import { useState, useEffect } from 'react'
import { fechaLegible } from '../necesidades/textos'
import { ESTADOS_UNIDAD, TIPOS_MOVIMIENTO, fechaHoraLegible } from './textos'

// Dónde pasó un movimiento: "de A a B" (transferencia), o la institución que corresponda
function lugarDe(movimiento) {
  const origen = movimiento.institucionOrigen?.nombre
  const destino = movimiento.institucionDestino?.nombre
  if (origen && destino) return `de ${origen} a ${destino}`
  if (destino || origen) return `en ${destino || origen}`
  return null
}

// Criterio: detalle de la unidad. Cuándo ingresó, de dónde vino y qué pasó con ella (sus movimientos).
// Pide el detalle a la API al abrirse (GET /api/unidades/:idUnidadSangre).
export function DetalleUnidad({ idUnidadSangre, pedir }) {
  const [detalle, setDetalle] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let activo = true
    pedir(`/${idUnidadSangre}`)
      .then((datos) => { if (activo) setDetalle(datos) })
      .catch((err) => { if (activo) setError(err.message) })
    return () => {
      activo = false
    }
  }, [pedir, idUnidadSangre])

  if (error) return <p className="texto-error">{error}</p>
  if (!detalle) return <p className="texto-suave">Cargando el recorrido...</p>

  const ingreso = detalle.movimientos.find((m) => m.tipo === 'ingreso')

  return (
    <div className="detalle-unidad">
      <dl className="detalle-datos">
        <div>
          <dt>Ingresó</dt>
          <dd>{ingreso ? fechaHoraLegible(ingreso.ocurridoEn) : '—'}</dd>
        </div>
        <div>
          <dt>De dónde vino</dt>
          <dd>{detalle.idDonacion ? 'De una donación registrada en DonaVida' : 'Cargada a mano por la institución'}</dd>
        </div>
        <div>
          <dt>Extracción</dt>
          <dd>{fechaLegible(detalle.fechaExtraccion)}</dd>
        </div>
        <div>
          <dt>Vencimiento</dt>
          <dd>{fechaLegible(detalle.fechaVencimiento)}</dd>
        </div>
      </dl>

      <h4 className="detalle-titulo">Qué pasó con ella</h4>
      <ol className="recorrido">
        {detalle.movimientos.map((movimiento) => {
          const lugar = lugarDe(movimiento)
          const quien = movimiento.usuario ? `${movimiento.usuario.nombre} ${movimiento.usuario.apellido}` : 'el sistema'
          return (
            <li key={movimiento.idMovimientoUnidad}>
              <strong>{TIPOS_MOVIMIENTO[movimiento.tipo]}</strong>
              {' · '}{movimiento.estadoAnterior ? ESTADOS_UNIDAD[movimiento.estadoAnterior].texto : 'Nueva'} → {ESTADOS_UNIDAD[movimiento.estadoNuevo].texto}
              <small>
                {fechaHoraLegible(movimiento.ocurridoEn)} · por {quien}{lugar && ` · ${lugar}`}
              </small>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
