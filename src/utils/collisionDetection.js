// HU-16: Motor de Colisión — detecta si un cono de riesgo intersecta con una geocerca

import { calcularCono, generarPuntosCono } from './dispersalAlgorithm'

/**
 * Algoritmo Ray-Casting: determina si un punto [lat, lng]
 * está dentro de un polígono definido por un array de [lat, lng].
 */
function puntoEnPoligono([px, py], poligono) {
  let inside = false
  for (let i = 0, j = poligono.length - 1; i < poligono.length; j = i++) {
    const [xi, yi] = poligono[i]
    const [xj, yj] = poligono[j]
    const intersecta =
      yi > py !== yj > py &&
      px < ((xj - xi) * (py - yi)) / (yj - yi) + xi
    if (intersecta) inside = !inside
  }
  return inside
}

/**
 * Comprueba si dos polígonos se intersectan:
 * 1. Algún vértice del polígono A está dentro de B
 * 2. Algún vértice de B está dentro de A
 */
function poligonosIntersectan(polyA, polyB) {
  for (const punto of polyA) {
    if (puntoEnPoligono(punto, polyB)) return true
  }
  for (const punto of polyB) {
    if (puntoEnPoligono(punto, polyA)) return true
  }
  return false
}

/**
 * Dado un listado de reportes (con datos de viento) y geocercas guardadas,
 * retorna un array de colisiones detectadas.
 *
 * @param {Array} reportes  – reportes de Firestore con { lat, lng, viento_kmh, viento_dir, nivel, plaga, finca, id }
 * @param {Array} geocercas – geocercas de Firestore con { id, nombre, coords: [[lat,lng]] }
 * @returns {Array} colisiones – [{ reporteId, plagaInfo, geocercaId, geocercaNombre }]
 */
export function detectarColisiones(reportes, geocercas) {
  if (!reportes.length || !geocercas.length) return []

  const colisiones = []

  for (const r of reportes) {
    if (!r.lat || !r.lng) continue

    const { center, radiusM, spreadDeg, halfAngleDeg } = calcularCono(r)
    const puntosСono = generarPuntosCono(center, radiusM, spreadDeg, halfAngleDeg)

    for (const geo of geocercas) {
      if (!geo.coords?.length) continue

      if (poligonosIntersectan(puntosСono, geo.coords)) {
        colisiones.push({
          reporteId:      r.id,
          plaga:          r.plaga,
          finca:          r.finca,
          nivel:          r.nivel,
          geocercaId:     geo.id,
          geocercaNombre: geo.nombre,
        })
      }
    }
  }

  return colisiones
}
