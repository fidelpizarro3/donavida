import { useState, useEffect, useCallback } from 'react'
import { fechaLegible } from '../necesidades/textos'
import { partesDeFecha, fechaLarga, enlaceMapa, guardarSinConexion, leerSinConexion } from './textos'
import { AvisoFlotante } from '../comunes/AvisoFlotante'
import { MapaPunto } from '../comunes/MapaPunto'

const CLAVE_SIN_CONEXION = 'donavida_proximo_turno'

// TAREA-10 en el front, lado del donante:
//   - si tiene turno: se lo muestra (con cómo llegar), y puede cambiar el horario o cancelarlo
//   - si aceptó una alerta y todavía no tiene turno: le ofrece los horarios libres de ese hospital
//   - si no: no muestra nada
// El turno se guarda en el navegador: si no hay conexión, se sigue viendo (criterio "sin conexión").
// "actualizar" lo cambia el perfil cuando el donante responde una alerta, para volver a mirar.
export function TurnoDonante({ token, apiUrl, actualizar = 0 }) {
  const [estado, setEstado] = useState({ turno: null, alerta: null, franjas: [] })
  const [sinConexion, setSinConexion] = useState(null) // { guardadoEn } si se muestra la copia guardada
  const [cargando, setCargando] = useState(true)
  const [ocupado, setOcupado] = useState(false)
  const [mensaje, setMensaje] = useState(null)
  const [error, setError] = useState(null)
  const [version, setVersion] = useState(0)
  const [modo, setModo] = useState(null) // null | 'reprogramar' | 'cancelar'

  // Esta sección consulta tres recursos (turnos, alertas, franjas), por eso recibe la ruta completa
  const pedir = useCallback(async (ruta, opciones = {}) => {
    const res = await fetch(`${apiUrl}${ruta}`, {
      ...opciones,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error?.mensaje || 'Error al comunicarse con el servidor')
    return data
  }, [apiUrl, token])

  useEffect(() => {
    let activo = true

    async function cargar() {
      const [turno, alertas] = await Promise.all([pedir('/api/turnos/proximo'), pedir('/api/alertas/mias')])

      if (turno) {
        // El turno trae el id de su alerta: de ahí salen el hospital y la fecha límite de la necesidad
        const alerta = alertas.find((a) => a.idAlerta === turno.idAlerta)
        const franjas = await pedir(`/api/franjas/disponibles?idInstitucion=${turno.idInstitucion}`)
        return {
          turno: { ...turno, institucion: alerta?.institucion },
          alerta,
          // Para reprogramar: otros horarios del mismo hospital, antes de la fecha límite
          franjas: franjas.filter((f) => f.fecha <= (alerta?.necesidad.fechaLimite ?? f.fecha)),
        }
      }

      const alerta = alertas.find((a) => a.estado === 'aceptada' && a.necesidad.estado === 'abierta')
      if (!alerta) return { turno: null, alerta: null, franjas: [] }

      const libres = await pedir(`/api/franjas/disponibles?idInstitucion=${alerta.institucion.idInstitucion}`)
      // Solo sirven las franjas anteriores a la fecha límite de la necesidad (la API igual lo valida)
      const franjas = libres.filter((f) => f.fecha <= alerta.necesidad.fechaLimite)
      return { turno: null, alerta, franjas }
    }

    cargar()
      .then((nuevo) => {
        if (!activo) return
        setEstado(nuevo)
        setSinConexion(null)
        guardarSinConexion(CLAVE_SIN_CONEXION, nuevo.turno)
      })
      .catch((err) => {
        if (!activo) return
        // Sin conexión: se muestra el último turno guardado en vez de un error
        const guardado = leerSinConexion(CLAVE_SIN_CONEXION)
        if (!navigator.onLine && guardado?.datos) {
          setEstado({ turno: guardado.datos, alerta: null, franjas: [] })
          setSinConexion(guardado)
        } else {
          setError(err.message)
        }
      })
      .finally(() => { if (activo) setCargando(false) })
    return () => {
      activo = false
    }
  }, [pedir, version, actualizar])

  const ejecutar = async (accion, textoExito) => {
    setOcupado(true)
    setMensaje(null)
    setError(null)
    try {
      await accion()
      setMensaje(textoExito)
      setModo(null)
    } catch (err) {
      // Por ejemplo, si justo otro donante se quedó con el último lugar: la API manda el motivo
      setError(err.message)
    } finally {
      setOcupado(false)
      setVersion((v) => v + 1) // recarga, por si algún horario se llenó
    }
  }

  const reservar = (idFranjaHoraria) =>
    ejecutar(
      () => pedir('/api/turnos', { method: 'POST', body: JSON.stringify({ idAlerta: estado.alerta.idAlerta, idFranjaHoraria }) }),
      '¡Listo! Te esperamos. El día anterior te mandamos un recordatorio.'
    )

  const reprogramar = (idFranjaHoraria) =>
    ejecutar(
      () => pedir(`/api/turnos/${estado.turno.idTurno}`, { method: 'PATCH', body: JSON.stringify({ idFranjaHoraria }) }),
      'Cambiamos tu turno. Tu lugar anterior quedó libre para otra persona.'
    )

  const cancelar = () =>
    ejecutar(
      () => pedir(`/api/turnos/${estado.turno.idTurno}/cancelar`, { method: 'POST' }),
      'Cancelaste el turno. Gracias por avisar: el lugar queda para otra persona.'
    )

  const { turno, alerta, franjas } = estado
  if (cargando) return null
  if (!turno && !alerta) {
    return <AvisoFlotante mensaje={mensaje} onCerrar={() => setMensaje(null)} />
  }

  const otrasFranjas = turno ? franjas.filter((f) => !(f.fecha === turno.fecha && f.horaInicio === turno.horaInicio)) : []
  const mapa = enlaceMapa(turno?.institucion)

  // Lista de horarios para elegir (al reservar o al reprogramar)
  const listaFranjas = (lista, accion, textoBoton) => (
    <div className="franjas-elegir">
      {lista.length === 0 && <p className="texto-suave">No hay otros horarios disponibles por ahora. Volvé a mirar más tarde.</p>}
      {lista.map((franja) => {
        const { dia, numero, mes } = partesDeFecha(franja.fecha)
        return (
          <button key={franja.idFranjaHoraria} type="button" className="franja-opcion" onClick={() => accion(franja.idFranjaHoraria)} disabled={ocupado}>
            <span className="ficha-fecha ficha-fecha-chica">
              <span>{dia}</span>
              <strong>{numero}</strong>
              <span>{mes}</span>
            </span>
            <span className="franja-opcion-datos">
              <strong>{franja.horaInicio} a {franja.horaFin}</strong>
              <small>Quedan {franja.cupoLibre} lugares</small>
            </span>
            <span className="franja-opcion-accion">{textoBoton}</span>
          </button>
        )
      })}
    </div>
  )

  return (
    <section className="card">
      <AvisoFlotante mensaje={mensaje} onCerrar={() => setMensaje(null)} />
      {error && <div className="alert alert-danger">{error}</div>}

      {turno && (() => {
        const { dia, numero, mes } = partesDeFecha(turno.fecha)
        return (
          <>
            <h3 className="card-title" style={{ marginTop: 0 }}>Tu próximo turno</h3>
            {sinConexion && (
              <div className="alert alert-warning">Estás sin conexión: te mostramos el turno que tenías guardado.</div>
            )}
            <div className="turno-ticket">
              <div className="ficha-fecha ficha-fecha-grande">
                <span>{dia}</span>
                <strong>{numero}</strong>
                <span>{mes}</span>
              </div>
              <div className="turno-ticket-datos">
                <strong>{fechaLarga(turno.fecha)}</strong>
                <span>De {turno.horaInicio} a {turno.horaFin} · podés llegar en cualquier momento de ese rango</span>
                {turno.institucion && (
                  <span>📍 <strong>{turno.institucion.nombre}</strong> · {turno.institucion.direccion}</span>
                )}
              </div>
            </div>

            {/* El mapa necesita internet: sin conexión queda el botón "Cómo llegar" para cuando vuelva */}
            {!sinConexion && turno.institucion && (
              <MapaPunto latitud={turno.institucion.latitud} longitud={turno.institucion.longitud} nombre={turno.institucion.nombre} />
            )}

            <ul className="consejos">
              <li>💧 Tomá mucha agua el día anterior</li>
              <li>🍞 Desayuná liviano (sin grasas)</li>
              <li>🪪 Llevá tu DNI</li>
            </ul>

            {!sinConexion && !modo && (
              <div className="necesidad-acciones">
                {mapa && (
                  <a className="btn btn-primary btn-chico" href={mapa} target="_blank" rel="noreferrer">Cómo llegar</a>
                )}
                <button type="button" className="btn btn-secondary btn-chico" onClick={() => setModo('reprogramar')} disabled={ocupado}>
                  Cambiar horario
                </button>
                <button type="button" className="btn btn-secondary btn-chico" onClick={() => setModo('cancelar')} disabled={ocupado}>
                  No puedo ir
                </button>
              </div>
            )}

            {modo === 'reprogramar' && (
              <>
                <p className="texto-suave">Elegí otro horario en {turno.institucion?.nombre ?? 'el mismo hospital'}:</p>
                {listaFranjas(otrasFranjas, reprogramar, 'Cambiar')}
                <button type="button" className="btn-link" onClick={() => setModo(null)}>Volver</button>
              </>
            )}

            {modo === 'cancelar' && (
              <div className="necesidad-acciones">
                <span>¿Cancelar el turno? El lugar queda libre para otra persona.</span>
                <button type="button" className="btn btn-primary btn-chico" onClick={cancelar} disabled={ocupado}>Sí, cancelar</button>
                <button type="button" className="btn btn-secondary btn-chico" onClick={() => setModo(null)} disabled={ocupado}>No</button>
              </div>
            )}
          </>
        )
      })()}

      {!turno && alerta && (
        <>
          <h3 className="card-title" style={{ marginTop: 0 }}>Elegí cuándo vas a {alerta.institucion.nombre}</h3>
          <p className="texto-suave">
            Gracias por aceptar. Elegí un horario antes del {fechaLegible(alerta.necesidad.fechaLimite)}: así el hospital sabe que vas.
          </p>
          {listaFranjas(franjas, reservar, 'Reservar')}
        </>
      )}
    </section>
  )
}
