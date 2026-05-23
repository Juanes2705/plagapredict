// HU-04 + HU-05 + HU-08: Formulario de reporte con GPS + clima + Firestore
import { useState, useEffect } from 'react'
import { collection, addDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../context/AuthContext'
import { useGeolocation } from '../hooks/useGeolocation'
import { fetchWeather, windDirLabel } from '../services/weatherService'
import Sidebar from '../components/Sidebar'

const PLAGAS = [
  'Mosca del mediterráneo',
  'Trips de la cebolla',
  'Áfidos / Pulgones',
  'Gusano cogollero',
  'Chinche de encaje',
  'Ácaro rojo',
  'Otra',
]

const NIVELES = ['bajo', 'medio', 'alto']

const nivelStyle = {
  bajo:  'border-green-500/50 bg-green-500/10 text-green-400',
  medio: 'border-yellow-500/50 bg-yellow-500/10 text-yellow-400',
  alto:  'border-red-500/50 bg-red-500/10 text-red-400',
}

export default function ReportForm() {
  const { user } = useAuth()
  const { coords, status: gpsStatus, error: gpsError, capture } = useGeolocation()

  const [form, setForm]               = useState({ finca: '', plaga: '', nivel: 'medio', descripcion: '' })
  const [submitStatus, setSubmitStatus] = useState('idle')
  const [clima, setClima]             = useState(null)
  const [loadingClima, setLoadingClima] = useState(false)

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }))

  // HU-08: al capturar GPS, obtener datos climáticos del punto
  useEffect(() => {
    if (!coords) return
    setLoadingClima(true)
    fetchWeather(coords.lat, coords.lng).then(data => {
      setClima(data)
      setLoadingClima(false)
    })
  }, [coords])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!coords) { alert('Captura tu ubicación GPS primero.'); return }
    if (!form.finca || !form.plaga) { alert('Completa todos los campos obligatorios.'); return }

    setSubmitStatus('loading')
    try {
      await addDoc(collection(db, 'reportes'), {
        plaga:            form.plaga,
        finca:            form.finca,
        nivel:            form.nivel,
        descripcion:      form.descripcion,
        lat:              coords.lat,
        lng:              coords.lng,
        precision_m:      coords.accuracy,
        uid_reportador:   user.uid,
        email_reportador: user.email,
        // HU-08: variables climáticas al momento del reporte
        temp_c:      clima?.temp_c     ?? null,
        humedad:     clima?.humedad    ?? null,
        viento_kmh:  clima?.viento_kmh ?? null,
        viento_dir:  clima?.viento_dir ?? null,
        fecha:       serverTimestamp(),
      })
      setSubmitStatus('success')
      setForm({ finca: '', plaga: '', nivel: 'medio', descripcion: '' })
      setClima(null)
    } catch (err) {
      console.error('Error al guardar reporte:', err)
      setSubmitStatus('error')
    }
  }

  return (
    <div className="flex h-screen bg-[#0d1117] text-white overflow-hidden">
      <Sidebar />

      <main className="flex-1 overflow-y-auto p-6">
        <div className="max-w-xl mx-auto">
          <h2 className="text-xl font-bold text-white mb-1">Reportar Avistamiento</h2>
          <p className="text-[#8b949e] text-sm mb-6">Registra la plaga detectada con su ubicación y datos climáticos.</p>

          {/* GPS — HU-03 */}
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

                {/* HU-08: mostrar datos climáticos capturados */}
                {loadingClima && (
                  <p className="text-[#8b949e] text-xs mt-2">🌤️ Obteniendo clima del punto...</p>
                )}
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

          {/* Formulario — HU-04 */}
          <form onSubmit={handleSubmit} className="bg-[#161b22] border border-[#30363d] rounded-xl p-4 space-y-4">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <span>🐛</span> Datos del Avistamiento
            </h3>

            <div>
              <label className="block text-xs font-medium text-[#c9d1d9] mb-1.5">Nombre de la finca *</label>
              <input type="text" placeholder="Ej: Hacienda La Esperanza"
                value={form.finca} onChange={e => set('finca', e.target.value)} required
                className="w-full bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-2 text-white text-sm placeholder-[#484f58] focus:outline-none focus:border-[#10b981] transition-colors" />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#c9d1d9] mb-1.5">Tipo de plaga *</label>
              <select value={form.plaga} onChange={e => set('plaga', e.target.value)} required
                className="w-full bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#10b981] transition-colors">
                <option value="">Selecciona una plaga...</option>
                {PLAGAS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>

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

            <div>
              <label className="block text-xs font-medium text-[#c9d1d9] mb-1.5">Descripción (opcional)</label>
              <textarea rows={3} placeholder="Describe lo que observaste..."
                value={form.descripcion} onChange={e => set('descripcion', e.target.value)}
                className="w-full bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-2 text-white text-sm placeholder-[#484f58] focus:outline-none focus:border-[#10b981] transition-colors resize-none" />
            </div>

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

            <button type="submit" disabled={submitStatus === 'loading' || !coords}
              className="w-full bg-[#10b981] hover:bg-[#059669] disabled:opacity-50 text-white font-semibold py-2.5 rounded-lg transition-colors">
              {submitStatus === 'loading' ? 'Enviando...' : 'Enviar Reporte'}
            </button>

            {!coords && (
              <p className="text-[#484f58] text-xs text-center">
                Captura tu ubicación GPS para habilitar el envío.
              </p>
            )}
          </form>
        </div>
      </main>
    </div>
  )
}
