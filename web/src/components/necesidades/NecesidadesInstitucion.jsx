import { useState, useEffect, useCallback } from 'react'
import { FormularioNecesidad } from './FormularioNecesidad'
import { TarjetaNecesidad } from './TarjetaNecesidad'
import { avisamosQueNoVayan } from './textos'
import { AvisoFlotante } from '../comunes/AvisoFlotante'
import { Esqueleto } from '../comunes/Esqueleto'

// Pestañas de la lista. Se trae todo una sola vez y se filtra acá, así cada pestaña muestra cuántas tiene
const PESTANAS = [
  { id: 'abierta', texto: 'Abiertas', incluye: ['abierta'] },
  { id: 'cubierta', texto: 'Cubiertas', incluye: ['cubierta'] },
  { id: 'cerrada', texto: 'Cerradas', incluye: ['cerrada_manual', 'vencida'] },
  { id: 'todas', texto: 'Todas', incluye: null },
]

// Las urgentes primero; dentro de cada grupo, la que vence antes
const porPrioridad = (a, b) =>
  (b.urgencia === 'urgente') - (a.urgencia === 'urgente') || a.fechaLimite.localeCompare(b.fechaLimite)

// TAREA-4 en el front: publicar, ver, corregir y cerrar las necesidades de la institución.
// TAREA-8: convocar donantes para una necesidad abierta.
// Toda la comunicación con la API pasa por la función pedir().
export function NecesidadesInstitucion({ token, apiUrl }) {
  const [necesidades, setNecesidades] = useState([])
  const [pestana, setPestana] = useState('abierta')
  const [publicando, setPublicando] = useState(false) // formulario de nueva necesidad abierto
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

  // Trae la lista al entrar y después de cada acción.
  // "activo" evita guardar la respuesta si el componente ya se cerró.
  useEffect(() => {
    let activo = true
    pedir('')
      .then((datos) => { if (activo) setNecesidades(datos) })
      .catch((err) => { if (activo) setError(err.message) })
      .finally(() => { if (activo) setCargando(false) })
    return () => {
      activo = false
    }
  }, [pedir, version])

  const deLaPestana = (id) => {
    const { incluye } = PESTANAS.find((p) => p.id === id)
    return incluye ? necesidades.filter((n) => incluye.includes(n.estado)) : necesidades
  }
  const abiertas = deLaPestana('abierta')
  const visibles = [...deLaPestana(pestana)].sort(porPrioridad)
  // El resumen de arriba: lo que el hospital quiere saber antes que nada
  const faltanTotal = abiertas.reduce((total, n) => total + n.unidadesFaltantes, 0)
  const urgentes = abiertas.filter((n) => n.urgencia === 'urgente').length

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

  const publicar = async (datos) => {
    const publicada = await ejecutar(() => pedir('', { method: 'POST', body: JSON.stringify(datos) }), 'Necesidad publicada: quedó abierta.')
    if (publicada) {
      setPublicando(false)
      setPestana('abierta') // para que se vea la que se acaba de publicar
    }
    return publicada
  }

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

      <section className="card">
        <div className="card-title">
          <div>
            <h3 style={{ margin: 0 }}>Necesidades</h3>
            {!cargando && (
              <small className="texto-suave">
                {abiertas.length === 0
                  ? 'No hay necesidades abiertas'
                  : `${abiertas.length} ${abiertas.length === 1 ? 'abierta' : 'abiertas'} · ${faltanTotal === 1 ? 'falta 1 unidad' : `faltan ${faltanTotal} unidades`}`}
                {urgentes > 0 && <> · <strong className="texto-urgente">{urgentes} {urgentes === 1 ? 'urgente' : 'urgentes'}</strong></>}
              </small>
            )}
          </div>
          {!publicando && (
            <button type="button" className="btn btn-primary btn-chico" onClick={() => setPublicando(true)}>
              + Publicar necesidad
            </button>
          )}
        </div>

        {publicando && (
          <FormularioNecesidad onPublicar={publicar} onCancelar={() => setPublicando(false)} publicando={ocupado} abiertas={abiertas} />
        )}

        <nav className="pestanas pestanas-chicas" role="tablist">
          {PESTANAS.map(({ id, texto }) => (
            <button key={id} type="button" role="tab" aria-selected={pestana === id} className={`pestana ${pestana === id ? 'activa' : ''}`} onClick={() => setPestana(id)}>
              {texto} <span className="pestana-contador">{deLaPestana(id).length}</span>
            </button>
          ))}
        </nav>

        {cargando && <Esqueleto />}
        {!cargando && visibles.length === 0 && (
          <div className="vacio">
            <span aria-hidden="true">🩸</span>
            <p>{pestana === 'abierta' ? 'No tenés necesidades abiertas. Cuando falte sangre, publicá una.' : 'No hay necesidades en este estado.'}</p>
          </div>
        )}

        <div className="necesidades-filas">
          {visibles.map((necesidad) => (
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
