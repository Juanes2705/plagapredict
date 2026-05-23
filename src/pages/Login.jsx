// HU-02: Login con Firebase Auth
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function Login() {
  const navigate = useNavigate()
  const { login, role } = useAuth()
  const [form, setForm] = useState({ email: '', password: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (!form.email || !form.password) {
      setError('Por favor completa todos los campos.')
      return
    }
    setLoading(true)
    try {
      await login(form.email, form.password)
      // Redirige según rol (AuthContext actualiza el role tras login)
      navigate('/dashboard')
    } catch (err) {
      const msgs = {
        'auth/invalid-credential': 'Correo o contraseña incorrectos.',
        'auth/user-not-found': 'Usuario no encontrado.',
        'auth/too-many-requests': 'Demasiados intentos. Intenta más tarde.',
      }
      setError(msgs[err.code] ?? 'Error al iniciar sesión.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#0d1117] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-gradient-to-br from-[#0d1117] via-[#0f1f1a] to-[#0d1117] pointer-events-none" />

      <div className="relative w-full max-w-md">
        <div className="bg-[#161b22] border border-[#30363d] rounded-2xl p-8 shadow-2xl">

          <div className="text-center mb-8">
            <div className="flex items-center justify-center gap-2 mb-2">
              <div className="w-9 h-9 rounded-lg bg-[#10b981] flex items-center justify-center">
                <span className="text-white text-lg">🌿</span>
              </div>
              <h1 className="text-2xl font-bold text-white">
                Plaga<span className="text-[#10b981]">Predict</span>
              </h1>
            </div>
            <p className="text-[#8b949e] text-sm">Sistema de Alerta Temprana Geoespacial</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-[#c9d1d9] mb-1.5">
                Correo electrónico
              </label>
              <input
                type="email"
                placeholder="usuario@finca.com"
                value={form.email}
                onChange={e => setForm({ ...form, email: e.target.value })}
                className="w-full bg-[#0d1117] border border-[#30363d] rounded-lg px-4 py-2.5 text-white placeholder-[#484f58] focus:outline-none focus:border-[#10b981] focus:ring-1 focus:ring-[#10b981] transition-colors"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-[#c9d1d9] mb-1.5">
                Contraseña
              </label>
              <input
                type="password"
                placeholder="••••••••"
                value={form.password}
                onChange={e => setForm({ ...form, password: e.target.value })}
                className="w-full bg-[#0d1117] border border-[#30363d] rounded-lg px-4 py-2.5 text-white placeholder-[#484f58] focus:outline-none focus:border-[#10b981] focus:ring-1 focus:ring-[#10b981] transition-colors"
              />
            </div>

            {error && (
              <p className="text-red-400 text-sm bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#10b981] hover:bg-[#059669] disabled:opacity-60 text-white font-semibold py-2.5 rounded-lg transition-colors mt-2"
            >
              {loading ? 'Verificando...' : 'Iniciar Sesión'}
            </button>
          </form>

          <div className="mt-6 pt-5 border-t border-[#30363d]">
            <p className="text-[#484f58] text-xs text-center mb-3">Perfiles del sistema</p>
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-[#0d1117] rounded-lg p-2.5 text-center">
                <p className="text-[#10b981] text-xs font-semibold">Trabajador de Campo</p>
                <p className="text-[#484f58] text-xs">Reporte GPS</p>
              </div>
              <div className="bg-[#0d1117] rounded-lg p-2.5 text-center">
                <p className="text-[#10b981] text-xs font-semibold">Administrador</p>
                <p className="text-[#484f58] text-xs">Panel analítico</p>
              </div>
            </div>
          </div>
        </div>
        <p className="text-center text-[#484f58] text-xs mt-4">
          Valle del Cauca, Colombia · AgTech 2025
        </p>
      </div>
    </div>
  )
}
