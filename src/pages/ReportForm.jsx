// HU-04 + HU-05 + HU-08 + HU-IA + MIP completo: Formulario con criterios técnicos ICA Colombia
import { useState, useEffect, useRef } from 'react'
import { collection, addDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../context/AuthContext'
import { useGeolocation } from '../hooks/useGeolocation'
import { fetchWeather, windDirLabel } from '../services/weatherService'
import { identificarPlagaDesdeImagen, fileToBase64 } from '../services/geminiService'
import Sidebar from '../components/Sidebar'
import {
  obtenerClasificacionICA,
  CLASIFICACION_LABEL,
  CLASIFICACION_COLOR,
  esCuarentenaria,
  getDefaultsEconomicos,
  calcularResumenEconomico,
  formatPesos,
  ESTADIOS_BIOLOGICOS,
  DISTRIBUCIONES_ESPACIALES,
} from '../utils/plagasEconomia'

// ── Catálogo de plagas Colombia (Valle del Cauca) ─────────────────────────────
const PLAGAS_COLOMBIA = [
  { nombre: 'Gusano cogollero',         cientifico: 'Spodoptera frugiperda',     wikiTitle: 'Fall armyworm',           cultivos: 'Maíz, sorgo, arroz, caña',                    tipoOrganismo: 'Insecto', emoji: '🐛' },
  { nombre: 'Broca del café',           cientifico: 'Hypothenemus hampei',        wikiTitle: 'Coffee berry borer',      cultivos: 'Café',                                         tipoOrganismo: 'Insecto', emoji: '🐞' },
  { nombre: 'Mosca de la fruta',        cientifico: 'Anastrepha obliqua',         wikiTitle: 'Anastrepha obliqua',      cultivos: 'Mango, guayaba, maracuyá, cítricos',           tipoOrganismo: 'Insecto', emoji: '🪰' },
  { nombre: 'Mosca blanca',             cientifico: 'Bemisia tabaci',             wikiTitle: 'Bemisia tabaci',          cultivos: 'Tomate, pimentón, pepino, fríjol',             tipoOrganismo: 'Insecto', emoji: '🦟' },
  { nombre: 'Áfidos / Pulgones',        cientifico: 'Familia Aphididae',          wikiTitle: 'Aphid',                   cultivos: 'Hortalizas, flores, frutales, leguminosas',    tipoOrganismo: 'Insecto', emoji: '🐜' },
  { nombre: 'Trips de las flores',      cientifico: 'Frankliniella occidentalis', wikiTitle: 'Western flower thrips',   cultivos: 'Rosas, clavel, crisantemo, cebolla',           tipoOrganismo: 'Insecto', emoji: '🔬' },
  { nombre: 'Picudo negro del plátano', cientifico: 'Cosmopolites sordidus',      wikiTitle: 'Cosmopolites sordidus',   cultivos: 'Plátano, banano',                              tipoOrganismo: 'Insecto', emoji: '🪲' },
  { nombre: 'Barrenador de la caña',    cientifico: 'Diatraea saccharalis',       wikiTitle: 'Diatraea saccharalis',    cultivos: 'Caña de azúcar',                               tipoOrganismo: 'Insecto', emoji: '🐛' },
  { nombre: 'Ácaro rojo / Arañita roja',cientifico: 'Tetranychus urticae',        wikiTitle: 'Tetranychus urticae',     cultivos: 'Fríjol, soya, fresas, flores, cucurbitáceas',  tipoOrganismo: 'Ácaro',   emoji: '🕷️' },
  { nombre: 'Hormiga arriera',          cientifico: 'Atta cephalotes',            wikiTitle: 'Atta cephalotes',         cultivos: 'Yuca, maíz, frutales tropicales, pastos',      tipoOrganismo: 'Insecto', emoji: '🐜' },
  { nombre: 'Minador de hojas',         cientifico: 'Liriomyza huidobrensis',     wikiTitle: 'Liriomyza huidobrensis',  cultivos: 'Papa, arveja, tomate, hortalizas',             tipoOrganismo: 'Insecto', emoji: '🌿' },
  { nombre: 'Chinche del aguacate',     cientifico: 'Leptopharsa gibbicarina',    wikiTitle: 'Leptopharsa gibbicarina', cultivos: 'Aguacate',                                     tipoOrganismo: 'Insecto', emoji: '🐛' },
  { nombre: 'Chisa / Gallina ciega',    cientifico: 'Phyllophaga spp.',           wikiTitle: 'Phyllophaga',             cultivos: 'Caña, maíz, pastos, hortalizas, papa',         tipoOrganismo: 'Insecto', emoji: '🪲' },
  { nombre: 'Palomilla del maíz',       cientifico: 'Sitotroga cerealella',       wikiTitle: 'Sitotroga cerealella',    cultivos: 'Maíz almacenado, arroz, trigo',                tipoOrganismo: 'Insecto', emoji: '🦋' },
  { nombre: 'Otra', cientifico: null, wikiTitle: null, cultivos: null, tipoOrganismo: null, emoji: '❓' },
]

// ── Catálogos MIP ─────────────────────────────────────────────────────────────
const CULTIVOS_VALLE = [
  'Caña de azúcar','Café','Maíz','Plátano / Banano','Soya','Fríjol','Tomate',
  'Pimentón','Aguacate','Mango','Cítricos (naranja, limón, mandarina)',
  'Guayaba','Maracuyá','Yuca','Papa','Arveja','Cebolla','Arroz','Sorgo',
  'Flores (rosas, crisantemo, clavel)','Otro',
]

const TIPOS_ORGANISMO = [
  { valor: 'Insecto',  label: 'Insecto',          desc: 'Mosca, mariposa, escarabajo, chinche...' },
  { valor: 'Ácaro',    label: 'Ácaro / Araña',    desc: 'Arañita roja, ácaro del bronceado...' },
  { valor: 'Nematodo', label: 'Nematodo',          desc: 'Organismos microscópicos del suelo' },
  { valor: 'Hongo',    label: 'Hongo / Oomiceto',  desc: 'Mildiu, roya, Fusarium, Botrytis...' },
  { valor: 'Bacteria', label: 'Bacteria',          desc: 'Marchitez bacteriana, cancro...' },
  { valor: 'Virus',    label: 'Virus / Viroide',   desc: 'Mosaico, amarillamiento, encrespamiento...' },
  { valor: 'Maleza',   label: 'Maleza / Arvense',  desc: 'Planta que compite con el cultivo' },
  { valor: 'Otro',     label: 'Otro organismo',    desc: 'Molusco, roedor, pájaro...' },
]

const PARTES_PLANTA = [
  { valor: 'hoja',         label: 'Hoja / Follaje' },
  { valor: 'tallo',        label: 'Tallo / Tronco' },
  { valor: 'raiz',         label: 'Raíz / Corona' },
  { valor: 'fruto',        label: 'Fruto / Semilla' },
  { valor: 'flor',         label: 'Flor / Yema' },
  { valor: 'planta_entera',label: 'Planta entera' },
]

const FASES_FENOLOGICAS = [
  { valor: 'germinacion',    label: 'Germinación / Emergencia' },
  { valor: 'vegetativo',     label: 'Desarrollo vegetativo' },
  { valor: 'floracion',      label: 'Floración' },
  { valor: 'fructificacion', label: 'Fructificación / Llenado' },
  { valor: 'maduracion',     label: 'Maduración / Cosecha' },
]

const SEVERIDAD_INFO = [
  { valor: 1, label: '1 – Leve',       color: '#10b981', desc: 'Daño incipiente, <10% del área foliar o tejido afectado por planta.' },
  { valor: 2, label: '2 – Moderado',   color: '#f59e0b', desc: '10-30% del área o tejido afectado. Reducción leve del rendimiento posible.' },
  { valor: 3, label: '3 – Severo',     color: '#f97316', desc: '30-60% del área o tejido afectado. Pérdidas de rendimiento evidentes.' },
  { valor: 4, label: '4 – Muy severo', color: '#ef4444', desc: '>60% del tejido afectado. Pérdida severa o muerte de la planta.' },
]

const UNIDADES_MUESTREO = [
  { valor: 'por_planta',  label: 'Por planta' },
  { valor: 'por_trampa',  label: 'Por trampa' },
  { valor: 'por_m2',      label: 'Por m²' },
  { valor: 'por_hoja',    label: 'Por hoja' },
]

// ── Nivel de riesgo calculado según MIP (incidencia + severidad) ──────────────
function calcularNivelMIP(incidencia, severidad) {
  if (incidencia >= 30 || severidad >= 3) return 'alto'
  if (incidencia >= 10 || severidad >= 2) return 'medio'
  return 'bajo'
}

const nivelStyle = {
  bajo:  'border-green-500/50 bg-green-500/10 text-green-400',
  medio: 'border-yellow-500/50 bg-yellow-500/10 text-yellow-400',
  alto:  'border-red-500/50 bg-red-500/10 text-red-400',
}
const nivelIcono = { bajo: '🟢', medio: '🟡', alto: '🔴' }

// ── Imagen Wikipedia ──────────────────────────────────────────────────────────
function PlagaImageCard({ wikiTitle, cientifico, cultivos }) {
  const [imagen, setImagen]   = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!wikiTitle) { setLoading(false); return }
    setLoading(true); setImagen(null)
    fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(wikiTitle)}`)
      .then(r => r.json())
      .then(data => {
        if (data.thumbnail?.source) { setImagen(data.thumbnail.source); setLoading(false) }
        else return fetch(`https://es.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(wikiTitle)}`)
          .then(r2 => r2.json())
          .then(d2 => { setImagen(d2.thumbnail?.source ?? null); setLoading(false) })
      })
      .catch(() => setLoading(false))
  }, [wikiTitle])

  if (!wikiTitle) return null
  return (
    <div className="mt-3 rounded-xl overflow-hidden border border-[#30363d] bg-[#0d1117]">
      <div className="relative h-44 bg-[#161b22] flex items-center justify-center">
        {loading && <div className="text-[#484f58] text-xs">Cargando imagen...</div>}
        {!loading && imagen && <img src={imagen} alt={cientifico ?? ''} className="w-full h-full object-cover" onError={() => setImagen(null)} />}
        {!loading && !imagen && <div className="text-[#484f58] text-xs">Sin imagen disponible</div>}
      </div>
      {(cientifico || cultivos) && (
        <div className="px-3 py-2.5 space-y-1">
          {cientifico && <p className="text-[#8b949e] text-xs italic">📗 {cientifico}</p>}
          {cultivos   && <p className="text-[#484f58] text-xs">🌾 <span className="text-[#8b949e]">Cultivos:</span> {cultivos}</p>}
        </div>
      )}
    </div>
  )
}

