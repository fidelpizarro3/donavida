import { COMPONENTES, grupoConFactor, fechaLegible } from '../necesidades/textos'
import { textoDiasRestantes } from './textos'

// Criterio: aviso anticipado de las unidades próximas a vencer, para usarlas primero.
// Recibe las disponibles por vencer, de la que vence primero a la última. Si no hay ninguna, no muestra nada.
export function AvisoPorVencer({ unidades }) {
  if (unidades.length === 0) return null

  return (
    <div className="alert alert-warning aviso-vencer">
      <strong>
        {unidades.length === 1 ? '1 unidad vence pronto' : `${unidades.length} unidades vencen pronto`}: usalas primero.
      </strong>
      <ul>
        {unidades.map((unidad) => (
          <li key={unidad.idUnidadSangre}>
            <span className="codigo-unidad">{unidad.codigo}</span>
            {' · '}{grupoConFactor(unidad.grupoSanguineo, unidad.factorRh)} {COMPONENTES[unidad.componente].toLowerCase()}
            {' · '}vence el {fechaLegible(unidad.fechaVencimiento)} ({textoDiasRestantes(unidad.diasRestantes)})
          </li>
        ))}
      </ul>
    </div>
  )
}
