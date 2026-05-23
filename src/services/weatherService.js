// HU-07: Integración OpenWeather API
const API_KEY = import.meta.env.VITE_OPENWEATHER_API_KEY

const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO']
export function windDirLabel(deg) {
  if (deg == null) return ''
  return COMPASS[Math.round(deg / 45) % 8]
}

export async function fetchWeather(lat, lng) {
  if (!API_KEY) return null
  try {
    const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lng}&appid=${API_KEY}&units=metric&lang=es`
    const res = await fetch(url)
    if (!res.ok) return null
    const d = await res.json()
    return {
      temp_c:      Math.round(d.main.temp),
      humedad:     d.main.humidity,
      viento_kmh:  Math.round(d.wind.speed * 3.6),
      viento_dir:  d.wind.deg ?? null,
      descripcion: d.weather[0]?.description ?? '',
    }
  } catch {
    return null
  }
}
