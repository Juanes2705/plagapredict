// HU-06 + HU-18: Panel Admin — Tabla de reportes en tiempo real desde Firestore
import { useState, useEffect } from 'react'
import { collection, onSnapshot, query, orderBy, addDoc, Timestamp, updateDoc, doc } from 'firebase/firestore'
import { db } from '../firebase'
import Sidebar from '../components/Sidebar'

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
              </tr>
            </thead>
            <tbody>
              {filtrados.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center text-[#484f58] py-10">
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
