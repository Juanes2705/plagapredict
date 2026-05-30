// HU-20 + HU-21 + HU-22 + HU-CONSENSO: Dashboard Gerencial
import { useState, useEffect, useMemo } from 'react'
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore'
import { db } from '../firebase'
import {
  calcularEstadosConsenso,
  detectarClusters,
} from '../utils/consensusValidation'
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, BarElement,
  LineElement, PointElement, ArcElement,
  Title, Tooltip, Legend, Filler,
} from 'chart.js'
import { Bar, Line, Doughnut } from 'react-chartjs-2'
import Sidebar from '../components/Sidebar'
import { detectarColisiones } from '../utils/collisionDetection'

ChartJS.register(
  CategoryScale, LinearScale, BarElement,
  LineElement, PointElement, ArcElement,
  Title, Tooltip, Legend, Filler,
)
// Tema oscuro global de Chart.js
ChartJS.defaults.color          = '#8b949e'
ChartJS.defaults.borderColor    = '#30363d'
ChartJS.defaults.font.family    = 'system-ui, sans-serif'
ChartJS.defaults.font.size      = 11

function formatFecha(fecha) {
  const d = fecha?.toDate?.() ?? (fecha instanceof Date ? fecha : null)
  if (!d) return '—'
  return d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short' })
}

const nivelColor = { alto: '#ef4444', medio: '#f59e0b', bajo: '#10b981' }
const nivelBg    = {
  alto:  'bg-red-500/20 text-red-400 border-red-500/30',
  medio: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  bajo:  'bg-green-500/20 text-green-400 border-green-500/30',
}

