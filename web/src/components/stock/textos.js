// Textos para mostrar los valores que devuelve la API de stock (TAREA-6)
import { grupoConFactor } from '../necesidades/textos'

export const ESTADOS_UNIDAD = {
  disponible: { texto: 'Disponible', clase: 'badge-success' },
  reservada: { texto: 'Reservada', clase: 'badge-info' },
  usada: { texto: 'Usada', clase: 'badge-neutro' },
  vencida: { texto: 'Vencida', clase: 'badge-warning' },
  descartada: { texto: 'Descartada', clase: 'badge-neutro' },
}

export const TIPOS_MOVIMIENTO = {
  ingreso: 'Ingreso',
  reserva: 'Reserva',
  liberacion: 'Liberación',
  uso: 'Uso',
  transferencia: 'Transferencia',
  vencimiento: 'Vencimiento',
  descarte: 'Descarte',
}

// Las unidades solo pueden ser de estos dos componentes (TAREA-5: el issue no dice cuánto dura la sangre entera)
export const COMPONENTES_STOCK = ['globulos_rojos', 'plaquetas']

// Las 8 combinaciones de grupo y factor, como se eligen en pantalla: "O−", "O+", "A−"...
export const GRUPOS = ['O', 'A', 'B', 'AB'].flatMap((grupoSanguineo) =>
  ['negativo', 'positivo'].map((factorRh) => ({
    valor: `${grupoSanguineo}|${factorRh}`,
    texto: grupoConFactor(grupoSanguineo, factorRh),
    grupoSanguineo,
    factorRh,
  }))
)

// "O|negativo" → { grupoSanguineo: 'O', factorRh: 'negativo' }
export function separarGrupo(valor) {
  const [grupoSanguineo, factorRh] = valor.split('|')
  return { grupoSanguineo, factorRh }
}

// Hasta que exista el vencimiento automático (TAREA-7), una unidad vencida puede seguir "disponible"
// en la base. En pantalla se muestra como vencida, igual que la cuenta el resumen.
export function estadoVisible(unidad) {
  return unidad.estado === 'disponible' && unidad.diasRestantes < 0 ? 'vencida' : unidad.estado
}

// 3 → "en 3 días", 0 → "vence hoy", -2 → "venció hace 2 días"
export function textoDiasRestantes(dias) {
  if (dias === 0) return 'vence hoy'
  if (dias === 1) return 'vence mañana'
  if (dias > 1) return `en ${dias} días`
  if (dias === -1) return 'venció ayer'
  return `venció hace ${-dias} días`
}

// "2026-10-15T13:32:00.000Z" → "15/10/2026, 10:32" (en la hora de la computadora)
export function fechaHoraLegible(iso) {
  return new Date(iso).toLocaleString('es-AR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  })
}
