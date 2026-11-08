import { useState } from 'react'
import { COMPONENTES, grupoConFactor, fechaLegible } from '../necesidades/textos'
import { GRUPOS, COMPONENTES_STOCK, separarGrupo, textoDiasRestantes } from '../stock/textos'
import { cantidadUnidades } from './textos'

const SIN_ELEGIR = { idInstitucion: null, ids: [] }

// Pedirle unidades a otra institución de la red.
// Se busca por grupo y componente; se eligen unidades de UNA institución (cada transferencia tiene una que presta).
// Se puede ligar a una de mis necesidades abiertas, o pedir a mano, sin necesidad (criterio).
// pedir(ruta) habla con la API; onPedir(datos) hace el pedido y devuelve true si salió bien.
export function PedirUnidades({ pedir, necesidades, onPedir, ocupado }) {
  const [idNecesidad, setIdNecesidad] = useState('')
  const [grupo, setGrupo] = useState(GRUPOS[0].valor)
  const [componente, setComponente] = useState(COMPONENTES_STOCK[0])
  const [resultados, setResultados] = useState(null) // null = todavía no buscó
  const [buscando, setBuscando] = useState(false)
  const [error, setError] = useState(null)
  const [elegidas, setElegidas] = useState(SIN_ELEGIR)

  // Elegir una necesidad completa la búsqueda con lo que pide
  const elegirNecesidad = (id) => {
    setIdNecesidad(id)
    const necesidad = necesidades.find((n) => n.idNecesidad === id)
    if (necesidad) {
      setGrupo(`${necesidad.grupoSanguineo}|${necesidad.factorRh}`)
      if (COMPONENTES_STOCK.includes(necesidad.componente)) setComponente(necesidad.componente)
    }
    setResultados(null)
    setElegidas(SIN_ELEGIR)
  }

  const buscar = async (e) => {
    e.preventDefault()
    setBuscando(true)
    setError(null)
    setElegidas(SIN_ELEGIR)
    try {
      const { grupoSanguineo, factorRh } = separarGrupo(grupo)
      const consulta = new URLSearchParams({ grupoSanguineo, factorRh, componente })
      setResultados(await pedir(`/transferencias/unidades-disponibles?${consulta}`))
    } catch (err) {
      setError(err.message)
    } finally {
      setBuscando(false)
    }
  }

  // Elegir una unidad de otra institución empieza una selección nueva
  const alternar = (idInstitucion, idUnidadSangre) => {
    setElegidas((prev) => {
      if (prev.idInstitucion !== idInstitucion) return { idInstitucion, ids: [idUnidadSangre] }
      const ids = prev.ids.includes(idUnidadSangre) ? prev.ids.filter((id) => id !== idUnidadSangre) : [...prev.ids, idUnidadSangre]
      return { idInstitucion: ids.length ? idInstitucion : null, ids }
    })
  }

  const institucionElegida = resultados?.find((i) => i.idInstitucion === elegidas.idInstitucion)

  const enviarPedido = async () => {
    const pedido = await onPedir({
      idInstitucionProveedora: elegidas.idInstitucion,
      idsUnidadSangre: elegidas.ids,
      ...(idNecesidad && { idNecesidad }),
      nombre: institucionElegida.nombre,
    })
    if (pedido) {
      setResultados(null)
      setElegidas(SIN_ELEGIR)
    }
  }

  return (
    <section className="card">
      <h3 className="card-title">Pedir unidades a otra institución</h3>
      <p className="texto-suave">
        Buscá qué hospitales de la red tienen lo que te falta y pediles las unidades. La otra institución tiene 24 horas
        para aceptar o rechazar.
      </p>

      <form onSubmit={buscar}>
        <div className="form-grid form-grid-tres">
          <div className="form-group">
            <label htmlFor="tr-necesidad">¿Para qué es?</label>
            <select id="tr-necesidad" value={idNecesidad} onChange={(e) => elegirNecesidad(e.target.value)}>
              <option value="">Sin necesidad (pedido a mano)</option>
              {necesidades.map((n) => (
                <option key={n.idNecesidad} value={n.idNecesidad}>
                  {grupoConFactor(n.grupoSanguineo, n.factorRh)} {COMPONENTES[n.componente].toLowerCase()} · faltan {n.unidadesFaltantes}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="tr-grupo">Grupo</label>
            <select id="tr-grupo" value={grupo} onChange={(e) => setGrupo(e.target.value)}>
              {GRUPOS.map((g) => (
                <option key={g.valor} value={g.valor}>{g.texto}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="tr-componente">Componente</label>
            <select id="tr-componente" value={componente} onChange={(e) => setComponente(e.target.value)}>
              {COMPONENTES_STOCK.map((valor) => (
                <option key={valor} value={valor}>{COMPONENTES[valor]}</option>
              ))}
            </select>
          </div>
        </div>
        <button type="submit" className="btn btn-secondary" disabled={buscando}>
          {buscando ? 'Buscando...' : 'Buscar en la red'}
        </button>
      </form>

      {error && <div className="alert alert-danger" style={{ marginTop: '1rem' }}>{error}</div>}

      {resultados && resultados.length === 0 && (
        <p className="texto-suave" style={{ marginTop: '1rem' }}>
          Ninguna otra institución tiene unidades {GRUPOS.find((g) => g.valor === grupo).texto} de {COMPONENTES[componente].toLowerCase()} disponibles.
        </p>
      )}

      {resultados && resultados.length > 0 && (
        <div className="red-resultados">
          {resultados.map((institucion) => (
            <div key={institucion.idInstitucion} className="red-institucion">
              <div className="red-institucion-cabecera">
                <strong>{institucion.nombre}</strong>
                <small>{institucion.direccion} · a {institucion.distanciaKm} km</small>
              </div>
              <ul className="convocatoria-lista">
                {institucion.unidades.map((u) => {
                  const elegida = elegidas.ids.includes(u.idUnidadSangre)
                  return (
                    <li key={u.idUnidadSangre} className={elegida ? 'convocatoria-elegido' : ''}>
                      <label>
                        <input type="checkbox" checked={elegida} onChange={() => alternar(institucion.idInstitucion, u.idUnidadSangre)} />
                        <span className="grupo-chip grupo-chip-chico">{grupoConFactor(u.grupoSanguineo, u.factorRh)}</span>
                        <span className="convocatoria-persona">
                          <strong className="codigo-unidad">{u.codigo}</strong>
                          <small>{COMPONENTES[u.componente]} · vence el {fechaLegible(u.fechaVencimiento)} ({textoDiasRestantes(u.diasRestantes)})</small>
                        </span>
                      </label>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}

          <div className="necesidad-acciones">
            <button type="button" className="btn btn-primary" onClick={enviarPedido} disabled={ocupado || !institucionElegida}>
              {institucionElegida
                ? `Pedir ${cantidadUnidades(elegidas.ids.length)} a ${institucionElegida.nombre}`
                : 'Elegí las unidades que querés pedir'}
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
