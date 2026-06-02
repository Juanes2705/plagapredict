/**
 * HU-CONSENSO: Protocolo de Validación Espacio-Temporal por Consenso
 *
 * Un avistamiento NO es una plaga confirmada por sí solo.
 * El sistema evalúa:
 *   X (minReportes) — cantidad mínima de reportes vecinos
 *   Y (radioKm)     — radio espacial de agrupación
 *   Z (ventanaHoras)— ventana temporal
 *
 * Estados posibles:
 *   'sospechoso'        🟡 Reporte aislado (Fase 1)
 *   'alerta_preventiva' 🟠 Cluster con suficientes reportes (Fase 2)
 *   'confirmado'        🔴 Confirmado SOLO por Agrónomo/Profesional (Fase 3)
 *   'descartado'        ⬛ Descartado por Admin (falso positivo)
 *
 * IMPORTANTE: La Fase 3 (confirmado) NUNCA se asigna automáticamente.
 * Solo un profesional/admin puede confirmar una plaga mediante el panel.
 */

export const CONSENSUS_CONFIG = {
  radioKm:      5,   // Y — radio espacial para agrupar reportes
  minReportes:  3,   // X — mínimo de reportes para Fase 2
  ventanaHoras: 48,  // Z — ventana temporal para Fase 2
}

/** Distancia Haversine en km entre dos coordenadas */
function haversineKm(lat1, lng1, lat2, lng2) {
  const R  = 6371
  const dL = ((lat2 - lat1) * Math.PI) / 180
  const dl = ((lng2 - lng1) * Math.PI) / 180
  const a  =
    Math.sin(dL / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dl / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/** Convierte un timestamp Firestore o Date a milisegundos epoch */
function toMs(fecha) {
  const d = fecha?.toDate?.() ?? (fecha instanceof Date ? fecha : null)
  return d ? d.getTime() : null
}

/**
 * Calcula el estado de consenso de cada reporte.
 *
 * El estado guardado en Firestore (confirmado / descartado por admin)
 * tiene prioridad absoluta sobre el estado calculado.
 *
 * @param {Array}  reportes — array de reportes desde Firestore
 * @param {Object} config   — parámetros opcionales
 * @returns {Map<string, string>} reporteId → estado
 */
export function calcularEstadosConsenso(reportes, config = CONSENSUS_CONFIG) {
  const estados   = new Map()
  const ahora     = Date.now()
  const ventanaMs = config.ventanaHoras * 3_600_000

  for (const r of reportes) {
    // Estado persistido por admin tiene prioridad absoluta
    if (r.estado_validacion === 'confirmado' || r.estado_validacion === 'descartado') {
      estados.set(r.id, r.estado_validacion)
      continue
    }

    if (!r.lat || !r.lng) {
      estados.set(r.id, 'sospechoso')
      continue
    }

    let vecinos = 0

    for (const otro of reportes) {
      if (otro.id === r.id)                        continue
      if (otro.estado_validacion === 'descartado') continue
      if (!otro.lat || !otro.lng)                  continue
      if (r.plaga && otro.plaga && r.plaga !== otro.plaga) continue

      if (haversineKm(r.lat, r.lng, otro.lat, otro.lng) > config.radioKm) continue

      const edadMs = ahora - (toMs(otro.fecha) ?? 0)
      if (edadMs <= ventanaMs) vecinos++
    }

    if (vecinos >= config.minReportes - 1) {
      estados.set(r.id, 'alerta_preventiva')
    } else {
      estados.set(r.id, 'sospechoso')
    }
  }

  return estados
}

/**
 * Detecta clusters únicos (grupos espaciales con suficientes reportes).
 * Solo incluye reportes en alerta_preventiva o confirmado.
 */
export function detectarClusters(reportes, estadosConsenso, config = CONSENSUS_CONFIG) {
  const visitados = new Set()
  const clusters  = []

  const elegibles = reportes.filter(r =>
    r.lat && r.lng &&
    estadosConsenso.get(r.id) !== 'descartado' &&
    estadosConsenso.get(r.id) !== 'sospechoso'
  )

  for (const r of elegibles) {
    if (visitados.has(r.id)) continue

    const vecinos = elegibles.filter(otro => {
      if (otro.id === r.id) return false
      if (r.plaga && otro.plaga && r.plaga !== otro.plaga) return false
      return haversineKm(r.lat, r.lng, otro.lat, otro.lng) <= config.radioKm
    })

    const miembros = [r, ...vecinos]
    miembros.forEach(m => visitados.add(m.id))

    const centroide = [
      miembros.reduce((s, m) => s + m.lat, 0) / miembros.length,
      miembros.reduce((s, m) => s + m.lng, 0) / miembros.length,
    ]

    const estados = miembros.map(m => estadosConsenso.get(m.id))
    const estado  = estados.includes('confirmado') ? 'confirmado' : 'alerta_preventiva'

    clusters.push({
      plaga:    r.plaga ?? 'Desconocida',
      finca:    r.finca ?? '—',
      centroide,
      reportes: miembros,
      cantidad: miembros.length,
      estado,
    })
  }

  return clusters.sort((a, b) => b.cantidad - a.cantidad)
}

export const ESTADO_LABEL = {
  sospechoso:        '🟡 Sospechoso',
  alerta_preventiva: '🟠 Alerta Preventiva',
  confirmado:        '🔴 Confirmado por Profesional',
  descartado:        '⬛ Descartado',
}

export const ESTADO_COLOR = {
  sospechoso:        '#eab308',
  alerta_preventiva: '#f97316',
  confirmado:        '#ef4444',
  descartado:        '#6b7280',
}
