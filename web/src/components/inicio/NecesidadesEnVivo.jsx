import { useState, useEffect } from 'react'
import { useEnVivo, distanciaKm, kmLegible } from './enVivo'
import { COMPONENTES, grupoConFactor } from '../necesidades/textos'
import { pedirUbicacion } from '../ubicacion'

const CAMBIAR_CADA_MS = 6000

// La tarjeta de la home con las necesidades REALES de la red, en vivo.
// Si hay varias, van rotando solas (o con los puntitos de abajo).
// La distancia es la de quien mira: si comparte su ubicación, se ve "a 4,2 km".
export function NecesidadesEnVivo({ apiUrl }) {
  const { datos: necesidades, error } = useEnVivo(`${apiUrl}/api/publico/necesidades`)
  const [indice, setIndice] = useState(0)
  const [ubicacion, setUbicacion] = useState(null)
  const [pidiendo, setPidiendo] = useState(false)

  const cantidad = necesidades?.length ?? 0

  // Rota entre las necesidades
  useEffect(() => {
    if (cantidad < 2) return undefined
    const intervalo = setInterval(() => setIndice((i) => (i + 1) % cantidad), CAMBIAR_CADA_MS)
    return () => clearInterval(intervalo)
  }, [cantidad])

  const usarUbicacion = async () => {
    setPidiendo(true)
    try {
      setUbicacion(await pedirUbicacion())
    } catch {
      // Si no la comparte, se sigue mostrando la dirección del hospital
    } finally {
      setPidiendo(false)
    }
  }

  // Esqueleto mientras carga la primera vez
  if (!necesidades) {
    return (
      <div className="necesidad-demo" aria-busy="true">
        <div className="esqueleto esqueleto-titulo" />
        <div className="esqueleto" />
        <div className="esqueleto esqueleto-corto" />
        {error && <small className="texto-suave">No pudimos conectarnos con la red.</small>}
      </div>
    )
  }

  if (cantidad === 0) {
    return (
      <div className="necesidad-demo necesidad-demo-vacia">
        <span className="necesidad-demo-icono" aria-hidden="true">💚</span>
        <strong>Hoy no hay pedidos abiertos</strong>
        <small>Gracias a los donantes, todos los hospitales de la red están cubiertos.</small>
        <div className="aviso-flotante">
          <span className="punto-vivo" />
          En vivo
        </div>
      </div>
    )
  }

  const n = necesidades[indice % cantidad]
  const porcentaje = Math.round((n.unidadesCubiertas / n.unidadesSolicitadas) * 100)
  const { institucion } = n
  const km = ubicacion && institucion.latitud != null
    ? distanciaKm(ubicacion.latitud, ubicacion.longitud, institucion.latitud, institucion.longitud)
    : null

  return (
    <>
      <div className="necesidad-demo" key={n.idNecesidad}>
        <div className="necesidad-demo-cabecera">
          <span className="grupo-chip">{grupoConFactor(n.grupoSanguineo, n.factorRh)}</span>
          <div>
            <strong>{institucion.nombre}</strong>
            <small>
              {COMPONENTES[n.componente]} · {km !== null ? `a ${kmLegible(km)} km` : institucion.direccion}
            </small>
          </div>
          {n.urgencia === 'urgente' && <span className="badge badge-urgente">Urgente</span>}
        </div>
        <div className="progreso">
          <div className="progreso-barra" style={{ width: `${porcentaje}%` }} />
        </div>
        <div className="necesidad-demo-pie">
          <span><strong>{n.unidadesCubiertas}</strong> de {n.unidadesSolicitadas} unidades cubiertas</span>
          <span>Faltan <strong>{n.unidadesFaltantes}</strong></span>
        </div>

        <div className="necesidad-demo-controles">
          {cantidad > 1 && (
            <div className="puntos-carrusel" role="tablist" aria-label="Necesidades abiertas">
              {necesidades.map((x, i) => (
                <button
                  key={x.idNecesidad}
                  type="button"
                  className={i === indice % cantidad ? 'activo' : ''}
                  onClick={() => setIndice(i)}
                  aria-label={`Ver necesidad ${i + 1} de ${cantidad}`}
                />
              ))}
            </div>
          )}
          {!ubicacion && (
            <button type="button" className="btn-link" onClick={usarUbicacion} disabled={pidiendo}>
              {pidiendo ? 'Buscando...' : '📍 ¿A cuántos km estoy?'}
            </button>
          )}
        </div>
      </div>
      <div className="aviso-flotante">
        <span className="punto-vivo" />
        {n.donantesAvisados > 0
          ? `Alerta enviada a ${n.donantesAvisados} ${n.donantesAvisados === 1 ? 'donante compatible' : 'donantes compatibles'}`
          : `En vivo · ${cantidad} ${cantidad === 1 ? 'pedido abierto' : 'pedidos abiertos'} en la red`}
      </div>
    </>
  )
}
