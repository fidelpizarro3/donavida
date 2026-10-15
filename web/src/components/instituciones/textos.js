// Textos para mostrar los valores que devuelve la API (GET /api/instituciones/mis-instituciones)
export const TIPOS = {
  hospital: 'Hospital',
  banco_de_sangre: 'Banco de sangre',
}

export const ESTADOS_INSTITUCION = {
  pendiente: { texto: 'Pendiente de aprobación', clase: 'badge-warning' },
  aprobada: { texto: 'Aprobada', clase: 'badge-success' },
  rechazada: { texto: 'Rechazada', clase: 'badge-danger' },
  baja: { texto: 'Dada de baja', clase: 'badge-neutro' },
}
