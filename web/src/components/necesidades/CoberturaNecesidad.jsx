import { useState, useEffect } from 'react'
import { grupoConFactor, fechaLegible } from './textos'
import { Esqueleto } from '../comunes/Esqueleto'

const cuantoLeQueda = (dias) => {
  if (dias === 0) return 'vence hoy'
  if (dias === 1) return 'vence mañana'
  return `vence en ${dias} días`
}

const unidades = (cantidad) => `${cantidad} ${cantidad === 1 ? 'unidad' : 'unidades'}`

// TAREA-14 en el front: antes de convocar donantes, muestra qué hospitales de la red pueden prestar unidades.
// El hospital siempre puede seguir y convocar igual: si la búsqueda falla, tampoco lo frena.
// "Pedir estas unidades" crea las transferencias (TAREA-12). onPedir(ids) devuelve true si salió bien.
export function CoberturaNecesidad({ necesidad, pedir, onPedir, onConvocar, onCancelar, ocupado }) {
  const [cobertura, setCobertura] = useState(null)
  const [error, setError] = useState(null)
  // Cambia después de pedir unidades: se vuelve a buscar y se ve lo que quedó en camino
  const [version, setVersion] = useState(0)

  useEffect(() => {
    let activo = true
    pedir(`/${necesidad.idNecesidad}/cobertura`)
      .then((datos) => { if (activo) setCobertura(datos) })
      .catch((err) => { if (activo) setError(err.message) })
    return () => {
      activo = false
    }
  }, [pedir, necesidad.idNecesidad, version])

  const cargando = !cobertura && !error
  const faltan = cobertura?.unidadesFaltantes ?? 0
  const hayOpciones = cobertura?.opciones.length > 0 && faltan > 0
  // Las unidades sugeridas: las primeras de cada hospital, hasta cubrir lo que falta
  const sugeridas = hayOpciones
    ? cobertura.opciones.flatMap((o) => o.unidades.slice(0, o.sugeridas).map((u) => u.idUnidadSangre))
    : []

  const handlePedir = async () => {
    const pedido = await onPedir(sugeridas)
    if (pedido) setVersion((v) => v + 1)
  }

  return (
    <div className="convocatoria">
      <h4 className="cobertura-titulo">Buscar en la red</h4>

      {cargando && <Esqueleto />}
      {error && <div className="alert alert-danger">{error}</div>}

      {cobertura && (
        <p className="convocatoria-cupo">
          {cobertura.enCamino > 0 && <>Ya vienen <strong>{unidades(cobertura.enCamino)}</strong> en camino. </>}
          {faltan === 0 && 'Ya no falta ninguna unidad: seguí los pedidos en la pestaña Transferencias.'}
          {faltan > 0 && !hayOpciones && 'Ningún hospital de la red puede prestar estas unidades ahora.'}
          {hayOpciones && (
            <>
              La red puede cubrir <strong>{cobertura.cubiertasEnRed}</strong> de {unidades(cobertura.unidadesFaltantes)} que faltan.
              {cobertura.faltanConvocar > 0 && <> Por {cobertura.faltanConvocar === 1 ? 'la otra' : `las otras ${cobertura.faltanConvocar}`} hay que convocar donantes.</>}
            </>
          )}
        </p>
      )}

      {hayOpciones && (
        <ul className="convocatoria-lista">
          {cobertura.opciones.map((opcion) => (
            <li key={opcion.idInstitucion} className={opcion.sugeridas > 0 ? 'convocatoria-elegido' : ''}>
              <div className="cobertura-hospital">
                <span className="convocatoria-persona">
                  <strong>{opcion.nombre}</strong>
                  <small>
                    Puede prestar {unidades(opcion.unidades.length)}
                    {opcion.sugeridas > 0 ? ` · Sugeridas: ${opcion.sugeridas}` : ' · Otra opción'}
                  </small>
                </span>
                <span className="convocatoria-km">{opcion.distanciaKm} km</span>
              </div>
              <ul className="cobertura-unidades">
                {/* Si no aporta a la sugerencia, igual se muestra la que vence antes */}
                {opcion.unidades.slice(0, Math.max(opcion.sugeridas, 1)).map((unidad) => (
                  <li key={unidad.idUnidadSangre}>
                    <span className="grupo-chip grupo-chip-chico">{grupoConFactor(unidad.grupoSanguineo, unidad.factorRh)}</span>
                    <span>{unidad.codigo}</span>
                    <small>{cuantoLeQueda(unidad.diasRestantes)} ({fechaLegible(unidad.fechaVencimiento)})</small>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}

      {!cargando && (
        <div className="necesidad-acciones">
          {hayOpciones && (
            <button type="button" className="btn btn-primary btn-chico" onClick={handlePedir} disabled={ocupado}>
              {ocupado ? 'Pidiendo...' : `Pedir ${sugeridas.length === 1 ? 'esta unidad' : `estas ${sugeridas.length} unidades`}`}
            </button>
          )}
          {faltan > 0 && (
            <button
              type="button"
              className={`btn btn-chico ${hayOpciones ? 'btn-secondary' : 'btn-primary'}`}
              onClick={onConvocar}
              disabled={ocupado}
            >
              {hayOpciones ? 'Convocar donantes igual' : 'Convocar donantes'}
            </button>
          )}
          <button type="button" className="btn btn-secondary btn-chico" onClick={onCancelar} disabled={ocupado}>
            {faltan === 0 ? 'Cerrar' : 'Cancelar'}
          </button>
        </div>
      )}

      {hayOpciones && (
        <p className="texto-suave cobertura-nota">
          Cada hospital tiene 24 horas para responder. Si no presta, esas unidades vuelven a faltar y podés convocar donantes.
        </p>
      )}
    </div>
  )
}
