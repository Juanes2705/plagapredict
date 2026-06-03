// Sprint 2 + Sprint 3: Mapa real, conos de riesgo, geocercas y alertas
import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  collection, onSnapshot, query, orderBy,
  addDoc, deleteDoc, doc, serverTimestamp,
} from 'firebase/firestore'
import { db } from '../firebase'
import {
  MapContainer, TileLayer, Marker, Popup,
  Polygon, Polyline, CircleMarker, useMapEvents, Tooltip,
} from 'react-leaflet'
import L from 'leaflet'
import Sidebar from '../components/Sidebar'
import RiskConeLayer from '../components/RiskConeLayer'
import AlertPanel from '../components/AlertPanel'
import TimeSlider from '../components/TimeSlider'
import ClusterAlertPanel from '../components/ClusterAlertPanel'
import {
  calcularEstadosConsenso,
  detectarClusters,
  ESTADO_LABEL,
  ESTADO_COLOR,
} from '../utils/consensusValidation'
import { fetchWeather, windDirLabel } from '../services/weatherService'
import { detectarColisiones } from '../utils/collisionDetection'
import { useAuth } from '../context/AuthContext'

// Fix Leaflet marker icons
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl:       'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl:     'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
})

const nivelColor = { alto: '#ef4444', medio: '#f59e0b', bajo: '#10b981' }
const nivelBg    = {
  alto:  'bg-red-500/20 text-red-400 border-red-500/30',
  medio: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  bajo:  'bg-green-500/20 text-green-400 border-green-500/30',
}

function formatFecha(fecha) {
  const d = fecha?.toDate?.() ?? (fecha instanceof Date ? fecha : null)
  if (!d) return '—'
  return d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })
}

// HU-10+11 + HU-CONSENSO: marcador con popup detallado y estado de validación visual
function ColorMarker({ r, estadoConsenso }) {
  const color = nivelColor[r.nivel] ?? '#8b949e'

  // Para plagas cuarentenarias, forzar color morado independientemente del nivel
  const esCuarentenaria = r.mip?.clasificacionICA?.startsWith('cuarentenaria')
  const markerColor = esCuarentenaria ? '#a855f7' : color

  // Apariencia del marcador según estado de consenso
  const markerHtml = (() => {
    const base = 'width:14px;height:14px;border-radius:50%;cursor:pointer;'
    if (esCuarentenaria) {
      // Cuarentenaria: morado con doble anillo pulsante — máxima visibilidad
      return `<div style="${base}width:16px;height:16px;background:#a855f7;border:3px solid white;box-shadow:0 0 0 5px #a855f750,0 0 20px #a855f7;animation:pulse 1.5s infinite"></div>`
    }
    switch (estadoConsenso) {
      case 'sospechoso':
        // Aislado: tenue, borde discontinuo, sin confirmar
        return `<div style="${base}background:${markerColor}35;border:2px dashed ${markerColor};opacity:0.65"></div>`
      case 'alerta_preventiva':
        // Cluster preventivo: naranja pulsante
        return `<div style="${base}background:${markerColor};border:3px solid #f97316;box-shadow:0 0 0 4px #f9731630,0 0 10px ${markerColor}80"></div>`
      case 'confirmado_algoritmico':
        // Confirmado por el sistema: rojo brillante con doble anillo
        return `<div style="${base}width:16px;height:16px;background:${markerColor};border:2px solid white;box-shadow:0 0 0 3px ${markerColor}60,0 0 14px ${markerColor}"></div>`
      case 'confirmado':
        // Confirmado por agrónomo: máxima prominencia
        return `<div style="${base}width:16px;height:16px;background:${markerColor};border:3px solid white;box-shadow:0 0 0 4px ${markerColor}80,0 0 18px ${markerColor}"></div>`
      case 'descartado':
        return `<div style="${base}background:#484f58;border:1px solid #30363d;opacity:0.25"></div>`
      default:
        return `<div style="${base}background:${markerColor};border:2px solid white;box-shadow:0 0 8px ${markerColor}80"></div>`
    }
  })()

  const iconSize = (estadoConsenso === 'confirmado' || estadoConsenso === 'confirmado_algoritmico') ? 16 : 14
  const icon = L.divIcon({
    className: '',
    html: markerHtml,
    iconSize: [iconSize, iconSize], iconAnchor: [iconSize / 2, iconSize / 2], popupAnchor: [0, -10],
  })
  return (
    <Marker position={[r.lat, r.lng]} icon={icon}>
      <Popup maxWidth={230} minWidth={180}>
        <div style={{ fontFamily: 'system-ui', fontSize: 13, lineHeight: 1.6, padding: '2px 0' }}>
          <p style={{ fontWeight: 700, fontSize: 14, marginBottom: 2 }}>{r.plaga}</p>
          <p style={{ color: '#666', marginBottom: 6 }}>🌾 {r.finca}</p>
          <p style={{ marginBottom: 4 }}>
            Riesgo:{' '}
            <span style={{ color, fontWeight: 600, textTransform: 'capitalize' }}>{r.nivel}</span>
          </p>
          {r.temp_c != null && (
            <div style={{ background: '#f5f5f5', borderRadius: 6, padding: '4px 8px', marginBottom: 6, fontSize: 12 }}>
              🌡 {r.temp_c}°C {'  '} 💧 {r.humedad}% {'  '} 🌬 {r.viento_kmh} km/h {windDirLabel(r.viento_dir)}
            </div>
          )}
          {esCuarentenaria && (
            <p style={{ marginBottom: 6, fontSize: 11, fontWeight: 700, color: '#a855f7',
              background: '#a855f715', borderRadius: 4, padding: '3px 6px', border: '1px solid #a855f740' }}>
              🟣 CUARENTENARIA — Notificar ICA
            </p>
          )}
          {estadoConsenso && (
            <p style={{
              marginBottom: 6,
              fontSize: 11,
              fontWeight: 600,
              color: ESTADO_COLOR[estadoConsenso] ?? '#8b949e',
            }}>
              {{
                sospechoso:             '🟡 Sospechoso — aislado, sin confirmar',
                alerta_preventiva:      '🟠 Alerta Preventiva — cluster activo',
                confirmado_algoritmico: '🔴 Confirmado por el sistema',
                confirmado:             '🔴 Plaga Confirmada por agrónomo',
                descartado:             '⬛ Descartado',
              }[estadoConsenso] ?? estadoConsenso}
            </p>
          )}
          {r.mip?.evaluacionEconomica?.estadoEconomico === 'plaga' && (
            <p style={{ marginBottom: 4, fontSize: 11, color: '#ef4444', fontWeight: 600 }}>
              💰 Supera NDE — pérdida estimada ${r.mip.evaluacionEconomica.perdidaEstimada?.toLocaleString('es-CO') ?? '?'}/ha
            </p>
          )}
          <p style={{ color: '#999', fontSize: 11, marginBottom: 2 }}>👤 {r.email_reportador}</p>
          <p style={{ color: '#aaa', fontSize: 11, marginBottom: 2 }}>📅 {formatFecha(r.fecha)}</p>
          <p style={{ color: '#bbb', fontSize: 11, fontFamily: 'monospace' }}>
            {r.lat?.toFixed(5)}, {r.lng?.toFixed(5)}
          </p>
        </div>
      </Popup>
    </Marker>
  )
}

