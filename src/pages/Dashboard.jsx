// Sprint 2 + Sprint 3: Mapa real, conos de riesgo, geocercas y alertas
import { useState, useEffect, useCallback } from 'react'
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

// HU-10+11: marcador con popup detallado
function ColorMarker({ r }) {
  const color = nivelColor[r.nivel] ?? '#8b949e'
  const icon = L.divIcon({
    className: '',
    html: `<div style="width:14px;height:14px;border-radius:50%;background:${color};border:2px solid white;box-shadow:0 0 8px ${color}80;cursor:pointer"></div>`,
    iconSize: [14, 14], iconAnchor: [7, 7], popupAnchor: [0, -10],
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

  // --- geocercas draw (HU-15) ---
  const [drawMode,      setDrawMode]      = useState(false)
  const [draftPoints,   setDraftPoints]   = useState([])
  const [nombreGeo,     setNombreGeo]     = useState('')
  const [showNombreBox, setShowNombreBox] = useState(false)

  // --- alertas (HU-17) ---
  const [colisiones,   setColisiones]   = useState([])
  const [alertaAbierta, setAlertaAbierta] = useState(true)

  // Cargar reportes en tiempo real
  useEffect(() => {
    const q = query(collection(db, 'reportes'), orderBy('fecha', 'desc'))
    return onSnapshot(q, snap => setReportes(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
  }, [])

  // Cargar geocercas en tiempo real (HU-15)
  useEffect(() => {
    return onSnapshot(collection(db, 'geocercas'), snap =>
      setGeocercas(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    )
  }, [])

  // HU-07: clima del centro del Valle del Cauca
  useEffect(() => { fetchWeather(3.88, -76.30).then(setClima) }, [])

  // HU-16: detectar colisiones cada vez que cambian reportes o geocercas
  useEffect(() => {
    setColisiones(detectarColisiones(reportes, geocercas))
    setAlertaAbierta(true)
  }, [reportes, geocercas])

  // KPIs dinámicos
  const hoy              = new Date().toDateString()
  const avistamientosHoy = reportes.filter(r => {
    const f = r.fecha?.toDate?.() ?? (r.fecha instanceof Date ? r.fecha : null)
    return f && f.toDateString() === hoy
  }).length
  const alertasAltas  = reportes.filter(r => r.nivel === 'alto').length
  const fincasUnicas  = new Set(reportes.map(r => r.finca).filter(Boolean)).size
  const zonasEnRiesgo = reportes.filter(r => r.nivel !== 'bajo').length

  const stats = [
    { label: 'Avistamientos Hoy',  value: avistamientosHoy, color: 'text-[#10b981]', icon: '🐛' },
    { label: 'Alertas Activas',    value: alertasAltas,     color: 'text-red-400',    icon: '⚠️' },
    { label: 'Fincas Reportando',  value: fincasUnicas,     color: 'text-blue-400',   icon: '🌾' },
    { label: 'Zonas en Riesgo',    value: zonasEnRiesgo,    color: 'text-yellow-400', icon: '📍' },
  ]

  // HU-12: filtros
  const reportesFiltrados = reportes.filter(r =>
    r.lat != null && r.lng != null &&
    (!filtroPlaga || r.plaga === filtroPlaga) &&
    (!filtroNivel || r.nivel === filtroNivel)
  )
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
  }

  const finalizarDibujo = () => {
    if (draftPoints.length < 3) return
    setShowNombreBox(true)
  }

  const guardarGeocerca = async () => {
    if (draftPoints.length < 3) return
    await addDoc(collection(db, 'geocercas'), {
      nombre:    nombreGeo.trim() || 'Geocerca sin nombre',
      coords:    draftPoints,
      creadoEn:  serverTimestamp(),
    })
    cancelarDibujo()
  }

  const eliminarGeocerca = async (id) => {
    await deleteDoc(doc(db, 'geocercas', id))
  }

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

        {/* ── KPIs ── */}
        <div className="grid grid-cols-4 gap-4 px-6 py-4 shrink-0">
          {stats.map(s => (
            <div key={s.label} className="bg-[#161b22] border border-[#30363d] rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-lg">{s.icon}</span>
                {s.label === 'Alertas Activas' && colisiones.length > 0 && (
                  <span className="text-xs bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 px-1.5 rounded">
                    {colisiones.length} colisión{colisiones.length > 1 ? 'es' : ''}
                  </span>
                )}
              </div>
              <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-[#8b949e] text-xs mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>

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
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500 inline-block" />Alto</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-yellow-500 inline-block" />Medio</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" />Bajo</span>
                  </div>
                </div>
              </div>

              {/* Modal nombre geocerca */}
              {showNombreBox && (
                <div className="flex items-center gap-2 bg-blue-500/10 border border-blue-500/30 rounded-lg px-3 py-2">
                  <span className="text-blue-400 text-xs">📐 Nombre de la geocerca:</span>
                  <input
                    autoFocus
                    value={nombreGeo}
                    onChange={e => setNombreGeo(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && guardarGeocerca()}
                    placeholder="Ej: Lote Norte – Finca El Paraíso"
                    className="flex-1 bg-[#0d1117] border border-[#30363d] rounded px-2 py-1 text-white text-xs focus:outline-none focus:border-blue-400"
                  />
                  <button
                    onClick={guardarGeocerca}
                    className="bg-blue-500 hover:bg-blue-600 text-white text-xs px-3 py-1 rounded-lg"
                  >
                    Guardar
                  </button>
                  <button
                    onClick={cancelarDibujo}
                    className="text-[#484f58] hover:text-red-400 text-xs"
                  >
                    Cancelar
                  </button>
                </div>
              )}

              {/* Fila 2: filtros HU-12 */}
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

                {/* HU-10+11: marcadores de reportes */}
                {reportesFiltrados.map(r => <ColorMarker key={r.id} r={r} />)}

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

              {/* Botón reabrir alertas */}
              {colisiones.length > 0 && !alertaAbierta && (
                <button
                  onClick={() => setAlertaAbierta(true)}
                  className="absolute top-3 right-3 z-[1000] bg-yellow-500 text-black text-xs font-bold px-3 py-1.5 rounded-lg animate-pulse"
                >
                  ⚠️ {colisiones.length} alerta{colisiones.length > 1 ? 's' : ''}
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

            {/* Avistamientos recientes */}
            <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-4 flex-1 overflow-hidden">
              <h3 className="font-semibold text-sm text-white mb-3">Avistamientos Recientes</h3>
              <div className="space-y-0 overflow-y-auto max-h-48">
                {reportes.slice(0, 10).map(r => (
                  <div key={r.id} className="flex items-start gap-2 py-2 border-b border-[#21262d] last:border-0">
                    <div className="w-2 h-2 rounded-full mt-1.5 shrink-0" style={{ background: nivelColor[r.nivel] ?? '#8b949e' }} />
                    <div className="min-w-0 flex-1">
                      <p className="text-[#c9d1d9] text-xs font-medium truncate">{r.plaga}</p>
                      <p className="text-[#484f58] text-xs truncate">{r.finca}</p>
                    </div>
                    <span className={`text-xs px-1.5 py-0.5 rounded border shrink-0 ${nivelBg[r.nivel] ?? ''}`}>
                      {r.nivel}
                    </span>
                  </div>
                ))}
                {reportes.length === 0 && (
                  <p className="text-[#484f58] text-xs text-center py-6">Sin avistamientos aún</p>
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
