import { Fragment, useState } from 'react'
import { COMPONENTES, grupoConFactor, fechaLegible } from '../necesidades/textos'
import { ESTADOS_UNIDAD, GRUPOS, COMPONENTES_STOCK, estadoVisible, textoDiasRestantes } from './textos'
import { DetalleUnidad } from './DetalleUnidad'
import { Esqueleto } from '../comunes/Esqueleto'

// Criterios: filtros por grupo, componente y estado, y el detalle de cualquier unidad.
// La lista viene de la que vence primero a la última. "Ver detalle" despliega el recorrido debajo de la fila.
// TAREA-5: en las disponibles, "Usar" (sale del stock disponible).
// TAREA-7: en las vencidas, "Descartar". Las dos piden confirmación debajo de la fila (no se pueden deshacer).
const ACCIONES = {
  usar: {
    boton: 'Usar',
    clase: 'btn-secondary',
    pregunta: '¿Usar la unidad',
    detalle: 'Sale del stock disponible y queda registrado el uso.',
    confirmar: 'Sí, usar',
    haciendo: 'Usando...',
  },
  descartar: {
    boton: 'Descartar',
    clase: 'btn-primary',
    pregunta: '¿Confirmás el descarte de',
    detalle: 'Sale del inventario y no se puede deshacer.',
    confirmar: 'Sí, descartar',
    haciendo: 'Descartando...',
  },
}

export function UnidadesStock({ unidades, filtros, onCambiarFiltro, cargando, pedir, onUsar, onDescartar, ocupado, version }) {
  const [abierta, setAbierta] = useState(null) // id de la unidad con el detalle desplegado
  const [confirmando, setConfirmando] = useState(null) // { idUnidadSangre, accion } de la que se está por usar o descartar
  const hayFiltros = filtros.grupo || filtros.componente || filtros.estado

  const confirmar = async (unidad, accion) => {
    const hecha = await (accion === 'usar' ? onUsar : onDescartar)(unidad)
    if (hecha) setConfirmando(null)
  }

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

      {cargando && <Esqueleto />}
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
                // Disponible y vigente: se puede usar. Vencida (también si venció después de la última corrida
                // automática: la API la marca al descartar): se puede descartar
                const accion = { disponible: 'usar', vencida: 'descartar' }[estadoVisible(unidad)]
                const estaConfirmando = confirmando?.idUnidadSangre === unidad.idUnidadSangre
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
                        <div className="acciones-fila">
                          <button
                            type="button"
                            className="btn btn-secondary btn-chico"
                            onClick={() => setAbierta(estaAbierta ? null : unidad.idUnidadSangre)}
                            aria-expanded={estaAbierta}
                          >
                            {estaAbierta ? 'Ocultar' : 'Ver detalle'}
                          </button>
                          {accion && !estaConfirmando && (
                            <button
                              type="button"
                              className={`btn ${ACCIONES[accion].clase} btn-chico`}
                              onClick={() => setConfirmando({ idUnidadSangre: unidad.idUnidadSangre, accion })}
                              disabled={ocupado}
                            >
                              {ACCIONES[accion].boton}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                    {estaConfirmando && (
                      <tr className="fila-detalle">
                        <td colSpan="6">
                          <div className="confirmar-accion">
                            <span>
                              {ACCIONES[confirmando.accion].pregunta} <strong className="codigo-unidad">{unidad.codigo}</strong>?{' '}
                              {ACCIONES[confirmando.accion].detalle}
                            </span>
                            <button type="button" className="btn btn-primary btn-chico" onClick={() => confirmar(unidad, confirmando.accion)} disabled={ocupado}>
                              {ocupado ? ACCIONES[confirmando.accion].haciendo : ACCIONES[confirmando.accion].confirmar}
                            </button>
                            <button type="button" className="btn btn-secondary btn-chico" onClick={() => setConfirmando(null)} disabled={ocupado}>
                              No
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}
                    {estaAbierta && (
                      <tr className="fila-detalle">
                        <td colSpan="6">
                          {/* La key con la versión vuelve a pedir el recorrido después de usar o descartar */}
                          <DetalleUnidad key={version} idUnidadSangre={unidad.idUnidadSangre} pedir={pedir} />
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
