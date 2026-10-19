import { Fragment, useState } from 'react'
import { COMPONENTES, grupoConFactor, fechaLegible } from '../necesidades/textos'
import { ESTADOS_UNIDAD, GRUPOS, COMPONENTES_STOCK, estadoVisible, textoDiasRestantes } from './textos'
import { DetalleUnidad } from './DetalleUnidad'

// Criterios: filtros por grupo, componente y estado, y el detalle de cualquier unidad.
// La lista viene de la que vence primero a la última. "Ver detalle" despliega el recorrido debajo de la fila.
export function UnidadesStock({ unidades, filtros, onCambiarFiltro, cargando, pedir }) {
  const [abierta, setAbierta] = useState(null) // id de la unidad con el detalle desplegado
  const hayFiltros = filtros.grupo || filtros.componente || filtros.estado

  return (
    <section className="card">
      <h3 className="card-title">Unidades</h3>

      <div className="filtros">
        <select value={filtros.grupo} onChange={(e) => onCambiarFiltro('grupo', e.target.value)} aria-label="Filtrar unidades por grupo">
          <option value="">Todos los grupos</option>
          {GRUPOS.map((g) => (
            <option key={g.valor} value={g.valor}>{g.texto}</option>
          ))}
        </select>
        <select value={filtros.componente} onChange={(e) => onCambiarFiltro('componente', e.target.value)} aria-label="Filtrar unidades por componente">
          <option value="">Todos los componentes</option>
          {COMPONENTES_STOCK.map((valor) => (
            <option key={valor} value={valor}>{COMPONENTES[valor]}</option>
          ))}
        </select>
        <select value={filtros.estado} onChange={(e) => onCambiarFiltro('estado', e.target.value)} aria-label="Filtrar unidades por estado">
          <option value="">Todos los estados</option>
          {Object.entries(ESTADOS_UNIDAD).map(([valor, { texto }]) => (
            <option key={valor} value={valor}>{texto}</option>
          ))}
        </select>
      </div>

      {cargando && <p className="texto-suave">Cargando...</p>}
      {!cargando && unidades.length === 0 && (
        <p className="texto-suave">{hayFiltros ? 'No hay unidades con esos filtros.' : 'Todavía no hay unidades cargadas.'}</p>
      )}

      {!cargando && unidades.length > 0 && (
        <div className="tabla-scroll">
          <table className="tabla">
            <thead>
              <tr>
                <th>Código</th>
                <th>Grupo</th>
                <th>Componente</th>
                <th>Vence</th>
                <th>Estado</th>
                <th><span className="solo-lectores">Acciones</span></th>
              </tr>
            </thead>
            <tbody>
              {unidades.map((unidad) => {
                const estado = ESTADOS_UNIDAD[estadoVisible(unidad)]
                const estaAbierta = abierta === unidad.idUnidadSangre
                return (
                  <Fragment key={unidad.idUnidadSangre}>
                    <tr>
                      <td className="codigo-unidad">{unidad.codigo}</td>
                      <td><span className="grupo-chip grupo-chip-chico">{grupoConFactor(unidad.grupoSanguineo, unidad.factorRh)}</span></td>
                      <td>{COMPONENTES[unidad.componente]}</td>
                      <td>
                        {fechaLegible(unidad.fechaVencimiento)}
                        {unidad.estado === 'disponible' && (
                          <small className="texto-chico">{textoDiasRestantes(unidad.diasRestantes)}</small>
                        )}
                      </td>
                      <td>
                        <span className={`badge ${estado.clase}`}>{estado.texto}</span>
                        {unidad.porVencer && <span className="badge badge-warning badge-en-tabla">Por vencer</span>}
                      </td>
                      <td>
                        <button
                          type="button"
                          className="btn btn-secondary btn-chico"
                          onClick={() => setAbierta(estaAbierta ? null : unidad.idUnidadSangre)}
                          aria-expanded={estaAbierta}
                        >
                          {estaAbierta ? 'Ocultar' : 'Ver detalle'}
                        </button>
                      </td>
                    </tr>
                    {estaAbierta && (
                      <tr className="fila-detalle">
                        <td colSpan="6">
                          <DetalleUnidad idUnidadSangre={unidad.idUnidadSangre} pedir={pedir} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
