// Textos y fechas de la agenda (TAREA-10) y las donaciones (DV-11)

// "2026-10-21" → Date al mediodía UTC (así el día no se corre por la zona horaria)
const aFecha = (fecha) => new Date(`${fecha}T12:00:00Z`)

// "2026-10-21" → { dia: 'mié', numero: '21', mes: 'oct' } para las fichas de calendario
export function partesDeFecha(fecha) {
  const f = aFecha(fecha)
  const opciones = (o) => f.toLocaleDateString('es-AR', { ...o, timeZone: 'UTC' }).replace('.', '')
  return { dia: opciones({ weekday: 'short' }), numero: String(f.getUTCDate()), mes: opciones({ month: 'short' }) }
}

// "2026-10-21" → "miércoles 21 de octubre"
export function fechaLarga(fecha) {
  return aFecha(fecha).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })
}

// Hoy en formato YYYY-MM-DD (fecha local, como los <input type="date">)
export function hoy() {
  const f = new Date()
  return `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-${String(f.getDate()).padStart(2, '0')}`
}

// Suma días a una fecha YYYY-MM-DD
export function sumarDias(fecha, dias) {
  const f = aFecha(fecha)
  f.setUTCDate(f.getUTCDate() + dias)
  return f.toISOString().slice(0, 10)
}

// Link de Google Maps a la institución ("cómo llegar")
export function enlaceMapa(institucion) {
  if (institucion?.latitud == null) return null
  return `https://www.google.com/maps/search/?api=1&query=${institucion.latitud},${institucion.longitud}`
}

export const ESTADOS_TURNO = {
  reservado: { texto: 'Esperando', clase: 'badge-info' },
  asistio: { texto: 'Vino', clase: 'badge-success' },
  ausente: { texto: 'No vino', clase: 'badge-neutro' },
  cancelado: { texto: 'Cancelado', clase: 'badge-neutro' },
}

export const RESULTADOS_DONACION = {
  realizada: { texto: 'Donó', clase: 'badge-success' },
  rechazada: { texto: 'No apto en el control', clase: 'badge-warning' },
}

// Lo que se guarda en el navegador para verlo sin conexión (criterio "se puede consultar sin conexión")
export function guardarSinConexion(clave, datos) {
  try {
    localStorage.setItem(clave, JSON.stringify({ datos, guardadoEn: new Date().toISOString() }))
  } catch {
    // Sin espacio o en modo privado: no pasa nada, solo no queda la copia
  }
}

export function leerSinConexion(clave) {
  try {
    return JSON.parse(localStorage.getItem(clave) || 'null')
  } catch {
    return null
  }
}
