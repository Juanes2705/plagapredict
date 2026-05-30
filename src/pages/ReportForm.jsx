// HU-04 + HU-05 + HU-08 + HU-IA: Formulario de reporte con GPS + clima + Gemini Vision
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
  {
    nombre: 'Gusano cogollero',
    cientifico: 'Spodoptera frugiperda',
    wikiTitle: 'Fall armyworm',
    cultivos: 'Maíz, sorgo, arroz, caña de azúcar',
    emoji: '🐛',
  },
  {
    nombre: 'Broca del café',
    cientifico: 'Hypothenemus hampei',
    wikiTitle: 'Coffee berry borer',
    cultivos: 'Café',
    emoji: '🐞',
  },
  {
    nombre: 'Mosca de la fruta',
    cientifico: 'Anastrepha obliqua',
    wikiTitle: 'Anastrepha obliqua',
    cultivos: 'Mango, guayaba, maracuyá, cítricos',
    emoji: '🪰',
  },
  {
    nombre: 'Mosca blanca',
    cientifico: 'Bemisia tabaci',
    wikiTitle: 'Bemisia tabaci',
    cultivos: 'Tomate, pimentón, pepino, fríjol',
    emoji: '🦟',
  },
  {
    nombre: 'Áfidos / Pulgones',
    cientifico: 'Familia Aphididae',
    wikiTitle: 'Aphid',
    cultivos: 'Hortalizas, flores, frutales, leguminosas',
    emoji: '🐜',
  },
  {
    nombre: 'Trips de las flores',
    cientifico: 'Frankliniella occidentalis',
    wikiTitle: 'Western flower thrips',
    cultivos: 'Rosas, clavel, crisantemo, cebolla',
    emoji: '🔬',
  },
  {
    nombre: 'Picudo negro del plátano',
    cientifico: 'Cosmopolites sordidus',
    wikiTitle: 'Cosmopolites sordidus',
    cultivos: 'Plátano, banano',
    emoji: '🪲',
  },
  {
    nombre: 'Barrenador de la caña',
    cientifico: 'Diatraea saccharalis',
    wikiTitle: 'Diatraea saccharalis',
    cultivos: 'Caña de azúcar',
    emoji: '🐛',
  },
  {
    nombre: 'Ácaro rojo / Arañita roja',
    cientifico: 'Tetranychus urticae',
    wikiTitle: 'Tetranychus urticae',
    cultivos: 'Fríjol, soya, fresas, flores, cucurbitáceas',
    emoji: '🕷️',
  },
  {
    nombre: 'Hormiga arriera',
    cientifico: 'Atta cephalotes',
    wikiTitle: 'Atta cephalotes',
    cultivos: 'Yuca, maíz, frutales tropicales, pastos',
    emoji: '🐜',
  },
  {
    nombre: 'Minador de hojas',
    cientifico: 'Liriomyza huidobrensis',
    wikiTitle: 'Liriomyza huidobrensis',
    cultivos: 'Papa, arveja, tomate, hortalizas',
    emoji: '🌿',
  },
  {
    nombre: 'Chinche del aguacate',
    cientifico: 'Leptopharsa gibbicarina',
    wikiTitle: 'Leptopharsa gibbicarina',
    cultivos: 'Aguacate',
    emoji: '🐛',
  },
  {
    nombre: 'Chisa / Gallina ciega',
    cientifico: 'Phyllophaga spp.',
    wikiTitle: 'Phyllophaga',
    cultivos: 'Caña, maíz, pastos, hortalizas, papa',
    emoji: '🪲',
  },
  {
    nombre: 'Palomilla del maíz',
    cientifico: 'Sitotroga cerealella',
    wikiTitle: 'Sitotroga cerealella',
    cultivos: 'Maíz almacenado, arroz, trigo',
    emoji: '🦋',
  },
  { nombre: 'Otra', cientifico: null, wikiTitle: null, cultivos: null, emoji: '❓' },
]

const NIVELES = ['bajo', 'medio', 'alto']

const nivelStyle = {
  bajo:  'border-green-500/50 bg-green-500/10 text-green-400',
  medio: 'border-yellow-500/50 bg-yellow-500/10 text-yellow-400',
  alto:  'border-red-500/50 bg-red-500/10 text-red-400',
}

// ── Componente: tarjeta de imagen de la plaga ─────────────────────────────────
/**
 * Busca y muestra la imagen de Wikipedia de una plaga.
 * @param {{ wikiTitle: string|null, cientifico: string|null, cultivos: string|null }} props
 */
