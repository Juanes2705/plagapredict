// HU-04 + HU-05 + HU-08 + HU-IA + MIP: Formulario de reporte con criterios técnicos ICA Colombia
import { useState, useEffect, useRef } from 'react'
import { collection, addDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../context/AuthContext'
import { useGeolocation } from '../hooks/useGeolocation'
import { fetchWeather, windDirLabel } from '../services/weatherService'
import { identificarPlagaDesdeImagen, fileToBase64 } from '../services/geminiService'
import Sidebar from '../components/Sidebar'

// ── Plagas más comunes en Colombia (Valle del Cauca) ──────────────────────────
const PLAGAS_COLOMBIA = [
  { nombre: 'Gusano cogollero',        cientifico: 'Spodoptera frugiperda',     wikiTitle: 'Fall armyworm',          cultivos: 'Maíz, sorgo, arroz, caña de azúcar',         tipoOrganismo: 'Insecto', emoji: '🐛' },
  { nombre: 'Broca del café',          cientifico: 'Hypothenemus hampei',        wikiTitle: 'Coffee berry borer',     cultivos: 'Café',                                        tipoOrganismo: 'Insecto', emoji: '🐞' },
  { nombre: 'Mosca de la fruta',       cientifico: 'Anastrepha obliqua',         wikiTitle: 'Anastrepha obliqua',     cultivos: 'Mango, guayaba, maracuyá, cítricos',          tipoOrganismo: 'Insecto', emoji: '🪰' },
  { nombre: 'Mosca blanca',            cientifico: 'Bemisia tabaci',             wikiTitle: 'Bemisia tabaci',         cultivos: 'Tomate, pimentón, pepino, fríjol',            tipoOrganismo: 'Insecto', emoji: '🦟' },
  { nombre: 'Áfidos / Pulgones',       cientifico: 'Familia Aphididae',          wikiTitle: 'Aphid',                  cultivos: 'Hortalizas, flores, frutales, leguminosas',   tipoOrganismo: 'Insecto', emoji: '🐜' },
  { nombre: 'Trips de las flores',     cientifico: 'Frankliniella occidentalis', wikiTitle: 'Western flower thrips',  cultivos: 'Rosas, clavel, crisantemo, cebolla',          tipoOrganismo: 'Insecto', emoji: '🔬' },
  { nombre: 'Picudo negro del plátano',cientifico: 'Cosmopolites sordidus',      wikiTitle: 'Cosmopolites sordidus',  cultivos: 'Plátano, banano',                             tipoOrganismo: 'Insecto', emoji: '🪲' },
  { nombre: 'Barrenador de la caña',   cientifico: 'Diatraea saccharalis',       wikiTitle: 'Diatraea saccharalis',   cultivos: 'Caña de azúcar',                              tipoOrganismo: 'Insecto', emoji: '🐛' },
  { nombre: 'Ácaro rojo / Arañita roja',cientifico: 'Tetranychus urticae',       wikiTitle: 'Tetranychus urticae',    cultivos: 'Fríjol, soya, fresas, flores, cucurbitáceas', tipoOrganismo: 'Ácaro',   emoji: '🕷️' },
  { nombre: 'Hormiga arriera',         cientifico: 'Atta cephalotes',            wikiTitle: 'Atta cephalotes',        cultivos: 'Yuca, maíz, frutales tropicales, pastos',     tipoOrganismo: 'Insecto', emoji: '🐜' },
  { nombre: 'Minador de hojas',        cientifico: 'Liriomyza huidobrensis',     wikiTitle: 'Liriomyza huidobrensis', cultivos: 'Papa, arveja, tomate, hortalizas',            tipoOrganismo: 'Insecto', emoji: '🌿' },
  { nombre: 'Chinche del aguacate',    cientifico: 'Leptopharsa gibbicarina',    wikiTitle: 'Leptopharsa gibbicarina',cultivos: 'Aguacate',                                    tipoOrganismo: 'Insecto', emoji: '🐛' },
  { nombre: 'Chisa / Gallina ciega',   cientifico: 'Phyllophaga spp.',           wikiTitle: 'Phyllophaga',            cultivos: 'Caña, maíz, pastos, hortalizas, papa',        tipoOrganismo: 'Insecto', emoji: '🪲' },
  { nombre: 'Palomilla del maíz',      cientifico: 'Sitotroga cerealella',       wikiTitle: 'Sitotroga cerealella',   cultivos: 'Maíz almacenado, arroz, trigo',               tipoOrganismo: 'Insecto', emoji: '🦋' },
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
  { valor: 'Insecto',    label: 'Insecto',               desc: 'Mosca, mariposa, escarabajo, chinche...' },
  { valor: 'Ácaro',      label: 'Ácaro / Araña',         desc: 'Arañita roja, ácaro del bronceado...' },
  { valor: 'Nematodo',   label: 'Nematodo',              desc: 'Organismos microscópicos del suelo' },
  { valor: 'Hongo',      label: 'Hongo / Oomiceto',      desc: 'Mildiu, roya, Fusarium, Botrytis...' },
  { valor: 'Bacteria',   label: 'Bacteria',              desc: 'Marchitez bacteriana, cancro...' },
  { valor: 'Virus',      label: 'Virus / Viroide',       desc: 'Mosaico, amarillamiento, encrespamiento...' },
  { valor: 'Maleza',     label: 'Maleza / Arvense',      desc: 'Planta que compite con el cultivo' },
  { valor: 'Otro',       label: 'Otro organismo',        desc: 'Molusco, roedor, pájaro...' },
]

const PARTES_PLANTA = [
  { valor: 'hoja',    label: 'Hoja / Follaje' },
  { valor: 'tallo',   label: 'Tallo / Tronco' },
  { valor: 'raiz',    label: 'Raíz / Corona' },
  { valor: 'fruto',   label: 'Fruto / Semilla' },
  { valor: 'flor',    label: 'Flor / Yema' },
  { valor: 'planta_entera', label: 'Planta entera' },
]

const FASES_FENOLOGICAS = [
  { valor: 'germinacion',   label: 'Germinación / Emergencia' },
  { valor: 'vegetativo',    label: 'Desarrollo vegetativo' },
  { valor: 'floracion',     label: 'Floración' },
  { valor: 'fructificacion',label: 'Fructificación / Llenado' },
  { valor: 'maduracion',    label: 'Maduración / Cosecha' },
]

const SEVERIDAD_INFO = [
  { valor: 1, label: '1 – Leve',       color: '#10b981', desc: 'Daño incipiente, <10% del área foliar o tejido afectado por planta. Sin impacto en rendimiento.' },
  { valor: 2, label: '2 – Moderado',   color: '#f59e0b', desc: '10-30% del área o tejido afectado. Reducción leve del rendimiento posible.' },
  { valor: 3, label: '3 – Severo',     color: '#f97316', desc: '30-60% del área o tejido afectado. Pérdidas de rendimiento evidentes.' },
  { valor: 4, label: '4 – Muy severo', color: '#ef4444', desc: '>60% del tejido afectado. Pérdida severa o muerte de la planta.' },
]

// ── Cálculo de nivel MIP (basado en umbrales de daño económico ICA) ───────────
// Fuente: ICA Colombia - Manejo Integrado de Plagas
// Incidencia = % plantas afectadas; Severidad = escala 1-4
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

// ── Componente: tarjeta de imagen de Wikipedia ───────────────────────────────
function PlagaImageCard({ wikiTitle, cientifico, cultivos }) {
  const [imagen,  setImagen]  = useState(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(false)

  useEffect(() => {
    if (!wikiTitle) { setLoading(false); return }
    setLoading(true); setError(false); setImagen(null)
    fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(wikiTitle)}`)
      .then(r => r.json())
      .then(data => {
        if (data.thumbnail?.source) { setImagen(data.thumbnail.source); setLoading(false) }
        else return fetch(`https://es.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(wikiTitle)}`)
          .then(r2 => r2.json())
          .then(data2 => { setImagen(data2.thumbnail?.source ?? null); setError(!data2.thumbnail?.source); setLoading(false) })
      })
      .catch(() => { setError(true); setLoading(false) })
  }, [wikiTitle])

  if (!wikiTitle) return null
  return (
    <div className="mt-3 rounded-xl overflow-hidden border border-[#30363d] bg-[#0d1117]">
      <div className="relative h-44 bg-[#161b22] flex items-center justify-center">
        {loading && <div className="flex flex-col items-center gap-2 text-[#484f58]"><svg className="animate-spin h-6 w-6 text-[#10b981]" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg><span className="text-xs">Cargando imagen...</span></div>}
        {!loading && imagen && <img src={imagen} alt={cientifico ?? 'Plaga'} className="w-full h-full object-cover" onError={() => { setImagen(null); setError(true) }} />}
        {!loading && !imagen && <div className="flex flex-col items-center gap-2 text-[#484f58]"><span className="text-4xl">🔍</span><span className="text-xs">Sin imagen disponible</span></div>}
      </div>
      {(cientifico || cultivos) && (
        <div className="px-3 py-2.5 space-y-1">
          {cientifico && <p className="text-[#8b949e] text-xs italic">📗 {cientifico}</p>}
          {cultivos && <p className="text-[#484f58] text-xs">🌾 <span className="text-[#8b949e]">Cultivos afectados:</span> {cultivos}</p>}
        </div>
      )}
    </div>
  )
}

