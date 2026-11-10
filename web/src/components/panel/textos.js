// Textos y colores del cuadro de stock contra demanda (GET /api/panel/stock-demanda)

// Recharts dibuja en SVG y necesita el color como valor (no acepta las variables de CSS):
// son los mismos que --danger, --warning y --success de index.css
export const SEMAFORO = {
  rojo: { texto: 'Crítico', clase: 'badge-danger', color: '#d32f2f' },
  amarillo: { texto: 'Atención', clase: 'badge-warning', color: '#e8a100' },
  verde: { texto: 'Cubierto', clase: 'badge-success', color: '#2b8a3e' },
  sin_datos: { texto: 'Sin stock', clase: 'badge-neutro', color: '#b8b0ae' },
}

export const COLOR_NECESITANDO = '#7a1414'

// Lo que se muestra como "días de cobertura" de un grupo
export function textoCobertura(fila) {
  if (fila.diasCobertura !== null) return fila.diasCobertura === 1 ? '1 día' : `${fila.diasCobertura} días`
  return fila.disponible > 0 ? 'Sin consumo reciente' : 'Sin stock'
}

// Identifica un grupo en la pantalla: "O|negativo"
export const claveDe = (fila) => `${fila.grupoSanguineo}|${fila.factorRh}`
