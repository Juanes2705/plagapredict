/**
 * HU-CONSENSO: Protocolo de Validación Espacio-Temporal por Consenso
 *
 * Un avistamiento NO es una plaga confirmada por sí solo.
 * El sistema evalúa tres variables:
 *   X (minReportes)         — cantidad mínima de reportes vecinos
 *   Y (radioKm)             — radio espacial de agrupación
 *   Z (ventanaHoras)        — ventana temporal de los reportes
 *
 * Estados posibles:
 *   'sospechoso'             🟡 Reporte aislado, sin vecinos suficientes
 *   'alerta_preventiva'      🟠 Cluster alcanzó umbral normal (Fase 2)
 *   'confirmado_algoritmico' 🔴 Cluster superó umbral crítico (Fase 3 automática)
 *   'confirmado'             🔴 Confirmado manualmente por Admin/Agrónomo
 *   'descartado'             ⬛ Descartado por Admin (falso positivo)
 */

/** Parámetros configurables del protocolo */
export const CONSENSUS_CONFIG = {
  radioKm:              5,   // Y — radio espacial para agrupar reportes
  minReportes:          3,   // X — mínimo de reportes para Fase 2 (alerta preventiva)
  ventanaHoras:        48,   // Z — ventana temporal para Fase 2
  umbralCritico:       15,   // reportes para Fase 3 algorítmica
  ventanaCriticaHoras: 24,   // ventana temporal para Fase 3
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
 * El estado guardado en Firestore (confirmado / descartado por admin) tiene
 * prioridad absoluta sobre el estado calculado algorítmicamente.
 *
 * @param {Array}  reportes — array de reportes desde Firestore
 * @param {Object} config   — parámetros CONSENSUS_CONFIG (opcional)
 * @returns {Map<string, string>} reporteId → estado de consenso
 */
export function calcularEstadosConsenso(reportes, config = CONSENSUS_CONFIG) {
  const estados        = new Map()
  const ahora          = Date.now()
  const ventanaMs      = config.ventanaHoras        * 3_600_000
  const ventanaCriticaMs = config.ventanaCriticaHoras * 3_600_000

  for (const r of reportes) {
    // Estado persistido por admin/agrónomo tiene prioridad absoluta
    if (r.estado_validacion === 'confirmado' || r.estado_validacion === 'descartado') {
      estados.set(r.id, r.estado_validacion)
      continue
    }

    // Sin coordenadas → sospechoso (no se puede agrupar espacialmente)
    if (!r.lat || !r.lng) {
      estados.set(r.id, 'sospechoso')
      continue
    }

    let vecinosNormal  = 0
    let vecinosCritico = 0

    for (const otro of reportes) {
      if (otro.id === r.id)                          continue
      if (otro.estado_validacion === 'descartado')   continue
      if (!otro.lat || !otro.lng)                    continue

      // Agrupamos solo reportes de la misma especie de plaga
      if (r.plaga && otro.plaga && r.plaga !== otro.plaga) continue

      // Filtro espacial: Y km de radio
      if (haversineKm(r.lat, r.lng, otro.lat, otro.lng) > config.radioKm) continue

      // Filtro temporal
      const edadMs = ahora - (toMs(otro.fecha) ?? 0)
      if (edadMs <= ventanaMs)        vecinosNormal++
      if (edadMs <= ventanaCriticaMs) vecinosCritico++
    }

    // Determinar fase
    if (vecinosCritico >= config.umbralCritico - 1) {
      estados.set(r.id, 'confirmado_algoritmico')
    } else if (vecinosNormal >= config.minReportes - 1) {
      estados.set(r.id, 'alerta_preventiva')
    } else {
      estados.set(r.id, 'sospechoso')
    }
  }

  return estados
}

/**
 * Detecta clusters únicos (grupos espaciales con suficientes reportes).
 * Útil para mostrar un resumen de focos activos en el panel lateral.
 *
 * @param {Array}  reportes       — reportes activos
 * @param {Map}    estadosConsenso — resultado de calcularEstadosConsenso
 * @param {Object} config
 * @returns {Array} clusters ordenados por cantidad desc
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

    // Vecinos dentro del radio
    const vecinos = elegibles.filter(otro => {
      if (otro.id === r.id) return false
      if (r.plaga && otro.plaga && r.plaga !== otro.plaga) return false
      return haversineKm(r.lat, r.lng, otro.lat, otro.lng) <= config.radioKm
    })

    const miembros = [r, ...vecinos]
    miembros.forEach(m => visitados.add(m.id))

    // Centroide del cluster
    const centroide = [
      miembros.reduce((s, m) => s + m.lat, 0) / miembros.length,
      miembros.reduce((s, m) => s + m.lng, 0) / miembros.length,
    ]

    // Estado más severo del cluster
    const est = miembros.map(m => estadosConsenso.get(m.id))
    const estado =
      est.includes('confirmado')             ? 'confirmado'             :
      est.includes('confirmado_algoritmico') ? 'confirmado_algoritmico' :
      'alerta_preventiva'

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

/** Etiqueta legible por estado de consenso */
export const ESTADO_LABEL = {
  sospechoso:              'Sospechoso',
  alerta_preventiva:       'Alerta Preventiva',
  confirmado_algoritmico:  'Confirmado (Sistema)',
  confirmado:              'Confirmado',
  descartado:              'Descartado',
}

/** Color de texto por estado de consenso */
export const ESTADO_COLOR = {
  sospechoso:              '#eab308',  // yellow-500
  alerta_preventiva:       '#f97316',  // orange-500
  confirmado_algoritmico:  '#ef4444',  // red-500
  confirmado:              '#ef4444',  // red-500
  descartado:              '#6b7280',  // gray-500
}
