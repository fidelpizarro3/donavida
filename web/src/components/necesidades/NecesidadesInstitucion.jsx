import { useState, useEffect, useCallback } from 'react'
import { FormularioNecesidad } from './FormularioNecesidad'
import { TarjetaNecesidad } from './TarjetaNecesidad'
import { ESTADOS, avisamosQueNoVayan } from './textos'
import { AvisoFlotante } from '../comunes/AvisoFlotante'
import { Esqueleto } from '../comunes/Esqueleto'

// TAREA-4 en el front: publicar, ver, corregir y cerrar las necesidades de la institución.
// TAREA-8: convocar donantes para una necesidad abierta.
// Toda la comunicación con la API pasa por la función pedir().
export function NecesidadesInstitucion({ token, apiUrl }) {
  const [necesidades, setNecesidades] = useState([])
  const [filtro, setFiltro] = useState('') // '' = todas
  const [cargando, setCargando] = useState(true)
  const [ocupado, setOcupado] = useState(false)
  const [mensaje, setMensaje] = useState(null)
  const [error, setError] = useState(null)

  // Hace el pedido con el token. Si la API responde un error, lo lanza con su mensaje.
  // "ruta" va desde /api (TAREA-13 también usa /api/convocatorias)
  const llamar = useCallback(async (ruta, opciones = {}) => {
    const res = await fetch(`${apiUrl}/api${ruta}`, {
      ...opciones,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error?.mensaje || 'Error al comunicarse con el servidor')
    return data
  }, [apiUrl, token])
  const pedir = useCallback((ruta, opciones) => llamar(`/necesidades${ruta}`, opciones), [llamar])

  // Cada vez que cambia esto, se vuelve a pedir la lista (después de publicar, corregir o cerrar)
  const [version, setVersion] = useState(0)

  // Trae la lista al entrar, al cambiar el filtro y después de cada acción.
  // "activo" evita guardar la respuesta si el componente ya se cerró.
  useEffect(() => {
    let activo = true
    pedir(filtro ? `?estado=${filtro}` : '')
      .then((datos) => { if (activo) setNecesidades(datos) })
      .catch((err) => { if (activo) setError(err.message) })
      .finally(() => { if (activo) setCargando(false) })
    return () => {
      activo = false
    }
  }, [pedir, filtro, version])

  const cambiarFiltro = (nuevoFiltro) => {
    setCargando(true)
    setFiltro(nuevoFiltro)
  }

  // Ejecuta una acción (publicar, corregir, cerrar), muestra el resultado y recarga la lista.
  // textoExito puede ser una función que arma el texto con la respuesta. Devuelve true si salió bien.
  const ejecutar = async (accion, textoExito) => {
    setOcupado(true)
    setMensaje(null)
    setError(null)
    try {
      const datos = await accion()
      setMensaje(typeof textoExito === 'function' ? textoExito(datos) : textoExito)
      setVersion((v) => v + 1) // recarga la lista
      return true
    } catch (err) {
      // Por ejemplo, 403 si la institución no está aprobada: la API ya manda el mensaje
      setError(err.message)
      return false
    } finally {
      setOcupado(false)
    }
  }

  const publicar = (datos) =>
    ejecutar(() => pedir('', { method: 'POST', body: JSON.stringify(datos) }), 'Necesidad publicada: quedó abierta.')

  const corregir = (idNecesidad, unidadesSolicitadas) =>
    ejecutar(
      () => pedir(`/${idNecesidad}`, { method: 'PATCH', body: JSON.stringify({ unidadesSolicitadas }) }),
      'Cantidad corregida.'
    )

  const cerrar = (idNecesidad) =>
    ejecutar(() => pedir(`/${idNecesidad}/cerrar`, { method: 'POST' }), 'Necesidad cerrada.')

  // TAREA-8: datos = { radioKm, idsDonantes }
  const convocar = (idNecesidad, datos) =>
    ejecutar(
      () => pedir(`/${idNecesidad}/convocatoria`, { method: 'POST', body: JSON.stringify(datos) }),
      `Convocatoria confirmada: ${datos.idsDonantes.length} ${datos.idsDonantes.length === 1 ? 'persona va a recibir' : 'personas van a recibir'} el aviso.`
    )

  // TAREA-14: pedir a otros hospitales las unidades que propuso la búsqueda en la red
  const pedirUnidades = (idNecesidad, idsUnidadSangre) =>
    ejecutar(
      () => pedir(`/${idNecesidad}/cobertura/aceptar`, { method: 'POST', body: JSON.stringify({ idsUnidadSangre }) }),
      `Pedido enviado: ${idsUnidadSangre.length} ${idsUnidadSangre.length === 1 ? 'unidad' : 'unidades'}. Seguilo en la pestaña Transferencias.`
    )

  // TAREA-13: dejar la convocatoria abierta aunque la necesidad se cubra, o cerrarla (y agradecer)
  const mantenerAbierta = (idConvocatoria, mantener) =>
    ejecutar(
      () => llamar(`/convocatorias/${idConvocatoria}/mantener-abierta`, { method: 'POST', body: JSON.stringify({ mantener }) }),
      (datos) => {
        if (datos.estado === 'cerrada') {
          return datos.agradecidos > 0 ? `Convocatoria cerrada: ${avisamosQueNoVayan(datos.agradecidos)}.` : 'Convocatoria cerrada.'
        }
        return mantener
          ? 'Listo: la convocatoria va a seguir abierta aunque se cubra la necesidad.'
          : 'Listo: la convocatoria se va a cerrar cuando se cubra la necesidad.'
      }
    )

  // TAREA-13: con los que tenían turno, mantenerlos o pedirles que reprogramen
  const decidirTurnos = (idConvocatoria, accion) =>
    ejecutar(
      () => llamar(`/convocatorias/${idConvocatoria}/turnos`, { method: 'PATCH', body: JSON.stringify({ accion }) }),
      (datos) => {
        if (accion === 'mantener') return 'Listo: los que tenían turno lo mantienen.'
        if (datos.avisados === datos.turnosReservados) {
          return datos.avisados === 1
            ? 'Le avisamos a 1 persona para que elija otro día.'
            : `Les avisamos a ${datos.avisados} personas para que elijan otro día.`
        }
        return `Les avisamos a ${datos.avisados} de ${datos.turnosReservados}: los demás lo van a ver al entrar a DonaVida.`
      }
    )

  return (
    <>
      <AvisoFlotante mensaje={mensaje} onCerrar={() => setMensaje(null)} />
      {error && <div className="alert alert-danger">{error}</div>}

      <FormularioNecesidad onPublicar={publicar} publicando={ocupado} />

      <section className="card">
        <div className="card-title">
          <h3 style={{ margin: 0 }}>Necesidades publicadas</h3>
          <select value={filtro} onChange={(e) => cambiarFiltro(e.target.value)} aria-label="Filtrar por estado">
            <option value="">Todas</option>
            {Object.entries(ESTADOS).map(([valor, { texto }]) => (
              <option key={valor} value={valor}>{texto}</option>
            ))}
          </select>
        </div>

        {cargando && <Esqueleto />}
        {!cargando && necesidades.length === 0 && (
          <p className="texto-suave">No hay necesidades {filtro ? 'con ese estado' : 'publicadas todavía'}.</p>
        )}

        <div className="necesidades-lista">
          {necesidades.map((necesidad) => (
            <TarjetaNecesidad
              // La key cambia con la cantidad, así la tarjeta se reinicia después de corregir
              key={`${necesidad.idNecesidad}-${necesidad.unidadesSolicitadas}-${necesidad.estado}`}
              necesidad={necesidad}
              onCorregir={corregir}
              onCerrar={cerrar}
              onConvocar={convocar}
              onPedirUnidades={pedirUnidades}
              onMantenerAbierta={mantenerAbierta}
              onDecidirTurnos={decidirTurnos}
              pedir={pedir}
              ocupado={ocupado}
            />
          ))}
        </div>
      </section>
    </>
  )
}