// ── Comprimir imagen ──────────────────────────────────────────────────────────
function comprimirImagen(file, maxPx = 900, quality = 0.78) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      const ratio  = Math.min(maxPx / img.width, maxPx / img.height, 1)
      const canvas = document.createElement('canvas')
      canvas.width  = Math.round(img.width  * ratio)
      canvas.height = Math.round(img.height * ratio)
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
      URL.revokeObjectURL(url)
      resolve(canvas.toDataURL('image/jpeg', quality))
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('No se pudo leer la imagen')) }
    img.src = url
  })
}

// ── Barra de confianza ────────────────────────────────────────────────────────
function ConfidenceBar({ value }) {
  const color = value >= 75 ? '#10b981' : value >= 50 ? '#f59e0b' : '#ef4444'
  return (
    <div className="mt-2">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-[#8b949e]">Confianza IA</span>
        <span className="text-xs font-bold" style={{ color }}>{value}%</span>
      </div>
      <div className="h-1.5 bg-[#30363d] rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${value}%`, background: color }} />
      </div>
    </div>
  )
}

// ── Badge clasificación ICA ───────────────────────────────────────────────────
function ClasificacionICABadge({ clasificacion }) {
  if (!clasificacion || clasificacion === 'desconocida') return null
  const color = CLASIFICACION_COLOR[clasificacion] ?? '#6b7280'
  const label = CLASIFICACION_LABEL[clasificacion] ?? clasificacion
  return (
    <div className="mt-2 px-3 py-2 rounded-lg border text-xs flex items-start gap-2"
      style={{ borderColor: color + '40', backgroundColor: color + '10', color }}>
      <span className="font-semibold shrink-0">ICA Res.3593/2015:</span>
      <span>{label}</span>
    </div>
  )
}

// ── Componente principal ──────────────────────────────────────────────────────
export default function ReportForm() {
  const { user } = useAuth()
  const { coords, status: gpsStatus, error: gpsError, capture } = useGeolocation()
  const inputFileRef      = useRef(null)
  const inputAdicionalRef = useRef(null)

  // ── Estado del formulario ──────────────────────────────────────────────────
  const [form, setForm] = useState({
    finca:              '',
    plaga:              '',
    plagaPersonalizada: '',
    // Identificación biológica
    tipoOrganismo:      '',
    estadioBiologico:   '',
    // Cultivo
    cultivo:            '',
    faseFenologica:     '',
    parteAfectada:      [],
    // Evaluación de campo
    plantasEvaluadas:   '',
    plantasAfectadas:   '',
    severidad:          '',
    individuosContados: '',
    unidadMuestreo:     'por_planta',
    distribucionEspacial: '',
    // Evaluación económica
    costoControlHa:     '',
    precioKg:           '',
    rendimientoTha:     '',
    eficienciaControl:  '',
    // Observaciones
    descripcion:        '',
  })

  const [submitStatus, setSubmitStatus] = useState('idle')
  const [clima,        setClima]        = useState(null)
  const [loadingClima, setLoadingClima] = useState(false)

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }))
  const toggleParte = (valor) => setForm(f => ({
    ...f,
    parteAfectada: f.parteAfectada.includes(valor)
      ? f.parteAfectada.filter(v => v !== valor)
      : [...f.parteAfectada, valor],
  }))

  // Cargar defaults económicos cuando cambia el cultivo
  const cargarDefaultsEconomicos = (cultivo) => {
    const d = getDefaultsEconomicos(cultivo)
    setForm(f => ({
      ...f,
      cultivo,
      costoControlHa:    f.costoControlHa    || String(d.costoControlHa),
      precioKg:          f.precioKg          || String(d.precioKg),
      rendimientoTha:    f.rendimientoTha    || String(d.rendimientoTha),
      eficienciaControl: f.eficienciaControl || String(Math.round(d.eficienciaControl * 100)),
    }))
  }

  useEffect(() => {
    if (!coords) return
    setLoadingClima(true)
    fetchWeather(coords.lat, coords.lng).then(data => { setClima(data); setLoadingClima(false) })
  }, [coords])

  // ── IA ─────────────────────────────────────────────────────────────────────
  const [iaEstado,      setIaEstado]      = useState('idle')
  const [imagenFile,    setImagenFile]    = useState(null)
  const [imagenPreview, setImagenPreview] = useState(null)
  const [sugerencia,    setSugerencia]    = useState(null)
  const [iaError,       setIaError]       = useState('')
  const [iaErrorCode,   setIaErrorCode]   = useState('')
  const [cuotaSegundos, setCuotaSegundos] = useState(0)
  const [fotosAdicionales, setFotosAdicionales] = useState([])
  const MAX_FOTOS = 4

  const agregarFotosAdicionales = (e) => {
    const files = Array.from(e.target.files ?? []).filter(f => f.type.startsWith('image/'))
      .slice(0, MAX_FOTOS - fotosAdicionales.length)
      .map(f => ({ file: f, preview: URL.createObjectURL(f) }))
    setFotosAdicionales(prev => [...prev, ...files])
    if (inputAdicionalRef.current) inputAdicionalRef.current.value = ''
  }

  const eliminarFotoAdicional = (idx) => {
    setFotosAdicionales(prev => { URL.revokeObjectURL(prev[idx].preview); return prev.filter((_, i) => i !== idx) })
  }

  const handleImageChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file || !file.type.startsWith('image/')) return
    if (file.size > 10 * 1024 * 1024) { setIaError('La imagen no debe superar 10 MB.'); return }

    setImagenFile(file)
    setImagenPreview(URL.createObjectURL(file))
    setIaEstado('analyzing')
    setIaError('')
    setSugerencia(null)

    try {
      const { base64, mimeType } = await fileToBase64(file)
      const resultado = await identificarPlagaDesdeImagen(base64, mimeType)
      setSugerencia(resultado)
      setIaEstado('suggested')
    } catch (err) {
      setIaErrorCode(err.code ?? '')
      if (err.code === 'QUOTA_EXCEEDED' && err.segundos > 0) {
        setCuotaSegundos(err.segundos)
        const iv = setInterval(() => setCuotaSegundos(s => { if (s <= 1) { clearInterval(iv); return 0 } return s - 1 }), 1000)
      }
      setIaError(err.message ?? 'Error al conectar con la IA.')
      setIaEstado('error')
    }
  }

  const confirmarSugerencia = () => {
    if (!sugerencia) return
    setForm(f => {
      const nuevo = {
        ...f,
        plaga:            sugerencia.nombreComun,
        plagaPersonalizada: '',
        // Pre-relleno inteligente de todos los campos que la IA identificó
        tipoOrganismo:    sugerencia.tipoOrganismo   ?? f.tipoOrganismo,
        estadioBiologico: sugerencia.estadioBiologico ?? f.estadioBiologico,
        severidad:        sugerencia.severidadSugerida
                            ? String(sugerencia.severidadSugerida) : f.severidad,
        parteAfectada:    sugerencia.parteAfectadaSugerida?.length
                            ? sugerencia.parteAfectadaSugerida : f.parteAfectada,
      }
      // Si la IA sugirió un cultivo probable y no hay uno seleccionado
      const cultivoTarget = sugerencia.cultivoProbable ?? f.cultivo
      if (cultivoTarget && !f.cultivo) {
        const defaults = getDefaultsEconomicos(cultivoTarget)
        nuevo.cultivo          = cultivoTarget
        nuevo.costoControlHa   = f.costoControlHa   || String(defaults.costoControlHa)
        nuevo.precioKg         = f.precioKg         || String(defaults.precioKg)
        nuevo.rendimientoTha   = f.rendimientoTha   || String(defaults.rendimientoTha)
        nuevo.eficienciaControl= f.eficienciaControl|| String(Math.round(defaults.eficienciaControl * 100))
      }
      return nuevo
    })
    setIaEstado('confirmed')
  }

  const rechazarSugerencia = () => { setIaEstado('rejected'); set('plaga', ''); set('plagaPersonalizada', '') }

  const resetIA = () => {
    setIaEstado('idle'); setImagenFile(null); setImagenPreview(null)
    setSugerencia(null); setIaError(''); setIaErrorCode(''); setCuotaSegundos(0)
    set('plaga', ''); set('plagaPersonalizada', '')
    fotosAdicionales.forEach(f => URL.revokeObjectURL(f.preview))
    setFotosAdicionales([])
    if (inputFileRef.current) inputFileRef.current.value = ''
    if (inputAdicionalRef.current) inputAdicionalRef.current.value = ''
  }

  // ── Derivados ──────────────────────────────────────────────────────────────
  const plagaFinal   = form.plaga === 'Otra' ? form.plagaPersonalizada.trim() : form.plaga
  const plagaInfo    = PLAGAS_COLOMBIA.find(p => p.nombre.toLowerCase() === form.plaga.toLowerCase()) ?? null
  const wikiTitleIA  = sugerencia?.nombreCientifico ?? sugerencia?.nombreComun ?? null

  // Clasificación ICA automática basada en nombre científico
  const nombreCientificoActual = iaEstado === 'confirmed'
    ? sugerencia?.nombreCientifico
    : plagaInfo?.cientifico ?? null
  const clasificacionICA = obtenerClasificacionICA(nombreCientificoActual, plagaFinal)
  const esCuarentenariaFlag = esCuarentenaria(clasificacionICA)

  // Cálculos MIP de campo
  const plantasEv   = parseInt(form.plantasEvaluadas) || 0
  const plantasAf   = parseInt(form.plantasAfectadas) || 0
  const incidencia  = plantasEv > 0 && plantasAf >= 0 ? Math.min(100, Math.round((plantasAf / plantasEv) * 100)) : null
  const severidadNum = parseInt(form.severidad) || 0
  const nivelMIP    = (incidencia !== null && severidadNum > 0) ? calcularNivelMIP(incidencia, severidadNum) : null

  // Cálculo económico NDE
  const costoNum      = parseFloat(form.costoControlHa)   || 0
  const precioNum     = parseFloat(form.precioKg)         || 0
  const rendNum       = parseFloat(form.rendimientoTha)   || 0
  const eficienciaDec = (parseFloat(form.eficienciaControl) || 0) / 100

  const resumenEco = (incidencia !== null && severidadNum > 0 && costoNum > 0 && precioNum > 0 && rendNum > 0 && eficienciaDec > 0)
    ? calcularResumenEconomico({
        costoControlHa:    costoNum,
        precioKg:          precioNum,
        rendimientoTha:    rendNum,
        eficienciaControl: eficienciaDec,
        severidad:         severidadNum,
        incidencia_pct:    incidencia,
      })
    : null

  // Validación completa
  const mipBiologicoCompleto = !!form.tipoOrganismo && !!form.estadioBiologico
  const mipCultivoCompleto   = !!form.cultivo && !!form.faseFenologica && form.parteAfectada.length > 0
  const mipCampoCompleto     = plantasEv > 0 && plantasAf >= 0 && plantasAf <= plantasEv
                               && severidadNum > 0 && !!form.distribucionEspacial
  const mipEcoCompleto       = costoNum > 0 && precioNum > 0 && rendNum > 0 && eficienciaDec > 0
  const mipCompleto          = mipBiologicoCompleto && mipCultivoCompleto && mipCampoCompleto && mipEcoCompleto

  const puedeEnviar = !!coords && !!plagaFinal && !!imagenFile
    && iaEstado !== 'analyzing' && submitStatus !== 'loading' && mipCompleto

  // ── Veredicto económico → determina el estado del reporte ────────────────
  // Un organismo se clasifica como PLAGA en Colombia cuando su daño supera el NDE.
  // En ese caso el reporte entra directamente como alerta_preventiva.
  // Si no supera el umbral, es una OBSERVACIÓN de monitoreo (sospechoso).
  const veredictoEco = resumenEco?.estadoEconomico   // 'plaga' | 'vigilancia' | 'bajo_umbral'
  const estadoReporteCalculado =
    esCuarentenariaFlag        ? 'alerta_preventiva' :
    veredictoEco === 'plaga'   ? 'alerta_preventiva' : 'sospechoso'

  // ── Submit ─────────────────────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!coords || !plagaFinal || !mipCompleto) return

    setSubmitStatus('loading')
    try {
      const todosLosFiles = [imagenFile, ...fotosAdicionales.map(f => f.file)].filter(Boolean)
      let imagenesBase64 = []
      try { imagenesBase64 = await Promise.all(todosLosFiles.map(f => comprimirImagen(f))) }
      catch (imgErr) { console.warn('No se pudo comprimir alguna imagen:', imgErr.message) }
      const imagenBase64 = imagenesBase64[0] ?? null

      await addDoc(collection(db, 'reportes'), {
        // Básicos
        plaga:            plagaFinal,
        finca:            form.finca.trim(),
        nivel:            nivelMIP ?? 'medio',
        descripcion:      form.descripcion,
        lat:              coords.lat,
        lng:              coords.lng,
        precision_m:      coords.accuracy,
        uid_reportador:   user.uid,
        email_reportador: user.email,
        // Clima
        temp_c:           clima?.temp_c     ?? null,
        humedad:          clima?.humedad    ?? null,
        viento_kmh:       clima?.viento_kmh ?? null,
        viento_dir:       clima?.viento_dir ?? null,
        fecha:            serverTimestamp(),
        estado_validacion: estadoReporteCalculado,
        // ── Datos MIP completos ──────────────────────────────────────────────
        mip: {
          // Identificación biológica
          tipoOrganismo:        form.tipoOrganismo,
          estadioBiologico:     form.estadioBiologico,
          clasificacionICA,
          // Cultivo
          cultivo:              form.cultivo,
          faseFenologica:       form.faseFenologica,
          parteAfectada:        form.parteAfectada,
          // Evaluación de campo
          plantasEvaluadas:     plantasEv,
          plantasAfectadas:     plantasAf,
          incidencia_pct:       incidencia,
          severidad:            severidadNum,
          individuosContados:   parseInt(form.individuosContados) || null,
          unidadMuestreo:       form.unidadMuestreo,
          distribucionEspacial: form.distribucionEspacial,
          nivelCalculado:       nivelMIP,
          // Evaluación económica
          evaluacionEconomica: {
            costoControlHa:     costoNum,
            precioKg:           precioNum,
            rendimientoTha:     rendNum,
            eficienciaControl:  eficienciaDec,
            nde:                resumenEco?.nde            ?? null,
            umbralAccion:       resumenEco?.umbralAccion   ?? null,
            perdidaEstimada:    resumenEco?.perdidaEstimada ?? null,
            valorCosechaHa:     resumenEco?.valorCosechaHa ?? null,
            ratioBenefCosto:    resumenEco?.ratioBenefCosto ?? null,
            estadoEconomico:    resumenEco?.estadoEconomico ?? null,
          },
        },
        // Imágenes
        ...(imagenBase64         ? { imagenBase64 }         : {}),
        ...(imagenesBase64.length ? { imagenesBase64 }       : {}),
        // IA
        ...(iaEstado === 'confirmed' && sugerencia ? {
          ia_identificacion: {
            nombreComun:          sugerencia.nombreComun,
            nombreCientifico:     sugerencia.nombreCientifico,
            tipoOrganismo:        sugerencia.tipoOrganismo        ?? null,
            estadioBiologico:     sugerencia.estadioBiologico     ?? null,
            parteAfectadaSugerida:sugerencia.parteAfectadaSugerida ?? [],
            severidadSugerida:    sugerencia.severidadSugerida    ?? null,
            porcentajeConfianza:  sugerencia.porcentajeConfianza,
            descripcionDano:      sugerencia.descripcionDano      ?? null,
            confirmadaPorUsuario: true,
            modelo:               sugerencia.modeloUsado          ?? 'ia',
          },
        } : {}),
      })

      setSubmitStatus('success')
      setForm({
        finca: '', plaga: '', plagaPersonalizada: '', tipoOrganismo: '', estadioBiologico: '',
        cultivo: '', faseFenologica: '', parteAfectada: [], plantasEvaluadas: '', plantasAfectadas: '',
        severidad: '', individuosContados: '', unidadMuestreo: 'por_planta', distribucionEspacial: '',
        costoControlHa: '', precioKg: '', rendimientoTha: '', eficienciaControl: '', descripcion: '',
      })
      setClima(null)
      resetIA()
    } catch (err) {
      console.error('Error al guardar reporte:', err)
      setSubmitStatus('error')
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-screen bg-[#0d1117] text-white overflow-hidden">
      <Sidebar />

      <main className="flex-1 overflow-y-auto p-6">
        <div className="max-w-xl mx-auto">
          <h2 className="text-xl font-bold text-white mb-1">Reportar Avistamiento</h2>
          <p className="text-[#8b949e] text-sm mb-2">
            Evaluación fitosanitaria completa según metodología MIP — ICA Colombia.
          </p>

          {/* Banner metodología */}
          <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg px-3 py-2 mb-5">
            <p className="text-blue-300 text-xs leading-relaxed">
              📋 <strong>Flujo MIP (ICA Colombia):</strong> Identificación por IA →
              Evaluación de campo (incidencia + severidad) →
              Cálculo económico NDE = C/(V×D×K) →
              Clasificación automática (Res. 3593/2015) →
              Nivel de riesgo calculado objetivamente.
            </p>
          </div>

          {/* Alerta cuarentenaria */}
          {esCuarentenariaFlag && plagaFinal && (
            <div className="bg-purple-500/10 border border-purple-500/50 rounded-xl px-4 py-3 mb-5 animate-pulse">
              <p className="text-purple-300 font-semibold text-sm">🚨 PLAGA CUARENTENARIA DETECTADA</p>
              <p className="text-purple-400 text-xs mt-1">
                Esta plaga está en la lista oficial del ICA (Res. 3593/2015).
                El reporte se marcará como alerta inmediata sin esperar consenso.
                <strong> Notificar al ICA: 01 8000 111 668</strong>
              </p>
            </div>
          )}

          {/* ── GPS ──────────────────────────────────────────────────────────── */}
          <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-4 mb-5">
            <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">📍 Ubicación GPS</h3>
            {coords ? (
              <div className="bg-[#10b981]/10 border border-[#10b981]/30 rounded-lg p-3 text-sm">
                <p className="text-[#10b981] font-semibold mb-1">Ubicación capturada ✓</p>
                <p className="text-[#c9d1d9]">Lat: <span className="font-mono">{coords.lat.toFixed(6)}</span></p>
                <p className="text-[#c9d1d9]">Lng: <span className="font-mono">{coords.lng.toFixed(6)}</span></p>
                <p className="text-[#8b949e] text-xs mt-1">Precisión: ±{coords.accuracy} m</p>
                {clima && (
                  <div className="mt-2 pt-2 border-t border-[#10b981]/20 flex gap-3 text-xs text-[#c9d1d9]">
                    <span>🌡 {clima.temp_c}°C</span>
                    <span>💧 {clima.humedad}%</span>
                    <span>🌬 {clima.viento_kmh} km/h {windDirLabel(clima.viento_dir)}</span>
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-[#0d1117] border border-[#30363d] rounded-lg p-3 text-sm text-[#8b949e] mb-3">
                {gpsStatus === 'idle'    && 'Presiona el botón para capturar tu ubicación actual.'}
                {gpsStatus === 'loading' && '🔄 Obteniendo señal GPS...'}
                {gpsStatus === 'error'   && <span className="text-red-400">{gpsError}</span>}
              </div>
            )}
            {!coords && (
              <button type="button" onClick={capture} disabled={gpsStatus === 'loading'}
                className="mt-2 bg-[#10b981] hover:bg-[#059669] disabled:opacity-60 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
                {gpsStatus === 'loading' ? 'Localizando...' : '📡 Capturar mi ubicación'}
              </button>
            )}
            {coords && <button type="button" onClick={capture} className="mt-2 text-[#8b949e] hover:text-white text-xs underline">Recapturar</button>}
          </div>

          {/* ── FASE 1: Fotografía + IA ───────────────────────────────────────── */}
          <div className={`bg-[#161b22] rounded-xl p-4 mb-5 border transition-colors ${
            iaEstado === 'confirmed' ? 'border-[#10b981]/50' : iaEstado === 'error' ? 'border-red-500/40' : 'border-[#30363d]'
          }`}>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                📷 <span>Fase 1 — Fotografía e Identificación IA</span>
                <span className="text-xs font-normal text-red-400">* obligatoria</span>
              </h3>
              {iaEstado !== 'idle' && <button onClick={resetIA} className="text-xs text-[#484f58] hover:text-white underline">Reiniciar</button>}
            </div>
            <p className="text-[#484f58] text-[11px] mb-3">
              La IA pre-rellena automáticamente: tipo de organismo, estadio biológico,
              parte de planta afectada, severidad estimada y cultivo probable.
              El técnico confirma o corrige.
            </p>

            {iaEstado === 'idle' && (
              <div>
                <input ref={inputFileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleImageChange} />
                <button type="button" onClick={() => inputFileRef.current?.click()}
                  className="flex items-center gap-2 px-4 py-2.5 bg-[#0d1117] border-2 border-dashed border-red-500/40 hover:border-[#10b981] text-[#8b949e] hover:text-[#10b981] text-sm rounded-lg transition-colors w-full justify-center">
                  📷 Subir fotografía de la plaga o cultivo afectado
                </button>
              </div>
            )}

            {iaEstado === 'analyzing' && (
              <div className="space-y-3">
                {imagenPreview && <img src={imagenPreview} alt="" className="w-full h-40 object-cover rounded-lg border border-[#30363d]" />}
                <div className="bg-[#0d1117] border border-[#30363d] rounded-lg px-4 py-3 flex items-center gap-3">
                  <svg className="animate-spin h-4 w-4 text-[#10b981] shrink-0" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                  <div>
                    <p className="text-[#10b981] text-sm font-medium">Analizando con IA…</p>
                    <p className="text-[#484f58] text-xs">Identificando plaga, estadio biológico, parte afectada...</p>
                  </div>
                </div>
              </div>
            )}

            {iaEstado === 'suggested' && sugerencia && (
              <div className="space-y-3">
                {imagenPreview && <img src={imagenPreview} alt="" className="w-full h-40 object-cover rounded-lg border border-[#30363d]" />}
                <div className={`rounded-lg p-4 border ${
                  sugerencia.porcentajeConfianza >= 70 ? 'bg-[#10b981]/10 border-[#10b981]/40'
                  : sugerencia.porcentajeConfianza >= 40 ? 'bg-yellow-500/10 border-yellow-500/40'
                  : 'bg-red-500/10 border-red-500/30'
                }`}>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div>
                      <p className="text-white font-semibold text-sm">🔬 {sugerencia.nombreComun}</p>
                      <p className="text-[#8b949e] text-xs italic">{sugerencia.nombreCientifico}</p>
                    </div>
                    <span className="text-[10px] text-[#484f58] bg-[#0d1117] px-2 py-0.5 rounded shrink-0">IA</span>
                  </div>
                  <ConfidenceBar value={sugerencia.porcentajeConfianza} />
                  {/* Campos pre-rellenados por IA */}
                  <div className="mt-3 grid grid-cols-2 gap-1.5 text-[11px]">
                    {sugerencia.tipoOrganismo && (
                      <div className="bg-[#0d1117]/60 rounded px-2 py-1">
                        <span className="text-[#484f58]">Tipo: </span>
                        <span className="text-[#10b981]">{sugerencia.tipoOrganismo}</span>
                      </div>
                    )}
                    {sugerencia.estadioBiologico && (
                      <div className="bg-[#0d1117]/60 rounded px-2 py-1">
                        <span className="text-[#484f58]">Estadio: </span>
                        <span className="text-[#10b981]">{sugerencia.estadioBiologico}</span>
                      </div>
                    )}
                    {sugerencia.severidadSugerida > 0 && (
                      <div className="bg-[#0d1117]/60 rounded px-2 py-1">
                        <span className="text-[#484f58]">Severidad est.: </span>
                        <span className="text-[#10b981]">{sugerencia.severidadSugerida}/4</span>
                      </div>
                    )}
                    {sugerencia.cultivoProbable && (
                      <div className="bg-[#0d1117]/60 rounded px-2 py-1">
                        <span className="text-[#484f58]">Cultivo: </span>
                        <span className="text-[#10b981]">{sugerencia.cultivoProbable}</span>
                      </div>
                    )}
                    {sugerencia.parteAfectadaSugerida?.length > 0 && (
                      <div className="bg-[#0d1117]/60 rounded px-2 py-1 col-span-2">
                        <span className="text-[#484f58]">Parte afectada: </span>
                        <span className="text-[#10b981]">{sugerencia.parteAfectadaSugerida.join(', ')}</span>
                      </div>
                    )}
                  </div>
                  {sugerencia.descripcionDano && (
                    <p className="text-[#8b949e] text-xs mt-2 pt-2 border-t border-white/10">💡 {sugerencia.descripcionDano}</p>
                  )}
                </div>
                <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg px-3 py-2">
                  <p className="text-blue-300 text-xs">✨ Al confirmar, estos valores se pre-rellenarán en el formulario. Podrás ajustarlos.</p>
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={confirmarSugerencia}
                    className="flex-1 bg-[#10b981] hover:bg-[#059669] text-white text-sm font-medium py-2 rounded-lg transition-colors">
                    ✅ Confirmar y pre-rellenar formulario
                  </button>
                  <button type="button" onClick={rechazarSugerencia}
                    className="flex-1 bg-[#0d1117] border border-[#30363d] text-[#8b949e] hover:text-white text-sm py-2 rounded-lg transition-colors">
                    ✍️ Ingresar manualmente
                  </button>
                </div>
              </div>
            )}

            {iaEstado === 'confirmed' && sugerencia && (
              <div className="space-y-3">
                {imagenPreview && <img src={imagenPreview} alt="" className="w-full h-32 object-cover rounded-lg border border-[#10b981]/40" />}
                <div className="bg-[#10b981]/10 border border-[#10b981]/40 rounded-lg p-3 flex items-center justify-between">
                  <div>
                    <p className="text-[#10b981] text-sm font-semibold">✅ Plaga identificada por IA — formulario pre-rellenado</p>
                    <p className="text-white text-sm mt-0.5">{sugerencia.nombreComun}</p>
                    <p className="text-[#8b949e] text-xs italic">{sugerencia.nombreCientifico} · {sugerencia.porcentajeConfianza}% confianza</p>
                  </div>
                  <button type="button" onClick={rechazarSugerencia} className="text-[#484f58] hover:text-white text-xs underline shrink-0 ml-2">Cambiar</button>
                </div>
                <PlagaImageCard wikiTitle={wikiTitleIA} cientifico={sugerencia.nombreCientifico} cultivos={null} />
              </div>
            )}

            {iaEstado === 'rejected' && imagenPreview && (
              <div className="space-y-2">
                <img src={imagenPreview} alt="" className="w-full h-36 object-cover rounded-lg border border-[#30363d]" />
                <div className="bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-2 flex items-center justify-between">
                  <p className="text-[#c9d1d9] text-xs">📷 Foto adjunta ✓</p>
                  <button type="button" onClick={resetIA} className="text-[#484f58] hover:text-red-400 text-xs underline">Cambiar foto</button>
                </div>
              </div>
            )}

            {iaEstado === 'error' && (
              <div className="space-y-3">
                {imagenPreview && <img src={imagenPreview} alt="" className="w-full h-32 object-cover rounded-lg border border-red-500/30 opacity-50" />}
                <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
                  {cuotaSegundos > 0
                    ? <p className="text-yellow-400 text-xs">⏳ Límite de IA. Puedes reintentar en <strong>{cuotaSegundos}s</strong>. Usa el formulario manual mientras tanto.</p>
                    : <p className="text-red-400 text-xs">✗ {iaError}</p>
                  }
                </div>
                <div className="flex gap-2">
                  {cuotaSegundos === 0 && (
                    <button type="button" onClick={() => { setIaEstado('idle'); setIaError(''); setImagenFile(null); setImagenPreview(null); if (inputFileRef.current) inputFileRef.current.value = '' }}
                      className="flex-1 text-xs text-[#10b981] border border-[#10b981]/40 rounded-lg py-1.5 transition-colors">🔄 Reintentar</button>
                  )}
                  <button type="button" onClick={() => { setIaEstado('rejected'); setIaError(''); setCuotaSegundos(0) }}
                    className="flex-1 text-xs text-[#8b949e] border border-[#30363d] rounded-lg py-1.5 transition-colors">✍️ Seleccionar manualmente</button>
                </div>
              </div>
            )}
          </div>

          {/* Fotos adicionales */}
          {imagenFile && iaEstado !== 'idle' && iaEstado !== 'analyzing' && (
            <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-4 mb-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-white flex items-center gap-2">🖼️ Fotos adicionales <span className="text-xs text-[#484f58]">opcional · máx 4</span></h3>
                <span className="text-xs text-[#484f58]">{1 + fotosAdicionales.length}/5</span>
              </div>
              {fotosAdicionales.length > 0 && (
                <div className="grid grid-cols-4 gap-2 mb-3">
                  {fotosAdicionales.map((f, idx) => (
                    <div key={idx} className="relative group">
                      <img src={f.preview} alt="" className="w-full h-20 object-cover rounded-lg border border-[#30363d]" />
                      <button type="button" onClick={() => eliminarFotoAdicional(idx)}
                        className="absolute top-1 right-1 bg-black/70 text-white rounded-full w-5 h-5 text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500">✕</button>
                    </div>
                  ))}
                </div>
              )}
              {fotosAdicionales.length < MAX_FOTOS && (
                <>
                  <input ref={inputAdicionalRef} type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" onChange={agregarFotosAdicionales} />
                  <button type="button" onClick={() => inputAdicionalRef.current?.click()}
                    className="flex items-center gap-2 px-4 py-2 bg-[#0d1117] border border-dashed border-[#484f58] hover:border-[#10b981] text-[#8b949e] hover:text-[#10b981] text-xs rounded-lg w-full justify-center">
                    + Agregar fotos ({MAX_FOTOS - fotosAdicionales.length} disponibles)
                  </button>
                </>
              )}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">

            {/* ── FASE 2: Identificación biológica ─────────────────────────── */}
            <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-4 space-y-4">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                🔬 Fase 2 — Identificación Biológica
              </h3>

              {/* Finca */}
              <div>
                <label className="block text-xs font-medium text-[#c9d1d9] mb-1.5">Nombre de la finca *</label>
                <input type="text" placeholder="Ej: Hacienda La Esperanza"
                  value={form.finca} onChange={e => set('finca', e.target.value)} required
                  className="w-full bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-2 text-white text-sm placeholder-[#484f58] focus:outline-none focus:border-[#10b981] transition-colors"
                />
              </div>

              {/* Plaga manual */}
              {iaEstado !== 'confirmed' && (
                <div>
                  <label className="block text-xs font-medium text-[#c9d1d9] mb-1.5">
                    Nombre de la plaga *
                    {iaEstado === 'idle' && <span className="ml-2 text-[#484f58] font-normal">(o usa la IA ↑)</span>}
                  </label>
                  <select value={form.plaga} onChange={e => {
                    const p = PLAGAS_COLOMBIA.find(x => x.nombre === e.target.value)
                    set('plaga', e.target.value)
                    set('plagaPersonalizada', '')
                    if (p?.tipoOrganismo) set('tipoOrganismo', p.tipoOrganismo)
                  }}
                    className="w-full bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#10b981] transition-colors">
                    <option value="">Selecciona una plaga...</option>
                    {PLAGAS_COLOMBIA.map(p => (
                      <option key={p.nombre} value={p.nombre}>{p.emoji} {p.nombre}{p.cientifico ? ` — ${p.cientifico}` : ''}</option>
                    ))}
                  </select>
                  {form.plaga === 'Otra' && (
                    <input type="text" placeholder="Describe la plaga observada..." value={form.plagaPersonalizada}
                      onChange={e => set('plagaPersonalizada', e.target.value)} autoFocus required
                      className="mt-2 w-full bg-[#0d1117] border border-yellow-500/40 rounded-lg px-3 py-2 text-white text-sm placeholder-[#484f58] focus:outline-none focus:border-yellow-400 transition-colors"
                    />
                  )}
                  {form.plaga && form.plaga !== 'Otra' && plagaInfo && (
                    <PlagaImageCard wikiTitle={plagaInfo.wikiTitle} cientifico={plagaInfo.cientifico} cultivos={plagaInfo.cultivos} />
                  )}
                </div>
              )}

              {/* Plaga confirmada IA */}
              {iaEstado === 'confirmed' && (
                <div>
                  <label className="block text-xs font-medium text-[#c9d1d9] mb-1.5">Nombre de la plaga <span className="text-[#10b981]">✅ Identificada por IA</span></label>
                  <div className="w-full bg-[#0d1117] border border-[#10b981]/40 rounded-lg px-3 py-2 text-white text-sm flex items-center justify-between">
                    <span>{form.plaga}</span>
                    <span className="text-xs text-[#484f58]">{sugerencia?.porcentajeConfianza}% confianza</span>
                  </div>
                </div>
              )}

              {/* Clasificación ICA */}
              {plagaFinal && <ClasificacionICABadge clasificacion={clasificacionICA} />}

              {/* Tipo de organismo */}
              <div>
                <label className="block text-xs font-medium text-[#c9d1d9] mb-1.5">
                  Tipo de organismo * <span className="text-[#484f58] font-normal">(clasificación ICA Res. 3593)</span>
                  {form.tipoOrganismo && iaEstado === 'confirmed' && <span className="ml-2 text-[#10b981]">← pre-rellenado por IA</span>}
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {TIPOS_ORGANISMO.map(t => (
                    <button key={t.valor} type="button" onClick={() => set('tipoOrganismo', t.valor)}
                      className={`text-left px-3 py-2 rounded-lg border text-xs transition-colors ${
                        form.tipoOrganismo === t.valor
                          ? 'border-[#10b981]/60 bg-[#10b981]/10 text-[#10b981]'
                          : 'border-[#30363d] text-[#8b949e] hover:border-[#484f58]'
                      }`}>
                      <div className="font-medium">{t.label}</div>
                      <div className="text-[#484f58] text-[10px] mt-0.5">{t.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Estadio biológico */}
              <div>
                <label className="block text-xs font-medium text-[#c9d1d9] mb-1.5">
                  Estadio biológico observado *
                  {form.estadioBiologico && iaEstado === 'confirmed' && <span className="ml-2 text-[#10b981]">← pre-rellenado por IA</span>}
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {ESTADIOS_BIOLOGICOS.map(e => (
                    <button key={e.valor} type="button" onClick={() => set('estadioBiologico', e.valor)}
                      className={`text-left px-3 py-2 rounded-lg border text-xs transition-colors ${
                        form.estadioBiologico === e.valor
                          ? 'border-[#10b981]/60 bg-[#10b981]/10 text-[#10b981]'
                          : 'border-[#30363d] text-[#8b949e] hover:border-[#484f58]'
                      }`}>
                      <div className="font-medium">{e.label}</div>
                      <div className="text-[#484f58] text-[10px] mt-0.5">{e.desc}</div>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* ── FASE 3: Cultivo hospedante ────────────────────────────────── */}
            <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-4 space-y-4">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                🌾 Fase 3 — Cultivo Hospedante
              </h3>

              <div>
                <label className="block text-xs font-medium text-[#c9d1d9] mb-1.5">
                  Cultivo afectado *
                  {form.cultivo && iaEstado === 'confirmed' && sugerencia?.cultivoProbable && <span className="ml-2 text-[#10b981]">← sugerido por IA</span>}
                </label>
                <select value={form.cultivo} onChange={e => cargarDefaultsEconomicos(e.target.value)}
                  className="w-full bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#10b981] transition-colors">
                  <option value="">Selecciona el cultivo...</option>
                  {CULTIVOS_VALLE.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                {form.cultivo && <p className="text-[#484f58] text-[10px] mt-1">💡 Los parámetros económicos típicos para este cultivo se cargaron automáticamente en la sección de NDE.</p>}
              </div>

              <div>
                <label className="block text-xs font-medium text-[#c9d1d9] mb-2">Fase fenológica del cultivo *</label>
                <div className="grid grid-cols-1 gap-1.5">
                  {FASES_FENOLOGICAS.map(f => (
                    <button key={f.valor} type="button" onClick={() => set('faseFenologica', f.valor)}
                      className={`text-left px-3 py-2 rounded-lg border text-xs transition-colors ${
                        form.faseFenologica === f.valor
                          ? 'border-[#10b981]/60 bg-[#10b981]/10 text-[#10b981]'
                          : 'border-[#30363d] text-[#8b949e] hover:border-[#484f58]'
                      }`}>{f.label}</button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#c9d1d9] mb-2">
                  Parte de la planta afectada *
                  {form.parteAfectada.length > 0 && iaEstado === 'confirmed' && <span className="ml-2 text-[#10b981]">← pre-rellenado por IA</span>}
                  <span className="ml-2 text-[#484f58] font-normal">(selecciona todas las que apliquen)</span>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {PARTES_PLANTA.map(p => (
                    <label key={p.valor} className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-colors ${
                      form.parteAfectada.includes(p.valor)
                        ? 'border-[#10b981]/60 bg-[#10b981]/10 text-[#10b981]'
                        : 'border-[#30363d] text-[#8b949e] hover:border-[#484f58]'
                    }`}>
                      <input type="checkbox" className="hidden" checked={form.parteAfectada.includes(p.valor)} onChange={() => toggleParte(p.valor)} />
                      <span className={`w-4 h-4 rounded border flex items-center justify-center text-[10px] shrink-0 ${form.parteAfectada.includes(p.valor) ? 'border-[#10b981] bg-[#10b981] text-white' : 'border-[#484f58]'}`}>
                        {form.parteAfectada.includes(p.valor) ? '✓' : ''}
                      </span>
                      <span className="text-xs">{p.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            {/* ── FASE 4: Evaluación de campo ───────────────────────────────── */}
            <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-4 space-y-4">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                📊 Fase 4 — Evaluación de Campo
              </h3>

              {/* Incidencia */}
              <div>
                <label className="block text-xs font-medium text-[#c9d1d9] mb-1">Incidencia — % plantas afectadas *</label>
                <p className="text-[#484f58] text-[11px] mb-2">Muestrea mín. 30 plantas al azar para un resultado representativo (ICA).</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] text-[#8b949e] mb-1">Plantas evaluadas (n)</label>
                    <input type="number" min="1" max="10000" placeholder="Ej: 50"
                      value={form.plantasEvaluadas} onChange={e => set('plantasEvaluadas', e.target.value)}
                      className="w-full bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-2 text-white text-sm placeholder-[#484f58] focus:outline-none focus:border-[#10b981] transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-[#8b949e] mb-1">Plantas con síntomas</label>
                    <input type="number" min="0" max={form.plantasEvaluadas || 10000} placeholder="Ej: 12"
                      value={form.plantasAfectadas} onChange={e => set('plantasAfectadas', e.target.value)}
                      className="w-full bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-2 text-white text-sm placeholder-[#484f58] focus:outline-none focus:border-[#10b981] transition-colors"
                    />
                  </div>
                </div>
                {incidencia !== null && (
                  <div className={`mt-3 rounded-lg px-4 py-3 border ${
                    incidencia >= 30 ? 'bg-red-500/10 border-red-500/30' : incidencia >= 10 ? 'bg-yellow-500/10 border-yellow-500/30' : 'bg-green-500/10 border-green-500/30'
                  }`}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs text-[#8b949e]">Incidencia calculada</span>
                      <span className={`text-xl font-bold ${incidencia >= 30 ? 'text-red-400' : incidencia >= 10 ? 'text-yellow-400' : 'text-green-400'}`}>{incidencia}%</span>
                    </div>
                    <div className="h-2 bg-[#30363d] rounded-full overflow-hidden mb-2">
                      <div className="h-full rounded-full" style={{ width: `${Math.min(incidencia, 100)}%`, background: incidencia >= 30 ? '#ef4444' : incidencia >= 10 ? '#f59e0b' : '#10b981' }} />
                    </div>
                    <p className="text-[10px] text-[#484f58]">
                      {incidencia >= 30 ? '⚠️ Supera umbral crítico (≥30%). Intervención urgente evaluada en sección NDE.'
                       : incidencia >= 10 ? '⚡ Supera umbral de alerta (≥10%). Evaluar intervención en sección NDE.'
                       : '✓ Por debajo del umbral de alerta (<10%). Continuar monitoreo.'}
                    </p>
                  </div>
                )}
                {plantasAf > plantasEv && plantasEv > 0 && <p className="text-red-400 text-xs mt-1">⚠️ Las plantas con síntomas no pueden superar las evaluadas.</p>}
              </div>

              {/* Severidad */}
              <div>
                <label className="block text-xs font-medium text-[#c9d1d9] mb-1">
                  Severidad del daño por planta *
                  {form.severidad && iaEstado === 'confirmed' && sugerencia?.severidadSugerida > 0 && <span className="ml-2 text-[#10b981]">← estimada por IA</span>}
                </label>
                <p className="text-[#484f58] text-[11px] mb-2">Escala 1-4 según proporción de tejido dañado en plantas con síntomas.</p>
                <div className="space-y-2">
                  {SEVERIDAD_INFO.map(s => (
                    <button key={s.valor} type="button" onClick={() => set('severidad', String(s.valor))}
                      className="w-full text-left px-4 py-3 rounded-lg border transition-colors"
                      style={parseInt(form.severidad) === s.valor
                        ? { borderColor: s.color + '60', backgroundColor: s.color + '15' }
                        : { borderColor: '#30363d' }}>
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium" style={{ color: parseInt(form.severidad) === s.valor ? s.color : '#c9d1d9' }}>{s.label}</span>
                        {parseInt(form.severidad) === s.valor && <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: s.color + '20', color: s.color }}>Seleccionado</span>}
                      </div>
                      <p className="text-[#8b949e] text-xs mt-0.5">{s.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Densidad poblacional */}
              <div>
                <label className="block text-xs font-medium text-[#c9d1d9] mb-1.5">
                  Densidad poblacional <span className="text-[#484f58] font-normal">(recomendado para NDE preciso)</span>
                </label>
                <p className="text-[#484f58] text-[11px] mb-2">
                  Cuenta los individuos de la plaga observados. Este dato permite calcular el NDE con mayor precisión.
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] text-[#8b949e] mb-1">Nº de individuos contados</label>
                    <input type="number" min="0" placeholder="Ej: 25"
                      value={form.individuosContados} onChange={e => set('individuosContados', e.target.value)}
                      className="w-full bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-2 text-white text-sm placeholder-[#484f58] focus:outline-none focus:border-[#10b981] transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-[#8b949e] mb-1">Unidad de muestreo</label>
                    <select value={form.unidadMuestreo} onChange={e => set('unidadMuestreo', e.target.value)}
                      className="w-full bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#10b981] transition-colors">
                      {UNIDADES_MUESTREO.map(u => <option key={u.valor} value={u.valor}>{u.label}</option>)}
                    </select>
                  </div>
                </div>
              </div>

              {/* Distribución espacial */}
              <div>
                <label className="block text-xs font-medium text-[#c9d1d9] mb-2">Distribución espacial en el lote *</label>
                <div className="space-y-2">
                  {DISTRIBUCIONES_ESPACIALES.map(d => (
                    <button key={d.valor} type="button" onClick={() => set('distribucionEspacial', d.valor)}
                      className={`w-full text-left px-4 py-3 rounded-lg border text-xs transition-colors ${
                        form.distribucionEspacial === d.valor
                          ? 'border-[#10b981]/60 bg-[#10b981]/10'
                          : 'border-[#30363d] hover:border-[#484f58]'
                      }`}>
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className={`font-semibold ${form.distribucionEspacial === d.valor ? 'text-[#10b981]' : 'text-[#c9d1d9]'}`}>{d.icono} {d.label}</p>
                          <p className="text-[#8b949e] mt-0.5">{d.desc}</p>
                        </div>
                        {form.distribucionEspacial === d.valor && <span className="text-[#10b981] text-xs shrink-0">✓</span>}
                      </div>
                      {form.distribucionEspacial === d.valor && (
                        <p className="text-[#10b981]/70 text-[10px] mt-1.5 pt-1.5 border-t border-[#10b981]/20">💡 {d.recomendacion}</p>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* Nivel MIP calculado */}
              {nivelMIP && (
                <div className={`rounded-xl p-4 border ${nivelStyle[nivelMIP]}`}>
                  <p className="text-sm font-bold">{nivelIcono[nivelMIP]} Nivel de riesgo MIP: {nivelMIP.toUpperCase()}</p>
                  <p className="text-xs opacity-70 mt-1">Basado en incidencia {incidencia}% + severidad {form.severidad}/4</p>
                  <p className="text-[10px] opacity-50 mt-0.5">
                    {nivelMIP === 'alto'  && 'Incidencia ≥30% o severidad ≥3 → ver cálculo NDE abajo.'}
                    {nivelMIP === 'medio' && 'Incidencia ≥10% o severidad ≥2 → evaluar umbral económico.'}
                    {nivelMIP === 'bajo'  && 'Por debajo de umbrales. Evaluar si justifica acción económica.'}
                  </p>
                </div>
              )}
            </div>

            {/* ── FASE 5: Evaluación económica NDE ─────────────────────────── */}
            <div className={`rounded-xl p-4 space-y-4 border-2 transition-colors ${
              !resumenEco                                      ? 'bg-[#161b22] border-[#30363d]'
              : resumenEco.estadoEconomico === 'plaga'         ? 'bg-red-950/30 border-red-500/60'
              : resumenEco.estadoEconomico === 'vigilancia'    ? 'bg-yellow-950/30 border-yellow-500/60'
              : 'bg-[#161b22] border-green-500/40'
            }`}>

              {/* Header */}
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                    💰 Fase 5 — Clasificación Económica (NDE)
                    <span className="text-[10px] font-normal text-[#484f58]">Metodología ICA Colombia</span>
                  </h3>
                  <p className="text-[#8b949e] text-[11px] mt-1 leading-relaxed">
                    En Colombia, un organismo se clasifica como <strong className="text-white">plaga</strong> solo cuando
                    el daño económico que causa supera el costo de controlarlo. Sin este análisis, es solo un avistamiento.
                  </p>
                </div>
                {form.cultivo && (
                  <span className="text-[10px] text-[#10b981] bg-[#10b981]/10 border border-[#10b981]/30 px-2 py-1 rounded shrink-0 ml-3">
                    ✓ Valores típicos
                  </span>
                )}
              </div>

              {/* ── VEREDICTO PRINCIPAL (aparece al tener todos los datos) ── */}
              {resumenEco && (
                <div className={`rounded-xl p-5 border-2 text-center ${
                  resumenEco.estadoEconomico === 'plaga'
                    ? 'border-red-500 bg-red-500/10'
                    : resumenEco.estadoEconomico === 'vigilancia'
                    ? 'border-yellow-500 bg-yellow-500/10'
                    : 'border-green-500 bg-green-500/10'
                }`}>
                  <p className={`text-2xl font-black tracking-tight mb-1 ${
                    resumenEco.estadoEconomico === 'plaga'      ? 'text-red-400'
                    : resumenEco.estadoEconomico === 'vigilancia' ? 'text-yellow-400'
                    : 'text-green-400'
                  }`}>
                    {resumenEco.estadoEconomico === 'plaga'      ? '🔴 PLAGA ECONÓMICA CONFIRMADA'
                     : resumenEco.estadoEconomico === 'vigilancia' ? '🟡 ZONA DE VIGILANCIA'
                     : '🟢 POR DEBAJO DEL UMBRAL'}
                  </p>
                  <p className="text-[#c9d1d9] text-sm mt-1 max-w-sm mx-auto">
                    {resumenEco.estadoEconomico === 'plaga'
                      ? `La incidencia actual (${incidencia}%) supera el NDE (${resumenEco.nde}%). El daño justifica económicamente la intervención según criterios ICA.`
                      : resumenEco.estadoEconomico === 'vigilancia'
                      ? `La incidencia (${incidencia}%) superó el Umbral de Acción (${resumenEco.umbralAccion}%) pero aún no alcanza el NDE (${resumenEco.nde}%). Prepare el plan de intervención.`
                      : `La incidencia (${incidencia}%) está por debajo del Umbral de Acción (${resumenEco.umbralAccion}%). Este organismo NO clasifica como plaga actualmente. Continuar monitoreo.`}
                  </p>

                  {/* Consecuencia del reporte */}
                  <div className={`mt-3 mx-auto max-w-xs rounded-lg px-4 py-2.5 text-xs font-semibold ${
                    estadoReporteCalculado === 'alerta_preventiva'
                      ? 'bg-orange-500/20 text-orange-300 border border-orange-500/40'
                      : 'bg-[#0d1117]/60 text-[#8b949e] border border-[#30363d]'
                  }`}>
                    {estadoReporteCalculado === 'alerta_preventiva'
                      ? '📡 Este reporte se registrará como ALERTA PREVENTIVA y será visible en el mapa.'
                      : '📋 Este reporte se registrará como OBSERVACIÓN de monitoreo. No genera alerta en el mapa.'}
                  </div>
                </div>
              )}

              {/* ── Comparativa umbral actual vs umbrales NDE ── */}
              {incidencia !== null && (
                <div className="bg-[#0d1117] rounded-xl border border-[#30363d] overflow-hidden">
                  <div className="px-3 py-2 border-b border-[#30363d]">
                    <p className="text-[10px] text-[#484f58] font-semibold uppercase tracking-wide">
                      Posición actual vs umbrales MIP
                    </p>
                  </div>
                  <div className="grid grid-cols-3 divide-x divide-[#30363d]">
                    {/* Incidencia actual */}
                    <div className="px-3 py-3 text-center">
                      <p className="text-[9px] text-[#484f58] uppercase tracking-wide mb-1">Incidencia actual</p>
                      <p className={`text-2xl font-black leading-none ${
                        resumenEco
                          ? resumenEco.estadoEconomico === 'plaga'      ? 'text-red-400'
                          : resumenEco.estadoEconomico === 'vigilancia' ? 'text-yellow-400'
                          : 'text-green-400'
                          : 'text-white'
                      }`}>{incidencia}%</p>
                      <p className="text-[9px] text-[#484f58] mt-1">lo que se midió</p>
                    </div>

                    {/* Umbral de Acción */}
                    <div className={`px-3 py-3 text-center ${resumenEco && incidencia >= resumenEco.umbralAccion ? 'bg-yellow-500/5' : ''}`}>
                      <p className="text-[9px] text-[#484f58] uppercase tracking-wide mb-1">Umbral de Acción</p>
                      <p className="text-2xl font-black leading-none text-yellow-400">
                        {resumenEco ? `${resumenEco.umbralAccion}%` : '—'}
                      </p>
                      <p className="text-[9px] text-[#484f58] mt-1">actuar antes de aquí</p>
                      {resumenEco && (
                        <p className={`text-[10px] font-semibold mt-1 ${incidencia >= resumenEco.umbralAccion ? 'text-yellow-400' : 'text-[#484f58]'}`}>
                          {incidencia >= resumenEco.umbralAccion ? '⚡ Superado' : `faltan ${(resumenEco.umbralAccion - incidencia).toFixed(1)}%`}
                        </p>
                      )}
                    </div>

                    {/* NDE */}
                    <div className={`px-3 py-3 text-center ${resumenEco && incidencia >= resumenEco.nde ? 'bg-red-500/5' : ''}`}>
                      <p className="text-[9px] text-[#484f58] uppercase tracking-wide mb-1">NDE — Daño económico</p>
                      <p className="text-2xl font-black leading-none text-red-400">
                        {resumenEco ? `${resumenEco.nde}%` : '—'}
                      </p>
                      <p className="text-[9px] text-[#484f58] mt-1">se clasifica como plaga</p>
                      {resumenEco && (
                        <p className={`text-[10px] font-semibold mt-1 ${incidencia >= resumenEco.nde ? 'text-red-400' : 'text-[#484f58]'}`}>
                          {incidencia >= resumenEco.nde ? '🔴 Superado' : `faltan ${(resumenEco.nde - incidencia).toFixed(1)}%`}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Barra visual de posición */}
                  {resumenEco && (
                    <div className="px-3 pb-3 pt-1">
                      <div className="relative h-2.5 bg-[#21262d] rounded-full overflow-hidden">
                        <div className="absolute h-full bg-green-500/25 rounded-l-full"
                          style={{ width: `${Math.min((resumenEco.umbralAccion / Math.max(resumenEco.nde, incidencia, 1)) * 100, 100)}%` }} />
                        <div className="absolute h-full bg-yellow-500/25"
                          style={{
                            left: `${Math.min((resumenEco.umbralAccion / Math.max(resumenEco.nde, incidencia, 1)) * 100, 100)}%`,
                            width: `${Math.max(0, ((resumenEco.nde - resumenEco.umbralAccion) / Math.max(resumenEco.nde, incidencia, 1)) * 100)}%`,
                          }} />
                        <div className="absolute h-full bg-red-500/25 rounded-r-full"
                          style={{ left: `${Math.min((resumenEco.nde / Math.max(resumenEco.nde, incidencia, 1)) * 100, 100)}%`, right: 0 }} />
                        {/* Marcador incidencia */}
                        <div className="absolute top-0 h-full w-1 rounded-full"
                          style={{
                            left: `${Math.min((incidencia / Math.max(resumenEco.nde, incidencia, 1)) * 100, 100)}%`,
                            background: resumenEco.estadoEconomico === 'plaga' ? '#ef4444'
                              : resumenEco.estadoEconomico === 'vigilancia' ? '#f59e0b' : '#10b981',
                          }} />
                      </div>
                      <p className="text-[9px] text-[#484f58] mt-1 text-center">
                        {!resumenEco
                          ? 'Completa los parámetros para ver el NDE'
                          : resumenEco.estadoEconomico === 'plaga'
                          ? `La incidencia supera el NDE en ${(incidencia - resumenEco.nde).toFixed(1)} puntos porcentuales`
                          : resumenEco.estadoEconomico === 'vigilancia'
                          ? `En zona de vigilancia — ${(resumenEco.nde - incidencia).toFixed(1)}% por debajo del NDE`
                          : `${(resumenEco.umbralAccion - incidencia).toFixed(1)}% por debajo del Umbral de Acción`}
                      </p>
                    </div>
                  )}

                  {/* Si aún no hay resumenEco, mostrar la incidencia y una guía */}
                  {!resumenEco && (
                    <div className="px-3 pb-3">
                      <p className="text-[10px] text-[#484f58] text-center">
                        Completa los 4 parámetros económicos para calcular el NDE y ver los umbrales.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* ── Parámetros económicos ── */}
              <div>
                <p className="text-xs text-[#484f58] mb-3">
                  Ingresa los valores del lote. Los valores típicos para <strong className="text-[#8b949e]">{form.cultivo || 'el cultivo seleccionado'}</strong> se cargaron automáticamente — ajústalos si corresponde.
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] text-[#8b949e] mb-1">
                      C — Costo del control ($/ha)
                      <span className="block text-[#484f58]">Plaguicida + aplicación + mano de obra</span>
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#484f58] text-xs">$</span>
                      <input type="number" min="0" placeholder="180000"
                        value={form.costoControlHa} onChange={e => set('costoControlHa', e.target.value)}
                        className="w-full bg-[#0d1117] border border-[#30363d] rounded-lg pl-6 pr-3 py-2 text-white text-sm placeholder-[#484f58] focus:outline-none focus:border-[#10b981] transition-colors"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] text-[#8b949e] mb-1">
                      P — Precio del cultivo ($/kg)
                      <span className="block text-[#484f58]">Precio en campo o plaza de mercado</span>
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#484f58] text-xs">$</span>
                      <input type="number" min="0" placeholder="3000"
                        value={form.precioKg} onChange={e => set('precioKg', e.target.value)}
                        className="w-full bg-[#0d1117] border border-[#30363d] rounded-lg pl-6 pr-3 py-2 text-white text-sm placeholder-[#484f58] focus:outline-none focus:border-[#10b981] transition-colors"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] text-[#8b949e] mb-1">
                      R — Rendimiento esperado (t/ha)
                      <span className="block text-[#484f58]">Producción estimada del lote esta temporada</span>
                    </label>
                    <input type="number" min="0" step="0.1" placeholder="1.2"
                      value={form.rendimientoTha} onChange={e => set('rendimientoTha', e.target.value)}
                      className="w-full bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-2 text-white text-sm placeholder-[#484f58] focus:outline-none focus:border-[#10b981] transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-[#8b949e] mb-1">
                      K — Eficiencia del control (%)
                      <span className="block text-[#484f58]">% de reducción de daño lograda con el control</span>
                    </label>
                    <div className="relative">
                      <input type="number" min="0" max="100" placeholder="80"
                        value={form.eficienciaControl} onChange={e => set('eficienciaControl', e.target.value)}
                        className="w-full bg-[#0d1117] border border-[#30363d] rounded-lg px-3 pr-8 py-2 text-white text-sm placeholder-[#484f58] focus:outline-none focus:border-[#10b981] transition-colors"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[#484f58] text-xs">%</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* ── Barra visual NDE ── */}
              {resumenEco && (
                <div className="space-y-3">
                  {/* Barra con zonas coloreadas */}
                  <div>
                    <div className="flex items-center justify-between text-[10px] text-[#484f58] mb-1.5">
                      <span>0%</span>
                      <span className="text-yellow-400/80">▲ U.A. {resumenEco.umbralAccion}%</span>
                      <span className="text-red-400/80">▲ NDE {resumenEco.nde}%</span>
                      <span>100%</span>
                    </div>
                    <div className="relative h-4 bg-[#21262d] rounded-full overflow-hidden">
                      <div className="absolute h-full bg-green-500/25 rounded-l-full"
                        style={{ width: `${Math.min(resumenEco.umbralAccion, 100)}%` }} />
                      <div className="absolute h-full bg-yellow-500/25"
                        style={{ left: `${Math.min(resumenEco.umbralAccion, 100)}%`, width: `${Math.max(0, Math.min(resumenEco.nde, 100) - resumenEco.umbralAccion)}%` }} />
                      <div className="absolute h-full bg-red-500/25 rounded-r-full"
                        style={{ left: `${Math.min(resumenEco.nde, 100)}%`, right: 0 }} />
                      {/* Marcador incidencia actual */}
                      <div className="absolute top-0 h-full w-1 rounded-full"
                        style={{
                          left: `${Math.min(incidencia, 100)}%`,
                          background: resumenEco.estadoEconomico === 'plaga' ? '#ef4444'
                            : resumenEco.estadoEconomico === 'vigilancia' ? '#f59e0b' : '#10b981',
                          boxShadow: '0 0 6px currentColor',
                        }} />
                    </div>
                    <div className="flex items-center gap-1.5 mt-1.5">
                      <div className="w-1 h-3 rounded-full"
                        style={{ background: resumenEco.estadoEconomico === 'plaga' ? '#ef4444' : resumenEco.estadoEconomico === 'vigilancia' ? '#f59e0b' : '#10b981' }} />
                      <span className="text-[10px] text-[#c9d1d9]">
                        Incidencia actual: <strong>{incidencia}%</strong>
                      </span>
                    </div>
                  </div>

                  {/* Indicadores numéricos */}
                  <div className="grid grid-cols-4 gap-2">
                    <div className="bg-[#0d1117] rounded-lg p-2.5 text-center">
                      <p className="text-[#484f58] text-[9px] uppercase tracking-wide mb-0.5">NDE</p>
                      <p className="text-white font-bold text-lg leading-none">{resumenEco.nde}%</p>
                      <p className="text-[#484f58] text-[9px] mt-0.5">incidencia</p>
                    </div>
                    <div className="bg-[#0d1117] rounded-lg p-2.5 text-center">
                      <p className="text-[#484f58] text-[9px] uppercase tracking-wide mb-0.5">Umbral acción</p>
                      <p className="text-yellow-400 font-bold text-lg leading-none">{resumenEco.umbralAccion}%</p>
                      <p className="text-[#484f58] text-[9px] mt-0.5">actuar aquí</p>
                    </div>
                    <div className="bg-[#0d1117] rounded-lg p-2.5 text-center">
                      <p className="text-[#484f58] text-[9px] uppercase tracking-wide mb-0.5">Pérdida/ha</p>
                      <p className={`font-bold text-lg leading-none ${resumenEco.estadoEconomico === 'plaga' ? 'text-red-400' : 'text-[#c9d1d9]'}`}>
                        {formatPesos(resumenEco.perdidaEstimada)}
                      </p>
                      <p className="text-[#484f58] text-[9px] mt-0.5">sin control</p>
                    </div>
                    <div className="bg-[#0d1117] rounded-lg p-2.5 text-center">
                      <p className="text-[#484f58] text-[9px] uppercase tracking-wide mb-0.5">Ratio B/C</p>
                      <p className={`font-bold text-lg leading-none ${(resumenEco.ratioBenefCosto ?? 0) >= 1 ? 'text-green-400' : 'text-[#484f58]'}`}>
                        {resumenEco.ratioBenefCosto != null ? `${resumenEco.ratioBenefCosto}x` : '—'}
                      </p>
                      <p className="text-[#484f58] text-[9px] mt-0.5">{(resumenEco.ratioBenefCosto ?? 0) >= 1 ? 'rentable' : 'no rentable'}</p>
                    </div>
                  </div>

                  {/* Fórmula aplicada */}
                  <div className="bg-[#0d1117] rounded-lg px-3 py-2 text-[10px] text-[#484f58] font-mono">
                    NDE = C / (V × D × K) = {formatPesos(costoNum)} / ({formatPesos(resumenEco.valorCosechaHa)} × D{severidadNum} × {(eficienciaDec * 100).toFixed(0)}%) = <strong className="text-[#8b949e]">{resumenEco.nde}%</strong>
                    <span className="ml-2 text-[#484f58] font-sans">· Valor cosecha: {formatPesos(resumenEco.valorCosechaHa)}/ha</span>
                  </div>
                </div>
              )}

              {/* Instrucción si faltan datos */}
              {!resumenEco && (
                <div className="bg-[#0d1117] border border-dashed border-[#30363d] rounded-lg px-4 py-5 text-center">
                  <p className="text-[#484f58] text-xs">
                    {incidencia === null
                      ? '↑ Completa primero la Fase 4 (incidencia + severidad) para calcular el NDE.'
                      : 'Completa los 4 parámetros económicos para obtener el veredicto de clasificación.'}
                  </p>
                </div>
              )}
            </div>

            {/* ── Observaciones ─────────────────────────────────────────────── */}
            <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-4 space-y-4">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">📝 Observaciones del Técnico</h3>
              <div>
                <label className="block text-xs font-medium text-[#c9d1d9] mb-1.5">
                  Descripción adicional <span className="text-[#484f58] font-normal">(opcional)</span>
                </label>
                <textarea rows={3} placeholder="Síntomas adicionales, condiciones del lote, historial de aplicaciones previas..."
                  value={form.descripcion} onChange={e => set('descripcion', e.target.value)}
                  className="w-full bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-2 text-white text-sm placeholder-[#484f58] focus:outline-none focus:border-[#10b981] transition-colors resize-none"
                />
              </div>

              {/* Progreso de completitud */}
              <div className="bg-[#0d1117] rounded-lg p-3 space-y-1.5">
                <p className="text-[#484f58] text-[10px] font-semibold mb-2">COMPLETITUD DEL REPORTE MIP</p>
                {[
                  { ok: !!coords && !!imagenFile,        label: 'GPS + Fotografía' },
                  { ok: mipBiologicoCompleto,             label: 'Identificación biológica (tipo + estadio)' },
                  { ok: mipCultivoCompleto,               label: 'Cultivo hospedante (cultivo + fenología + parte)' },
                  { ok: mipCampoCompleto,                 label: 'Evaluación de campo (incidencia + severidad + distribución)' },
                  { ok: mipEcoCompleto && !!resumenEco,   label: 'Evaluación económica NDE calculado' },
                  { ok: !!plagaFinal,                     label: 'Plaga identificada' },
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <span className={item.ok ? 'text-[#10b981]' : 'text-[#484f58]'}>{item.ok ? '✓' : '○'}</span>
                    <span className={item.ok ? 'text-[#8b949e]' : 'text-[#484f58]'}>{item.label}</span>
                  </div>
                ))}
              </div>

              {/* Feedbacks */}
              {submitStatus === 'success' && (() => {
                // Capturamos los valores del último resumen antes del reset
                return (
                  <div className="rounded-xl border border-green-500/40 bg-green-500/5 p-4 space-y-3">
                    <p className="text-green-400 text-sm font-semibold">
                      ✓ Evaluación MIP registrada correctamente
                    </p>
                    {esCuarentenariaFlag && (
                      <div className="bg-purple-500/10 border border-purple-500/40 rounded-lg px-3 py-2">
                        <p className="text-purple-300 text-xs font-semibold">
                          🚨 Plaga cuarentenaria — Notificar al ICA: <strong>01 8000 111 668</strong>
                        </p>
                      </div>
                    )}
                    <p className="text-[#8b949e] text-xs">
                      El estado y los datos del umbral quedan disponibles en el
                      {' '}<strong className="text-[#c9d1d9]">Panel de Seguimiento de Umbrales</strong>{' '}
                      en el Dashboard y en el <strong className="text-[#c9d1d9]">Panel Admin</strong>.
                      Puedes ver en qué porcentaje del NDE se encuentra el organismo en cualquier momento.
                    </p>
                  </div>
                )
              })()}
              {submitStatus === 'error' && (
                <p className="text-red-400 text-sm bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2">✗ Error al guardar. Intenta de nuevo.</p>
              )}

              {/* Veredicto final antes del botón */}
              {puedeEnviar && resumenEco && (
                <div className={`rounded-lg px-4 py-3 border flex items-center gap-3 ${
                  estadoReporteCalculado === 'alerta_preventiva'
                    ? 'bg-orange-500/10 border-orange-500/40'
                    : 'bg-[#0d1117] border-[#30363d]'
                }`}>
                  <span className="text-xl shrink-0">
                    {estadoReporteCalculado === 'alerta_preventiva' ? '📡' : '📋'}
                  </span>
                  <div>
                    <p className={`text-xs font-semibold ${estadoReporteCalculado === 'alerta_preventiva' ? 'text-orange-400' : 'text-[#8b949e]'}`}>
                      {estadoReporteCalculado === 'alerta_preventiva'
                        ? 'Se registrará como ALERTA PREVENTIVA — visible en el mapa de monitoreo'
                        : 'Se registrará como OBSERVACIÓN de monitoreo — no genera alerta activa'}
                    </p>
                    <p className="text-[#484f58] text-[10px] mt-0.5">
                      {estadoReporteCalculado === 'alerta_preventiva'
                        ? 'Un profesional agrónomo debe confirmar para elevar a plaga confirmada.'
                        : `Incidencia actual ${incidencia}% < Umbral de Acción ${resumenEco.umbralAccion}%. Continuar monitoreo.`}
                    </p>
                  </div>
                </div>
              )}

              <button type="submit" disabled={!puedeEnviar}
                className={`w-full disabled:opacity-50 text-white font-semibold py-3 rounded-lg transition-colors flex items-center justify-center gap-2 ${
                  estadoReporteCalculado === 'alerta_preventiva' && puedeEnviar
                    ? 'bg-orange-600 hover:bg-orange-700'
                    : 'bg-[#10b981] hover:bg-[#059669]'
                }`}>
                {submitStatus === 'loading' ? (
                  <>
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                    </svg>
                    Registrando evaluación MIP...
                  </>
                ) : esCuarentenariaFlag
                  ? '🚨 Registrar Alerta Cuarentenaria'
                  : estadoReporteCalculado === 'alerta_preventiva'
                  ? '📡 Registrar como Alerta Preventiva'
                  : resumenEco
                  ? '📋 Registrar Observación de Monitoreo'
                  : 'Registrar Evaluación MIP'}
              </button>

              {!puedeEnviar && submitStatus !== 'loading' && (
                <p className="text-[#484f58] text-xs text-center">
                  {!coords       ? '📍 Captura tu ubicación GPS primero.'
                  : !imagenFile  ? '📷 Adjunta una fotografía del avistamiento.'
                  : !plagaFinal  ? '🔬 Identifica el organismo (Fase 1 o 2).'
                  : !mipCompleto ? 'Completa todas las fases del formulario MIP.'
                  : ''}
                </p>
              )}
            </div>
          </form>
        </div>
      </main>
    </div>
  )
}
