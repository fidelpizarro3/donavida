import { useState, useEffect } from 'react'

// Cada cuánto se vuelven a pedir los datos de la página de inicio
export const CADA_CUANTO_MS = 15000

// Pide una ruta pública de la API al entrar y después cada 15 segundos ("en vivo").
// Así, si un hospital registra una donación, la home se actualiza sola sin recargar.
// Devuelve { datos, error, actualizadoEn }. Si un pedido falla, se siguen mostrando los últimos datos.
export function useEnVivo(url) {
  const [estado, setEstado] = useState({ datos: null, error: null, actualizadoEn: null })

  useEffect(() => {
    let activo = true
    const pedir = () =>
      fetch(url)
        .then((res) => (res.ok ? res.json() : Promise.reject(new Error('No se pudieron cargar los datos'))))
        .then((datos) => { if (activo) setEstado({ datos, error: null, actualizadoEn: new Date() }) })
        .catch((err) => { if (activo) setEstado((prev) => ({ ...prev, error: err.message })) })

    pedir()
    const intervalo = setInterval(pedir, CADA_CUANTO_MS)
    return () => {
      activo = false
      clearInterval(intervalo)
    }
  }, [url])

  return estado
}

// Distancia en km entre dos puntos (fórmula de Haversine, la misma que usa la convocatoria en la API)
export function distanciaKm(lat1, lon1, lat2, lon2) {
  const aRadianes = (g) => (g * Math.PI) / 180
  const dLat = aRadianes(lat2 - lat1)
  const dLon = aRadianes(lon2 - lon1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(aRadianes(lat1)) * Math.cos(aRadianes(lat2)) * Math.sin(dLon / 2) ** 2
  return 2 * 6371 * Math.asin(Math.sqrt(a))
}

// 4.237 → "4,2"
export const kmLegible = (km) => km.toLocaleString('es-AR', { maximumFractionDigits: 1 })
