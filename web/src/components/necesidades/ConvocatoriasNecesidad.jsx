import { useState } from 'react'
import { fechaLegible, avisamosQueNoVayan } from './textos'

const personas = (cantidad) => `${cantidad} ${cantidad === 1 ? 'persona' : 'personas'}`

// TAREA-13 en el front: qué pasa con las convocatorias de una necesidad cuando se cubre.
//   - necesidad abierta: elegir si la convocatoria sigue abierta aunque se cubra (para reponer stock)
//   - cubierta y la convocatoria siguió abierta: cerrarla (se agradece a los que no fueron)
//   - cubierta y cerrada: a cuántos se les agradeció y, con los que tienen turno, mantenerlos o pedirles que reprogramen
// onMantenerAbierta(id, mantener) y onDecidirTurnos(id, accion) devuelven true si salió bien.
export function ConvocatoriasNecesidad({ necesidad, onMantenerAbierta, onDecidirTurnos, ocupado }) {
  const convocatorias = necesidad.convocatorias ?? []
  if (!['abierta', 'cubierta'].includes(necesidad.estado) || convocatorias.length === 0) return null

  return (
    <div className="cierre-convocatorias">
      {convocatorias.map((convocatoria) => (
        <UnaConvocatoria
          key={convocatoria.idConvocatoria}
          convocatoria={convocatoria}
          necesidad={necesidad}
          titulo={convocatorias.length > 1 ? `Convocatoria del ${new Date(convocatoria.creadaEn).toLocaleDateString('es-AR')}` : 'Convocatoria'}
          onMantenerAbierta={onMantenerAbierta}
          onDecidirTurnos={onDecidirTurnos}
          ocupado={ocupado}
        />
      ))}
    </div>
  )
}

function UnaConvocatoria({ convocatoria: c, necesidad, titulo, onMantenerAbierta, onDecidirTurnos, ocupado }) {
  const [paso, setPaso] = useState(null) // null | 'cerrar' | 'mantener' | 'reprogramar'
  const sigueAbierta = c.estado === 'enviada'
  const conTurno = c.turnosReservados

  // Si la acción salió bien se cierra el paso; si no, queda abierto para reintentar
  const hacer = async (accion) => {
    if (await accion()) setPaso(null)
  }

  // Necesidad abierta: se elige antes de que se cubra (el cierre es automático)
  if (necesidad.estado === 'abierta') {
    if (!sigueAbierta) return null
    return (
      <div className="cierre-convocatoria">
        <label className="cierre-casilla">
          <input
            type="checkbox"
            checked={c.mantenerAbierta}
            onChange={(e) => onMantenerAbierta(c.idConvocatoria, e.target.checked)}
            disabled={ocupado}
          />
          <span>
            <strong>{titulo}:</strong> mantenerla abierta cuando se cubra la necesidad
            <small>Los donantes avisados pueden seguir yendo para reponer tu stock. Si no, cuando se cubra les agradecemos y les avisamos que ya no hace falta.</small>
          </span>
        </label>
      </div>
    )
  }

  // Necesidad cubierta, pero el hospital mantuvo la convocatoria abierta para reponer stock
  if (sigueAbierta) {
    return (
      <div className="cierre-convocatoria">
        <p>
          📣 <strong>{titulo} abierta</strong> para reponer stock: los avisados todavía pueden ir hasta el {fechaLegible(necesidad.fechaLimite)}.
          {conTurno > 0 && <small className="texto-chico">{personas(conTurno)} con turno reservado.</small>}
        </p>
        {!paso && (
          <div className="necesidad-acciones">
            <button type="button" className="btn btn-secondary btn-chico" onClick={() => setPaso('cerrar')} disabled={ocupado}>
              Cerrar la convocatoria
            </button>
          </div>
        )}
        {paso === 'cerrar' && (
          <div className="necesidad-acciones confirmar-accion">
            <span>¿Cerrarla? A los que no respondieron les avisamos que ya no hace falta que vayan, y les agradecemos.</span>
            <button type="button" className="btn btn-primary btn-chico" onClick={() => hacer(() => onMantenerAbierta(c.idConvocatoria, false))} disabled={ocupado}>
              {ocupado ? 'Cerrando...' : 'Sí, cerrar y agradecer'}
            </button>
            <button type="button" className="btn btn-secondary btn-chico" onClick={() => setPaso(null)} disabled={ocupado}>
              No
            </button>
          </div>
        )}
      </div>
    )
  }

  // Necesidad cubierta y convocatoria cerrada
  return (
    <div className="cierre-convocatoria">
      <p>
        <strong>{titulo} cerrada</strong>
        {c.agradecidos > 0
          ? `: ${avisamosQueNoVayan(c.agradecidos)}, y ${c.agradecidos === 1 ? 'le' : 'les'} agradecimos.`
          : '.'}
      </p>

      {c.decisionTurnos === 'mantener' && <p className="texto-suave">Los que tenían turno lo mantienen: su donación va a tu stock.</p>}
      {c.decisionTurnos === 'reprogramar' && <p className="texto-suave">Les pediste a los que tenían turno que elijan otro día.</p>}

      {!c.decisionTurnos && conTurno > 0 && (
        <>
          <p>
            <strong>{personas(conTurno)} {conTurno === 1 ? 'tiene' : 'tienen'} turno reservado.</strong> ¿Qué hacemos con {conTurno === 1 ? 'su turno' : 'sus turnos'}?
          </p>
          {!paso && (
            <div className="necesidad-acciones">
              <button type="button" className="btn btn-primary btn-chico" onClick={() => setPaso('mantener')} disabled={ocupado}>
                Mantener {conTurno === 1 ? 'el turno' : 'los turnos'}
              </button>
              <button type="button" className="btn btn-secondary btn-chico" onClick={() => setPaso('reprogramar')} disabled={ocupado}>
                Pedir que reprogramen
              </button>
            </div>
          )}
          {paso === 'mantener' && (
            <div className="necesidad-acciones confirmar-accion">
              <span>
                {conTurno === 1
                  ? 'Viene el día que eligió y su donación va a tu stock. No le mandamos nada.'
                  : 'Vienen el día que eligieron y su donación va a tu stock. No les mandamos nada.'}
              </span>
              <button type="button" className="btn btn-primary btn-chico" onClick={() => hacer(() => onDecidirTurnos(c.idConvocatoria, 'mantener'))} disabled={ocupado}>
                {ocupado ? 'Guardando...' : 'Sí, mantener'}
              </button>
              <button type="button" className="btn btn-secondary btn-chico" onClick={() => setPaso(null)} disabled={ocupado}>
                No
              </button>
            </div>
          )}
          {paso === 'reprogramar' && (
            <div className="necesidad-acciones confirmar-accion">
              <span>
                {conTurno === 1
                  ? 'Le avisamos para que elija otro día (puede ser después de la fecha límite). Su turno sigue reservado hasta que lo cambie.'
                  : 'Les avisamos para que elijan otro día (puede ser después de la fecha límite). Sus turnos siguen reservados hasta que los cambien.'}
              </span>
              <button type="button" className="btn btn-primary btn-chico" onClick={() => hacer(() => onDecidirTurnos(c.idConvocatoria, 'reprogramar'))} disabled={ocupado}>
                {ocupado ? 'Avisando...' : 'Sí, avisarles'}
              </button>
              <button type="button" className="btn btn-secondary btn-chico" onClick={() => setPaso(null)} disabled={ocupado}>
                No
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
