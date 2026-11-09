import { useState } from 'react'
import { COMPONENTES, ESTADOS, grupoConFactor, fechaLegible } from './textos'
import { CoberturaNecesidad } from './CoberturaNecesidad'
import { ConvocatoriaNecesidad } from './ConvocatoriaNecesidad'

// Una necesidad: qué se pide, cuánto falta (barra de progreso) y, si está abierta,
// los botones para convocar donantes, corregir la cantidad o cerrarla a mano.
export function TarjetaNecesidad({ necesidad, onCorregir, onCerrar, onConvocar, onPedirUnidades, pedir, ocupado }) {
  const [editando, setEditando] = useState(false)
  const [cantidad, setCantidad] = useState(necesidad.unidadesSolicitadas)
  const [confirmandoCierre, setConfirmandoCierre] = useState(false)
  // null = nada abierto. TAREA-14: primero 'red' (buscar en otros hospitales), después 'donantes'
  const [pasoConvocatoria, setPasoConvocatoria] = useState(null)

  const estado = ESTADOS[necesidad.estado]
  const estaAbierta = necesidad.estado === 'abierta'
  // Criterio: siempre se ve cuántas están comprometidas y cuántas faltan
  const porcentaje = Math.round((necesidad.unidadesCubiertas / necesidad.unidadesSolicitadas) * 100)
  // TAREA-14: unidades pedidas a otros hospitales que todavía no llegaron (no cuentan como comprometidas)
  const enCamino = necesidad.unidadesEnCamino ?? 0
  const porcentajeEnCamino = Math.min(100 - porcentaje, Math.round((enCamino / necesidad.unidadesSolicitadas) * 100))

  const handleGuardar = async () => {
    const guardada = await onCorregir(necesidad.idNecesidad, Number(cantidad))
    if (guardada) setEditando(false)
  }

  return (
    <article className={`necesidad-tarjeta ${estaAbierta ? '' : 'necesidad-cerrada'}`}>
      <div className="necesidad-cabecera">
        <span className="grupo-chip">{grupoConFactor(necesidad.grupoSanguineo, necesidad.factorRh)}</span>
        <div className="necesidad-datos">
          <strong>{COMPONENTES[necesidad.componente]}</strong>
          <small>Hasta el {fechaLegible(necesidad.fechaLimite)}</small>
        </div>
        <div className="necesidad-etiquetas">
          {necesidad.urgencia === 'urgente' && <span className="badge badge-urgente">Urgente</span>}
          <span className={`badge ${estado.clase}`}>{estado.texto}</span>
        </div>
      </div>

      <div className="progreso progreso-doble">
        <div className="progreso-barra" style={{ width: `${porcentaje}%` }} />
        {enCamino > 0 && <div className="progreso-en-camino" style={{ width: `${porcentajeEnCamino}%` }} />}
      </div>
      <div className="necesidad-pie">
        <span><strong>{necesidad.unidadesCubiertas}</strong> de {necesidad.unidadesSolicitadas} unidades comprometidas</span>
        <span>
          Faltan <strong>{necesidad.unidadesFaltantes}</strong>
          {enCamino > 0 && <> · <strong className="texto-en-camino">{enCamino}</strong> en camino</>}
        </span>
      </div>

      {estaAbierta && !editando && !confirmandoCierre && !pasoConvocatoria && (
        <div className="necesidad-acciones">
          <button type="button" className="btn btn-primary btn-chico" onClick={() => setPasoConvocatoria('red')} disabled={ocupado}>
            Convocar donantes
          </button>
          <button type="button" className="btn btn-secondary btn-chico" onClick={() => setEditando(true)} disabled={ocupado}>
            Corregir cantidad
          </button>
          <button type="button" className="btn btn-secondary btn-chico" onClick={() => setConfirmandoCierre(true)} disabled={ocupado}>
            Cerrar necesidad
          </button>
        </div>
      )}

      {pasoConvocatoria === 'red' && (
        <CoberturaNecesidad
          necesidad={necesidad}
          pedir={pedir}
          onPedir={(ids) => onPedirUnidades(necesidad.idNecesidad, ids)}
          onConvocar={() => setPasoConvocatoria('donantes')}
          onCancelar={() => setPasoConvocatoria(null)}
          ocupado={ocupado}
        />
      )}

      {pasoConvocatoria === 'donantes' && (
        <ConvocatoriaNecesidad
          necesidad={necesidad}
          pedir={pedir}
          onConfirmar={(datos) => onConvocar(necesidad.idNecesidad, datos)}
          onCancelar={() => setPasoConvocatoria(null)}
          ocupado={ocupado}
        />
      )}

      {editando && (
        <div className="necesidad-acciones">
          <input
            type="number"
            min={Math.max(1, necesidad.unidadesCubiertas)}
            max="100"
            value={cantidad}
            onChange={(e) => setCantidad(e.target.value)}
            aria-label="Nueva cantidad de unidades"
          />
          <button type="button" className="btn btn-primary btn-chico" onClick={handleGuardar} disabled={ocupado}>
            Guardar
          </button>
          <button type="button" className="btn btn-secondary btn-chico" onClick={() => setEditando(false)} disabled={ocupado}>
            Cancelar
          </button>
        </div>
      )}

      {confirmandoCierre && (
        <div className="necesidad-acciones">
          <span>¿Cerrar esta necesidad? Ya no se va a poder modificar.</span>
          <button type="button" className="btn btn-primary btn-chico" onClick={() => onCerrar(necesidad.idNecesidad)} disabled={ocupado}>
            Sí, cerrar
          </button>
          <button type="button" className="btn btn-secondary btn-chico" onClick={() => setConfirmandoCierre(false)} disabled={ocupado}>
            No
          </button>
        </div>
      )}
    </article>
  )
}
