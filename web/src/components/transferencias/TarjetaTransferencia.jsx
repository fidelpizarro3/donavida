import { useState } from 'react'
import { COMPONENTES, grupoConFactor, fechaLegible } from '../necesidades/textos'
import { fechaHoraLegible } from '../stock/textos'
import { ESTADOS_TRANSFERENCIA, cantidadUnidades, tiempoRestante } from './textos'

// Una transferencia, vista desde mi institución: la pedí yo ("enviada") o me la pidieron ("recibida").
// Según el estado y quién soy, muestra lo que puedo hacer:
//   - me la pidieron y está pendiente: Aceptar (reserva las unidades) o Rechazar (con motivo, obligatorio)
//   - la pedí yo y está aceptada: Confirmar recepción (las unidades pasan a mi stock)
export function TarjetaTransferencia({ transferencia: t, onAceptar, onRechazar, onRecibir, ocupado }) {
  const [paso, setPaso] = useState(null) // null | 'aceptar' | 'rechazar' | 'recibir'
  const [motivo, setMotivo] = useState('')

  const meLaPidieron = t.direccion === 'recibida'
  const otra = meLaPidieron ? t.institucionSolicitante : t.institucionProveedora
  const estado = ESTADOS_TRANSFERENCIA[t.estado]
  const unidades = cantidadUnidades(t.unidades.length)

  // Si la acción salió bien se cierra el paso; si no, queda abierto para reintentar
  const hacer = async (accion) => {
    if (await accion()) setPaso(null)
  }

  return (
    <article className={`necesidad-tarjeta transferencia-tarjeta ${['pendiente', 'aceptada'].includes(t.estado) ? '' : 'necesidad-cerrada'}`}>
      <div className="necesidad-cabecera">
        <span className="transferencia-direccion" aria-hidden="true">{meLaPidieron ? '↗' : '↙'}</span>
        <div className="necesidad-datos">
          <strong>{meLaPidieron ? `${otra.nombre} te pide ${unidades}` : `Le pediste ${unidades} a ${otra.nombre}`}</strong>
          <small>
            Pedido el {fechaHoraLegible(t.creadaEn)}
            {t.necesidad && (
              <> · para {meLaPidieron ? 'su' : 'tu'} necesidad de {grupoConFactor(t.necesidad.grupoSanguineo, t.necesidad.factorRh)} {COMPONENTES[t.necesidad.componente].toLowerCase()}</>
            )}
            {!t.necesidad && <> · pedido a mano</>}
          </small>
        </div>
        <div className="necesidad-etiquetas">
          <span className={`badge ${estado.clase}`}>{estado.texto}</span>
        </div>
      </div>

      <ul className="transferencia-unidades">
        {t.unidades.map((u) => (
          <li key={u.idUnidadSangre}>
            <span className="grupo-chip grupo-chip-chico">{grupoConFactor(u.grupoSanguineo, u.factorRh)}</span>
            <span className="codigo-unidad">{u.codigo}</span>
            <small>{COMPONENTES[u.componente]} · vence el {fechaLegible(u.fechaVencimiento)}</small>
          </li>
        ))}
      </ul>

      {t.estado === 'pendiente' && (
        <p className="texto-chico">
          {meLaPidieron ? 'Tenés' : `${otra.nombre} tiene`} hasta el {fechaHoraLegible(t.plazoRespuesta)} para responder ({tiempoRestante(t.plazoRespuesta)}).
        </p>
      )}
      {t.estado === 'recibida' && <p className="texto-chico">Recibida el {fechaHoraLegible(t.recibidaEn)}.</p>}
      {t.estado === 'rechazada' && (
        <p className="transferencia-motivo"><strong>Motivo del rechazo:</strong> {t.motivoRechazo}</p>
      )}
      {t.estado === 'expirada' && (
        <p className="texto-chico">
          {meLaPidieron
            ? 'No respondiste a tiempo: el pedido cayó.'
            : 'No respondieron a tiempo: estas unidades vuelven a faltar. Podés convocar donantes desde Necesidades.'}
        </p>
      )}

      {/* Me la pidieron y está pendiente: aceptar o rechazar */}
      {meLaPidieron && t.estado === 'pendiente' && !paso && (
        <div className="necesidad-acciones">
          <button type="button" className="btn btn-primary btn-chico" onClick={() => setPaso('aceptar')} disabled={ocupado}>
            Aceptar
          </button>
          <button type="button" className="btn btn-secondary btn-chico" onClick={() => setPaso('rechazar')} disabled={ocupado}>
            Rechazar
          </button>
        </div>
      )}
      {paso === 'aceptar' && (
        <div className="necesidad-acciones confirmar-accion">
          <span>
            ¿Aceptar? {t.unidades.length === 1 ? 'La unidad queda reservada' : `Las ${t.unidades.length} unidades quedan reservadas`} para{' '}
            {otra.nombre} hasta que confirme que le llegaron.
          </span>
          <button type="button" className="btn btn-primary btn-chico" onClick={() => hacer(() => onAceptar(t))} disabled={ocupado}>
            {ocupado ? 'Aceptando...' : 'Sí, aceptar'}
          </button>
          <button type="button" className="btn btn-secondary btn-chico" onClick={() => setPaso(null)} disabled={ocupado}>
            No
          </button>
        </div>
      )}
      {paso === 'rechazar' && (
        <form
          className="transferencia-rechazo"
          onSubmit={(e) => {
            e.preventDefault()
            hacer(() => onRechazar(t, motivo.trim()))
          }}
        >
          <label htmlFor={`motivo-${t.idTransferencia}`}>¿Por qué lo rechazás? (obligatorio)</label>
          <textarea
            id={`motivo-${t.idTransferencia}`}
            className="campo-texto"
            rows="2"
            maxLength="500"
            required
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Por ejemplo: quedaríamos por debajo de nuestro stock mínimo"
          />
          <div className="necesidad-acciones">
            <button type="submit" className="btn btn-primary btn-chico" disabled={ocupado || !motivo.trim()}>
              {ocupado ? 'Rechazando...' : 'Rechazar el pedido'}
            </button>
            <button type="button" className="btn btn-secondary btn-chico" onClick={() => setPaso(null)} disabled={ocupado}>
              Cancelar
            </button>
          </div>
        </form>
      )}

      {/* La pedí yo y ya la aceptaron: confirmar que llegó */}
      {!meLaPidieron && t.estado === 'aceptada' && !paso && (
        <div className="necesidad-acciones">
          <button type="button" className="btn btn-primary btn-chico" onClick={() => setPaso('recibir')} disabled={ocupado}>
            Confirmar recepción
          </button>
        </div>
      )}
      {paso === 'recibir' && (
        <div className="necesidad-acciones confirmar-accion">
          <span>¿Ya llegaron? {t.unidades.length === 1 ? 'La unidad pasa' : `Las ${t.unidades.length} unidades pasan`} a tu stock.</span>
          <button type="button" className="btn btn-primary btn-chico" onClick={() => hacer(() => onRecibir(t))} disabled={ocupado}>
            {ocupado ? 'Confirmando...' : 'Sí, llegaron'}
          </button>
          <button type="button" className="btn btn-secondary btn-chico" onClick={() => setPaso(null)} disabled={ocupado}>
            No
          </button>
        </div>
      )}
    </article>
  )
}
