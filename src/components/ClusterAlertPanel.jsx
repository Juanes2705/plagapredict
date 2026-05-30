// HU-CONSENSO: Panel de alertas de clusters espacio-temporales detectados

const ESTADO_META = {
  alerta_preventiva:       { icon: '🟠', label: 'Alerta Preventiva', bg: 'bg-orange-500',   ring: 'border-orange-500/40',    text: 'text-orange-300', body: 'bg-orange-950/40' },
  confirmado_algoritmico:  { icon: '🔴', label: 'Confirmado (Sistema)',bg: 'bg-red-600',     ring: 'border-red-500/40',       text: 'text-red-300',    body: 'bg-red-950/40' },
  confirmado:              { icon: '🔴', label: 'Plaga Confirmada',   bg: 'bg-red-700',      ring: 'border-red-500/40',       text: 'text-red-200',    body: 'bg-red-950/50' },
}

/**
 * Panel flotante que muestra los clusters de plagas detectados por el
 * Protocolo de Validación Espacio-Temporal.
 *
 * @param {{ clusters: Array, onClose: () => void }} props
 */
export default function ClusterAlertPanel({ clusters, onClose }) {
  if (!clusters.length) return null

  // Separar por estado (más severo primero)
  const confirmados   = clusters.filter(c => c.estado === 'confirmado' || c.estado === 'confirmado_algoritmico')
  const preventivos   = clusters.filter(c => c.estado === 'alerta_preventiva')

  const topEstado = confirmados.length > 0
    ? (clusters.some(c => c.estado === 'confirmado') ? 'confirmado' : 'confirmado_algoritmico')
    : 'alerta_preventiva'

  const meta = ESTADO_META[topEstado]

  return (
    <div className="absolute bottom-4 left-4 z-[1000] w-80 pointer-events-auto">

      {/* Cabecera */}
      <div className={`${meta.bg} text-white rounded-t-xl px-4 py-3 flex items-center justify-between`}>
        <div className="flex items-center gap-2">
          <span className="text-xl animate-pulse">{meta.icon}</span>
          <div>
            <p className="font-bold text-sm leading-none uppercase tracking-wide">
              {meta.label}
            </p>
            <p className="text-xs opacity-80 mt-0.5">
              {clusters.length} foco{clusters.length > 1 ? 's' : ''} detectado{clusters.length > 1 ? 's' : ''}
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="text-white/60 hover:text-white text-lg leading-none ml-2"
          title="Cerrar"
        >
          ×
        </button>
      </div>

      {/* Lista de clusters */}
      <div className={`${meta.body} border ${meta.ring} rounded-b-xl divide-y divide-white/10 max-h-64 overflow-y-auto`}>
        {[...confirmados, ...preventivos].map((c, i) => {
          const m = ESTADO_META[c.estado] ?? ESTADO_META['alerta_preventiva']
          return (
            <div key={i} className="px-4 py-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className={`${m.text} text-xs font-semibold truncate`}>
                    {m.icon} {c.plaga}
                  </p>
                  <p className="text-white/60 text-xs mt-0.5">
                    {c.cantidad} reporte{c.cantidad > 1 ? 's' : ''} en el área
                  </p>
                  <p className="text-white/40 text-xs">
                    {c.centroide[0].toFixed(4)}, {c.centroide[1].toFixed(4)}
                  </p>
                </div>
                <span className={`text-xs font-bold px-2 py-0.5 rounded shrink-0 mt-0.5 ${m.text} border ${m.ring} bg-black/20`}>
                  {c.cantidad}
                </span>
              </div>
            </div>
          )
        })}
      </div>

      {/* Pie informativo */}
      <div className={`border ${meta.ring} border-t-0 rounded-b-xl px-4 py-2 ${meta.body}`}>
        <p className={`${meta.text} opacity-70 text-xs text-center`}>
          Consenso espacio-temporal · radio 5 km · 48 h
        </p>
      </div>
    </div>
  )
}
