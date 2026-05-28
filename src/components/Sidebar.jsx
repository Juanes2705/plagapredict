import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const NAV_ADMIN = [
  { icon: '🗺️',  label: 'Mapa Predictivo',      path: '/dashboard' },
  { icon: '📋',  label: 'Todos los Reportes',   path: '/admin/reportes' },
  { icon: '📅',  label: 'Bitácora Histórica',   path: '/admin/historico' },
  { icon: '📊',  label: 'Dashboard Gerencial',  path: '/admin/gerencial' },
  { icon: '📝',  label: 'Reportar Plaga',        path: '/reportar' },
]

const NAV_TRABAJADOR = [
  { icon: '📝', label: 'Reportar Plaga', path: '/reportar' },
  { icon: '🗺️', label: 'Mapa',           path: '/dashboard' },
]

export default function Sidebar() {
  const { user, role, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const nav = role === 'admin' ? NAV_ADMIN : NAV_TRABAJADOR

  return (
    <aside className="w-60 bg-[#161b22] border-r border-[#30363d] flex flex-col shrink-0">
      <div className="px-4 py-5 border-b border-[#30363d]">
        <h1 className="text-lg font-bold text-white">
          Plaga<span className="text-[#10b981]">Predict</span>
        </h1>
        <p className="text-[#484f58] text-xs mt-0.5">Alerta Temprana GIS</p>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1">
        {nav.map((item) => (
          <button
            key={item.path + item.label}
            onClick={() => navigate(item.path)}
            className={`flex items-center gap-3 w-full px-4 py-2.5 rounded-lg text-sm transition-colors ${
              location.pathname === item.path
                ? 'bg-[#10b981]/15 text-[#10b981]'
                : 'text-[#8b949e] hover:text-white hover:bg-[#21262d]'
            }`}
          >
            <span>{item.icon}</span>
            {item.label}
          </button>
        ))}
      </nav>

      <div className="px-4 py-4 border-t border-[#30363d]">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-[#10b981] flex items-center justify-center text-sm font-bold text-white">
            {user?.email?.[0]?.toUpperCase() ?? 'U'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white truncate">{user?.email}</p>
            <p className="text-xs text-[#484f58] capitalize">{role}</p>
          </div>
          <button
            onClick={logout}
            title="Cerrar sesión"
            className="text-[#484f58] hover:text-red-400 transition-colors text-sm"
          >⏏</button>
        </div>
      </div>
    </aside>
  )
}