// HU-15: captura clics en el mapa para dibujar geocercas
function MapClickHandler({ drawMode, onMapClick }) {
  useMapEvents({
    click: e => {
      if (drawMode) onMapClick([e.latlng.lat, e.latlng.lng])
    },
  })
  return null
}

export default function Dashboard() {
  const navigate     = useNavigate()
  const { role }     = useAuth()
  const isAdmin      = role === 'admin'

  // --- datos ---
  const [reportes,   setReportes]   = useState([])
  const [geocercas,  setGeocercas]  = useState([])
  const [clima,      setClima]      = useState(null)

  // --- UI mapa ---
  const [filtroPlaga, setFiltroPlaga] = useState('')
  const [filtroNivel, setFiltroNivel] = useState('')
  const [showCones,   setShowCones]   = useState(true)  // HU-14 toggle
  const [diasSlider,  setDiasSlider]  = useState(30)    // HU-19 slider temporal

  // --- geocercas draw (HU-15) ---
  const [drawMode,      setDrawMode]      = useState(false)
  const [draftPoints,   setDraftPoints]   = useState([])
  const [nombreGeo,     setNombreGeo]     = useState('')
  const [showNombreBox, setShowNombreBox] = useState(false)
  const [savingGeo,     setSavingGeo]     = useState(false)
  const [geoError,      setGeoError]      = useState('')

  // --- alertas (HU-17) ---
  const [colisiones,   setColisiones]   = useState([])
  const [alertaAbierta, setAlertaAbierta] = useState(true)

  // --- HU-CONSENSO: validación espacio-temporal ---
  const [clusterAbierto, setClusterAbierto] = useState(true)

  // Cargar reportes en tiempo real
  useEffect(() => {
    const q = query(collection(db, 'reportes'), orderBy('fecha', 'desc'))
    return onSnapshot(q, snap => setReportes(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
  }, [])

  // Cargar geocercas en tiempo real (HU-15)
  // Firestore no soporta arrays anidados → se guardan como {lat,lng} y se convierten al leer
  useEffect(() => {
    return onSnapshot(collection(db, 'geocercas'), snap =>
      setGeocercas(snap.docs.map(d => {
        const data = d.data()
        return {
          id: d.id,
          ...data,
          coords: data.coords?.map(p => [p.lat, p.lng]) ?? [],
        }
      }))
    )
  }, [])

  // HU-07: clima del centro del Valle del Cauca
  useEffect(() => { fetchWeather(3.88, -76.30).then(setClima) }, [])

  // HU-16: detectar colisiones cada vez que cambian reportes o geocercas
  useEffect(() => {
    setColisiones(detectarColisiones(reportes, geocercas))
    setAlertaAbierta(true)
  }, [reportes, geocercas])

  // KPIs dinámicos — basados en el estado de consenso real
  const hoy              = new Date().toDateString()
  const avistamientosHoy = reportes.filter(r => {
    const f = r.fecha?.toDate?.() ?? (r.fecha instanceof Date ? r.fecha : null)
    return f && f.toDateString() === hoy
  }).length
  const fincasUnicas  = new Set(reportes.map(r => r.finca).filter(Boolean)).size
  const alertasAltas  = reportes.filter(r => r.nivel === 'alto').length

  // KPIs se calculan DESPUÉS de que estadosConsenso esté disponible (useMemo más abajo)
  // Los usamos via closure en el render
  const stats = [
    { label: 'Registros Hoy',       value: avistamientosHoy,   color: 'text-[#10b981]', icon: '📋', hint: 'Evaluaciones MIP enviadas hoy' },
    { label: 'Alertas en Mapa',     value: 0,                   color: 'text-orange-400', icon: '⚠️', dynamic: 'preventivas', hint: 'Visibles en el mapa — requieren atención' },
    { label: 'Plagas Confirmadas',  value: 0,                   color: 'text-red-400',    icon: '🔴', dynamic: 'confirmadas', hint: 'Confirmadas por profesional agrónomo' },
    { label: 'Fincas con Reporte',  value: fincasUnicas,        color: 'text-blue-400',   icon: '🌾', hint: 'Fincas que han enviado datos' },
  ]

  // HU-12 + HU-19: filtros (nivel, plaga, temporal)
  const fechaCorte = new Date()
  fechaCorte.setDate(fechaCorte.getDate() - diasSlider)
  const fechaCorteMs = fechaCorte.getTime()

  const reportesFiltrados = reportes.filter(r => {
    if (r.lat == null || r.lng == null)        return false
    if (r.estado === 'archivado')              return false   // ocultar archivados
    if (r.estado_validacion === 'descartado')  return false   // ocultar descartados
    if (filtroPlaga && r.plaga !== filtroPlaga) return false
    if (filtroNivel && r.nivel !== filtroNivel) return false
    const f = r.fecha?.toDate?.() ?? (r.fecha instanceof Date ? r.fecha : null)
    if (f && f.getTime() < fechaCorteMs) return false
    return true
  })
  const plagasUnicas = [...new Set(reportes.map(r => r.plaga).filter(Boolean))]
  const hayFiltro    = filtroPlaga || filtroNivel

  // ---- Geocercas: acciones ----
  const handleMapClick = useCallback(point => {
    setDraftPoints(pts => [...pts, point])
  }, [])

  const cancelarDibujo = () => {
    setDrawMode(false)
    setDraftPoints([])
    setNombreGeo('')
    setShowNombreBox(false)
    setGeoError('')
    setSavingGeo(false)
  }

  const finalizarDibujo = () => {
    if (draftPoints.length < 3) return
    setGeoError('')
    setShowNombreBox(true)
  }

  const guardarGeocerca = async () => {
    if (draftPoints.length < 3) return
    setSavingGeo(true)
    setGeoError('')
    try {
      // Convertir [[lat,lng],...] → [{lat,lng},...] porque Firestore no soporta arrays anidados
      await addDoc(collection(db, 'geocercas'), {
        nombre:   nombreGeo.trim() || 'Geocerca sin nombre',
        coords:   draftPoints.map(([lat, lng]) => ({ lat, lng })),
        creadoEn: serverTimestamp(),
      })
      cancelarDibujo()
    } catch (err) {
      console.error('Error al guardar geocerca:', err)
      if (err.code === 'permission-denied') {
        setGeoError('Sin permisos. Publica las reglas en Firebase Console y verifica que tu usuario tiene rol "admin" en Firestore.')
      } else {
        setGeoError(`Error: ${err.message}`)
      }
      setSavingGeo(false)
    }
  }

  const eliminarGeocerca = async (id) => {
    await deleteDoc(doc(db, 'geocercas', id))
  }

  // HU-CONSENSO: estados de consenso calculados en tiempo real
  const estadosConsenso = useMemo(
    () => calcularEstadosConsenso(reportes),
    [reportes]
  )
  const clusters = useMemo(
    () => detectarClusters(reportes, estadosConsenso),
    [reportes, estadosConsenso]
  )

  // Ids de geocercas afectadas (para resaltarlas en el mapa)
  const geocercasAfectadas = new Set(colisiones.map(c => c.geocercaId))

  return (
    <div className="flex h-screen bg-[#0d1117] text-white overflow-hidden">
      <Sidebar />

      <main className="flex-1 flex flex-col overflow-hidden">

        {/* ── Header ── */}
        <header className="bg-[#161b22] border-b border-[#30363d] px-6 py-4 flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-lg font-semibold text-white">Panel de Control</h2>
            <p className="text-[#8b949e] text-xs">
              Valle del Cauca · {new Date().toLocaleDateString('es-CO', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {clima && (
              <div className="bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-1.5 flex items-center gap-2 text-sm">
                <span>🌤️</span>
                <span className="text-[#c9d1d9]">{clima.temp_c}°C</span>
                <span className="text-[#484f58]">·</span>
                <span className="text-[#8b949e]">
                  💧{clima.humedad}% · 🌬 {clima.viento_kmh} km/h {windDirLabel(clima.viento_dir)}
                </span>
              </div>
            )}
            <button
              onClick={() => navigate('/reportar')}
              className="bg-[#10b981] hover:bg-[#059669] text-white text-sm font-medium px-4 py-1.5 rounded-lg transition-colors"
            >
              + Reportar Plaga
            </button>
          </div>
        </header>

        {/* ── KPIs — calculados sobre estadosConsenso en tiempo real ── */}
        {(() => {
          const countPreventivas = reportes.filter(r => estadosConsenso.get(r.id) === 'alerta_preventiva').length
          const countConfirmadas = reportes.filter(r => estadosConsenso.get(r.id) === 'confirmado').length
          const countObservaciones = reportes.filter(r => (estadosConsenso.get(r.id) ?? 'sospechoso') === 'sospechoso' && r.estado !== 'archivado').length

          const kpis = [
            { label: 'Evaluaciones Hoy',     value: avistamientosHoy,   color: 'text-[#10b981]', icon: '📋', note: 'reportes MIP recibidos' },
            { label: 'Alertas en Mapa',      value: countPreventivas,   color: 'text-orange-400', icon: '🟠', note: 'requieren atención', highlight: countPreventivas > 0 },
            { label: 'Confirmadas',          value: countConfirmadas,   color: 'text-red-400',    icon: '🔴', note: 'por agrónomo', highlight: countConfirmadas > 0 },
            { label: 'En Monitoreo',         value: countObservaciones, color: 'text-[#8b949e]',  icon: '👁', note: 'observaciones activas' },
          ]
          return (
            <div className="grid grid-cols-4 gap-4 px-6 py-4 shrink-0">
              {kpis.map(s => (
                <div key={s.label} className={`rounded-xl p-4 border transition-colors ${
                  s.highlight ? 'bg-[#1c1812] border-orange-500/30' : 'bg-[#161b22] border-[#30363d]'
                }`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-lg">{s.icon}</span>
                    {s.label === 'Alertas en Mapa' && colisiones.length > 0 && (
                      <span className="text-[10px] bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 px-1.5 py-0.5 rounded">
                        {colisiones.length} geocerca{colisiones.length > 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                  <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                  <p className="text-[#8b949e] text-xs mt-0.5">{s.label}</p>
                  <p className="text-[#484f58] text-[10px] mt-0.5">{s.note}</p>
                </div>
              ))}
            </div>
          )
        })()}

        {/* ── Contenido principal ── */}
        <div className="flex-1 flex gap-4 px-6 pb-6 overflow-hidden min-h-0">

          {/* ── Mapa ── */}
          <div className="flex-1 bg-[#161b22] border border-[#30363d] rounded-xl overflow-hidden flex flex-col">

            {/* Barra de controles del mapa */}
            <div className="px-4 py-3 border-b border-[#30363d] shrink-0 space-y-2">
              {/* Fila 1: título + leyenda + toggles */}
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-sm text-white">
                  Mapa Predictivo · Valle del Cauca
                  {reportesFiltrados.length < reportes.length && (
                    <span className="ml-2 text-[#10b981] text-xs font-normal">
                      ({reportesFiltrados.length}/{reportes.length})
                    </span>
                  )}
                </h3>
                <div className="flex items-center gap-3">
                  {/* Toggle conos HU-14 */}
                  <button
                    onClick={() => setShowCones(v => !v)}
                    className={`text-xs px-2.5 py-1 rounded-lg border transition-colors ${
                      showCones
                        ? 'border-orange-500/50 bg-orange-500/10 text-orange-400'
                        : 'border-[#30363d] text-[#484f58] hover:border-[#484f58]'
                    }`}
                  >
                    🌡 Conos de riesgo
                  </button>

                  {/* Dibujar geocerca HU-15 (solo admin) */}
                  {isAdmin && !drawMode && (
                    <button
                      onClick={() => setDrawMode(true)}
                      className="text-xs px-2.5 py-1 rounded-lg border border-[#30363d] text-[#484f58] hover:border-blue-500/50 hover:text-blue-400 transition-colors"
                    >
                      📐 Dibujar Geocerca
                    </button>
                  )}
                  {isAdmin && drawMode && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-blue-400 animate-pulse">
                        ✏️ Haz clic en el mapa para agregar vértices ({draftPoints.length})
                      </span>
                      {draftPoints.length >= 3 && (
                        <button
                          onClick={finalizarDibujo}
                          className="text-xs px-2 py-1 bg-blue-500/20 text-blue-400 border border-blue-500/40 rounded-lg"
                        >
                          ✓ Finalizar
                        </button>
                      )}
                      <button
                        onClick={cancelarDibujo}
                        className="text-xs px-2 py-1 text-[#484f58] hover:text-red-400 border border-[#30363d] rounded-lg"
                      >
                        ✕ Cancelar
                      </button>
                    </div>
                  )}

                  {/* Leyenda */}
                  <div className="flex items-center gap-3 text-xs text-[#8b949e]">
                    <span className="text-[#484f58] text-[10px] border border-[#30363d] rounded px-1.5 py-0.5">Solo alertas activas</span>
                    <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-orange-500 ring-1 ring-orange-400 inline-block" />Preventivo</span>
                    <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-red-500 ring-2 ring-white inline-block" />Confirmado</span>
                    <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-purple-500 ring-2 ring-white inline-block" />Cuarentenaria</span>
                  </div>
                </div>
              </div>

              {/* Modal nombre geocerca */}
              {showNombreBox && (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 bg-blue-500/10 border border-blue-500/30 rounded-lg px-3 py-2">
                    <span className="text-blue-400 text-xs shrink-0">📐 Nombre:</span>
                    <input
                      autoFocus
                      value={nombreGeo}
                      onChange={e => setNombreGeo(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && !savingGeo && guardarGeocerca()}
                      placeholder="Ej: Lote Norte – Finca El Paraíso"
                      disabled={savingGeo}
                      className="flex-1 bg-[#0d1117] border border-[#30363d] rounded px-2 py-1 text-white text-xs focus:outline-none focus:border-blue-400 disabled:opacity-50"
                    />
                    <button
                      onClick={guardarGeocerca}
                      disabled={savingGeo}
                      className="bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white text-xs px-3 py-1 rounded-lg shrink-0"
                    >
                      {savingGeo ? '⏳ Guardando...' : 'Guardar'}
                    </button>
                    <button
                      onClick={cancelarDibujo}
                      disabled={savingGeo}
                      className="text-[#484f58] hover:text-red-400 text-xs shrink-0"
                    >
                      Cancelar
                    </button>
                  </div>
                  {geoError && (
                    <p className="text-red-400 text-xs bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2">
                      ✗ {geoError}
                    </p>
                  )}
                </div>
              )}

              {/* Fila 2: slider temporal HU-19 */}
              <TimeSlider dias={diasSlider} onChange={setDiasSlider} />

              {/* Fila 3: filtros HU-12 */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[#484f58] text-xs shrink-0">Filtrar:</span>
                {['alto', 'medio', 'bajo'].map(n => (
                  <button
                    key={n}
                    onClick={() => setFiltroNivel(v => v === n ? '' : n)}
                    className={`px-2 py-0.5 rounded text-xs capitalize border transition-colors ${
                      filtroNivel === n ? nivelBg[n] : 'border-[#30363d] text-[#484f58] hover:border-[#484f58] hover:text-[#8b949e]'
                    }`}
                  >
                    {n}
                  </button>
                ))}
                {plagasUnicas.length > 0 && <span className="text-[#30363d] select-none">|</span>}
                {plagasUnicas.map(p => (
                  <button
                    key={p}
                    onClick={() => setFiltroPlaga(v => v === p ? '' : p)}
                    title={p}
                    className={`px-2 py-0.5 rounded text-xs border transition-colors max-w-[130px] truncate ${
                      filtroPlaga === p
                        ? 'border-[#10b981]/50 bg-[#10b981]/10 text-[#10b981]'
                        : 'border-[#30363d] text-[#484f58] hover:border-[#484f58] hover:text-[#8b949e]'
                    }`}
                  >
                    {p}
                  </button>
                ))}
                {hayFiltro && (
                  <button
                    onClick={() => { setFiltroPlaga(''); setFiltroNivel('') }}
                    className="text-[#484f58] hover:text-white text-xs underline ml-1"
                  >
                    Limpiar
                  </button>
                )}
              </div>
            </div>

            {/* Mapa Leaflet */}
            <div className="flex-1 relative">
              <MapContainer
                center={[3.88, -76.30]}
                zoom={11}
                style={{
                  height: '100%', width: '100%',
                  cursor: drawMode ? 'crosshair' : 'grab',
                }}
                zoomControl
              >
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />

                {/* HU-15: captura clics para dibujar */}
                <MapClickHandler drawMode={drawMode} onMapClick={handleMapClick} />

                {/* Solo se muestran reportes con estado alerta_preventiva o confirmado.
                    Los reportes sospechosos (observaciones sin umbral superado) no
                    aparecen en el mapa operacional — son datos de monitoreo, no alertas. */}
                {reportesFiltrados
                  .filter(r => {
                    const e = estadosConsenso.get(r.id) ?? 'sospechoso'
                    return e === 'alerta_preventiva' || e === 'confirmado'
                  })
                  .map(r => (
                    <ColorMarker
                      key={r.id}
                      r={r}
                      estadoConsenso={estadosConsenso.get(r.id)}
                    />
                  ))}

                {/* HU-14: conos de dispersión */}
                {showCones && <RiskConeLayer reportes={reportesFiltrados} />}

                {/* HU-15: geocercas guardadas */}
                {geocercas.map(geo => (
                  <Polygon
                    key={geo.id}
                    positions={geo.coords}
                    pathOptions={{
                      color: geocercasAfectadas.has(geo.id) ? '#f59e0b' : '#3b82f6',
                      fillColor: geocercasAfectadas.has(geo.id) ? '#f59e0b' : '#3b82f6',
                      fillOpacity: geocercasAfectadas.has(geo.id) ? 0.25 : 0.12,
                      weight: geocercasAfectadas.has(geo.id) ? 2.5 : 1.5,
                      dashArray: geocercasAfectadas.has(geo.id) ? undefined : '6 4',
                    }}
                  >
                    <Tooltip direction="center" permanent={false}>
                      <div style={{ fontSize: 12 }}>
                        🏡 <strong>{geo.nombre}</strong>
                        {geocercasAfectadas.has(geo.id) && (
                          <span style={{ color: '#f59e0b' }}> · ⚠️ En riesgo</span>
                        )}
                        {isAdmin && (
                          <div
                            onClick={() => eliminarGeocerca(geo.id)}
                            style={{ color: '#ef4444', cursor: 'pointer', fontSize: 11, marginTop: 2 }}
                          >
                            🗑 Eliminar
                          </div>
                        )}
                      </div>
                    </Tooltip>
                  </Polygon>
                ))}

                {/* HU-15: polígono siendo dibujado (borrador) */}
                {draftPoints.length > 0 && (
                  <>
                    {draftPoints.map((pt, i) => (
                      <CircleMarker
                        key={i}
                        center={pt}
                        radius={5}
                        pathOptions={{ color: '#3b82f6', fillColor: '#3b82f6', fillOpacity: 1, weight: 2 }}
                      />
                    ))}
                    {draftPoints.length > 1 && (
                      <Polyline
                        positions={draftPoints}
                        pathOptions={{ color: '#3b82f6', weight: 2, dashArray: '6 4' }}
                      />
                    )}
                    {draftPoints.length >= 3 && (
                      <Polygon
                        positions={draftPoints}
                        pathOptions={{ color: '#3b82f6', fillColor: '#3b82f6', fillOpacity: 0.15, weight: 2, dashArray: '6 4' }}
                      />
                    )}
                  </>
                )}
              </MapContainer>

              {/* HU-17: panel de alertas amarillas (flotante sobre el mapa) */}
              {colisiones.length > 0 && alertaAbierta && (
                <div className="absolute top-3 right-3 z-[1000] pointer-events-auto">
                  <AlertPanel
                    colisiones={colisiones}
                    onClose={() => setAlertaAbierta(false)}
                  />
                </div>
              )}

              {/* Botón reabrir alertas de viento */}
              {colisiones.length > 0 && !alertaAbierta && (
                <button
                  onClick={() => setAlertaAbierta(true)}
                  className="absolute top-3 right-3 z-[1000] bg-yellow-500 text-black text-xs font-bold px-3 py-1.5 rounded-lg animate-pulse"
                >
                  ⚠️ {colisiones.length} alerta{colisiones.length > 1 ? 's' : ''}
                </button>
              )}

              {/* HU-CONSENSO: panel de clusters activos */}
              {clusters.length > 0 && clusterAbierto && (
                <ClusterAlertPanel
                  clusters={clusters}
                  onClose={() => setClusterAbierto(false)}
                />
              )}
              {clusters.length > 0 && !clusterAbierto && (
                <button
                  onClick={() => setClusterAbierto(true)}
                  className={`absolute bottom-4 left-4 z-[1000] text-white text-xs font-bold px-3 py-1.5 rounded-lg animate-pulse ${
                    clusters.some(c => c.estado === 'confirmado' || c.estado === 'confirmado_algoritmico')
                      ? 'bg-red-600'
                      : 'bg-orange-500'
                  }`}
                >
                  🔴 {clusters.length} foco{clusters.length > 1 ? 's' : ''} activo{clusters.length > 1 ? 's' : ''}
                </button>
              )}
            </div>
          </div>

          {/* ── Panel lateral derecho ── */}
          <div className="w-72 flex flex-col gap-4 overflow-y-auto shrink-0">

            {/* Geocercas registradas (admin) */}
            {isAdmin && (
              <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-4 shrink-0">
                <h3 className="font-semibold text-sm text-white mb-3 flex items-center justify-between">
                  <span>📐 Geocercas ({geocercas.length})</span>
                  {!drawMode && (
                    <button
                      onClick={() => setDrawMode(true)}
                      className="text-xs text-blue-400 hover:text-blue-300 underline"
                    >
                      + Nueva
                    </button>
                  )}
                </h3>
                {geocercas.length === 0 ? (
                  <p className="text-[#484f58] text-xs">
                    Ninguna geocerca registrada.<br />
                    Usa "Dibujar Geocerca" en el mapa.
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {geocercas.map(g => (
                      <div
                        key={g.id}
                        className={`flex items-center justify-between px-2 py-1.5 rounded-lg text-xs ${
                          geocercasAfectadas.has(g.id)
                            ? 'bg-yellow-500/10 border border-yellow-500/30 text-yellow-300'
                            : 'bg-[#0d1117] text-[#c9d1d9]'
                        }`}
                      >
                        <span className="truncate">
                          {geocercasAfectadas.has(g.id) ? '⚠️ ' : '🏡 '}{g.nombre}
                        </span>
                        <button
                          onClick={() => eliminarGeocerca(g.id)}
                          className="text-[#484f58] hover:text-red-400 ml-2 shrink-0"
                          title="Eliminar"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* HU-CONSENSO: Focos activos detectados por consenso */}
            {clusters.length > 0 && (
              <div className="bg-[#161b22] border border-orange-500/30 rounded-xl p-4 shrink-0">
                <h3 className="font-semibold text-sm text-white mb-3 flex items-center gap-2">
                  <span>🔬</span>
                  <span>Focos Detectados</span>
                  <span className="ml-auto text-xs bg-orange-500/20 text-orange-400 border border-orange-500/30 px-1.5 py-0.5 rounded">
                    {clusters.length}
                  </span>
                </h3>
                <div className="space-y-2">
                  {clusters.slice(0, 4).map((c, i) => {
                    const isConfirmed = c.estado === 'confirmado' || c.estado === 'confirmado_algoritmico'
                    return (
                      <div
                        key={i}
                        className={`rounded-lg p-2.5 border text-xs ${
                          isConfirmed
                            ? 'bg-red-500/10 border-red-500/30'
                            : 'bg-orange-500/10 border-orange-500/30'
                        }`}
                      >
                        <p className={`font-semibold truncate ${isConfirmed ? 'text-red-400' : 'text-orange-400'}`}>
                          {isConfirmed ? '🔴' : '🟠'} {c.plaga}
                        </p>
                        <p className="text-[#8b949e] mt-0.5">{c.cantidad} reportes en el área</p>
                        <p className="text-[#484f58] text-xs mt-0.5">
                          {ESTADO_LABEL[c.estado] ?? c.estado}
                        </p>
                      </div>
                    )
                  })}
                </div>
                <p className="text-[#484f58] text-xs mt-2 pt-2 border-t border-[#21262d]">
                  Radio 5 km · ventana 48 h · umbral 3 rep.
                </p>
              </div>
            )}

            {/* Alertas activas */}
            <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-4">
              <h3 className="font-semibold text-sm text-white mb-3">
                Alertas Activas
                {alertasAltas > 0 && (
                  <span className="ml-2 bg-red-500/20 text-red-400 text-xs px-1.5 py-0.5 rounded border border-red-500/30">
                    {alertasAltas}
                  </span>
                )}
              </h3>
              <div className="space-y-2">
                {reportes.filter(r => r.nivel === 'alto').slice(0, 5).map(r => (
                  <div key={r.id} className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
                    <p className="text-red-400 text-xs font-semibold truncate">{r.plaga}</p>
                    <p className="text-[#8b949e] text-xs mt-0.5 truncate">{r.finca}</p>
                    <p className="text-[#484f58] text-xs">{formatFecha(r.fecha)}</p>
                  </div>
                ))}
                {alertasAltas === 0 && (
                  <p className="text-[#484f58] text-xs text-center py-4">Sin alertas de riesgo alto</p>
                )}
              </div>
            </div>

            {/* Actividad reciente — con estado de consenso */}
            <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-4 flex-1 overflow-hidden">
              <h3 className="font-semibold text-sm text-white mb-1">Actividad Reciente</h3>
              <p className="text-[#484f58] text-[10px] mb-3">Todos los registros MIP recibidos</p>
              <div className="space-y-0 overflow-y-auto max-h-52">
                {reportes.slice(0, 12).map(r => {
                  const ev = estadosConsenso.get(r.id) ?? 'sospechoso'
                  const evColor = ESTADO_COLOR[ev] ?? '#8b949e'
                  const evLabel = { sospechoso: 'Monitoreo', alerta_preventiva: 'Alerta', confirmado: 'Confirmado', descartado: 'Descartado' }[ev] ?? ev
                  return (
                    <div key={r.id} className="flex items-start gap-2 py-2 border-b border-[#21262d] last:border-0">
                      <div className="w-2 h-2 rounded-full mt-1.5 shrink-0" style={{ background: evColor }} />
                      <div className="min-w-0 flex-1">
                        <p className="text-[#c9d1d9] text-xs font-medium truncate">{r.plaga}</p>
                        <p className="text-[#484f58] text-[10px] truncate">{r.finca}</p>
                      </div>
                      <span className="text-[10px] px-1.5 py-0.5 rounded border shrink-0 font-medium"
                        style={{ color: evColor, borderColor: evColor + '40', background: evColor + '15' }}>
                        {evLabel}
                      </span>
                    </div>
                  )
                })}
                {reportes.length === 0 && (
                  <p className="text-[#484f58] text-xs text-center py-6">Sin registros MIP aún</p>
                )}
              </div>
            </div>

            {/* Variables climáticas */}
            <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-4 shrink-0">
              <h3 className="font-semibold text-sm text-white mb-3">Variables Climáticas</h3>
              {clima ? (
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-[#8b949e]">Temperatura</span>
                    <span className="text-white font-medium">{clima.temp_c}°C</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#8b949e]">Viento</span>
                    <span className="text-[#10b981] font-medium">
                      {clima.viento_kmh} km/h {windDirLabel(clima.viento_dir)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#8b949e]">Humedad</span>
                    <span className="text-white font-medium">{clima.humedad}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#8b949e]">Condición</span>
                    <span className="text-white font-medium text-xs capitalize">{clima.descripcion}</span>
                  </div>
                  <p className="text-[#484f58] text-xs pt-1 border-t border-[#21262d]">
                    Fuente: OpenWeather API
                  </p>
                </div>
              ) : (
                <p className="text-[#484f58] text-xs leading-relaxed">
                  {import.meta.env.VITE_OPENWEATHER_API_KEY
                    ? 'Cargando datos climáticos...'
                    : 'Agrega VITE_OPENWEATHER_API_KEY en .env'}
                </p>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
