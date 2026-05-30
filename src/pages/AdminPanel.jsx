// HU-06 + HU-18 + HU-CONSENSO: Panel Admin
import { useState, useEffect, useMemo } from 'react'
import { collection, onSnapshot, query, orderBy, addDoc, Timestamp, updateDoc, doc } from 'firebase/firestore'
import { db } from '../firebase'
import Sidebar from '../components/Sidebar'
import {
  calcularEstadosConsenso,
  detectarClusters,
  ESTADO_LABEL,
  ESTADO_COLOR,
  CONSENSUS_CONFIG,
} from '../utils/consensusValidation'

const SEED_REPORTES = [
  { plaga: 'Mosca del mediterráneo', finca: 'Finca La Esperanza',  nivel: 'alto',  lat: 3.8801, lng: -76.3000, temp_c: 27, humedad: 72, viento_kmh: 14, viento_dir: 45,  email_reportador: 'campo@plagapredict.com' },
  { plaga: 'Trips de la cebolla',    finca: 'Finca El Paraíso',    nivel: 'medio', lat: 3.9200, lng: -76.2800, temp_c: 25, humedad: 80, viento_kmh: 8,  viento_dir: 90,  email_reportador: 'campo@plagapredict.com' },
  { plaga: 'Áfidos / Pulgones',      finca: 'Finca Santa Rosa',    nivel: 'bajo',  lat: 3.8500, lng: -76.3300, temp_c: 24, humedad: 85, viento_kmh: 6,  viento_dir: 180, email_reportador: 'campo@plagapredict.com' },
  { plaga: 'Mosca del mediterráneo', finca: 'Finca Los Álamos',    nivel: 'alto',  lat: 3.9000, lng: -76.3500, temp_c: 28, humedad: 68, viento_kmh: 18, viento_dir: 30,  email_reportador: 'campo@plagapredict.com' },
  { plaga: 'Gusano cogollero',       finca: 'Hacienda San Pedro',  nivel: 'medio', lat: 3.8300, lng: -76.2500, temp_c: 26, humedad: 75, viento_kmh: 12, viento_dir: 270, email_reportador: 'campo@plagapredict.com' },
  { plaga: 'Ácaro rojo',             finca: 'Finca Bella Vista',   nivel: 'alto',  lat: 3.8650, lng: -76.3150, temp_c: 29, humedad: 65, viento_kmh: 20, viento_dir: 60,  email_reportador: 'campo@plagapredict.com' },
  { plaga: 'Chinche de encaje',      finca: 'Hacienda El Roble',   nivel: 'bajo',  lat: 3.9100, lng: -76.3400, temp_c: 23, humedad: 88, viento_kmh: 5,  viento_dir: 135, email_reportador: 'campo@plagapredict.com' },
]

const nivelBadge = {
  alto:  'bg-red-500/20 text-red-400 border border-red-500/30',
  medio: 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30',
  bajo:  'bg-green-500/20 text-green-400 border border-green-500/30',
}

