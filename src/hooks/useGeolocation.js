// HU-03: Captura nativa de GPS (Latitud / Longitud)
import { useState, useCallback } from 'react'

export function useGeolocation() {
  const [coords, setCoords] = useState(null)   // { lat, lng, accuracy }
  const [status, setStatus] = useState('idle') // idle | loading | success | error
  const [error, setError] = useState(null)

  const capture = useCallback(() => {
    if (!navigator.geolocation) {
      setError('Tu navegador no soporta geolocalización.')
      setStatus('error')
      return
    }
    setStatus('loading')
    setError(null)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: Math.round(pos.coords.accuracy),
        })
        setStatus('success')
      },
      (err) => {
        setError('No se pudo obtener la ubicación. Verifica los permisos.')
        setStatus('error')
        console.error(err)
      },
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }, [])

  return { coords, status, error, capture }
}
