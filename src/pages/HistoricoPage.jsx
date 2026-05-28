// HU-18: Bitácora Histórica — tabla completa con filtros y gestión de estado
import { useState, useEffect, useMemo } from 'react'
import {
  collection, onSnapshot, query, orderBy,
  updateDoc, doc,
} from 'firebase/firestore'
import { db } from '../firebase'
import Sidebar from '../components/Sidebar'
import { useAuth } from '../context/AuthContext'

const nivelBadge = {
  alto:  'bg-red-500/20 text-red-400 border border-red-500/30',
  medio: 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30',
  bajo:  'bg-green-500/20 text-green-400 border border-green-500/30',
}

function formatFecha(fecha) {
  const d = fecha?.toDate?.() ?? (fecha instanceof Date ? fecha : null)
  if (!d) return '—'
  return d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })
}

function toDate(fecha) {
  return fecha?.toDate?.() ?? (fecha instanceof Date ? fecha : null)
}

export default function HistoricoPage() {
  const { role } = useAuth()
  const isAdmin  = role === 'admin'

  const [reportes, setReportes] = useState([])
  const [loading,  setLoading]  = useState(true)

  // Filtros
  const [desde,       setDesde]       = useState('')   // YYYY-MM-DD
  const [hasta,       setHasta]       = useState('')
  const [filtroPlaga, setFiltroPlaga] = useState('')
  const [filtroNivel, setFiltroNivel] = useState('')
  const [filtroEstado,setFiltroEstado]= useState('todos')  // 'todos' | 'activo' | 'archivado'

  // Paginación
  const [pagina, setPagina] = useState(1)
  const POR_PAGINA = 15

  // Acciones de archivado en curso
  const [archivando, setArchivando] = useState(new Set())

  useEffect(() => {
    const q = query(collection(db, 'reportes'), orderBy('fecha', 'desc'))
    const unsub = onSnapshot(q, snap => {
      setReportes(snap.docs.map(d => ({ id: d.id, ...d.data() })))
      setLoading(false)
    })
    return unsub
  }, [])

  // Lista de plagas únicas para el selector
  const plagasUnicas = useMemo(
    () => [...new Set(reportes.map(r => r.plaga).filter(Boolean))].sort(),
    [reportes]
  )

  // Aplicar filtros
  const filtrados = useMemo(() => {
    const desdeMs = desde ? new Date(desde + 'T00:00:00').getTime() : null
    const hastaMs = hasta ? new Date(hasta + 'T23:59:59').getTime() : null

    return reportes.filter(r => {
      const d = toDate(r.fecha)

      if (desdeMs && (!d || d.getTime() < desdeMs)) return false
      if (hastaMs && (!d || d.getTime() > hastaMs)) return false
      if (filtroPlaga && r.plaga !== filtroPlaga)    return false
      if (filtroNivel && r.nivel !== filtroNivel)    return false

      const estado = r.estado === 'archivado' ? 'archivado' : 'activo'
      if (filtroEstado !== 'todos' && estado !== filtroEstado) return false

      return true
    })
  }, [reportes, desde, hasta, filtroPlaga, filtroNivel, filtroEstado])

  // Paginación
  const totalPaginas = Math.max(1, Math.ceil(filtrados.length / POR_PAGINA))
  const paginaActual = Math.min(pagina, totalPaginas)
  const visible      = filtrados.slice((paginaActual - 1) * POR_PAGINA, paginaActual * POR_PAGINA)

  // Reset página al cambiar filtros
  useEffect(() => setPagina(1), [desde, hasta, filtroPlaga, filtroNivel, filtroEstado])

  const toggleArchivo = async (r) => {
    const nuevoEstado = r.estado === 'archivado' ? 'activo' : 'archivado'
    setArchivando(s => new Set(s).add(r.id))
    try {
      await updateDoc(doc(db, 'reportes', r.id), { estado: nuevoEstado })
    } catch (err) {
      console.error('Error al cambiar estado:', err)
    } finally {
      setArchivando(s => { const n = new Set(s); n.delete(r.id); return n })
    }
  }

  const limpiarFiltros = () => {
    setDesde(''); setHasta(''); setFiltroPlaga(''); setFiltroNivel(''); setFiltroEstado('todos')
  }

  const hayFiltro = desde || hasta || filtroPlaga || filtroNivel || filtroEstado !== 'todos'

  // Contadores de resumen
  const totalActivos   = reportes.filter(r => r.estado !== 'archivado').length
  const totalArchivados= reportes.filter(r => r.estado === 'archivado').length

  return (
    <div className="flex h-screen bg-[#0d1117] text-white overflow-hidden">
      <Sidebar />

      <main className="flex-1 overflow-y-auto">

        {/* Header */}
        <div className="bg-[#161b22] border-b border-[#30363d] px-6 py-4 sticky top-0 z-10">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-white">Bitácora Histórica</h2>
              <p className="text-[#8b949e] text-xs">
                Registro completo de avistamientos · {reportes.length} total
              </p>
            </div>
            <div className="flex items-center gap-3 text-xs">
              <span className="bg-[#10b981]/15 text-[#10b981] border border-[#10b981]/30 px-2.5 py-1 rounded-lg">
                {totalActivos} activos
              </span>
              <span className="bg-[#484f58]/20 text-[#8b949e] border border-[#30363d] px-2.5 py-1 rounded-lg">
                {totalArchivados} archivados
              </span>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-4">

          {/* Filtros */}
          <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-4">
            <div className="flex flex-wrap items-end gap-4">

              {/* Rango de fechas */}
              <div className="flex items-center gap-2">
                <div className="flex flex-col gap-1">
                  <label className="text-[#8b949e] text-xs">Desde</label>
                  <input
                    type="date"
                    value={desde}
                    onChange={e => setDesde(e.target.value)}
                    className="bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-1.5 text-white text-xs focus:outline-none focus:border-[#10b981] w-36"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[#8b949e] text-xs">Hasta</label>
                  <input
                    type="date"
                    value={hasta}
                    onChange={e => setHasta(e.target.value)}
                    className="bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-1.5 text-white text-xs focus:outline-none focus:border-[#10b981] w-36"
                  />
                </div>
              </div>

              {/* Filtro Plaga */}
              <div className="flex flex-col gap-1">
                <label className="text-[#8b949e] text-xs">Plaga</label>
                <select
                  value={filtroPlaga}
                  onChange={e => setFiltroPlaga(e.target.value)}
                  className="bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-1.5 text-white text-xs focus:outline-none focus:border-[#10b981] w-44"
                >
                  <option value="">Todas las plagas</option>
                  {plagasUnicas.map(p => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>

              {/* Filtro Nivel */}
              <div className="flex flex-col gap-1">
                <label className="text-[#8b949e] text-xs">Nivel</label>
                <div className="flex items-center gap-1">
                  {['', 'alto', 'medio', 'bajo'].map(n => (
                    <button
                      key={n}
                      onClick={() => setFiltroNivel(n)}
                      className={`px-2.5 py-1.5 rounded-lg text-xs capitalize border transition-colors ${
                        filtroNivel === n
                          ? n === '' ? 'bg-[#10b981]/15 text-[#10b981] border-[#10b981]/40'
                          : n === 'alto'  ? 'bg-red-500/20 text-red-400 border-red-500/40'
                          : n === 'medio' ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/40'
                          : 'bg-green-500/20 text-green-400 border-green-500/40'
                          : 'border-[#30363d] text-[#484f58] hover:border-[#484f58] hover:text-[#8b949e]'
                      }`}
                    >
                      {n === '' ? 'Todos' : n}
                    </button>
                  ))}
                </div>
              </div>

              {/* Filtro Estado */}
              <div className="flex flex-col gap-1">
                <label className="text-[#8b949e] text-xs">Estado</label>
                <div className="flex items-center gap-1">
                  {[
                    { val: 'todos',     label: 'Todos' },
                    { val: 'activo',    label: '✅ Activos' },
                    { val: 'archivado', label: '📦 Archivados' },
                  ].map(opt => (
                    <button
                      key={opt.val}
                      onClick={() => setFiltroEstado(opt.val)}
                      className={`px-2.5 py-1.5 rounded-lg text-xs border transition-colors ${
                        filtroEstado === opt.val
                          ? 'bg-[#10b981]/15 text-[#10b981] border-[#10b981]/40'
                          : 'border-[#30363d] text-[#484f58] hover:border-[#484f58] hover:text-[#8b949e]'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Limpiar filtros */}
              {hayFiltro && (
                <button
                  onClick={limpiarFiltros}
                  className="text-xs text-[#484f58] hover:text-white underline self-end pb-1.5"
                >
                  Limpiar filtros
                </button>
              )}

              {/* Contador resultado */}
              <div className="ml-auto self-end pb-1">
                <span className="text-[#8b949e] text-xs">
                  {filtrados.length} resultado{filtrados.length !== 1 ? 's' : ''}
                  {hayFiltro && <span className="text-[#10b981]"> (filtrado)</span>}
                </span>
              </div>
            </div>
          </div>

          {/* Tabla */}
          <div className="bg-[#161b22] border border-[#30363d] rounded-xl overflow-hidden">
            {loading ? (
              <div className="text-center py-16 text-[#484f58] text-sm">
                <div className="animate-pulse">Cargando bitácora…</div>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#30363d] text-[#8b949e] text-xs">
                    <th className="text-left px-4 py-3">Plaga</th>
                    <th className="text-left px-4 py-3">Finca</th>
                    <th className="text-left px-4 py-3">Nivel</th>
                    <th className="text-left px-4 py-3">Reportado por</th>
                    <th className="text-left px-4 py-3">Fecha</th>
                    <th className="text-left px-4 py-3">Estado</th>
                    {isAdmin && <th className="text-left px-4 py-3">Acción</th>}
                  </tr>
                </thead>
                <tbody>
                  {visible.length === 0 && (
                    <tr>
                      <td colSpan={isAdmin ? 7 : 6} className="text-center text-[#484f58] py-12 text-sm">
                        {hayFiltro ? 'Sin resultados para los filtros aplicados.' : 'Sin reportes registrados.'}
                      </td>
                    </tr>
                  )}
                  {visible.map(r => {
                    const archivado = r.estado === 'archivado'
                    const enCurso   = archivando.has(r.id)
                    return (
                      <tr
                        key={r.id}
                        className={`border-b border-[#21262d] hover:bg-[#1c2128] transition-colors ${archivado ? 'opacity-50' : ''}`}
                      >
                        <td className="px-4 py-3 text-[#c9d1d9] font-medium">{r.plaga}</td>
                        <td className="px-4 py-3 text-[#8b949e]">{r.finca}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded text-xs capitalize border ${nivelBadge[r.nivel] ?? 'border-[#30363d] text-[#8b949e]'}`}>
                            {r.nivel}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-[#8b949e] text-xs truncate max-w-[160px]">
                          {r.email_reportador ?? '—'}
                        </td>
                        <td className="px-4 py-3 text-[#484f58] text-xs">{formatFecha(r.fecha)}</td>
                        <td className="px-4 py-3">
                          {archivado ? (
                            <span className="text-xs px-2 py-0.5 rounded border border-[#30363d] text-[#484f58]">
                              📦 Archivado
                            </span>
                          ) : (
                            <span className="text-xs px-2 py-0.5 rounded border border-[#10b981]/30 text-[#10b981] bg-[#10b981]/10">
                              ✅ Activo
                            </span>
                          )}
                        </td>
                        {isAdmin && (
                          <td className="px-4 py-3">
                            <button
                              onClick={() => toggleArchivo(r)}
                              disabled={enCurso}
                              className={`text-xs px-2.5 py-1 rounded-lg border transition-colors disabled:opacity-50 ${
                                archivado
                                  ? 'border-[#10b981]/40 text-[#10b981] hover:bg-[#10b981]/10'
                                  : 'border-[#30363d] text-[#484f58] hover:border-red-500/40 hover:text-red-400'
                              }`}
                              title={archivado ? 'Restaurar a activo' : 'Archivar reporte'}
                            >
                              {enCurso ? '⏳' : archivado ? '↩ Restaurar' : '📦 Archivar'}
                            </button>
                          </td>
                        )}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* Paginación */}
          {totalPaginas > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-[#484f58] text-xs">
                Página {paginaActual} de {totalPaginas} · mostrando {visible.length} de {filtrados.length}
              </p>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPagina(1)}
                  disabled={paginaActual === 1}
                  className="px-2 py-1 text-xs rounded border border-[#30363d] text-[#8b949e] hover:text-white disabled:opacity-30 disabled:cursor-default"
                >
                  «
                </button>
                <button
                  onClick={() => setPagina(p => Math.max(1, p - 1))}
                  disabled={paginaActual === 1}
                  className="px-3 py-1 text-xs rounded border border-[#30363d] text-[#8b949e] hover:text-white disabled:opacity-30 disabled:cursor-default"
                >
                  ‹ Ant
                </button>
                {/* Números de página */}
                {Array.from({ length: Math.min(5, totalPaginas) }, (_, i) => {
                  const base = Math.max(1, Math.min(paginaActual - 2, totalPaginas - 4))
                  const num  = base + i
                  if (num > totalPaginas) return null
                  return (
                    <button
                      key={num}
                      onClick={() => setPagina(num)}
                      className={`w-7 py-1 text-xs rounded border transition-colors ${
                        num === paginaActual
                          ? 'border-[#10b981]/50 bg-[#10b981]/15 text-[#10b981]'
                          : 'border-[#30363d] text-[#8b949e] hover:text-white'
                      }`}
                    >
                      {num}
                    </button>
                  )
                })}
                <button
                  onClick={() => setPagina(p => Math.min(totalPaginas, p + 1))}
                  disabled={paginaActual === totalPaginas}
                  className="px-3 py-1 text-xs rounded border border-[#30363d] text-[#8b949e] hover:text-white disabled:opacity-30 disabled:cursor-default"
                >
                  Sig ›
                </button>
                <button
                  onClick={() => setPagina(totalPaginas)}
                  disabled={paginaActual === totalPaginas}
                  className="px-2 py-1 text-xs rounded border border-[#30363d] text-[#8b949e] hover:text-white disabled:opacity-30 disabled:cursor-default"
                >
                  »
                </button>
              </div>
            </div>
          )}

        </div>
      </main>
    </div>
  )
}
