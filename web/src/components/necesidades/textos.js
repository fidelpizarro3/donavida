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
