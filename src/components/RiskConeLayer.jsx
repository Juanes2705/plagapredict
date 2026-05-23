// HU-14: Renderizado del cono de riesgo proyectado según dirección del viento
import { Polygon, Tooltip } from 'react-leaflet'
import { calcularCono, generarPuntosCono } from '../utils/dispersalAlgorithm'
import { windDirLabel } from '../services/weatherService'

const ESTILO_CONO = {
  alto:  { color: '#ef4444', fillColor: '#ef4444', fillOpacity: 0.18, weight: 1.5, dashArray: '5 4' },
  medio: { color: '#f59e0b', fillColor: '#f59e0b', fillOpacity: 0.14, weight: 1.5, dashArray: '5 4' },
  bajo:  { color: '#10b981', fillColor: '#10b981', fillOpacity: 0.10, weight: 1,   dashArray: '4 6' },
}

/**
 * Renderiza un cono de dispersión por cada reporte que tenga datos de viento.
 * Se monta dentro de <MapContainer>.
 *
 * @param {{ reportes: Array }} props
 */
export default function RiskConeLayer({ reportes }) {
  const conVisibles = reportes.filter(r => r.lat && r.lng && (r.viento_kmh ?? 0) >= 0)

  return conVisibles.map(r => {
    const { center, radiusM, spreadDeg, halfAngleDeg, nivel } = calcularCono(r)
    const puntos = generarPuntosCono(center, radiusM, spreadDeg, halfAngleDeg)
    const estilo = ESTILO_CONO[nivel] ?? ESTILO_CONO.bajo

    return (
      <Polygon
        key={`cono-${r.id}`}
        positions={puntos}
        pathOptions={estilo}
      >
        <Tooltip sticky direction="top">
          <div style={{ fontSize: 12, lineHeight: 1.6 }}>
            <strong>🌬 Cono de dispersión</strong><br />
            <span>{r.plaga}</span><br />
            Radio: <strong>{(radiusM / 1000).toFixed(1)} km</strong> ·
            Dirección: <strong>{windDirLabel((spreadDeg + 180) % 360)}</strong>
            {r.viento_kmh && <><br />Viento: {r.viento_kmh} km/h</>}
          </div>
        </Tooltip>
      </Polygon>
    )
  })
}
