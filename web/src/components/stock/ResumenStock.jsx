import { Esqueleto } from '../comunes/Esqueleto'
import { COMPONENTES, grupoConFactor } from '../necesidades/textos'

// Criterio: totales por grupo + factor y por componente (disponibles, por vencer, usadas, vencidas),
// con el stock mínimo de la institución y un aviso si está por debajo.
export function ResumenStock({ filas, cargando }) {
  if (cargando) return <Esqueleto filas={2} />
  if (filas.length === 0) {
    return <p className="texto-suave">Todavía no hay unidades cargadas ni mínimos definidos.</p>
  }

  return (
    <div className="tabla-scroll">
      <table className="tabla">
        <thead>
          <tr>
            <th>Grupo</th>
            <th>Componente</th>
            <th className="tabla-numero">Disponibles</th>
            <th className="tabla-numero">Por vencer</th>
            <th className="tabla-numero">Usadas</th>
            <th className="tabla-numero">Vencidas</th>
            <th className="tabla-numero">Mínimo</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((fila) => (
            <tr key={`${fila.grupoSanguineo}|${fila.factorRh}|${fila.componente}`} className={fila.bajoMinimo ? 'fila-alerta' : ''}>
              <td><span className="grupo-chip grupo-chip-chico">{grupoConFactor(fila.grupoSanguineo, fila.factorRh)}</span></td>
              <td>{COMPONENTES[fila.componente]}</td>
              <td className="tabla-numero"><strong>{fila.disponibles}</strong></td>
              <td className="tabla-numero">{fila.porVencer}</td>
              <td className="tabla-numero">{fila.usadas}</td>
              <td className="tabla-numero">{fila.vencidas}</td>
              <td className="tabla-numero">
                {fila.minimo ?? '—'}
                {fila.bajoMinimo && <span className="badge badge-urgente badge-en-tabla">Bajo el mínimo</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
