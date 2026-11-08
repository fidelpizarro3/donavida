import { useState, useEffect, useCallback } from 'react'
import { PedirUnidades } from './PedirUnidades'
import { TarjetaTransferencia } from './TarjetaTransferencia'
import { DIRECCIONES, cantidadUnidades } from './textos'
import { AvisoFlotante } from '../comunes/AvisoFlotante'
import { Esqueleto } from '../comunes/Esqueleto'

// TAREA-12 en el front: transferencias de unidades entre instituciones.
//   - Pedir unidades a otra institución (a mano o para una de mis necesidades abiertas)
//   - Responder lo que me piden: aceptar (las unidades quedan reservadas) o rechazar con motivo
//   - Confirmar la recepción de lo que pedí (las unidades pasan a mi stock)
//   - Historial: qué se prestó, a quién y cuándo
// Toda la comunicación con la API pasa por la función pedir().
export function TransferenciasInstitucion({ token, apiUrl }) {
  const [transferencias, setTransferencias] = useState([])
  const [necesidades, setNecesidades] = useState([])
  const [direccion, setDireccion] = useState('')
  const [cargando, setCargando] = useState(true)
  const [ocupado, setOcupado] = useState(false)
  const [mensaje, setMensaje] = useState(null)
  const [error, setError] = useState(null)

  // Hace el pedido con el token (ruta desde /api). Si la API responde un error, lo lanza con su mensaje.
  const pedir = useCallback(async (ruta, opciones = {}) => {
    const res = await fetch(`${apiUrl}/api${ruta}`, {
      ...opciones,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error?.mensaje || 'Error al comunicarse con el servidor')
    return data
  }, [apiUrl, token])

  // Cada vez que cambia esto, se vuelve a pedir todo (después de pedir, aceptar, rechazar o recibir)
  const [version, setVersion] = useState(0)

  // El historial, filtrado por dirección. "activo" evita guardar la respuesta si el componente ya se cerró.
  useEffect(() => {
    let activo = true
    pedir(`/transferencias${direccion ? `?direccion=${direccion}` : ''}`)
      .then((datos) => { if (activo) setTransferencias(datos) })
      .catch((err) => { if (activo) setError(err.message) })
      .finally(() => { if (activo) setCargando(false) })
    return () => {
      activo = false
    }
  }, [pedir, direccion, version])

  // Mis necesidades abiertas, para ligar un pedido a una de ellas
  useEffect(() => {
    let activo = true
    pedir('/necesidades?estado=abierta')
      .then((datos) => { if (activo) setNecesidades(datos) })
      .catch(() => {}) // sin necesidades igual se puede pedir a mano
    return () => {
      activo = false
    }
  }, [pedir, version])

  const cambiarDireccion = (valor) => {
    setCargando(true)
    setDireccion(valor)
  }

  // Ejecuta una acción, muestra el texto que devuelve y recarga todo. Devuelve true si salió bien.
  const ejecutar = async (accion) => {
    setOcupado(true)
    setMensaje(null)
    setError(null)
    try {
      setMensaje(await accion())
      setVersion((v) => v + 1)
      return true
    } catch (err) {
      setError(err.message)
      return false
    } finally {
      setOcupado(false)
    }
  }

  const pedirUnidades = ({ nombre, ...datos }) =>
    ejecutar(async () => {
      await pedir('/transferencias', { method: 'POST', body: JSON.stringify(datos) })
      return `Pedido enviado a ${nombre}: tiene 24 horas para responder.`
    })

  const aceptar = (t) =>
    ejecutar(async () => {
      await pedir(`/transferencias/${t.idTransferencia}/aceptar`, { method: 'POST' })
      return `Aceptaste: ${cantidadUnidades(t.unidades.length)} quedaron reservadas para ${t.institucionSolicitante.nombre}.`
    })

  const rechazar = (t, motivoRechazo) =>
    ejecutar(async () => {
      await pedir(`/transferencias/${t.idTransferencia}/rechazar`, { method: 'POST', body: JSON.stringify({ motivoRechazo }) })
      return `Rechazaste el pedido de ${t.institucionSolicitante.nombre}.`
    })

  const recibir = (t) =>
    ejecutar(async () => {
      const recibida = await pedir(`/transferencias/${t.idTransferencia}/recibir`, { method: 'POST' })
      const cubierta = recibida.necesidad?.estado === 'cubierta'
      return `Recibiste ${cantidadUnidades(t.unidades.length)}: ya están en tu stock${cubierta ? ' y la necesidad quedó cubierta' : ''}.`
    })

  const porResponder = transferencias.filter((t) => t.direccion === 'recibida' && t.estado === 'pendiente').length

  return (
    <>
      <AvisoFlotante mensaje={mensaje} onCerrar={() => setMensaje(null)} />
      {error && <div className="alert alert-danger">{error}</div>}

      <PedirUnidades pedir={pedir} necesidades={necesidades} onPedir={pedirUnidades} ocupado={ocupado} />

      <section className="card">
        <div className="card-title">
          <h3 style={{ margin: 0 }}>Transferencias</h3>
          <select value={direccion} onChange={(e) => cambiarDireccion(e.target.value)} aria-label="Filtrar transferencias">
            {DIRECCIONES.map(({ valor, texto }) => (
              <option key={valor} value={valor}>{texto}</option>
            ))}
          </select>
        </div>

        {porResponder > 0 && (
          <div className="alert alert-warning">
            {porResponder === 1 ? 'Tenés 1 pedido para responder.' : `Tenés ${porResponder} pedidos para responder.`}
          </div>
        )}

        {cargando && <Esqueleto filas={2} />}
        {!cargando && transferencias.length === 0 && (
          <p className="texto-suave">
            {direccion ? 'No hay transferencias en esta lista.' : 'Todavía no pediste ni te pidieron unidades.'}
          </p>
        )}

        <div className="necesidades-lista">
          {transferencias.map((t) => (
            <TarjetaTransferencia
              // La key cambia con el estado, así la tarjeta se reinicia después de cada acción
              key={`${t.idTransferencia}-${t.estado}`}
              transferencia={t}
              onAceptar={aceptar}
              onRechazar={rechazar}
              onRecibir={recibir}
              ocupado={ocupado}
            />
          ))}
        </div>
      </section>
    </>
  )
}