export default function AdminPanel() {
  const [reportes,   setReportes]   = useState([])
  const [filtro,     setFiltro]     = useState('')
  const [seeding,    setSeeding]    = useState(false)
  const [seedDone,   setSeedDone]   = useState(false)
  const [archivando, setArchivando] = useState(new Set())

  const toggleArchivo = async (r) => {
    const nuevoEstado = r.estado === 'archivado' ? 'activo' : 'archivado'
    setArchivando(s => new Set(s).add(r.id))
    try {
      await updateDoc(doc(db, 'reportes', r.id), { estado: nuevoEstado })
    } catch (err) {
      console.error('Error al archivar:', err)
    } finally {
      setArchivando(s => { const n = new Set(s); n.delete(r.id); return n })
    }
  }

  // HU-CONSENSO: confirmación / descarte manual por agrónomo/admin
  const [validando, setValidando] = useState(new Set())

  const cambiarValidacion = async (r, nuevoEstado) => {
    setValidando(s => new Set(s).add(r.id))
    try {
      await updateDoc(doc(db, 'reportes', r.id), { estado_validacion: nuevoEstado })
    } catch (err) {
      console.error('Error al validar:', err)
    } finally {
      setValidando(s => { const n = new Set(s); n.delete(r.id); return n })
    }
  }

  // Calcular estados de consenso para mostrar en la tabla
  const estadosConsenso = useMemo(() => calcularEstadosConsenso(reportes), [reportes])
  const clusters        = useMemo(() => detectarClusters(reportes, estadosConsenso), [reportes, estadosConsenso])

  // Contadores de validación
  const countSospechosos  = reportes.filter(r => (estadosConsenso.get(r.id) ?? 'sospechoso') === 'sospechoso').length
  const countPreventivos  = reportes.filter(r => estadosConsenso.get(r.id) === 'alerta_preventiva').length
  const countConfirmados  = reportes.filter(r =>
    estadosConsenso.get(r.id) === 'confirmado' || estadosConsenso.get(r.id) === 'confirmado_algoritmico'
  ).length

  const handleSeed = async () => {
    setSeeding(true)
    try {
      const col = collection(db, 'reportes')
      // Inserta reportes en fechas distintas de los últimos 7 días
      for (let i = 0; i < SEED_REPORTES.length; i++) {
        const diasAtras = i
        const fecha = new Date()
        fecha.setDate(fecha.getDate() - diasAtras)
        await addDoc(col, {
          ...SEED_REPORTES[i],
          uid_reportador: 'seed',
          precision_m: 10,
          descripcion: '',
          fecha: Timestamp.fromDate(fecha),
        })
      }
      setSeedDone(true)
    } catch (e) {
      console.error(e)
    }
    setSeeding(false)
  }

  useEffect(() => {
    const q = query(collection(db, 'reportes'), orderBy('fecha', 'desc'))
    const unsub = onSnapshot(q, (snap) => {
      setReportes(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    })
    return unsub
  }, [])

  const filtrados = filtro ? reportes.filter(r => r.nivel === filtro) : reportes

  const counts = {
    total: reportes.length,
    alto:  reportes.filter(r => r.nivel === 'alto').length,
    medio: reportes.filter(r => r.nivel === 'medio').length,
    bajo:  reportes.filter(r => r.nivel === 'bajo').length,
  }

  return (
    <div className="flex h-screen bg-[#0d1117] text-white overflow-hidden">
      <Sidebar />

      <main className="flex-1 overflow-y-auto p-6">
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h2 className="text-xl font-bold text-white mb-1">Todos los Reportes</h2>
            <p className="text-[#8b949e] text-sm">Avistamientos registrados desde campo.</p>
          </div>
          {/* Botón de datos de prueba — solo para desarrollo */}
          {!seedDone ? (
            <button
              onClick={handleSeed}
              disabled={seeding}
              className="flex items-center gap-2 px-4 py-2 bg-[#161b22] border border-[#30363d] hover:border-[#484f58] text-[#8b949e] hover:text-white text-xs rounded-lg transition-colors disabled:opacity-50"
            >
              {seeding ? '⏳ Cargando...' : '🧪 Cargar datos de prueba'}
            </button>
          ) : (
            <span className="text-green-400 text-xs flex items-center gap-1">✓ Datos cargados</span>
          )}
        </div>

        {/* HU-CONSENSO: Panel de focos activos */}
        {clusters.length > 0 && (
          <div className="mb-6 bg-[#161b22] border border-orange-500/30 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
              🔬 Focos Detectados por Consenso Espacio-Temporal
              <span className="ml-1 text-xs bg-orange-500/20 text-orange-400 border border-orange-500/30 px-1.5 py-0.5 rounded">
                {clusters.length}
              </span>
            </h3>
            <div className="grid grid-cols-2 gap-3">
              {clusters.slice(0, 4).map((c, i) => {
                const isConfirmed = c.estado === 'confirmado' || c.estado === 'confirmado_algoritmico'
                return (
                  <div key={i} className={`rounded-lg p-3 border text-xs ${
                    isConfirmed ? 'bg-red-500/10 border-red-500/30' : 'bg-orange-500/10 border-orange-500/30'
                  }`}>
                    <p className={`font-semibold ${isConfirmed ? 'text-red-400' : 'text-orange-400'}`}>
                      {isConfirmed ? '🔴' : '🟠'} {c.plaga}
                    </p>
                    <p className="text-[#8b949e] mt-1">{c.cantidad} reportes · radio {CONSENSUS_CONFIG.radioKm} km</p>
                    <p className="text-[#484f58]">{ESTADO_LABEL[c.estado] ?? c.estado}</p>
                  </div>
                )
              })}
            </div>
            <p className="text-[#484f58] text-xs mt-3 pt-2 border-t border-[#21262d]">
              Protocolo: X={CONSENSUS_CONFIG.minReportes} rep · Y={CONSENSUS_CONFIG.radioKm} km · Z={CONSENSUS_CONFIG.ventanaHoras} h · Umbral crítico: {CONSENSUS_CONFIG.umbralCritico} rep en {CONSENSUS_CONFIG.ventanaCriticaHoras} h
            </p>
          </div>
        )}

        {/* Contadores */}
        <div className="grid grid-cols-4 gap-3 mb-6">
          {[
            { label: 'Total', value: counts.total, color: 'text-white' },
            { label: 'Alto riesgo',  value: counts.alto,  color: 'text-red-400' },
            { label: 'Medio riesgo', value: counts.medio, color: 'text-yellow-400' },
            { label: 'Bajo riesgo',  value: counts.bajo,  color: 'text-green-400' },
          ].map(c => (
            <div key={c.label} className="bg-[#161b22] border border-[#30363d] rounded-xl p-4">
              <p className={`text-2xl font-bold ${c.color}`}>{c.value}</p>
              <p className="text-[#8b949e] text-xs mt-0.5">{c.label}</p>
            </div>
          ))}
        </div>

        {/* Contadores de validación (consenso) */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-4">
            <p className="text-2xl font-bold text-yellow-400">{countSospechosos}</p>
            <p className="text-[#8b949e] text-xs mt-0.5">🟡 Sospechosos</p>
          </div>
          <div className="bg-[#161b22] border border-orange-500/30 rounded-xl p-4">
            <p className="text-2xl font-bold text-orange-400">{countPreventivos}</p>
            <p className="text-[#8b949e] text-xs mt-0.5">🟠 Alerta Preventiva</p>
          </div>
          <div className="bg-[#161b22] border border-red-500/30 rounded-xl p-4">
            <p className="text-2xl font-bold text-red-400">{countConfirmados}</p>
            <p className="text-[#8b949e] text-xs mt-0.5">🔴 Confirmados</p>
          </div>
        </div>

        {/* Filtro */}
        <div className="flex items-center gap-2 mb-4">
          <span className="text-[#8b949e] text-sm">Filtrar:</span>
          {['', 'alto', 'medio', 'bajo'].map(n => (
            <button key={n} onClick={() => setFiltro(n)}
              className={`px-3 py-1 rounded-lg text-xs font-medium capitalize transition-colors border ${
                filtro === n
                  ? 'bg-[#10b981]/20 text-[#10b981] border-[#10b981]/40'
                  : 'border-[#30363d] text-[#8b949e] hover:border-[#484f58]'
              }`}>
              {n === '' ? 'Todos' : n}
            </button>
          ))}
        </div>

        {/* Tabla */}
        <div className="bg-[#161b22] border border-[#30363d] rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#30363d] text-[#8b949e] text-xs">
                <th className="text-left px-4 py-3">Plaga</th>
                <th className="text-left px-4 py-3">Finca</th>
                <th className="text-left px-4 py-3">Nivel</th>
                <th className="text-left px-4 py-3">Coordenadas</th>
                <th className="text-left px-4 py-3">Reportado por</th>
                <th className="text-left px-4 py-3">Fecha</th>
                <th className="text-left px-4 py-3">Estado</th>
                <th className="text-left px-4 py-3">Validación</th>
                <th className="text-left px-4 py-3">Acción</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.length === 0 && (
                <tr>
                  <td colSpan={9} className="text-center text-[#484f58] py-10">
                    No hay reportes registrados.
                  </td>
                </tr>
              )}
              {filtrados.map(r => {
                const archivado = r.estado === 'archivado'
                const enCurso   = archivando.has(r.id)
                return (
                  <tr key={r.id} className={`border-b border-[#21262d] hover:bg-[#1c2128] transition-colors ${archivado ? 'opacity-50' : ''}`}>
                    <td className="px-4 py-3 text-[#c9d1d9] font-medium">{r.plaga}</td>
                    <td className="px-4 py-3 text-[#8b949e]">{r.finca}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded text-xs capitalize ${nivelBadge[r.nivel]}`}>
                        {r.nivel}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-[#8b949e]">
                      {r.lat?.toFixed(5)}, {r.lng?.toFixed(5)}
                    </td>
                    <td className="px-4 py-3 text-[#8b949e] text-xs truncate max-w-[140px]">
                      {r.email_reportador}
                    </td>
                    <td className="px-4 py-3 text-[#484f58] text-xs">
                      {r.fecha instanceof Date
                        ? r.fecha.toLocaleDateString('es-CO')
                        : r.fecha?.toDate?.()?.toLocaleDateString('es-CO') ?? '—'}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => toggleArchivo(r)}
                        disabled={enCurso}
                        title={archivado ? 'Restaurar a activo' : 'Archivar reporte'}
                        className={`text-xs px-2.5 py-1 rounded-lg border transition-colors disabled:opacity-50 ${
                          archivado
                            ? 'border-[#10b981]/40 text-[#10b981] hover:bg-[#10b981]/10'
                            : 'border-[#30363d] text-[#484f58] hover:border-red-500/40 hover:text-red-400'
                        }`}
                      >
                        {enCurso ? '⏳' : archivado ? '↩ Restaurar' : '📦 Archivar'}
                      </button>
                    </td>
                    {/* HU-CONSENSO: estado calculado */}
                    <td className="px-4 py-3">
                      {(() => {
                        const ev = estadosConsenso.get(r.id) ?? 'sospechoso'
                        const label = ESTADO_LABEL[ev] ?? ev
                        const color = ESTADO_COLOR[ev] ?? '#8b949e'
                        return (
                          <span className="text-xs font-medium" style={{ color }}>
                            {{
                              sospechoso:             '🟡',
                              alerta_preventiva:      '🟠',
                              confirmado_algoritmico: '🔴',
                              confirmado:             '🔴',
                              descartado:             '⬛',
                            }[ev] ?? '●'}{' '}{label}
                          </span>
                        )
                      })()}
                    </td>
                    {/* HU-CONSENSO: botones Confirmar / Descartar */}
                    <td className="px-4 py-3">
                      {(() => {
                        const ev      = estadosConsenso.get(r.id) ?? 'sospechoso'
                        const enVal   = validando.has(r.id)
                        if (ev === 'descartado') {
                          return (
                            <button
                              onClick={() => cambiarValidacion(r, 'sospechoso')}
                              disabled={enVal}
                              className="text-xs px-2 py-1 rounded border border-[#30363d] text-[#8b949e] hover:text-white hover:border-[#484f58] disabled:opacity-50"
                            >
                              {enVal ? '⏳' : '↩ Reactivar'}
                            </button>
                          )
                        }
                        if (ev === 'confirmado') {
                          return (
                            <button
                              onClick={() => cambiarValidacion(r, 'sospechoso')}
                              disabled={enVal}
                              className="text-xs px-2 py-1 rounded border border-[#30363d] text-[#484f58] hover:text-yellow-400 hover:border-yellow-500/40 disabled:opacity-50"
                            >
                              {enVal ? '⏳' : '↩ Revertir'}
                            </button>
                          )
                        }
                        return (
                          <div className="flex gap-1">
                            <button
                              onClick={() => cambiarValidacion(r, 'confirmado')}
                              disabled={enVal}
                              title="Confirmar como plaga real"
                              className="text-xs px-2 py-1 rounded border border-green-500/40 text-green-400 hover:bg-green-500/10 disabled:opacity-50"
                            >
                              {enVal ? '⏳' : '✅ Confirmar'}
                            </button>
                            <button
                              onClick={() => cambiarValidacion(r, 'descartado')}
                              disabled={enVal}
                              title="Descartar (falso positivo)"
                              className="text-xs px-2 py-1 rounded border border-[#30363d] text-[#484f58] hover:border-red-500/40 hover:text-red-400 disabled:opacity-50"
                            >
                              ✕
                            </button>
                          </div>
                        )
                      })()}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  )
}
