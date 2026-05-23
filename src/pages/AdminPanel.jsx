// HU-06: Panel Admin — Tabla de reportes en tiempo real desde Firestore
import { useState, useEffect } from 'react'
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore'
import { db } from '../firebase'
import Sidebar from '../components/Sidebar'

const nivelBadge = {
  alto:  'bg-red-500/20 text-red-400 border border-red-500/30',
  medio: 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30',
  bajo:  'bg-green-500/20 text-green-400 border border-green-500/30',
}

export default function AdminPanel() {
  const [reportes, setReportes] = useState([])
  const [filtro, setFiltro]     = useState('')

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
        <div className="mb-6">
          <h2 className="text-xl font-bold text-white mb-1">Todos los Reportes</h2>
          <p className="text-[#8b949e] text-sm">Avistamientos registrados desde campo.</p>
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
              </tr>
            </thead>
            <tbody>
              {filtrados.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center text-[#484f58] py-10">
                    No hay reportes registrados.
                  </td>
                </tr>
              )}
              {filtrados.map(r => (
                <tr key={r.id} className="border-b border-[#21262d] hover:bg-[#1c2128] transition-colors">
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  )
}