// ── Comprimir imagen con Canvas ───────────────────────────────────────────────
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

// ── Componente principal ──────────────────────────────────────────────────────
export default function ReportForm() {
  const { user } = useAuth()
  const { coords, status: gpsStatus, error: gpsError, capture } = useGeolocation()
  const inputFileRef     = useRef(null)
  const inputAdicionalRef = useRef(null)

  // ── Estado del formulario ──────────────────────────────────────────────────
  const [form, setForm] = useState({
    finca:              '',
    plaga:              '',
    plagaPersonalizada: '',
    // Criterios MIP Colombia
    cultivo:            '',
    tipoOrganismo:      '',
    parteAfectada:      [],    // checkboxes
    plantasEvaluadas:   '',
    plantasAfectadas:   '',
    severidad:          '',
    faseFenologica:     '',
    descripcion:        '',
  })

  const [submitStatus, setSubmitStatus] = useState('idle')
  const [clima,        setClima]        = useState(null)
  const [loadingClima, setLoadingClima] = useState(false)

  const set  = (key, val) => setForm(f => ({ ...f, [key]: val }))

  // Toggle parte de planta (checkboxes)
  const toggleParte = (valor) => setForm(f => ({
    ...f,
    parteAfectada: f.parteAfectada.includes(valor)
      ? f.parteAfectada.filter(v => v !== valor)
      : [...f.parteAfectada, valor],
  }))

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

  // ── Fotos adicionales ─────────────────────────────────────────────────────
  const [fotosAdicionales, setFotosAdicionales] = useState([])
  const MAX_FOTOS_ADICIONALES = 4

  const agregarFotosAdicionales = (e) => {
    const files = Array.from(e.target.files ?? [])
    if (!files.length) return
    const nuevas = files
      .filter(f => f.type.startsWith('image/'))
      .slice(0, MAX_FOTOS_ADICIONALES - fotosAdicionales.length)
      .map(f => ({ file: f, preview: URL.createObjectURL(f) }))
    setFotosAdicionales(prev => [...prev, ...nuevas])
    if (inputAdicionalRef.current) inputAdicionalRef.current.value = ''
  }

  const eliminarFotoAdicional = (idx) => {
    setFotosAdicionales(prev => {
      URL.revokeObjectURL(prev[idx].preview)
      return prev.filter((_, i) => i !== idx)
    })
  }

  const handleImageChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) { setIaError('El archivo debe ser una imagen.'); return }
    if (file.size > 10 * 1024 * 1024)   { setIaError('La imagen no debe superar 10 MB.'); return }

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
        const intervalo = setInterval(() => {
          setCuotaSegundos(s => { if (s <= 1) { clearInterval(intervalo); return 0 } return s - 1 })
        }, 1000)
      }
      setIaError(err.message ?? 'Error al conectar con la IA.')
      setIaEstado('error')
    }
  }

  const confirmarSugerencia = () => {
    if (!sugerencia) return
    set('plaga', sugerencia.nombreComun)
    set('plagaPersonalizada', '')
    // Pre-rellenar tipo de organismo si la IA lo detectó
    if (sugerencia.tipoOrganismo && !form.tipoOrganismo) set('tipoOrganismo', sugerencia.tipoOrganismo)
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

  // ── Derivados MIP ──────────────────────────────────────────────────────────
  const plagaFinal = form.plaga === 'Otra' ? form.plagaPersonalizada.trim() : form.plaga
  const plagaInfo  = PLAGAS_COLOMBIA.find(p => p.nombre.toLowerCase() === form.plaga.toLowerCase()) ?? null
  const wikiTitleIA = sugerencia?.nombreCientifico ?? sugerencia?.nombreComun ?? null

  const plantasEv  = parseInt(form.plantasEvaluadas) || 0
  const plantasAf  = parseInt(form.plantasAfectadas) || 0
  const incidencia = plantasEv > 0 && plantasAf >= 0
    ? Math.min(100, Math.round((plantasAf / plantasEv) * 100))
    : null
  const severidadNum = parseInt(form.severidad) || 0
  const nivelMIP = (incidencia !== null && severidadNum > 0)
    ? calcularNivelMIP(incidencia, severidadNum)
    : null

  // Validación: campos MIP obligatorios
  const mipCompleto = !!form.cultivo && !!form.tipoOrganismo && form.parteAfectada.length > 0
    && plantasEv > 0 && plantasAf >= 0 && plantasAf <= plantasEv && severidadNum > 0 && !!form.faseFenologica

  const puedeEnviar = !!coords && !!plagaFinal && !!imagenFile
    && iaEstado !== 'analyzing' && submitStatus !== 'loading' && mipCompleto

  // ── Submit ─────────────────────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!coords)            { alert('Captura tu ubicación GPS primero.'); return }
    if (!form.finca.trim()) { alert('Ingresa el nombre de la finca.'); return }
    if (!plagaFinal)        { alert('Selecciona o escribe el tipo de plaga.'); return }
    if (!mipCompleto)       { alert('Completa todos los criterios de evaluación MIP.'); return }

    setSubmitStatus('loading')
    try {
      const todosLosFiles = [imagenFile, ...fotosAdicionales.map(f => f.file)].filter(Boolean)
      let imagenesBase64 = []
      try {
        imagenesBase64 = await Promise.all(todosLosFiles.map(f => comprimirImagen(f)))
      } catch (imgErr) {
        console.warn('No se pudo comprimir alguna imagen:', imgErr.message)
      }
      const imagenBase64 = imagenesBase64[0] ?? null

      await addDoc(collection(db, 'reportes'), {
        // Datos básicos
        plaga:             plagaFinal,
        finca:             form.finca.trim(),
        nivel:             nivelMIP ?? 'medio',
        descripcion:       form.descripcion,
        lat:               coords.lat,
        lng:               coords.lng,
        precision_m:       coords.accuracy,
        uid_reportador:    user.uid,
        email_reportador:  user.email,
        // Datos climáticos
        temp_c:            clima?.temp_c     ?? null,
        humedad:           clima?.humedad    ?? null,
        viento_kmh:        clima?.viento_kmh ?? null,
        viento_dir:        clima?.viento_dir ?? null,
        fecha:             serverTimestamp(),
        estado_validacion: 'sospechoso',
        // ── Criterios MIP Colombia (ICA) ──────────────────────────────────
        mip: {
          cultivo:           form.cultivo,
          tipoOrganismo:     form.tipoOrganismo,
          parteAfectada:     form.parteAfectada,
          plantasEvaluadas:  plantasEv,
          plantasAfectadas:  plantasAf,
          incidencia_pct:    incidencia,       // % plantas afectadas
          severidad:         severidadNum,     // escala 1-4
          faseFenologica:    form.faseFenologica,
          nivelCalculado:    nivelMIP,         // nivel derivado de incidencia+severidad
        },
        // Imágenes
        ...(imagenBase64   ? { imagenBase64 }   : {}),
        ...(imagenesBase64.length > 0 ? { imagenesBase64 } : {}),
        // IA
        ...(iaEstado === 'confirmed' && sugerencia ? {
          ia_identificacion: {
            nombreComun:         sugerencia.nombreComun,
            nombreCientifico:    sugerencia.nombreCientifico,
            porcentajeConfianza: sugerencia.porcentajeConfianza,
            descripcionDano:     sugerencia.descripcionDano ?? null,
            tipoOrganismo:       sugerencia.tipoOrganismo   ?? null,
            confirmadaPorUsuario: true,
            modelo:              sugerencia.modeloUsado ?? 'ia',
          },
        } : {}),
      })

      setSubmitStatus('success')
      setForm({ finca: '', plaga: '', plagaPersonalizada: '', cultivo: '', tipoOrganismo: '',
        parteAfectada: [], plantasEvaluadas: '', plantasAfectadas: '', severidad: '',
        faseFenologica: '', descripcion: '' })
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
          <p className="text-[#8b949e] text-sm mb-1">
            Registra la plaga con criterios técnicos MIP según el ICA Colombia.
          </p>
          <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg px-3 py-2 mb-6">
            <p className="text-blue-300 text-xs">
              📋 <strong>Metodología MIP (ICA):</strong> El nivel de riesgo se calcula automáticamente
              a partir de la incidencia (% plantas afectadas) y la severidad del daño, según los umbrales
              de daño económico establecidos por el ICA Colombia.
            </p>
          </div>

          {/* ── GPS ──────────────────────────────────────────────────────────── */}
          <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-4 mb-5">
            <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
              <span>📍</span> Ubicación GPS
            </h3>
            {coords ? (
              <div className="bg-[#10b981]/10 border border-[#10b981]/30 rounded-lg p-3 text-sm">
                <p className="text-[#10b981] font-semibold mb-1">Ubicación capturada ✓</p>
                <p className="text-[#c9d1d9]">Lat: <span className="font-mono">{coords.lat.toFixed(6)}</span></p>
                <p className="text-[#c9d1d9]">Lng: <span className="font-mono">{coords.lng.toFixed(6)}</span></p>
                <p className="text-[#8b949e] text-xs mt-1">Precisión: ±{coords.accuracy} m</p>
                {loadingClima && <p className="text-[#8b949e] text-xs mt-2">🌤️ Obteniendo datos climáticos...</p>}
                {clima && !loadingClima && (
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
            {coords && (
              <button type="button" onClick={capture} className="mt-2 text-[#8b949e] hover:text-white text-xs underline">
                Recapturar
              </button>
            )}
          </div>

          {/* ── Fotografía + IA ───────────────────────────────────────────────── */}
          <div className={`bg-[#161b22] rounded-xl p-4 mb-5 border transition-colors ${
            iaEstado === 'confirmed' ? 'border-[#10b981]/50' : iaEstado === 'error' ? 'border-red-500/40' : 'border-[#30363d]'
          }`}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <span>📷</span> Fotografía de la plaga
                <span className="text-xs font-normal text-red-400">* obligatoria</span>
              </h3>
              {iaEstado !== 'idle' && (
                <button onClick={resetIA} className="text-xs text-[#484f58] hover:text-white underline">Reiniciar</button>
              )}
            </div>

            {/* idle */}
            {iaEstado === 'idle' && (
              <div>
                <p className="text-[#8b949e] text-xs mb-3">
                  Sube una foto clara de la plaga. La IA intentará identificarla automáticamente.
                  <span className="text-red-400"> La foto es requerida para enviar el reporte.</span>
                </p>
                <input ref={inputFileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleImageChange} />
                <button type="button" onClick={() => inputFileRef.current?.click()}
                  className="flex items-center gap-2 px-4 py-2 bg-[#0d1117] border-2 border-dashed border-red-500/40 hover:border-[#10b981] text-[#8b949e] hover:text-[#10b981] text-sm rounded-lg transition-colors w-full justify-center">
                  📷 Subir fotografía de la plaga
                </button>
              </div>
            )}

            {/* analyzing */}
            {iaEstado === 'analyzing' && (
              <div className="space-y-3">
                {imagenPreview && <img src={imagenPreview} alt="" className="w-full h-40 object-cover rounded-lg border border-[#30363d]" />}
                <div className="bg-[#0d1117] border border-[#30363d] rounded-lg px-4 py-3 flex items-center gap-3">
                  <svg className="animate-spin h-4 w-4 text-[#10b981] shrink-0" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                  <div>
                    <p className="text-[#10b981] text-sm font-medium">Analizando imagen con IA…</p>
                    <p className="text-[#484f58] text-xs">Identificando plaga y tipo de organismo</p>
                  </div>
                </div>
              </div>
            )}

            {/* suggested */}
            {iaEstado === 'suggested' && sugerencia && (
              <div className="space-y-3">
                {imagenPreview && <img src={imagenPreview} alt="" className="w-full h-40 object-cover rounded-lg border border-[#30363d]" />}
                <div className={`rounded-lg p-4 border ${
                  sugerencia.porcentajeConfianza >= 70 ? 'bg-[#10b981]/10 border-[#10b981]/40'
                  : sugerencia.porcentajeConfianza >= 40 ? 'bg-yellow-500/10 border-yellow-500/40'
                  : 'bg-red-500/10 border-red-500/30'
                }`}>
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="min-w-0">
                      <p className="text-white font-semibold text-sm">🔬 {sugerencia.nombreComun}</p>
                      <p className="text-[#8b949e] text-xs italic mt-0.5">{sugerencia.nombreCientifico}</p>
                      {sugerencia.tipoOrganismo && (
                        <p className="text-[#484f58] text-xs mt-0.5">Tipo: {sugerencia.tipoOrganismo}</p>
                      )}
                    </div>
                    <span className="text-xs text-[#484f58] bg-[#0d1117] px-2 py-0.5 rounded shrink-0">IA</span>
                  </div>
                  <ConfidenceBar value={sugerencia.porcentajeConfianza} />
                  {sugerencia.descripcionDano && (
                    <p className="text-[#8b949e] text-xs mt-2 pt-2 border-t border-white/10">💡 {sugerencia.descripcionDano}</p>
                  )}
                  {sugerencia.porcentajeConfianza < 40 && (
                    <p className="text-yellow-400 text-xs mt-2">⚠️ Confianza baja — considera ingresar la plaga manualmente.</p>
                  )}
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={confirmarSugerencia}
                    className="flex-1 bg-[#10b981] hover:bg-[#059669] text-white text-sm font-medium py-2 rounded-lg transition-colors">
                    ✅ Confirmar identificación
                  </button>
                  <button type="button" onClick={rechazarSugerencia}
                    className="flex-1 bg-[#0d1117] border border-[#30363d] hover:border-[#484f58] text-[#8b949e] hover:text-white text-sm py-2 rounded-lg transition-colors">
                    ✍️ Ingresar manualmente
                  </button>
                </div>
              </div>
            )}

            {/* confirmed */}
            {iaEstado === 'confirmed' && sugerencia && (
              <div className="space-y-3">
                {imagenPreview && <img src={imagenPreview} alt="" className="w-full h-32 object-cover rounded-lg border border-[#10b981]/40" />}
                <div className="bg-[#10b981]/10 border border-[#10b981]/40 rounded-lg p-3 flex items-center justify-between">
                  <div>
                    <p className="text-[#10b981] text-sm font-semibold">✅ Plaga identificada por IA</p>
                    <p className="text-white text-sm mt-0.5">{sugerencia.nombreComun}</p>
                    <p className="text-[#8b949e] text-xs italic">{sugerencia.nombreCientifico}</p>
                    <p className="text-[#484f58] text-xs mt-0.5">Confianza: {sugerencia.porcentajeConfianza}%</p>
                  </div>
                  <button type="button" onClick={rechazarSugerencia} className="text-[#484f58] hover:text-white text-xs underline shrink-0 ml-2">Cambiar</button>
                </div>
                <PlagaImageCard wikiTitle={wikiTitleIA} cientifico={sugerencia.nombreCientifico} cultivos={null} />
              </div>
            )}

            {/* rejected */}
            {iaEstado === 'rejected' && imagenPreview && (
              <div className="space-y-2">
                <img src={imagenPreview} alt="" className="w-full h-36 object-cover rounded-lg border border-[#30363d]" />
                <div className="bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-2 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-[#10b981] text-sm">📷</span>
                    <div>
                      <p className="text-[#c9d1d9] text-xs font-medium">Foto adjunta al reporte ✓</p>
                      <p className="text-[#484f58] text-xs">Se guardará junto con tu reporte</p>
                    </div>
                  </div>
                  <button type="button" onClick={resetIA} className="text-[#484f58] hover:text-red-400 text-xs underline transition-colors">Cambiar foto</button>
                </div>
              </div>
            )}

            {/* error */}
            {iaEstado === 'error' && (
              <div className="space-y-3">
                {imagenPreview && <img src={imagenPreview} alt="" className="w-full h-32 object-cover rounded-lg border border-red-500/30 opacity-50" />}
                {cuotaSegundos > 0 ? (
                  <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg px-4 py-3">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="text-2xl">⏳</span>
                      <div>
                        <p className="text-yellow-400 text-sm font-semibold">Límite de consultas alcanzado</p>
                        <p className="text-[#8b949e] text-xs">Puedes reintentar en <span className="font-mono font-bold text-yellow-400">{cuotaSegundos}s</span></p>
                      </div>
                    </div>
                    <p className="text-[#484f58] text-xs">💡 Puedes seleccionar la plaga manualmente mientras esperas.</p>
                  </div>
                ) : (
                  <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
                    <p className="text-red-400 text-xs font-medium">✗ {iaError}</p>
                    <p className="text-[#484f58] text-xs mt-1">Puedes continuar e ingresar la plaga manualmente.</p>
                  </div>
                )}
                <div className="flex gap-2">
                  {cuotaSegundos === 0 && (
                    <button type="button" onClick={() => { setIaEstado('idle'); setIaError(''); setIaErrorCode(''); setCuotaSegundos(0); setImagenFile(null); setImagenPreview(null); if (inputFileRef.current) inputFileRef.current.value = '' }}
                      className="flex-1 text-xs text-[#10b981] hover:text-white border border-[#10b981]/40 hover:border-[#10b981] rounded-lg py-1.5 transition-colors">
                      🔄 Reintentar
                    </button>
                  )}
                  <button type="button" onClick={() => { setIaEstado('rejected'); setIaError(''); setIaErrorCode(''); setCuotaSegundos(0) }}
                    className="flex-1 text-xs text-[#8b949e] hover:text-white border border-[#30363d] hover:border-[#484f58] rounded-lg py-1.5 transition-colors">
                    ✍️ Seleccionar manualmente
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* ── Fotos adicionales ─────────────────────────────────────────────── */}
          {imagenFile && iaEstado !== 'idle' && iaEstado !== 'analyzing' && (
            <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-4 mb-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                  <span>🖼️</span> Fotos adicionales
                  <span className="text-xs font-normal text-[#484f58]">opcional · máx 4 más</span>
                </h3>
                <span className="text-xs text-[#484f58]">{1 + fotosAdicionales.length} / 5</span>
              </div>
              {fotosAdicionales.length > 0 && (
                <div className="grid grid-cols-4 gap-2 mb-3">
                  {fotosAdicionales.map((f, idx) => (
                    <div key={idx} className="relative group">
                      <img src={f.preview} alt={`Foto ${idx + 2}`} className="w-full h-20 object-cover rounded-lg border border-[#30363d]" />
                      <button type="button" onClick={() => eliminarFotoAdicional(idx)}
                        className="absolute top-1 right-1 bg-black/70 text-white rounded-full w-5 h-5 text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500">✕</button>
                    </div>
                  ))}
                </div>
              )}
              {fotosAdicionales.length < MAX_FOTOS_ADICIONALES && (
                <>
                  <input ref={inputAdicionalRef} type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" onChange={agregarFotosAdicionales} />
                  <button type="button" onClick={() => inputAdicionalRef.current?.click()}
                    className="flex items-center gap-2 px-4 py-2 bg-[#0d1117] border border-dashed border-[#484f58] hover:border-[#10b981] text-[#8b949e] hover:text-[#10b981] text-xs rounded-lg transition-colors w-full justify-center">
                    + Agregar fotos ({MAX_FOTOS_ADICIONALES - fotosAdicionales.length} disponibles)
                  </button>
                </>
              )}
            </div>
          )}

          {/* ── Formulario principal ──────────────────────────────────────────── */}
          <form onSubmit={handleSubmit} className="space-y-5">

            {/* Sección 1: Identificación básica */}
            <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-4 space-y-4">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <span>🐛</span> Identificación de la Plaga
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
                    {iaEstado === 'idle' && <span className="ml-2 text-[#484f58] font-normal">(o usa la IA de arriba ↑)</span>}
                  </label>
                  <select value={form.plaga} onChange={e => { set('plaga', e.target.value); set('plagaPersonalizada', '')
                      // Pre-llenar tipo de organismo desde catálogo
                      const info = PLAGAS_COLOMBIA.find(p => p.nombre === e.target.value)
                      if (info?.tipoOrganismo) set('tipoOrganismo', info.tipoOrganismo)
                    }}
                    className="w-full bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#10b981] transition-colors">
                    <option value="">Selecciona una plaga...</option>
                    {PLAGAS_COLOMBIA.map(p => (
                      <option key={p.nombre} value={p.nombre}>{p.emoji}  {p.nombre}{p.cientifico ? ` — ${p.cientifico}` : ''}</option>
                    ))}
                  </select>
                  {form.plaga === 'Otra' && (
                    <div className="mt-2">
                      <input type="text" placeholder="Describe la plaga observada (nombre o síntomas)..."
                        value={form.plagaPersonalizada} onChange={e => set('plagaPersonalizada', e.target.value)} autoFocus required
                        className="w-full bg-[#0d1117] border border-yellow-500/40 rounded-lg px-3 py-2 text-white text-sm placeholder-[#484f58] focus:outline-none focus:border-yellow-400 transition-colors"
                      />
                    </div>
                  )}
                  {form.plaga && form.plaga !== 'Otra' && plagaInfo && (
                    <PlagaImageCard wikiTitle={plagaInfo.wikiTitle} cientifico={plagaInfo.cientifico} cultivos={plagaInfo.cultivos} />
                  )}
                </div>
              )}

              {/* Plaga confirmada IA */}
              {iaEstado === 'confirmed' && (
                <div>
                  <label className="block text-xs font-medium text-[#c9d1d9] mb-1.5">
                    Nombre de la plaga <span className="ml-1 text-[#10b981]">✅ Identificada por IA</span>
                  </label>
                  <div className="w-full bg-[#0d1117] border border-[#10b981]/40 rounded-lg px-3 py-2 text-white text-sm flex items-center justify-between">
                    <span>{form.plaga}</span>
                    <span className="text-xs text-[#484f58]">{sugerencia?.porcentajeConfianza}% confianza</span>
                  </div>
                </div>
              )}

              {/* Tipo de organismo */}
              <div>
                <label className="block text-xs font-medium text-[#c9d1d9] mb-1.5">
                  Tipo de organismo plaga * <span className="text-[#484f58] font-normal">(clasificación ICA)</span>
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
                      <div className="text-[#484f58] mt-0.5 text-[10px]">{t.desc}</div>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Sección 2: Cultivo y hospedante */}
            <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-4 space-y-4">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <span>🌾</span> Cultivo Hospedante
              </h3>

              <div>
                <label className="block text-xs font-medium text-[#c9d1d9] mb-1.5">Cultivo afectado *</label>
                <select value={form.cultivo} onChange={e => set('cultivo', e.target.value)}
                  className="w-full bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#10b981] transition-colors">
                  <option value="">Selecciona el cultivo...</option>
                  {CULTIVOS_VALLE.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#c9d1d9] mb-2">
                  Fase fenológica del cultivo *
                </label>
                <div className="grid grid-cols-1 gap-1.5">
                  {FASES_FENOLOGICAS.map(f => (
                    <button key={f.valor} type="button" onClick={() => set('faseFenologica', f.valor)}
                      className={`text-left px-3 py-2 rounded-lg border text-xs transition-colors ${
                        form.faseFenologica === f.valor
                          ? 'border-[#10b981]/60 bg-[#10b981]/10 text-[#10b981]'
                          : 'border-[#30363d] text-[#8b949e] hover:border-[#484f58]'
                      }`}>
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#c9d1d9] mb-2">
                  Parte de la planta afectada * <span className="text-[#484f58] font-normal">(selecciona todas las que apliquen)</span>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {PARTES_PLANTA.map(p => (
                    <label key={p.valor} className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-colors ${
                      form.parteAfectada.includes(p.valor)
                        ? 'border-[#10b981]/60 bg-[#10b981]/10 text-[#10b981]'
                        : 'border-[#30363d] text-[#8b949e] hover:border-[#484f58]'
                    }`}>
                      <input type="checkbox" className="hidden" checked={form.parteAfectada.includes(p.valor)} onChange={() => toggleParte(p.valor)} />
                      <span className={`w-4 h-4 rounded border flex items-center justify-center text-[10px] shrink-0 ${
                        form.parteAfectada.includes(p.valor) ? 'border-[#10b981] bg-[#10b981] text-white' : 'border-[#484f58]'
                      }`}>{form.parteAfectada.includes(p.valor) ? '✓' : ''}</span>
                      <span className="text-xs">{p.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            {/* Sección 3: Evaluación de campo MIP */}
            <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-4 space-y-4">
              <div className="flex items-start justify-between">
                <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                  <span>📊</span> Evaluación de Campo (MIP)
                </h3>
                <a href="https://www.ica.gov.co/areas/agricola/servicios/epidemiologia-agricola" target="_blank" rel="noopener noreferrer"
                  className="text-[10px] text-[#484f58] hover:text-[#10b981] underline">Protocolo ICA ↗</a>
              </div>

              {/* Incidencia */}
              <div>
                <label className="block text-xs font-medium text-[#c9d1d9] mb-1">
                  Incidencia — % de plantas afectadas *
                </label>
                <p className="text-[#484f58] text-[11px] mb-2">
                  Ingresa el número de plantas evaluadas y las que presentan síntomas de la plaga.
                </p>
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

                {/* Resultado incidencia */}
                {incidencia !== null && (
                  <div className={`mt-3 rounded-lg px-4 py-3 border ${
                    incidencia >= 30 ? 'bg-red-500/10 border-red-500/30'
                    : incidencia >= 10 ? 'bg-yellow-500/10 border-yellow-500/30'
                    : 'bg-green-500/10 border-green-500/30'
                  }`}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs text-[#8b949e]">Incidencia calculada</span>
                      <span className={`text-lg font-bold ${
                        incidencia >= 30 ? 'text-red-400' : incidencia >= 10 ? 'text-yellow-400' : 'text-green-400'
                      }`}>{incidencia}%</span>
                    </div>
                    <div className="h-2 bg-[#30363d] rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{
                        width: `${Math.min(incidencia, 100)}%`,
                        background: incidencia >= 30 ? '#ef4444' : incidencia >= 10 ? '#f59e0b' : '#10b981',
                      }} />
                    </div>
                    <p className="text-[10px] text-[#484f58] mt-2">
                      {incidencia >= 30 ? '⚠️ Supera el umbral de acción crítico (≥30%). Se requiere intervención inmediata.'
                       : incidencia >= 10 ? '⚡ Supera el umbral de alerta (≥10%). Monitoreo intensivo recomendado.'
                       : '✓ Por debajo del umbral de alerta (<10%). Continuar monitoreo.'}
                    </p>
                  </div>
                )}
                {plantasAf > plantasEv && plantasEv > 0 && (
                  <p className="text-red-400 text-xs mt-1">⚠️ Las plantas con síntomas no pueden superar las evaluadas.</p>
                )}
              </div>

              {/* Severidad */}
              <div>
                <label className="block text-xs font-medium text-[#c9d1d9] mb-1">
                  Severidad del daño por planta *
                </label>
                <p className="text-[#484f58] text-[11px] mb-2">
                  Escala 1-4 según la proporción de tejido afectado en las plantas con síntomas.
                </p>
                <div className="space-y-2">
                  {SEVERIDAD_INFO.map(s => (
                    <button key={s.valor} type="button" onClick={() => set('severidad', String(s.valor))}
                      className={`w-full text-left px-4 py-3 rounded-lg border transition-colors ${
                        parseInt(form.severidad) === s.valor
                          ? 'border-opacity-60 bg-opacity-10'
                          : 'border-[#30363d] hover:border-[#484f58]'
                      }`}
                      style={parseInt(form.severidad) === s.valor ? {
                        borderColor: s.color + '60', backgroundColor: s.color + '15',
                      } : {}}>
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium" style={{ color: parseInt(form.severidad) === s.valor ? s.color : '#c9d1d9' }}>
                          {s.label}
                        </span>
                        {parseInt(form.severidad) === s.valor && (
                          <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: s.color + '20', color: s.color }}>Seleccionado</span>
                        )}
                      </div>
                      <p className="text-[#8b949e] text-xs mt-1">{s.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Nivel MIP calculado */}
              {nivelMIP && (
                <div className={`rounded-xl p-4 border ${nivelStyle[nivelMIP]}`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-bold">{nivelIcono[nivelMIP]} Nivel de riesgo MIP: {nivelMIP.toUpperCase()}</span>
                  </div>
                  <p className="text-xs opacity-80">
                    Calculado según criterios ICA: Incidencia {incidencia}% + Severidad {form.severidad}/4
                  </p>
                  <p className="text-[10px] opacity-60 mt-1">
                    {nivelMIP === 'alto'  && 'Incidencia ≥30% o severidad ≥3 → acción de control urgente.'}
                    {nivelMIP === 'medio' && 'Incidencia ≥10% o severidad ≥2 → monitoreo intensivo y medidas preventivas.'}
                    {nivelMIP === 'bajo'  && 'Incidencia <10% y severidad 1 → por debajo del umbral económico. Continuar monitoreo.'}
                  </p>
                </div>
              )}
            </div>

            {/* Sección 4: Observaciones */}
            <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-4 space-y-4">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <span>📝</span> Observaciones del Técnico
              </h3>
              <div>
                <label className="block text-xs font-medium text-[#c9d1d9] mb-1.5">
                  Descripción adicional <span className="text-[#484f58] font-normal">(opcional)</span>
                </label>
                <textarea rows={3} placeholder="Describe síntomas adicionales, distribución en el lote, condiciones observadas..."
                  value={form.descripcion} onChange={e => set('descripcion', e.target.value)}
                  className="w-full bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-2 text-white text-sm placeholder-[#484f58] focus:outline-none focus:border-[#10b981] transition-colors resize-none"
                />
              </div>

              {/* Feedback */}
              {submitStatus === 'success' && (
                <p className="text-green-400 text-sm bg-green-400/10 border border-green-400/20 rounded-lg px-3 py-2">
                  ✓ Reporte MIP enviado correctamente. ¡Gracias!
                </p>
              )}
              {submitStatus === 'error' && (
                <p className="text-red-400 text-sm bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2">
                  ✗ Error al guardar el reporte. Intenta de nuevo.
                </p>
              )}

              {/* Botón enviar */}
              <button type="submit" disabled={!puedeEnviar}
                className="w-full bg-[#10b981] hover:bg-[#059669] disabled:opacity-50 text-white font-semibold py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2">
                {submitStatus === 'loading' ? (
                  <><svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>Enviando...</>
                ) : `Enviar Reporte MIP${nivelMIP ? ` — Nivel ${nivelMIP.toUpperCase()}` : ''}`}
              </button>

              {/* Hints */}
              {!coords && <p className="text-[#484f58] text-xs text-center">📍 Captura tu ubicación GPS para habilitar el envío.</p>}
              {coords && !imagenFile && <p className="text-red-400/70 text-xs text-center">📷 Sube una fotografía de la plaga para habilitar el envío.</p>}
              {coords && imagenFile && !plagaFinal && <p className="text-[#484f58] text-xs text-center">Selecciona el tipo de plaga del listado o usa la identificación de IA.</p>}
              {coords && imagenFile && plagaFinal && !mipCompleto && (
                <p className="text-yellow-400/70 text-xs text-center">
                  Completa todos los campos de evaluación MIP marcados con *.
                </p>
              )}
            </div>
          </form>
        </div>
      </main>
    </div>
  )
}
