// Textos para mostrar los valores que devuelve la API (GET /api/necesidades)
export const COMPONENTES = {
  sangre_entera: 'Sangre entera',
  globulos_rojos: 'Glóbulos rojos',
  plaquetas: 'Plaquetas',
}

export const ESTADOS = {
  abierta: { texto: 'Abierta', clase: 'badge-info' },
  cubierta: { texto: 'Cubierta', clase: 'badge-success' },
  cerrada_manual: { texto: 'Cerrada a mano', clase: 'badge-neutro' },
  vencida: { texto: 'Vencida (no cubierta)', clase: 'badge-warning' },
}

// TAREA-13: con qué se cubrió una necesidad (queda en el historial)
export const CUBIERTA_CON = {
  donantes: 'Se cubrió con donantes',
  transferencia: 'Se cubrió con transferencias de otros hospitales',
  ambas: 'Se cubrió con donantes y transferencias de otros hospitales',
}

// TAREA-13: "le avisamos a 1 persona que ya no hace falta que vaya" / "les avisamos a 3 personas que ... vayan"
export function avisamosQueNoVayan(cantidad) {
  return cantidad === 1
    ? 'le avisamos a 1 persona que ya no hace falta que vaya'
    : `les avisamos a ${cantidad} personas que ya no hace falta que vayan`
}

// Por dónde le llega el aviso al donante (TAREA-8)
export const CANALES = {
  push: 'celular',
  email: 'correo',
  whatsapp: 'WhatsApp',
}

// "O" + "negativo" → "O−"
export function grupoConFactor(grupo, factor) {
  return `${grupo}${factor === 'positivo' ? '+' : '−'}`
}

// "2026-12-20" → "20/12/2026"
export function fechaLegible(fecha) {
  const [anio, mes, dia] = fecha.split('-')
  return `${dia}/${mes}/${anio}`
}

// Días entre hoy y una fecha "YYYY-MM-DD" (negativo si ya pasó). Se cuenta en días calendario, sin horas
function diasHasta(fecha) {
  const [anio, mes, dia] = fecha.split('-').map(Number)
  const ahora = new Date()
  const hoy = Date.UTC(ahora.getFullYear(), ahora.getMonth(), ahora.getDate())
  return Math.round((Date.UTC(anio, mes - 1, dia) - hoy) / (24 * 60 * 60 * 1000))
}

// Fecha límite en lenguaje natural: se entiende más rápido "vence en 3 días" que "hasta el 15/11/2026"
export function venceEn(fechaLimite) {
  const dias = diasHasta(fechaLimite)
  if (dias < 0) return `Venció el ${fechaLegible(fechaLimite)}`
  if (dias === 0) return 'Vence hoy'
  if (dias === 1) return 'Vence mañana'
  return `Vence en ${dias} días`
}

// Cuándo se publicó: "hoy 10:42", "ayer 18:05" o "12/11 09:30". Sirve para distinguir dos necesidades iguales
export function publicadaEl(creadaEn) {
  const fecha = new Date(creadaEn)
  const hora = fecha.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
  const ahora = new Date()
  const ayer = new Date(ahora)
  ayer.setDate(ahora.getDate() - 1)
  if (fecha.toDateString() === ahora.toDateString()) return `hoy ${hora}`
  if (fecha.toDateString() === ayer.toDateString()) return `ayer ${hora}`
  return `${fecha.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })} ${hora}`
}
