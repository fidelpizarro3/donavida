import { useState, useEffect, useCallback } from 'react'
import { ActivarAvisos } from './ActivarAvisos'
import { COMPONENTES, CANALES, grupoConFactor, fechaLegible } from '../necesidades/textos'

const ESTADOS_ALERTA = {
  enviada: { texto: 'Sin responder', clase: 'badge-info' },
  aceptada: { texto: 'Aceptada', clase: 'badge-success' },
  rechazada: { texto: 'Rechazada', clase: 'badge-neutro' },
}

// TAREA-11 en el front: el donante ve las alertas que le llegaron (motivo, hospital y distancia)
// y las acepta o rechaza. Al aceptar, el próximo paso es reservar un turno (TAREA-10).
// onRespondida (opcional): avisa al perfil cuando se acepta o rechaza, para que la agenda (TAREA-10) se actualice
export function MisAlertas({ token, apiUrl, onRespondida }) {
  const [alertas, setAlertas] = useState([])
  const [cargando, setCargando] = useState(true)
  const [ocupado, setOcupado] = useState(false)
  const [mensaje, setMensaje] = useState(null)
  const [error, setError] = useState(null)
  // Cada vez que cambia esto, se vuelve a pedir la lista (después de aceptar o rechazar)
  const [version, setVersion] = useState(0)

  const pedir = useCallback(async (ruta, opciones = {}) => {
    const res = await fetch(`${apiUrl}/api/alertas${ruta}`, {
      ...opciones,
      headers: { Authorization: `Bearer ${token}` },
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error?.mensaje || 'Error al comunicarse con el servidor')
    return data
  }, [apiUrl, token])

  useEffect(() => {
    let activo = true
    pedir('/mias')
      .then((datos) => { if (activo) setAlertas(datos) })
      .catch((err) => { if (activo) setError(err.message) })
      .finally(() => { if (activo) setCargando(false) })
    return () => {
      activo = false
    }
  }, [pedir, version])

  const responder = async (idAlerta, accion) => {
    setOcupado(true)
    setMensaje(null)
    setError(null)
    try {
      const datos = await pedir(`/${idAlerta}/${accion}`, { method: 'POST' })
      setMensaje(accion === 'aceptar' ? `¡Gracias! ${datos.siguientePaso}.` : 'Listo, no te vamos a esperar esta vez.')
      setVersion((v) => v + 1)
      onRespondida?.()
    } catch (err) {
      setError(err.message)
    } finally {
      setOcupado(false)
    }
  }

  const sinResponder = alertas.filter((a) => a.puedeResponder).length

  return (
    <section className="card">
      <div className="card-title">
        <h3 style={{ margin: 0 }}>Mis alertas</h3>
        {sinResponder > 0 && <span className="badge badge-urgente">{sinResponder} sin responder</span>}
      </div>

      <ActivarAvisos token={token} apiUrl={apiUrl} />

      {mensaje && <div className="alert alert-success">{mensaje}</div>}
      {error && <div className="alert alert-danger">{error}</div>}
      {cargando && <p className="texto-suave">Cargando...</p>}
      {!cargando && alertas.length === 0 && (
        <p className="texto-suave">Todavía no te llegó ninguna alerta. Cuando una institución te necesite, te avisamos.</p>
      )}

      <div className="necesidades-lista">
        {alertas.map((alerta) => {
          const estado = ESTADOS_ALERTA[alerta.estado]
          const { necesidad, institucion } = alerta
          return (
            <article key={alerta.idAlerta} className={`necesidad-tarjeta ${alerta.puedeResponder ? '' : 'necesidad-cerrada'}`}>
              <div className="necesidad-cabecera">
                <span className="grupo-chip">{grupoConFactor(necesidad.grupoSanguineo, necesidad.factorRh)}</span>
                <div className="necesidad-datos">
                  <strong>{institucion.nombre}</strong>
                  <small>{institucion.direccion} · a {alerta.distanciaKm} km</small>
                  <small>{COMPONENTES[necesidad.componente]} · hasta el {fechaLegible(necesidad.fechaLimite)}</small>
                </div>
                <div className="necesidad-etiquetas">
                  {necesidad.urgencia === 'urgente' && <span className="badge badge-urgente">Urgente</span>}
                  <span className={`badge ${estado.clase}`}>{estado.texto}</span>
                </div>
              </div>

              {/* Criterio: el donante ve por qué le llegó a él */}
              <p className="alerta-motivo">
                <strong>Por qué te llegó:</strong> {alerta.motivo}
                <small> Aviso por {CANALES[alerta.canal]}.</small>
              </p>

              {alerta.puedeResponder && (
                <div className="necesidad-acciones">
                  <button type="button" className="btn btn-primary btn-chico" onClick={() => responder(alerta.idAlerta, 'aceptar')} disabled={ocupado}>
                    Voy a donar
                  </button>
                  <button type="button" className="btn btn-secondary btn-chico" onClick={() => responder(alerta.idAlerta, 'rechazar')} disabled={ocupado}>
                    No puedo esta vez
                  </button>
                </div>
              )}
              {alerta.estado === 'enviada' && !alerta.puedeResponder && (
                <p className="texto-suave">La institución ya no necesita esta donación. ¡Gracias igual!</p>
              )}
            </article>
          )
        })}
      </div>
    </section>
  )
}
