// HU-09 + HU-10 + HU-11 + HU-12: Mapa real con Firestore, popups detallados y filtros
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore'
import { db } from '../firebase'
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet'
import L from 'leaflet'
import Sidebar from '../components/Sidebar'
import { fetchWeather, windDirLabel } from '../services/weatherService'

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

// HU-10: marcador coloreado según nivel de riesgo
function ColorMarker({ r }) {
  const color = nivelColor[r.nivel] ?? '#8b949e'
  const icon = L.divIcon({
    className: '',
    html: `<div style="width:14px;height:14px;border-radius:50%;background:${color};border:2px solid white;box-shadow:0 0 8px ${color}80;cursor:pointer"></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
    popupAnchor: [0, -10],
  })

  // HU-11: popup con todos los datos del reporte + clima
  return (
    <Marker position={[r.lat, r.lng]} icon={icon}>
      <Popup maxWidth={230} minWidth={180}>
        <div style={{ fontFamily: 'system-ui, sans-serif', fontSize: '13px', lineHeight: '1.6', padding: '2px 0' }}>
          <p style={{ fontWeight: 700, fontSize: '14px', marginBottom: 2 }}>{r.plaga}</p>
          <p style={{ color: '#666', marginBottom: 6 }}>🌾 {r.finca}</p>
          <p style={{ marginBottom: 4 }}>
            Riesgo:{' '}
            <span style={{ color: color, fontWeight: 600, textTransform: 'capitalize' }}>{r.nivel}</span>
          </p>
          {(r.temp_c != null) && (
            <div style={{ background: '#f5f5f5', borderRadius: 6, padding: '4px 8px', marginBottom: 6, fontSize: '12px' }}>
              <span>🌡 {r.temp_c}°C</span>
              {'  '}
              <span>💧 {r.humedad}%</span>
              {'  '}
              <span>🌬 {r.viento_kmh} km/h {windDirLabel(r.viento_dir)}</span>
            </div>
          )}
          <p style={{ color: '#999', fontSize: '11px', marginBottom: 2 }}>
            👤 {r.email_reportador}
          </p>
          <p style={{ color: '#aaa', fontSize: '11px', marginBottom: 2 }}>
            📅 {formatFecha(r.fecha)}
          </p>
          <p style={{ color: '#bbb', fontSize: '11px', fontFamily: 'monospace' }}>
            {r.lat?.toFixed(5)}, {r.lng?.toFixed(5)}
          </p>
        </div>
      </Popup>
    </Marker>
  )
}

export default function Dashboard() {
  const navigate = useNavigate()
  const [reportes, setReportes]       = useState([])
  const [clima, setClima]             = useState(null)
  const [filtroPlaga, setFiltroPlaga] = useState('')
  const [filtroNivel, setFiltroNivel] = useState('')

  // HU-10: escuchar reportes en tiempo real desde Firestore
  useEffect(() => {
    const q = query(collection(db, 'reportes'), orderBy('fecha', 'desc'))
    return onSnapshot(q, snap => {
      setReportes(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    })
  }, [])

  // HU-07: cargar clima actual del centro del Valle del Cauca
  useEffect(() => {
    fetchWeather(3.88, -76.30).then(setClima)
  }, [])

  // KPIs dinámicos calculados desde Firestore
  const hoy = new Date().toDateString()
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

  // HU-12: filtrar marcadores por plaga y/o nivel
  const reportesFiltrados = reportes.filter(r =>
    r.lat != null && r.lng != null &&
    (!filtroPlaga || r.plaga === filtroPlaga) &&
    (!filtroNivel || r.nivel === filtroNivel)
  )

  const plagasUnicas = [...new Set(reportes.map(r => r.plaga).filter(Boolean))]
  const hayFiltro    = filtroPlaga || filtroNivel

  return (
    <div className="flex h-screen bg-[#0d1117] text-white overflow-hidden">
      <Sidebar />

      <main className="flex-1 flex flex-col overflow-hidden">

        {/* Header */}
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

        {/* KPIs */}
        <div className="grid grid-cols-4 gap-4 px-6 py-4 shrink-0">
          {stats.map(s => (
            <div key={s.label} className="bg-[#161b22] border border-[#30363d] rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-lg">{s.icon}</span>
              </div>
              <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-[#8b949e] text-xs mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Contenido principal */}
        <div className="flex-1 flex gap-4 px-6 pb-6 overflow-hidden min-h-0">

          {/* Mapa (HU-09) */}
          <div className="flex-1 bg-[#161b22] border border-[#30363d] rounded-xl overflow-hidden flex flex-col">

            {/* Cabecera del mapa + filtros HU-12 */}
            <div className="px-4 py-3 border-b border-[#30363d] shrink-0">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold text-sm text-white">
                  Mapa Predictivo · Valle del Cauca
                  {reportesFiltrados.length < reportes.length && (
                    <span className="ml-2 text-[#10b981] text-xs font-normal">
                      ({reportesFiltrados.length} de {reportes.length} puntos)
                    </span>
                  )}
                </h3>
                <div className="flex items-center gap-3 text-xs text-[#8b949e]">
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500 inline-block" />Alto</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-yellow-500 inline-block" />Medio</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" />Bajo</span>
                </div>
              </div>

              {/* HU-12: filtros por nivel y por tipo de plaga */}
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

            {/* Mapa Leaflet con datos reales */}
            <div className="flex-1">
              <MapContainer
                center={[3.88, -76.30]}
                zoom={11}
                style={{ height: '100%', width: '100%' }}
                zoomControl
              >
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                {reportesFiltrados.map(r => <ColorMarker key={r.id} r={r} />)}
              </MapContainer>
            </div>
          </div>

          {/* Panel lateral derecho */}
          <div className="w-72 flex flex-col gap-4 overflow-y-auto shrink-0">

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
                  <p className="text-[#484f58] text-xs text-center py-6">
                    Sin avistamientos registrados aún
                  </p>
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
                    : 'Agrega tu clave en VITE_OPENWEATHER_API_KEY (.env) para ver datos reales.'}
                </p>
              )}
            </div>

          </div>
        </div>
      </main>
    </div>
  )
}
