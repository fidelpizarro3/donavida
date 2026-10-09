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

// "O" + "negativo" → "O−"
export function grupoConFactor(grupo, factor) {
  return `${grupo}${factor === 'positivo' ? '+' : '−'}`
}

// "2026-12-20" → "20/12/2026"
export function fechaLegible(fecha) {
  const [anio, mes, dia] = fecha.split('-')
  return `${dia}/${mes}/${anio}`
}