function PlagaImageCard({ wikiTitle, cientifico, cultivos }) {
  const [imagen,  setImagen]  = useState(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(false)

  useEffect(() => {
    if (!wikiTitle) { setLoading(false); return }

    setLoading(true)
    setError(false)
    setImagen(null)

    // Intento 1: Wikipedia en inglés (más imágenes disponibles)
    fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(wikiTitle)}`)
      .then(r => r.json())
      .then(data => {
        if (data.thumbnail?.source) {
          setImagen(data.thumbnail.source)
          setLoading(false)
        } else {
          // Intento 2: Wikipedia en español
          return fetch(`https://es.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(wikiTitle)}`)
            .then(r2 => r2.json())
            .then(data2 => {
              setImagen(data2.thumbnail?.source ?? null)
              setError(!data2.thumbnail?.source)
              setLoading(false)
            })
        }
      })
      .catch(() => { setError(true); setLoading(false) })
  }, [wikiTitle])

  if (!wikiTitle) return null

  return (
    <div className="mt-3 rounded-xl overflow-hidden border border-[#30363d] bg-[#0d1117]">
      {/* Imagen */}
      <div className="relative h-44 bg-[#161b22] flex items-center justify-center">
        {loading && (
          <div className="flex flex-col items-center gap-2 text-[#484f58]">
            <svg className="animate-spin h-6 w-6 text-[#10b981]" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
            </svg>
            <span className="text-xs">Cargando imagen...</span>
          </div>
        )}
        {!loading && imagen && (
          <img
            src={imagen}
            alt={cientifico ?? 'Plaga'}
            className="w-full h-full object-cover"
            onError={() => { setImagen(null); setError(true) }}
          />
        )}
        {!loading && !imagen && (
          <div className="flex flex-col items-center gap-2 text-[#484f58]">
            <span className="text-4xl">🔍</span>
            <span className="text-xs">Sin imagen disponible</span>
          </div>
        )}
      </div>

      {/* Info */}
      {(cientifico || cultivos) && (
        <div className="px-3 py-2.5 space-y-1">
          {cientifico && (
            <p className="text-[#8b949e] text-xs italic">📗 {cientifico}</p>
          )}
          {cultivos && (
            <p className="text-[#484f58] text-xs">
              🌾 <span className="text-[#8b949e]">Cultivos afectados:</span> {cultivos}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

// ── Barra de confianza ────────────────────────────────────────────────────────
function ConfidenceBar({ value }) {
  const color = value >= 75 ? '#10b981' : value >= 50 ? '#f59e0b' : '#ef4444'
  return (
    <div className="mt-2">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-[#8b949e]">Confianza</span>
        <span className="text-xs font-bold" style={{ color }}>{value}%</span>
      </div>
      <div className="h-1.5 bg-[#30363d] rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${value}%`, background: color }}
        />
      </div>
    </div>
  )
}

// ── Componente principal ──────────────────────────────────────────────────────
export default function ReportForm() {
  const { user } = useAuth()
  const { coords, status: gpsStatus, error: gpsError, capture } = useGeolocation()
  const inputFileRef = useRef(null)

  // ── Formulario base ────────────────────────────────────────────────────────
  const [form, setForm] = useState({
    finca:             '',
    plaga:             '',         // nombre del select
    plagaPersonalizada:'',         // solo cuando plaga === 'Otra'
    nivel:             'medio',
    descripcion:       '',
  })
  const [submitStatus, setSubmitStatus] = useState('idle')
  const [clima,        setClima]        = useState(null)
  const [loadingClima, setLoadingClima] = useState(false)

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }))

  useEffect(() => {
    if (!coords) return
    setLoadingClima(true)
    fetchWeather(coords.lat, coords.lng).then(data => {
      setClima(data)
      setLoadingClima(false)
    })
  }, [coords])

  // ── IA — máquina de estados ────────────────────────────────────────────────
  // idle | analyzing | suggested | confirmed | rejected | error
  const [iaEstado,      setIaEstado]      = useState('idle')
  const [imagenFile,    setImagenFile]    = useState(null)
  const [imagenPreview, setImagenPreview] = useState(null)
  const [sugerencia,    setSugerencia]    = useState(null)
  const [iaError,       setIaError]       = useState('')
  const [iaErrorCode,   setIaErrorCode]   = useState('')   // código de error estructurado
  const [cuotaSegundos, setCuotaSegundos] = useState(0)    // cuenta regresiva 429

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
      // Error de cuota: mostrar cuenta regresiva
      if (err.code === 'QUOTA_EXCEEDED' && err.segundos > 0) {
        setCuotaSegundos(err.segundos)
        const intervalo = setInterval(() => {
          setCuotaSegundos(s => {
            if (s <= 1) { clearInterval(intervalo); return 0 }
            return s - 1
          })
        }, 1000)
      }
      setIaError(err.message ?? 'Error al conectar con Gemini.')
      setIaEstado('error')
    }
  }

  const confirmarSugerencia = () => {
    if (!sugerencia) return
    set('plaga', sugerencia.nombreComun)
    set('plagaPersonalizada', '')
    setIaEstado('confirmed')
  }

  const rechazarSugerencia = () => {
    setIaEstado('rejected')
    set('plaga', '')
    set('plagaPersonalizada', '')
  }

  const resetIA = () => {
    setIaEstado('idle')
    setImagenFile(null)
    setImagenPreview(null)
    setSugerencia(null)
    setIaError('')
    setIaErrorCode('')
    setCuotaSegundos(0)
    set('plaga', '')
    set('plagaPersonalizada', '')
    if (inputFileRef.current) inputFileRef.current.value = ''
  }

  // ── Derivados ──────────────────────────────────────────────────────────────
  // Nombre final de la plaga que se guardará
  const plagaFinal = form.plaga === 'Otra'
    ? form.plagaPersonalizada.trim()
    : form.plaga

  // Info de la plaga seleccionada para mostrar imagen
  const plagaInfo = PLAGAS_COLOMBIA.find(p =>
    p.nombre.toLowerCase() === form.plaga.toLowerCase()
  ) ?? null

  // Para IA confirmada: usar nombre científico de Gemini como wikiTitle
  const wikiTitleIA = sugerencia?.nombreCientifico ?? sugerencia?.nombreComun ?? null

  // Validación del botón enviar
  const puedeEnviar = !!coords
    && !!plagaFinal
    && submitStatus !== 'loading'
    && iaEstado !== 'analyzing'

  // ── Submit ─────────────────────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!coords)     { alert('Captura tu ubicación GPS primero.'); return }
    if (!form.finca.trim()) { alert('Ingresa el nombre de la finca.'); return }
    if (!plagaFinal) { alert('Selecciona o escribe el tipo de plaga.'); return }

    setSubmitStatus('loading')
    try {
      await addDoc(collection(db, 'reportes'), {
        plaga:            plagaFinal,
        finca:            form.finca.trim(),
        nivel:            form.nivel,
        descripcion:      form.descripcion,
        lat:              coords.lat,
        lng:              coords.lng,
        precision_m:      coords.accuracy,
        uid_reportador:   user.uid,
        email_reportador: user.email,
        temp_c:           clima?.temp_c     ?? null,
        humedad:          clima?.humedad    ?? null,
        viento_kmh:       clima?.viento_kmh ?? null,
        viento_dir:       clima?.viento_dir ?? null,
        fecha:            serverTimestamp(),
        estado_validacion: 'sospechoso',
        ...(iaEstado === 'confirmed' && sugerencia ? {
          ia_identificacion: {
            nombreComun:          sugerencia.nombreComun,
            nombreCientifico:     sugerencia.nombreCientifico,
            porcentajeConfianza:  sugerencia.porcentajeConfianza,
            descripcionDano:      sugerencia.descripcionDano ?? null,
            confirmadaPorUsuario: true,
            modelo:               sugerencia.modeloUsado ?? 'gemini',
          },
        } : {}),
      })
      setSubmitStatus('success')
      setForm({ finca: '', plaga: '', plagaPersonalizada: '', nivel: 'medio', descripcion: '' })
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
          <p className="text-[#8b949e] text-sm mb-6">
            Registra la plaga detectada. Usa la identificación por IA o selecciónala manualmente.
          </p>

          {/* ── GPS ─────────────────────────────────────────────────────────── */}
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
                {loadingClima && <p className="text-[#8b949e] text-xs mt-2">🌤️ Obteniendo clima del punto...</p>}
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
              <button type="button" onClick={capture}
                className="mt-2 text-[#8b949e] hover:text-white text-xs underline">
                Recapturar
              </button>
            )}
          </div>

          {/* ── Identificación por IA ────────────────────────────────────────── */}
          <div className={`bg-[#161b22] rounded-xl p-4 mb-5 border transition-colors ${
            iaEstado === 'confirmed' ? 'border-[#10b981]/50'
            : iaEstado === 'error'  ? 'border-red-500/40'
            : 'border-[#30363d]'
          }`}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <span>🤖</span> Identificación por IA
                <span className="text-xs font-normal text-[#484f58]">Gemini Vision · opcional</span>
              </h3>
              {iaEstado !== 'idle' && (
                <button onClick={resetIA} className="text-xs text-[#484f58] hover:text-white underline">
                  Reiniciar
                </button>
              )}
            </div>

            {/* idle */}
            {iaEstado === 'idle' && (
              <div>
                <p className="text-[#8b949e] text-xs mb-3">
                  Sube una fotografía de la plaga y Gemini la identificará automáticamente.
                </p>
                <input ref={inputFileRef} type="file" accept="image/jpeg,image/png,image/webp"
                  className="hidden" onChange={handleImageChange} />
                <button type="button" onClick={() => inputFileRef.current?.click()}
                  className="flex items-center gap-2 px-4 py-2 bg-[#0d1117] border border-dashed border-[#484f58] hover:border-[#10b981] text-[#8b949e] hover:text-[#10b981] text-sm rounded-lg transition-colors w-full justify-center">
                  📷 Subir fotografía para identificación
                </button>
              </div>
            )}

            {/* analyzing */}
            {iaEstado === 'analyzing' && (
              <div className="space-y-3">
                {imagenPreview && <img src={imagenPreview} alt="Imagen subida"
                  className="w-full h-40 object-cover rounded-lg border border-[#30363d]" />}
                <div className="bg-[#0d1117] border border-[#30363d] rounded-lg px-4 py-3 flex items-center gap-3">
                  <svg className="animate-spin h-4 w-4 text-[#10b981] shrink-0" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                  <div>
                    <p className="text-[#10b981] text-sm font-medium">Analizando imagen con IA…</p>
                    <p className="text-[#484f58] text-xs">Gemini está identificando la plaga</p>
                  </div>
                </div>
              </div>
            )}

            {/* suggested */}
            {iaEstado === 'suggested' && sugerencia && (
              <div className="space-y-3">
                {imagenPreview && <img src={imagenPreview} alt="Imagen analizada"
                  className="w-full h-40 object-cover rounded-lg border border-[#30363d]" />}
                <div className={`rounded-lg p-4 border ${
                  sugerencia.porcentajeConfianza >= 70 ? 'bg-[#10b981]/10 border-[#10b981]/40'
                  : sugerencia.porcentajeConfianza >= 40 ? 'bg-yellow-500/10 border-yellow-500/40'
                  : 'bg-red-500/10 border-red-500/30'
                }`}>
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="min-w-0">
                      <p className="text-white font-semibold text-sm">🔬 {sugerencia.nombreComun}</p>
                      <p className="text-[#8b949e] text-xs italic mt-0.5">{sugerencia.nombreCientifico}</p>
                    </div>
                    <span className="text-xs text-[#484f58] bg-[#0d1117] px-2 py-0.5 rounded shrink-0">
                      Gemini Flash
                    </span>
                  </div>
                  <ConfidenceBar value={sugerencia.porcentajeConfianza} />
                  {sugerencia.descripcionDano && (
                    <p className="text-[#8b949e] text-xs mt-2 pt-2 border-t border-white/10">
                      💡 {sugerencia.descripcionDano}
                    </p>
                  )}
                  {sugerencia.porcentajeConfianza < 40 && (
                    <p className="text-yellow-400 text-xs mt-2">
                      ⚠️ Confianza baja — considera ingresar la plaga manualmente.
                    </p>
                  )}
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={confirmarSugerencia}
                    className="flex-1 bg-[#10b981] hover:bg-[#059669] text-white text-sm font-medium py-2 rounded-lg transition-colors">
                    ✅ Sí, confirmar identificación
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
                {imagenPreview && <img src={imagenPreview} alt="Imagen analizada"
                  className="w-full h-32 object-cover rounded-lg border border-[#10b981]/40" />}
                <div className="bg-[#10b981]/10 border border-[#10b981]/40 rounded-lg p-3 flex items-center justify-between">
                  <div>
                    <p className="text-[#10b981] text-sm font-semibold">✅ Plaga identificada por IA</p>
                    <p className="text-white text-sm mt-0.5">{sugerencia.nombreComun}</p>
                    <p className="text-[#8b949e] text-xs italic">{sugerencia.nombreCientifico}</p>
                    <p className="text-[#484f58] text-xs mt-0.5">
                      Confianza: {sugerencia.porcentajeConfianza}% · Gemini Flash
                    </p>
                  </div>
                  <button type="button" onClick={rechazarSugerencia}
                    className="text-[#484f58] hover:text-white text-xs underline shrink-0 ml-2">
                    Cambiar
                  </button>
                </div>
                {/* Imagen de Wikipedia para la plaga confirmada por IA */}
                <PlagaImageCard
                  wikiTitle={wikiTitleIA}
                  cientifico={sugerencia.nombreCientifico}
                  cultivos={null}
                />
              </div>
            )}

            {/* error */}
            {iaEstado === 'error' && (
              <div className="space-y-3">
                {imagenPreview && (
                  <img src={imagenPreview} alt=""
                    className="w-full h-32 object-cover rounded-lg border border-red-500/30 opacity-50" />
                )}

                {/* Error de cuota con cuenta regresiva */}
                {cuotaSegundos > 0 ? (
                  <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg px-4 py-3">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="text-2xl">⏳</span>
                      <div>
                        <p className="text-yellow-400 text-sm font-semibold">
                          Límite de consultas alcanzado
                        </p>
                        <p className="text-[#8b949e] text-xs">
                          El plan gratuito de Gemini tiene un límite de peticiones por minuto.
                        </p>
                      </div>
                    </div>
                    <div className="bg-[#0d1117] rounded-lg px-3 py-2 flex items-center justify-between">
                      <span className="text-[#8b949e] text-xs">Puedes reintentar en</span>
                      <span className="text-yellow-400 font-mono font-bold text-lg">
                        {cuotaSegundos}s
                      </span>
                    </div>
                    <p className="text-[#484f58] text-xs mt-2">
                      💡 Mientras tanto puedes seleccionar la plaga manualmente del listado.
                    </p>
                  </div>
                ) : (iaErrorCode === 'INVALID_KEY_FORMAT' || iaErrorCode === 'INVALID_KEY') ? (
                  /* Error de API key inválida */
                  <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2 space-y-1.5">
                    <p className="text-red-400 text-xs font-semibold">🔑 API key de Gemini inválida</p>
                    <p className="text-[#c9d1d9] text-xs">{iaError}</p>
                    <a
                      href="https://aistudio.google.com/app/apikey"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-block text-xs text-[#10b981] underline hover:text-white"
                    >
                      Obtener clave gratuita en AI Studio →
                    </a>
                  </div>
                ) : (
                  /* Otros errores */
                  <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
                    <p className="text-red-400 text-xs font-medium">✗ {iaError}</p>
                    <p className="text-[#484f58] text-xs mt-1">
                      Puedes continuar e ingresar la plaga manualmente.
                    </p>
                  </div>
                )}

                <div className="flex gap-2">
                  {/* Reintentar solo si el contador llegó a 0 */}
                  {cuotaSegundos === 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setIaEstado('idle')
                        setIaError('')
                        setIaErrorCode('')
                        setCuotaSegundos(0)
                        setImagenFile(null)
                        setImagenPreview(null)
                        if (inputFileRef.current) inputFileRef.current.value = ''
                      }}
                      className="flex-1 text-xs text-[#10b981] hover:text-white border border-[#10b981]/40 hover:border-[#10b981] rounded-lg py-1.5 transition-colors"
                    >
                      🔄 Reintentar con otra imagen
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => { setIaEstado('rejected'); setIaError(''); setIaErrorCode(''); setCuotaSegundos(0) }}
                    className="flex-1 text-xs text-[#8b949e] hover:text-white border border-[#30363d] hover:border-[#484f58] rounded-lg py-1.5 transition-colors"
                  >
                    ✍️ Seleccionar manualmente
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* ── Formulario de datos ──────────────────────────────────────────── */}
          <form onSubmit={handleSubmit} className="bg-[#161b22] border border-[#30363d] rounded-xl p-4 space-y-4">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <span>🐛</span> Datos del Avistamiento
            </h3>

            {/* Finca */}
            <div>
              <label className="block text-xs font-medium text-[#c9d1d9] mb-1.5">
                Nombre de la finca *
              </label>
              <input type="text" placeholder="Ej: Hacienda La Esperanza"
                value={form.finca} onChange={e => set('finca', e.target.value)} required
                className="w-full bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-2 text-white text-sm placeholder-[#484f58] focus:outline-none focus:border-[#10b981] transition-colors"
              />
            </div>

            {/* ── Plaga: selector manual ──────────────────────────────────── */}
            {iaEstado !== 'confirmed' && (
              <div>
                <label className="block text-xs font-medium text-[#c9d1d9] mb-1.5">
                  Tipo de plaga *
                  {iaEstado === 'idle' && (
                    <span className="ml-2 text-[#484f58] font-normal">(o usa la IA de arriba ↑)</span>
                  )}
                </label>

                <select value={form.plaga} onChange={e => { set('plaga', e.target.value); set('plagaPersonalizada', '') }}
                  className="w-full bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#10b981] transition-colors">
                  <option value="">Selecciona una plaga...</option>
                  {PLAGAS_COLOMBIA.map(p => (
                    <option key={p.nombre} value={p.nombre}>
                      {p.emoji}  {p.nombre}{p.cientifico ? ` — ${p.cientifico}` : ''}
                    </option>
                  ))}
                </select>

                {/* Campo libre cuando selecciona "Otra" */}
                {form.plaga === 'Otra' && (
                  <div className="mt-2">
                    <input
                      type="text"
                      placeholder="Describe la plaga observada (nombre o síntomas)..."
                      value={form.plagaPersonalizada}
                      onChange={e => set('plagaPersonalizada', e.target.value)}
                      autoFocus
                      required
                      className="w-full bg-[#0d1117] border border-yellow-500/40 rounded-lg px-3 py-2 text-white text-sm placeholder-[#484f58] focus:outline-none focus:border-yellow-400 transition-colors"
                    />
                    <p className="text-[#484f58] text-xs mt-1">
                      💡 También puedes subir una foto arriba para que la IA la identifique.
                    </p>
                  </div>
                )}

                {/* Imagen de la plaga seleccionada del listado */}
                {form.plaga && form.plaga !== 'Otra' && plagaInfo && (
                  <PlagaImageCard
                    wikiTitle={plagaInfo.wikiTitle}
                    cientifico={plagaInfo.cientifico}
                    cultivos={plagaInfo.cultivos}
                  />
                )}
              </div>
            )}

            {/* ── Plaga: confirmada por IA (solo lectura) ─────────────────── */}
            {iaEstado === 'confirmed' && (
              <div>
                <label className="block text-xs font-medium text-[#c9d1d9] mb-1.5">
                  Tipo de plaga
                  <span className="ml-2 text-[#10b981] font-normal">✅ Identificada por IA</span>
                </label>
                <div className="w-full bg-[#0d1117] border border-[#10b981]/40 rounded-lg px-3 py-2 text-white text-sm flex items-center justify-between">
                  <span>{form.plaga}</span>
                  <span className="text-xs text-[#484f58]">{sugerencia?.porcentajeConfianza}% confianza</span>
                </div>
              </div>
            )}

            {/* Nivel de riesgo */}
            <div>
              <label className="block text-xs font-medium text-[#c9d1d9] mb-2">Nivel de riesgo</label>
              <div className="flex gap-2">
                {NIVELES.map(n => (
                  <button key={n} type="button" onClick={() => set('nivel', n)}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium border capitalize transition-colors ${
                      form.nivel === n ? nivelStyle[n] : 'border-[#30363d] text-[#8b949e] hover:border-[#484f58]'
                    }`}>
                    {n}
                  </button>
                ))}
              </div>
            </div>

            {/* Descripción */}
            <div>
              <label className="block text-xs font-medium text-[#c9d1d9] mb-1.5">
                Descripción (opcional)
              </label>
              <textarea rows={3} placeholder="Describe lo que observaste..."
                value={form.descripcion} onChange={e => set('descripcion', e.target.value)}
                className="w-full bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-2 text-white text-sm placeholder-[#484f58] focus:outline-none focus:border-[#10b981] transition-colors resize-none"
              />
            </div>

            {/* Feedback */}
            {submitStatus === 'success' && (
              <p className="text-green-400 text-sm bg-green-400/10 border border-green-400/20 rounded-lg px-3 py-2">
                ✓ Reporte enviado correctamente. ¡Gracias!
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
                <>
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                  Enviando...
                </>
              ) : 'Enviar Reporte'}
            </button>

            {/* Hints */}
            {!coords && (
              <p className="text-[#484f58] text-xs text-center">
                📍 Captura tu ubicación GPS para habilitar el envío.
              </p>
            )}
            {coords && !plagaFinal && iaEstado === 'idle' && (
              <p className="text-[#484f58] text-xs text-center">
                Sube una foto para identificación automática, o selecciona la plaga del listado.
              </p>
            )}
          </form>
        </div>
      </main>
    </div>
  )
}