export default function GerencialDashboard() {
  const [reportes,  setReportes]  = useState([])
  const [geocercas, setGeocercas] = useState([])

  useEffect(() => {
    const q = query(collection(db, 'reportes'), orderBy('fecha', 'desc'))
    return onSnapshot(q, snap =>
      setReportes(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    )
  }, [])

  useEffect(() => {
    return onSnapshot(collection(db, 'geocercas'), snap =>
      setGeocercas(snap.docs.map(d => {
        const data = d.data()
        return { id: d.id, ...data, coords: data.coords?.map(p => [p.lat, p.lng]) ?? [] }
      }))
    )
  }, [])

  // ── HU-20: KPIs estadísticos ──────────────────────────────────────────────
  const activos    = reportes.filter(r => r.estado !== 'archivado')
  const archivados = reportes.filter(r => r.estado === 'archivado')
  const altos      = activos.filter(r => r.nivel === 'alto')
  const medios     = activos.filter(r => r.nivel === 'medio')
  const bajos      = activos.filter(r => r.nivel === 'bajo')
  const pctAlto    = activos.length ? Math.round((altos.length  / activos.length) * 100) : 0
  const pctMedio   = activos.length ? Math.round((medios.length / activos.length) * 100) : 0
  const pctBajo    = activos.length ? Math.round((bajos.length  / activos.length) * 100) : 0

  const colisiones        = useMemo(() => detectarColisiones(activos, geocercas), [activos, geocercas])
  const geocercasEnRiesgo = new Set(colisiones.map(c => c.geocercaId)).size

  // HU-CONSENSO: estados de validación
  const estadosConsenso = useMemo(() => calcularEstadosConsenso(activos), [activos])
  const clusters        = useMemo(() => detectarClusters(activos, estadosConsenso), [activos, estadosConsenso])

  const cntSospechosos  = activos.filter(r => (estadosConsenso.get(r.id) ?? 'sospechoso') === 'sospechoso').length
  const cntPreventivos  = activos.filter(r => estadosConsenso.get(r.id) === 'alerta_preventiva').length
  const cntConfirmados  = activos.filter(r =>
    estadosConsenso.get(r.id) === 'confirmado' || estadosConsenso.get(r.id) === 'confirmado_algoritmico'
  ).length

  // Plaga más frecuente
  const frecPlaga = activos.reduce((acc, r) => {
    if (r.plaga) acc[r.plaga] = (acc[r.plaga] ?? 0) + 1
    return acc
  }, {})
  const plagaTop = Object.entries(frecPlaga).sort((a, b) => b[1] - a[1])[0]

  // Días con reporte
  const hoy = new Date().toDateString()
  const hoyCount = activos.filter(r => {
    const f = r.fecha?.toDate?.() ?? (r.fecha instanceof Date ? r.fecha : null)
    return f && f.toDateString() === hoy
  }).length

  // Tendencia: ¿subió o bajó vs ayer?
  const ayer = new Date(); ayer.setDate(ayer.getDate() - 1)
  const ayerStr = ayer.toDateString()
  const ayerCount = activos.filter(r => {
    const f = r.fecha?.toDate?.() ?? (r.fecha instanceof Date ? r.fecha : null)
    return f && f.toDateString() === ayerStr
  }).length
  const tendencia = hoyCount > ayerCount ? '↑' : hoyCount < ayerCount ? '↓' : '='

  const kpis = [
    { label: 'Reportes Totales',      value: reportes.length,  sub: `${archivados.length} archivados`,     color: 'text-white',          icon: '📊' },
    { label: 'Brotes Activos',        value: activos.length,   sub: `${hoyCount} hoy ${tendencia}`,        color: 'text-[#10b981]',      icon: '🐛' },
    { label: 'Riesgo Alto',           value: `${pctAlto}%`,    sub: `${altos.length} reportes`,            color: 'text-red-400',        icon: '🔴' },
    { label: 'Riesgo Medio',          value: `${pctMedio}%`,   sub: `${medios.length} reportes`,           color: 'text-yellow-400',     icon: '🟡' },
    { label: 'Geocercas en Riesgo',   value: geocercasEnRiesgo,sub: `de ${geocercas.length} totales`,       color: 'text-orange-400',     icon: '⚠️' },
    { label: 'Plaga Predominante',    value: plagaTop?.[0]?.split('/')[0]?.trim() ?? '—',
                                       sub: plagaTop ? `${plagaTop[1]} avistamientos` : 'Sin datos',
                                                                                                             color: 'text-purple-400',     icon: '🔬' },
  ]

  // ── HU-21: datos para gráficos ────────────────────────────────────────────

  // Gráfico 1: Top 5 plagas (barras horizontales)
  const topPlagas = Object.entries(frecPlaga)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)

  const chartTopPlagas = {
    labels: topPlagas.map(([p]) => p.length > 22 ? p.slice(0, 22) + '…' : p),
    datasets: [{
      label: 'Avistamientos',
      data: topPlagas.map(([, n]) => n),
      backgroundColor: ['#ef444480', '#f59e0b80', '#10b98180', '#3b82f680', '#8b5cf680', '#ec489980'],
      borderColor:     ['#ef4444',   '#f59e0b',   '#10b981',   '#3b82f6',   '#8b5cf6',   '#ec4899'],
      borderWidth: 1.5,
      borderRadius: 4,
    }],
  }

  // Gráfico 2: Reportes por día (últimos 14 días) — línea
  const dias14 = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (13 - i))
    return d
  })
  const countPorDia = dias14.map(d => ({
    label: d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short' }),
    alto:  activos.filter(r => { const f = r.fecha?.toDate?.(); return f && f.toDateString() === d.toDateString() && r.nivel === 'alto' }).length,
    medio: activos.filter(r => { const f = r.fecha?.toDate?.(); return f && f.toDateString() === d.toDateString() && r.nivel === 'medio' }).length,
    bajo:  activos.filter(r => { const f = r.fecha?.toDate?.(); return f && f.toDateString() === d.toDateString() && r.nivel === 'bajo' }).length,
  }))

  const chartTendencia = {
    labels: countPorDia.map(d => d.label),
    datasets: [
      {
        label: 'Alto',
        data: countPorDia.map(d => d.alto),
        borderColor: '#ef4444', backgroundColor: '#ef444420',
        tension: 0.4, fill: false, pointRadius: 3,
      },
      {
        label: 'Medio',
        data: countPorDia.map(d => d.medio),
        borderColor: '#f59e0b', backgroundColor: '#f59e0b20',
        tension: 0.4, fill: false, pointRadius: 3,
      },
      {
        label: 'Bajo',
        data: countPorDia.map(d => d.bajo),
        borderColor: '#10b981', backgroundColor: '#10b98120',
        tension: 0.4, fill: false, pointRadius: 3,
      },
    ],
  }

  // Gráfico 3: Distribución por nivel (dona)
  const chartDistribucion = {
    labels: ['Alto', 'Medio', 'Bajo'],
    datasets: [{
      data: [altos.length, medios.length, bajos.length],
      backgroundColor: ['#ef444460', '#f59e0b60', '#10b98160'],
      borderColor:     ['#ef4444',   '#f59e0b',   '#10b981'],
      borderWidth: 2,
    }],
  }

  const chartOpts = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false }, tooltip: { callbacks: {} } },
    scales: {
      x: { grid: { color: '#21262d' }, ticks: { color: '#8b949e' } },
      y: { grid: { color: '#21262d' }, ticks: { color: '#8b949e', stepSize: 1 } },
    },
  }

  const lineOpts = {
    ...chartOpts,
    plugins: {
      legend: { display: true, labels: { color: '#8b949e', boxWidth: 12 } },
    },
  }

  const donutOpts = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: true, position: 'bottom', labels: { color: '#8b949e', boxWidth: 12, padding: 12 } },
    },
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-screen bg-[#0d1117] text-white overflow-hidden">
      <Sidebar />

      <main className="flex-1 overflow-y-auto">
        {/* Header */}
        <div className="bg-[#161b22] border-b border-[#30363d] px-6 py-4 sticky top-0 z-10">
          <h2 className="text-lg font-semibold text-white">Dashboard Gerencial</h2>
          <p className="text-[#8b949e] text-xs">
            Indicadores ejecutivos · {new Date().toLocaleDateString('es-CO', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>

        <div className="p-6 space-y-6">

          {/* HU-20: KPI Cards */}
          <div className="grid grid-cols-3 gap-4">
            {kpis.map(k => (
              <div key={k.label} className="bg-[#161b22] border border-[#30363d] rounded-xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-2xl">{k.icon}</span>
                  <span className={`text-2xl font-bold ${k.color}`}>{k.value}</span>
                </div>
                <p className="text-[#c9d1d9] text-sm font-medium">{k.label}</p>
                <p className="text-[#484f58] text-xs mt-0.5">{k.sub}</p>
              </div>
            ))}
          </div>

          {/* HU-CONSENSO: KPIs del Protocolo de Validación */}
          <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-5">
            <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
              🔬 Protocolo de Validación Espacio-Temporal
              <span className="text-xs text-[#484f58] font-normal ml-1">
                · X=3 rep · Y=5 km · Z=48 h
              </span>
            </h3>
            <div className="grid grid-cols-4 gap-4">
              <div className="bg-[#0d1117] rounded-xl p-4 border border-[#21262d]">
                <p className="text-2xl font-bold text-yellow-400">{cntSospechosos}</p>
                <p className="text-[#c9d1d9] text-sm font-medium mt-1">🟡 Sospechosos</p>
                <p className="text-[#484f58] text-xs mt-0.5">Aislados, sin confirmar</p>
              </div>
              <div className="bg-orange-500/5 rounded-xl p-4 border border-orange-500/20">
                <p className="text-2xl font-bold text-orange-400">{cntPreventivos}</p>
                <p className="text-[#c9d1d9] text-sm font-medium mt-1">🟠 Alerta Preventiva</p>
                <p className="text-[#484f58] text-xs mt-0.5">Cluster activo (Fase 2)</p>
              </div>
              <div className="bg-red-500/5 rounded-xl p-4 border border-red-500/20">
                <p className="text-2xl font-bold text-red-400">{cntConfirmados}</p>
                <p className="text-[#c9d1d9] text-sm font-medium mt-1">🔴 Confirmados</p>
                <p className="text-[#484f58] text-xs mt-0.5">Plaga validada (Fase 3)</p>
              </div>
              <div className="bg-[#0d1117] rounded-xl p-4 border border-[#21262d]">
                <p className="text-2xl font-bold text-white">{clusters.length}</p>
                <p className="text-[#c9d1d9] text-sm font-medium mt-1">📍 Focos Activos</p>
                <p className="text-[#484f58] text-xs mt-0.5">Clusters espaciales</p>
              </div>
            </div>
            {clusters.length > 0 && (
              <div className="mt-4 pt-4 border-t border-[#21262d] grid grid-cols-2 gap-2">
                {clusters.slice(0, 4).map((c, i) => {
                  const isConf = c.estado !== 'alerta_preventiva'
                  return (
                    <div key={i} className={`flex items-center justify-between text-xs px-3 py-2 rounded-lg border ${
                      isConf ? 'bg-red-500/10 border-red-500/30' : 'bg-orange-500/10 border-orange-500/20'
                    }`}>
                      <span className={isConf ? 'text-red-300' : 'text-orange-300'}>
                        {isConf ? '🔴' : '🟠'} {c.plaga}
                      </span>
                      <span className="text-[#484f58]">{c.cantidad} rep.</span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* HU-21: Gráficos fila superior */}
          <div className="grid grid-cols-3 gap-4">

            {/* Top Plagas */}
            <div className="col-span-2 bg-[#161b22] border border-[#30363d] rounded-xl p-5">
              <h3 className="text-sm font-semibold text-white mb-1">Top Plagas Detectadas</h3>
              <p className="text-[#484f58] text-xs mb-4">Frecuencia de avistamientos activos por tipo</p>
              <div style={{ height: 200 }}>
                {topPlagas.length > 0
                  ? <Bar data={chartTopPlagas} options={{ ...chartOpts, indexAxis: 'y' }} />
                  : <p className="text-[#484f58] text-xs text-center pt-16">Sin datos aún</p>
                }
              </div>
            </div>

            {/* Distribución dona */}
            <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-5">
              <h3 className="text-sm font-semibold text-white mb-1">Distribución de Riesgo</h3>
              <p className="text-[#484f58] text-xs mb-4">% por nivel en brotes activos</p>
              <div style={{ height: 200 }}>
                {activos.length > 0
                  ? <Doughnut data={chartDistribucion} options={donutOpts} />
                  : <p className="text-[#484f58] text-xs text-center pt-16">Sin datos aún</p>
                }
              </div>
            </div>

          </div>

          {/* Tendencia temporal */}
          <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-5">
            <h3 className="text-sm font-semibold text-white mb-1">Tendencia de Brotes — Últimos 14 días</h3>
            <p className="text-[#484f58] text-xs mb-4">Reportes diarios por nivel de riesgo</p>
            <div style={{ height: 180 }}>
              <Line data={chartTendencia} options={lineOpts} />
            </div>
          </div>

          {/* HU-22: Tabla resumen últimos reportes de alto riesgo */}
          <div className="bg-[#161b22] border border-[#30363d] rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-[#30363d] flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-white">Últimos Reportes Críticos</h3>
                <p className="text-[#484f58] text-xs mt-0.5">Avistamientos activos de alto riesgo</p>
              </div>
              <span className="bg-red-500/20 text-red-400 border border-red-500/30 text-xs px-2 py-0.5 rounded">
                {altos.length} activos
              </span>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#30363d] text-[#8b949e] text-xs">
                  <th className="text-left px-5 py-3">Plaga</th>
                  <th className="text-left px-5 py-3">Finca</th>
                  <th className="text-left px-5 py-3">Nivel</th>
                  <th className="text-left px-5 py-3">Coordenadas</th>
                  <th className="text-left px-5 py-3">Fecha</th>
                </tr>
              </thead>
              <tbody>
                {altos.slice(0, 8).map(r => (
                  <tr key={r.id} className="border-b border-[#21262d] hover:bg-[#1c2128] transition-colors">
                    <td className="px-5 py-3 text-[#c9d1d9] font-medium">{r.plaga}</td>
                    <td className="px-5 py-3 text-[#8b949e]">{r.finca}</td>
                    <td className="px-5 py-3">
                      <span className={`px-2 py-0.5 rounded text-xs capitalize ${nivelBg[r.nivel]}`}>{r.nivel}</span>
                    </td>
                    <td className="px-5 py-3 font-mono text-xs text-[#484f58]">
                      {r.lat?.toFixed(4)}, {r.lng?.toFixed(4)}
                    </td>
                    <td className="px-5 py-3 text-[#484f58] text-xs">{formatFecha(r.fecha)}</td>
                  </tr>
                ))}
                {altos.length === 0 && (
                  <tr>
                    <td colSpan={5} className="text-center text-[#484f58] py-10 text-sm">
                      Sin reportes de alto riesgo activos
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

        </div>
      </main>
    </div>
  )
}
