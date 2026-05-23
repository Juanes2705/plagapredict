// HU-17: UI de Alertas — muestra "Alerta Amarilla" cuando un cono toca una geocerca

const nivelColor = { alto: '#ef4444', medio: '#f59e0b', bajo: '#10b981' }

/**
 * Panel flotante que aparece cuando se detectan colisiones cono→geocerca.
 *
 * @param {{ colisiones: Array, onClose: Function }} props
 */
export default function AlertPanel({ colisiones, onClose }) {
  if (!colisiones.length) return null

  return (
    <div className="absolute top-4 right-4 z-[1000] w-80 pointer-events-auto">
      {/* Cabecera */}
      <div className="bg-yellow-500 text-black rounded-t-xl px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xl animate-pulse">⚠️</span>
          <div>
            <p className="font-bold text-sm leading-none">ALERTA AMARILLA</p>
            <p className="text-xs opacity-80 mt-0.5">
              {colisiones.length} zona{colisiones.length > 1 ? 's' : ''} en riesgo de contaminación
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="text-black/60 hover:text-black text-lg leading-none ml-2"
          title="Cerrar panel"
        >
          ×
        </button>
      </div>

      {/* Lista de colisiones */}
      <div className="bg-[#1c1a08] border border-yellow-500/40 rounded-b-xl divide-y divide-yellow-500/20 max-h-72 overflow-y-auto">
        {colisiones.map((c, i) => (
          <div key={i} className="px-4 py-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-yellow-300 text-xs font-semibold truncate">
                  🚨 {c.geocercaNombre}
                </p>
                <p className="text-yellow-100/80 text-xs mt-0.5 truncate">
                  Amenazada por: <span className="font-medium">{c.plaga}</span>
                </p>
                <p className="text-yellow-100/50 text-xs">
                  Foco: {c.finca}
                </p>
              </div>
              <span
                className="text-xs font-bold px-2 py-0.5 rounded capitalize shrink-0 mt-0.5"
                style={{
                  background: nivelColor[c.nivel] + '30',
                  color: nivelColor[c.nivel],
                  border: `1px solid ${nivelColor[c.nivel]}50`,
                }}
              >
                {c.nivel}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Pie */}
      <div className="bg-yellow-500/10 border border-yellow-500/30 border-t-0 rounded-b-xl px-4 py-2">
        <p className="text-yellow-400/70 text-xs text-center">
          El cono de dispersión del viento alcanza estas zonas
        </p>
      </div>
    </div>
  )
}
