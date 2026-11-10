import { useState, useEffect } from 'react'
import { grupoConFactor } from '../necesidades/textos'

// TAREA-15 + DV-13: desde el cuadro, pedirle unidades del grupo que falta a otro hospital de la red.
// Usa los endpoints de transferencias de Joaquín: primero busca quién tiene, después pide.
//   - Si el grupo tiene una necesidad abierta, el pedido queda asociado a ella (y no se pide más de lo que le falta).
//   - Si no (solo hay poca cobertura), se pide a mano la cantidad que se elija.
// pedir(): la función del contenedor, que ya lleva el token. onPedida: avisa para recargar el cuadro.
export function ProponerTransferencia({ fila, componente, pedir, onPedida }) {
  const [ofertas, setOfertas] = useState([])
  const [cargando, setCargando] = useState(true)
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState(null)
  const [cantidadManual, setCantidadManual] = useState(1)

  // La primera necesidad abierta del grupo, si hay
  const necesidad = fila.necesidades[0]
  const nombreGrupo = grupoConFactor(fila.grupoSanguineo, fila.factorRh)
  // Lo que falta según el cuadro: el stock propio ya cubre una parte de lo pedido.
  // Hay 3 y la necesidad pide 4 → se pide 1 afuera, no 4 (y nunca más de lo que le falta a la necesidad)
  const faltante = Math.max(1, -fila.balance)
  const cantidadBuscada = necesidad ? Math.min(necesidad.faltan, faltante) : cantidadManual

  useEffect(() => {
    let activo = true
    const query = new URLSearchParams({ grupoSanguineo: fila.grupoSanguineo, factorRh: fila.factorRh, componente })
    pedir(`/api/transferencias/unidades-disponibles?${query}`)
      .then((datos) => { if (activo) setOfertas(datos) })
      .catch((err) => { if (activo) setError(err.message) })
      .finally(() => { if (activo) setCargando(false) })
    return () => {
      activo = false
    }
  }, [pedir, fila.grupoSanguineo, fila.factorRh, componente])

  // Cuántas se le piden a esa institución: lo que falta (o lo elegido), sin pasar de lo que tiene
  const cantidadPara = (oferta) => Math.min(cantidadBuscada, oferta.unidades.length)

  const pedirA = async (oferta) => {
    setOcupado(true)
    setError(null)
    try {
      // Las unidades ya vienen ordenadas por vencimiento: se piden primero las que vencen antes
      const idsUnidadSangre = oferta.unidades.slice(0, cantidadPara(oferta)).map((u) => u.idUnidadSangre)
      await pedir('/api/transferencias', {
        method: 'POST',
        body: JSON.stringify({ idInstitucionProveedora: oferta.idInstitucion, idsUnidadSangre, idNecesidad: necesidad?.idNecesidad }),
      })
      onPedida(`Le pediste ${idsUnidadSangre.length} ${nombreGrupo} a ${oferta.nombre}. Queda pendiente hasta que acepte.`)
    } catch (err) {
      setError(err.message)
    } finally {
      setOcupado(false)
    }
  }

  return (
    <div className="proponer-transferencia">
      <h4>¿Quién de la red tiene {nombreGrupo}?</h4>
      {necesidad ? (
        <p className="texto-suave texto-ancho">
          Tu necesidad abierta pide {necesidad.faltan} y tenés {fila.disponible} en stock: se {cantidadBuscada === 1 ? 'pide 1 unidad' : `piden ${cantidadBuscada} unidades`} a otro hospital.
        </p>
      ) : (
        <div className="form-group" style={{ maxWidth: '12rem' }}>
          <label htmlFor="cantidad-transferencia">Cuántas pedir</label>
          <input
            id="cantidad-transferencia"
            type="number"
            min="1"
            max="20"
            value={cantidadManual}
            onChange={(e) => setCantidadManual(Math.max(1, Number(e.target.value) || 1))}
          />
        </div>
      )}

      {error && <div className="alert alert-danger">{error}</div>}
      {cargando && <p className="texto-suave">Buscando en la red...</p>}
      {!cargando && ofertas.length === 0 && (
        <p className="texto-suave texto-ancho">Ningún hospital de la red tiene {nombreGrupo} disponible ahora. Convocá donantes.</p>
      )}

      <div className="necesidades-lista">
        {ofertas.map((oferta) => (
          <div key={oferta.idInstitucion} className="oferta-red">
            <div className="necesidad-datos">
              <strong>{oferta.nombre}</strong>
              <small>a {oferta.distanciaKm} km · tiene {oferta.unidades.length} · la primera vence en {oferta.unidades[0].diasRestantes} días</small>
            </div>
            <button type="button" className="btn btn-primary btn-chico" onClick={() => pedirA(oferta)} disabled={ocupado}>
              Pedir {cantidadPara(oferta)}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
