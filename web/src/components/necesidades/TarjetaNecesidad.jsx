import { useState } from 'react'
import { COMPONENTES, ESTADOS, CUBIERTA_CON, grupoConFactor, fechaLegible, venceEn, publicadaEl } from './textos'
import { CoberturaNecesidad } from './CoberturaNecesidad'
import { ConvocatoriaNecesidad } from './ConvocatoriaNecesidad'
import { ConvocatoriasNecesidad } from './ConvocatoriasNecesidad'

// Una necesidad, como fila de la lista: qué se pide, cuánto falta, cuándo vence y la acción principal (convocar).
// Corregir la cantidad y cerrarla a mano se usan poco: van al menú "⋯" para no competir con Convocar.
// Lo que se abre (búsqueda en la red, convocatoria, corregir, cerrar) aparece debajo de la fila.
// TAREA-13: con qué se cubrió y qué pasa con sus convocatorias al cubrirse.
export function TarjetaNecesidad({
  necesidad, onCorregir, onCerrar, onConvocar, onPedirUnidades, onMantenerAbierta, onDecidirTurnos, pedir, ocupado,
}) {
  const [editando, setEditando] = useState(false)
  const [cantidad, setCantidad] = useState(necesidad.unidadesSolicitadas)
  const [confirmandoCierre, setConfirmandoCierre] = useState(false)
  const [menuAbierto, setMenuAbierto] = useState(false)
  // null = nada abierto. TAREA-14: primero 'red' (buscar en otros hospitales), después 'donantes'
  const [pasoConvocatoria, setPasoConvocatoria] = useState(null)

  const estado = ESTADOS[necesidad.estado]
  const estaAbierta = necesidad.estado === 'abierta'
  const esUrgente = necesidad.urgencia === 'urgente'
  const algoAbierto = editando || confirmandoCierre || pasoConvocatoria
  // Criterio: siempre se ve cuántas están comprometidas y cuántas faltan
  const porcentaje = Math.round((necesidad.unidadesCubiertas / necesidad.unidadesSolicitadas) * 100)
  // TAREA-14: unidades pedidas a otros hospitales que todavía no llegaron (no cuentan como comprometidas)
  const enCamino = necesidad.unidadesEnCamino ?? 0
  const porcentajeEnCamino = Math.min(100 - porcentaje, Math.round((enCamino / necesidad.unidadesSolicitadas) * 100))

  const handleGuardar = async () => {
    const guardada = await onCorregir(necesidad.idNecesidad, Number(cantidad))
    if (guardada) setEditando(false)
  }

  // Elegir una opción del menú cierra el menú
  const desdeMenu = (accion) => () => {
    setMenuAbierto(false)
    accion()
  }

  // El menú se cierra si el foco sale de él (clic afuera o Tab)
  const cerrarMenuAlSalir = (e) => {
    if (!e.currentTarget.contains(e.relatedTarget)) setMenuAbierto(false)
  }

  return (
    <article className={`necesidad-fila ${esUrgente && estaAbierta ? 'necesidad-fila-urgente' : ''} ${estaAbierta ? '' : 'necesidad-cerrada'}`}>
      <div className="necesidad-fila-principal">
        <span className="grupo-chip grupo-chip-chico">{grupoConFactor(necesidad.grupoSanguineo, necesidad.factorRh)}</span>

        <div className="necesidad-fila-datos">
          <strong>
            {COMPONENTES[necesidad.componente]}
            {esUrgente && <span className="badge badge-urgente">Urgente</span>}
          </strong>
          <small>
            {estaAbierta ? venceEn(necesidad.fechaLimite) : `Límite ${fechaLegible(necesidad.fechaLimite)}`}
            {' · '}publicada {publicadaEl(necesidad.creadaEn)}
          </small>
        </div>

        <div className="necesidad-fila-progreso" title={`${necesidad.unidadesCubiertas} de ${necesidad.unidadesSolicitadas} unidades comprometidas`}>
          <div className="progreso progreso-doble progreso-fino">
            <div className="progreso-barra" style={{ width: `${porcentaje}%` }} />
            {enCamino > 0 && <div className="progreso-en-camino" style={{ width: `${porcentajeEnCamino}%` }} />}
          </div>
          <small>
            <strong>{necesidad.unidadesCubiertas}/{necesidad.unidadesSolicitadas}</strong>
            {estaAbierta && necesidad.unidadesFaltantes > 0 && <> · faltan {necesidad.unidadesFaltantes}</>}
            {enCamino > 0 && <> · <span className="texto-en-camino">{enCamino} en camino</span></>}
          </small>
        </div>

        <div className="necesidad-fila-acciones">
          {!estaAbierta && <span className={`badge ${estado.clase}`}>{estado.texto}</span>}
          {estaAbierta && !algoAbierto && (
            <>
              <button type="button" className="btn btn-primary btn-chico" onClick={() => setPasoConvocatoria('red')} disabled={ocupado}>
                Convocar
              </button>
              <div className="menu-acciones" onBlur={cerrarMenuAlSalir}>
                <button
                  type="button"
                  className="menu-acciones-boton"
                  aria-label="Más acciones"
                  aria-haspopup="menu"
                  aria-expanded={menuAbierto}
                  onClick={() => setMenuAbierto((abierto) => !abierto)}
                  onKeyDown={(e) => e.key === 'Escape' && setMenuAbierto(false)}
                  disabled={ocupado}
                >
                  ⋯
                </button>
                {menuAbierto && (
                  <div className="menu-acciones-lista" role="menu">
                    <button type="button" role="menuitem" onClick={desdeMenu(() => setEditando(true))}>Corregir cantidad</button>
                    <button type="button" role="menuitem" className="menu-peligro" onClick={desdeMenu(() => setConfirmandoCierre(true))}>Cerrar necesidad</button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* TAREA-13, criterio: la necesidad cerrada queda en el historial indicando cómo se cubrió */}
      {necesidad.cubiertaCon && <p className="necesidad-cubierta-con">✓ {CUBIERTA_CON[necesidad.cubiertaCon]}</p>}

      {!pasoConvocatoria && (
        <ConvocatoriasNecesidad
          necesidad={necesidad}
          onMantenerAbierta={onMantenerAbierta}
          onDecidirTurnos={onDecidirTurnos}
          ocupado={ocupado}
        />
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
          <span>Unidades que se necesitan:</span>
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
