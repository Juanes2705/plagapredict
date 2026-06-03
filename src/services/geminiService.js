/**
 * Servicio de identificación de plagas por IA
 *
 * Fuentes en orden de prioridad:
 *   1. Groq       (gratis, visión Llama 4)     → VITE_GROQ_API_KEY
 *   2. HuggingFace (gratis, Qwen / SmolVLM)    → VITE_HF_API_KEY
 *   3. Gemini     (fallback, si funciona)       → VITE_GEMINI_API_KEY
 */

const GROQ_KEY   = import.meta.env.VITE_GROQ_API_KEY   ?? ''
const HF_KEY     = import.meta.env.VITE_HF_API_KEY     ?? ''
const GEMINI_KEY = import.meta.env.VITE_GEMINI_API_KEY ?? ''

// ── Prompts ───────────────────────────────────────────────────────────────────
/**
 * Prompt MIP completo — ICA Colombia
 *
 * La IA devuelve un JSON con TODOS los campos necesarios para el formulario MIP,
 * reduciendo al mínimo la entrada manual del técnico de campo.
 * El técnico confirma o corrige; no parte de cero.
 */
const PROMPT =
  'Eres un experto fitosanitario de Colombia (Valle del Cauca), especializado en Manejo Integrado de Plagas (MIP) según el ICA.\n' +
  'Analiza la imagen e identifica el organismo plaga o enfermedad vegetal con el máximo detalle técnico posible.\n\n' +
  'Responde ÚNICAMENTE con este objeto JSON (sin markdown, sin texto extra):\n' +
  '{\n' +
  '  "nombreComun": "...",\n' +
  '  "nombreCientifico": "...",\n' +
  '  "tipoOrganismo": "...",\n' +
  '  "estadioBiologico": "...",\n' +
  '  "parteAfectadaSugerida": ["..."],\n' +
  '  "severidadSugerida": 0,\n' +
  '  "cultivoProbable": "...",\n' +
  '  "porcentajeConfianza": 0,\n' +
  '  "descripcionDano": "..."\n' +
  '}\n\n' +
  'Reglas por campo:\n' +
  '- nombreComun: nombre común de la plaga en español colombiano\n' +
  '- nombreCientifico: nombre científico binomial (género especie)\n' +
  '- tipoOrganismo: EXACTAMENTE uno de: "Insecto", "Ácaro", "Nematodo", "Hongo", "Bacteria", "Virus", "Maleza", "Otro"\n' +
  '- estadioBiologico: EXACTAMENTE uno de: "huevo", "larva", "ninfa", "pupa", "adulto", "micelio", "mixto"\n' +
  '- parteAfectadaSugerida: array con los que apliquen de: ["hoja", "tallo", "raiz", "fruto", "flor", "planta_entera"]\n' +
  '- severidadSugerida: entero 1-4 (1=<10% tejido dañado, 2=10-30%, 3=30-60%, 4=>60%). Estima por lo visible en imagen. 0 si no se puede estimar.\n' +
  '- cultivoProbable: nombre del cultivo si es visible en la imagen, o null si no se identifica\n' +
  '- porcentajeConfianza: entero 0-100 (plaga clara→70-100, borrosa→30-69, sin plaga→0)\n' +
  '- descripcionDano: 1-2 oraciones técnicas sobre los daños que causa esta plaga en el cultivo hospedante\n' +
  '- Si NO hay plaga visible: nombreComun="No identificado", nombreCientifico="—", tipoOrganismo="Otro", estadioBiologico="adulto", parteAfectadaSugerida=[], severidadSugerida=0, porcentajeConfianza=0\n' +
  '- NUNCA uses markdown, solo JSON puro'

// ── Utilidades ────────────────────────────────────────────────────────────────
function parsearJSON(text) {
  const limpio = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim()
  const match  = limpio.match(/\{[\s\S]*\}/)
  if (!match) throw new Error('Sin JSON en la respuesta')
  return JSON.parse(match[0])
}

function normalizarRespuesta(parsed, modeloUsado) {
  return {
    nombreComun:           String(parsed.nombreComun         ?? 'No identificado'),
    nombreCientifico:      String(parsed.nombreCientifico    ?? '—'),
    tipoOrganismo:         parsed.tipoOrganismo         ? String(parsed.tipoOrganismo)         : undefined,
    estadioBiologico:      parsed.estadioBiologico      ? String(parsed.estadioBiologico)      : undefined,
    parteAfectadaSugerida: Array.isArray(parsed.parteAfectadaSugerida) ? parsed.parteAfectadaSugerida : [],
    severidadSugerida:     parsed.severidadSugerida > 0
                             ? Math.max(1, Math.min(4, Math.round(Number(parsed.severidadSugerida))))
                             : undefined,
    cultivoProbable:       parsed.cultivoProbable ? String(parsed.cultivoProbable) : undefined,
    porcentajeConfianza:   Math.max(0, Math.min(100, Math.round(Number(parsed.porcentajeConfianza ?? 0)))),
    descripcionDano:       parsed.descripcionDano ? String(parsed.descripcionDano) : undefined,
    modeloUsado,
  }
}

