import { useState } from 'react'
import { TIPOS, ESTADOS_INSTITUCION } from './textos'

// Una institución a la que pertenece el usuario logueado, con su estado y,
// si ya está aprobada, la opción de sumar a otra persona (func. 1: varios usuarios por institución).
export function TarjetaInstitucion({ institucion, onSumarUsuario, ocupado }) {
  const [sumando, setSumando] = useState(false)
  const [email, setEmail] = useState('')
  const [cargo, setCargo] = useState('')

  const estado = ESTADOS_INSTITUCION[institucion.estado]

  const handleSumar = async (e) => {
    e.preventDefault()
    const agregado = await onSumarUsuario(institucion.idInstitucion, email, cargo)
    if (agregado) {
      setSumando(false)
      setEmail('')
      setCargo('')
    }
  }

  return (
    <article className="necesidad-tarjeta">
      <div className="necesidad-cabecera">
        <div className="necesidad-datos">
          <strong>{institucion.nombre}</strong>
          <small>{TIPOS[institucion.tipo]} · {institucion.direccion} · tu cargo: {institucion.cargo}</small>
        </div>
        <span className={`badge ${estado.clase}`}>{estado.texto}</span>
      </div>

      {institucion.estado === 'rechazada' && institucion.motivoRechazo && (
        <div className="alert alert-danger" style={{ marginTop: '0.5rem' }}>
          Motivo del rechazo: {institucion.motivoRechazo}
        </div>
      )}

      {institucion.estado === 'aprobada' && (
        <div className="necesidad-acciones" style={{ marginTop: '0.75rem' }}>
          {!sumando && (
            <button type="button" className="btn btn-secondary btn-chico" onClick={() => setSumando(true)} disabled={ocupado}>
              Sumar otro usuario
            </button>
          )}

          {sumando && (
            <form onSubmit={handleSumar} style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email@ejemplo.com"
                aria-label="Email del usuario a sumar"
              />
              <input
                type="text"
                required
                value={cargo}
                onChange={(e) => setCargo(e.target.value)}
                placeholder="Cargo (ej: Personal de guardia)"
                aria-label="Cargo del usuario a sumar"
              />
              <button type="submit" className="btn btn-primary btn-chico" disabled={ocupado}>
                Sumar
              </button>
              <button type="button" className="btn btn-secondary btn-chico" onClick={() => setSumando(false)} disabled={ocupado}>
                Cancelar
              </button>
            </form>
          )}
        </div>
      )}
    </article>
  )
}
