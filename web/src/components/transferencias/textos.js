// Textos para mostrar las transferencias entre instituciones (TAREA-12)

export const ESTADOS_TRANSFERENCIA = {
  pendiente: { texto: 'Esperando respuesta', clase: 'badge-warning' },
  aceptada: { texto: 'Aceptada: en camino', clase: 'badge-info' },
  recibida: { texto: 'Recibida', clase: 'badge-success' },
  rechazada: { texto: 'Rechazada', clase: 'badge-neutro' },
  expirada: { texto: 'Expiró sin respuesta', clase: 'badge-neutro' },
  cancelada: { texto: 'Cancelada', clase: 'badge-neutro' },
}

export const DIRECCIONES = [
  { valor: '', texto: 'Todas' },
  { valor: 'recibidas', texto: 'Me piden' },
  { valor: 'enviadas', texto: 'Pedí yo' },
]

// "1 unidad" / "3 unidades"
export function cantidadUnidades(cantidad) {
  return cantidad === 1 ? '1 unidad' : `${cantidad} unidades`
}

// Cuánto le queda al plazo para responder: "quedan 23 h", "quedan 40 min" o "venció"
export function tiempoRestante(iso, ahora = Date.now()) {
  const minutos = Math.floor((new Date(iso).getTime() - ahora) / 60000)
  if (minutos <= 0) return 'venció'
  if (minutos < 60) return `quedan ${minutos} min`
  return `quedan ${Math.floor(minutos / 60)} h`
}
