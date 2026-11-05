import { useState } from 'react'
import { TIPOS, ESTADOS_INSTITUCION } from '../instituciones/textos'

// Una institución vista por el admin: sus datos, quién pidió el alta y las acciones según el estado.
//   - pendiente: Aprobar o Rechazar (el rechazo pide un motivo, la API lo exige)
//   - aprobada: Dar de baja (pide confirmación)
// "modo" indica qué formulario está abierto debajo de la tarjeta.
export function TarjetaAdminInstitucion({ institucion, onAprobar, onRechazar, onDarDeBaja, ocupado }) {
  const [modo, setModo] = useState(null) // null | 'rechazar' | 'baja'
  const [motivo, setMotivo] = useState('')

  const estado = ESTADOS_INSTITUCION[institucion.estado]

  const handleRechazar = async (e) => {
    e.preventDefault()
    const rechazada = await onRechazar(institucion, motivo.trim())
    if (rechazada) {
      setModo(null)
      setMotivo('')
    }
  }

  // En el filtro "Todas" la tarjeta sigue en pantalla: hay que cerrar la confirmación
  const handleBaja = async () => {
    if (await onDarDeBaja(institucion)) setModo(null)
  }

  return (
    <article className="necesidad-tarjeta">
      <div className="necesidad-cabecera">
        <div className="necesidad-datos">
          <strong>{institucion.nombre}</strong>
          <small>{TIPOS[institucion.tipo]} · {institucion.direccion}</small>
          {institucion.usuarios.map((u) => (
            <small key={u.email}>
              Pedido por {u.nombre} {u.apellido} ({u.email}){u.cargo ? ` · ${u.cargo}` : ''}
            </small>
          ))}
          {institucion.documentacionUrl ? (
            <small>
              <a href={institucion.documentacionUrl} target="_blank" rel="noreferrer">Ver documentación</a>
            </small>
          ) : (
            <small className="texto-suave">Sin documentación adjunta</small>
          )}
        </div>
        <span className={`badge ${estado.clase}`}>{estado.texto}</span>
      </div>

      {institucion.estado === 'rechazada' && institucion.motivoRechazo && (
        <div className="alert alert-danger" style={{ marginTop: '0.5rem' }}>
          Motivo del rechazo: {institucion.motivoRechazo}
        </div>
      )}

      {institucion.estado === 'pendiente' && !modo && (
        <div className="necesidad-acciones" style={{ marginTop: '0.75rem' }}>
          <button type="button" className="btn btn-primary btn-chico" onClick={() => onAprobar(institucion)} disabled={ocupado}>
            Aprobar
          </button>
          <button type="button" className="btn btn-secondary btn-chico" onClick={() => setModo('rechazar')} disabled={ocupado}>
            Rechazar
          </button>
        </div>
      )}

      {modo === 'rechazar' && (
        <form onSubmit={handleRechazar} className="necesidad-acciones" style={{ marginTop: '0.75rem', flexWrap: 'wrap' }}>
          <input
            type="text"
            required
            maxLength={500}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Motivo (ej: falta la habilitación del ministerio)"
            aria-label="Motivo del rechazo"
            style={{ flex: 1, minWidth: '14rem' }}
          />
          <button type="submit" className="btn btn-primary btn-chico" disabled={ocupado || !motivo.trim()}>
            Confirmar rechazo
          </button>
          <button type="button" className="btn btn-secondary btn-chico" onClick={() => setModo(null)} disabled={ocupado}>
            Cancelar
          </button>
        </form>
      )}

      {institucion.estado === 'aprobada' && !modo && (
        <div className="necesidad-acciones" style={{ marginTop: '0.75rem' }}>
          <button type="button" className="btn-link" onClick={() => setModo('baja')} disabled={ocupado}>
            Dar de baja
          </button>
        </div>
      )}

      {modo === 'baja' && (
        <div className="necesidad-acciones" style={{ marginTop: '0.75rem' }}>
          <span>¿Dar de baja {institucion.nombre}? Deja de poder operar en DonaVida.</span>
          <button type="button" className="btn btn-primary btn-chico" onClick={handleBaja} disabled={ocupado}>
            Sí, dar de baja
          </button>
          <button type="button" className="btn btn-secondary btn-chico" onClick={() => setModo(null)} disabled={ocupado}>
            No
          </button>
        </div>
      )}
    </article>
  )
}