// ── Helper: llamada OpenAI-compatible (Groq y HF usan el mismo formato) ───────
async function llamarOpenAICompat({ url, key, modelo, base64Data, mimeType }) {
  const resp = await fetch(url, {
    method:  'POST',
    headers: {
      'Authorization': `Bearer ${key}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({
      model:    modelo,
      messages: [{
        role:    'user',
        content: [
          { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64Data}` } },
          { type: 'text',      text: PROMPT },
        ],
      }],
      max_tokens:  512,
      temperature: 0.1,
    }),
  })

  const data = await resp.json()
  if (!resp.ok) {
    const msg = data?.error?.message ?? data?.message ?? resp.statusText
    const err = new Error(msg)
    err.status = resp.status
    throw err
  }

  const text = data?.choices?.[0]?.message?.content ?? ''
  if (!text) throw new Error('Respuesta vacía del modelo')
  return parsearJSON(text)
}

// ── Fuente 1: Groq ────────────────────────────────────────────────────────────
const GROQ_MODELOS = [
  'meta-llama/llama-4-scout-17b-16e-instruct',  // Llama 4 con visión
  'llama-3.2-11b-vision-preview',               // fallback Llama 3.2 visión
]

async function intentarGroq(base64Data, mimeType) {
  if (!GROQ_KEY || GROQ_KEY.trim().length < 5) return null

  for (const modelo of GROQ_MODELOS) {
    try {
      const parsed = await llamarOpenAICompat({
        url:       'https://api.groq.com/openai/v1/chat/completions',
        key:       GROQ_KEY,
        modelo,
        base64Data,
        mimeType,
      })
      console.info(`[Groq] ✓ ${modelo}`)
      return normalizarRespuesta(parsed, `Groq / ${modelo.split('/').pop()}`)
    } catch (err) {
      console.warn(`[Groq] ${modelo} → ${err.status ?? ''} ${err.message}`)
      if (err.status === 401 || err.status === 403) break  // key inválida
      continue
    }
  }
  return null
}

// ── Fuente 2: Hugging Face ────────────────────────────────────────────────────
const HF_MODELOS = [
  'Qwen/Qwen2.5-VL-7B-Instruct',
  'HuggingFaceTB/SmolVLM-Instruct',
]

async function intentarHuggingFace(base64Data, mimeType) {
  if (!HF_KEY || HF_KEY.trim().length < 5) return null

  for (const modelo of HF_MODELOS) {
    try {
      const parsed = await llamarOpenAICompat({
        url:       'https://api-inference.huggingface.co/v1/chat/completions',
        key:       HF_KEY,
        modelo,
        base64Data,
        mimeType,
      })
      console.info(`[HF] ✓ ${modelo}`)
      return normalizarRespuesta(parsed, `HuggingFace / ${modelo.split('/').pop()}`)
    } catch (err) {
      console.warn(`[HF] ${modelo} → ${err.status ?? ''} ${err.message}`)
      if (err.status === 401 || err.status === 403) break
      continue
    }
  }
  return null
}

// ── Fuente 3: Gemini REST ─────────────────────────────────────────────────────
const GEMINI_INTENTOS = [
  ['v1beta', 'gemini-2.0-flash-lite'],
  ['v1beta', 'gemini-2.0-flash'],
]

async function intentarGemini(base64Data, mimeType) {
  if (!GEMINI_KEY || GEMINI_KEY.trim().length < 5) return null

  for (const [version, modelo] of GEMINI_INTENTOS) {
    try {
      const url  = `https://generativelanguage.googleapis.com/${version}/models/${modelo}:generateContent?key=${GEMINI_KEY}`
      const resp = await fetch(url, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [
            { inline_data: { mime_type: mimeType, data: base64Data } },
            { text: PROMPT },
          ]}],
          generationConfig: { temperature: 0.1 },
        }),
      })

      const data = await resp.json()
      if (!resp.ok) {
        console.warn(`[Gemini] ${modelo} → HTTP ${resp.status}`)
        continue
      }

      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
      if (!text) continue

      const parsed = parsearJSON(text)
      console.info(`[Gemini] ✓ ${modelo}`)
      return normalizarRespuesta(parsed, `Gemini / ${modelo}`)
    } catch (err) {
      console.warn(`[Gemini] ${modelo} → ${err.message}`)
      continue
    }
  }
  return null
}

// ── Función principal ─────────────────────────────────────────────────────────
export async function identificarPlagaDesdeImagen(base64Data, mimeType = 'image/jpeg') {
  // 1. Groq (más accesible en Colombia, gratis)
  const rGroq = await intentarGroq(base64Data, mimeType)
  if (rGroq) return rGroq

  // 2. HuggingFace
  const rHF = await intentarHuggingFace(base64Data, mimeType)
  if (rHF) return rHF

  // 3. Gemini
  const rGemini = await intentarGemini(base64Data, mimeType)
  if (rGemini) return rGemini

  // Sin resultado
  const tieneAlgunaKey = GROQ_KEY.length > 5 || HF_KEY.length > 5 || GEMINI_KEY.length > 5
  if (!tieneAlgunaKey) {
    throw Object.assign(
      new Error('No hay clave de IA. Agrega VITE_GROQ_API_KEY en .env (gratis en console.groq.com)'),
      { code: 'NO_KEY' }
    )
  }

  throw Object.assign(
    new Error('No se pudo conectar con el servicio de IA. Verifica tu VITE_GROQ_API_KEY en .env'),
    { code: 'ALL_MODELS_FAILED' }
  )
}

// ── Convertir File del DOM a { base64, mimeType } ─────────────────────────────
export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const [header, base64] = reader.result.split(',')
      resolve({ base64, mimeType: header.replace('data:', '').replace(';base64', '') })
    }
    reader.onerror = () => reject(new Error('No se pudo leer el archivo de imagen.'))
    reader.readAsDataURL(file)
  })
}
