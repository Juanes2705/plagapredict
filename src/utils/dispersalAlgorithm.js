// HU-13: Algoritmo Vectorial — cálculo de radio y cono de dispersión de plaga

// Radio base (km) según nivel de riesgo
const BASE_RADIUS_KM = { alto: 7, medio: 4, bajo: 2 }

// Cuántos km se suma al radio por cada km/h de viento
const WIND_FACTOR = 0.25

// Ángulo del cono (medio-ángulo). Más viento → cono más estrecho (más dirigido)
function halfAngle(viento_kmh) {
  if (viento_kmh >= 20) return 20
  if (viento_kmh >= 10) return 30
  return 45 // viento débil → dispersión casi circular
}

/**
 * Calcula los parámetros del cono de dispersión de un reporte.
 * La dirección del viento en OpenWeather es DE DÓNDE VIENE el viento (conv. meteorológica).
 * La plaga se dispersa en la dirección CONTRARIA (hacia donde va el viento).
 *
 * @param {Object} r – reporte { lat, lng, nivel, viento_kmh, viento_dir }
 * @returns {{ center, radiusM, spreadDeg, halfAngleDeg, nivel }}
 */
export function calcularCono(r) {
  const nivel      = r.nivel     ?? 'bajo'
  const vientoKmh  = r.viento_kmh ?? 0
  const vientoDeg  = r.viento_dir ?? 0

  const baseKm   = BASE_RADIUS_KM[nivel] ?? 2
  const bonusKm  = vientoKmh * WIND_FACTOR
  const radiusM  = (baseKm + bonusKm) * 1000

  // La plaga va adonde va el viento (opuesto al origen meteorológico)
  const spreadDeg = (vientoDeg + 180) % 360

  return {
    center:       [r.lat, r.lng],
    radiusM,
    spreadDeg,
    halfAngleDeg: halfAngle(vientoKmh),
    nivel,
  }
}

/**
 * Genera los vértices lat/lng del polígono del cono de dispersión.
 * Devuelve un array de [lat, lng] lista para usar en <Polygon positions={...} />.
 *
 * @param {[number,number]} center – [lat, lng]
 * @param {number} radiusM         – radio en metros
 * @param {number} spreadDeg       – dirección de dispersión (grados)
 * @param {number} halfAngleDeg    – semiancho del cono (grados)
 * @param {number} steps           – puntos del arco
 */
export function generarPuntosCono(center, radiusM, spreadDeg, halfAngleDeg, steps = 30) {
  const [lat, lng] = center
  const latRad = (lat * Math.PI) / 180

  const puntos = [[lat, lng]] // vértice en el foco

  const startDeg = spreadDeg - halfAngleDeg
  const endDeg   = spreadDeg + halfAngleDeg

  for (let i = 0; i <= steps; i++) {
    const angleDeg = startDeg + (i / steps) * (endDeg - startDeg)
    const angleRad = (angleDeg * Math.PI) / 180

    // Conversión de metros a desplazamiento lat/lng
    const dLat = (radiusM / 111_320) * Math.cos(angleRad)
    const dLng = (radiusM / (111_320 * Math.cos(latRad))) * Math.sin(angleRad)

    puntos.push([lat + dLat, lng + dLng])
  }

  puntos.push([lat, lng]) // cerrar el polígono
  return puntos
}
