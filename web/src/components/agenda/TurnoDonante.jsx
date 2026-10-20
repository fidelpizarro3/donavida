import { useState, useEffect, useCallback } from 'react'
import { fechaLegible } from '../necesidades/textos'

// TAREA-10 en el front, lado del donante:
//   - si tiene turno: se lo muestra, con dónde queda
//   - si aceptó una alerta y todavía no tiene turno: le ofrece los horarios libres de ese hospital
//   - si no: no muestra nada
// "actualizar" lo cambia el perfil cuando el donante responde una alerta, para volver a mirar.
export function TurnoDonante({ token, apiUrl, actualizar = 0 }) {
  const [estado, setEstado] = useState({ turno: null, alerta: null, franjas: [] })
  const [cargando, setCargando] = useState(true)
  const [ocupado, setOcupado] = useState(false)
  const [mensaje, setMensaje] = useState(null)
  const [error, setError] = useState(null)
  const [version, setVersion] = useState(0)

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
        // El turno solo trae el id de la institución: el nombre y la dirección salen de la alerta
        const alertaDelTurno = alertas.find((a) => a.institucion.idInstitucion === turno.idInstitucion)
        return { turno: { ...turno, institucion: alertaDelTurno?.institucion }, alerta: null, franjas: [] }
      }

      const alerta = alertas.find((a) => a.estado === 'aceptada' && a.necesidad.estado === 'abierta')
      if (!alerta) return { turno: null, alerta: null, franjas: [] }

      const libres = await pedir(`/api/franjas/disponibles?idInstitucion=${alerta.institucion.idInstitucion}`)
      // Solo sirven las franjas anteriores a la fecha límite de la necesidad (la API igual lo valida)
      const franjas = libres.filter((f) => f.fecha <= alerta.necesidad.fechaLimite)
      return { turno: null, alerta, franjas }
    }

    cargar()
      .then((nuevo) => { if (activo) setEstado(nuevo) })
      .catch((err) => { if (activo) setError(err.message) })
      .finally(() => { if (activo) setCargando(false) })
    return () => {
      activo = false
    }
  }, [pedir, version, actualizar])

  const reservar = async (idFranjaHoraria) => {
    setOcupado(true)
    setMensaje(null)
    setError(null)
    try {
      await pedir('/api/turnos', {
        method: 'POST',
        body: JSON.stringify({ idAlerta: estado.alerta.idAlerta, idFranjaHoraria }),
      })
      setMensaje('¡Listo! Te esperamos.')
      setVersion((v) => v + 1)
    } catch (err) {
      // Por ejemplo, si justo otro donante se quedó con el último lugar: la API manda el motivo
      setError(err.message)
      setVersion((v) => v + 1) // recarga los horarios, por si alguno se llenó
    } finally {
      setOcupado(false)
    }
  }

  const { turno, alerta, franjas } = estado
  if (cargando || (!turno && !alerta)) return null

  return (
    <section className="card">
      {mensaje && <div className="alert alert-success">{mensaje}</div>}
      {error && <div className="alert alert-danger">{error}</div>}

      {turno && (
        <>
          <h3 style={{ marginTop: 0 }}>Tu próximo turno</h3>
          <p>
            <strong>{fechaLegible(turno.fecha)}</strong>, entre las {turno.horaInicio} y las {turno.horaFin}
            {turno.institucion && <> en <strong>{turno.institucion.nombre}</strong> ({turno.institucion.direccion})</>}.
          </p>
          <p className="texto-suave">Es un rango de atención: podés llegar en cualquier momento de ese horario.</p>
        </>
      )}

      {!turno && alerta && (
        <>
          <h3 style={{ marginTop: 0 }}>Elegí cuándo vas a {alerta.institucion.nombre}</h3>
          <p className="texto-suave">
            Gracias por aceptar. Elegí un horario antes del {fechaLegible(alerta.necesidad.fechaLimite)}: así el hospital sabe que vas.
          </p>

          {franjas.length === 0 && (
            <p className="texto-suave">Todavía no hay horarios disponibles. Volvé a mirar más tarde.</p>
          )}

          <div className="necesidades-lista">
            {franjas.map((franja) => (
              <article key={franja.idFranjaHoraria} className="necesidad-tarjeta">
                <div className="necesidad-cabecera">
                  <div className="necesidad-datos">
                    <strong>{fechaLegible(franja.fecha)} · {franja.horaInicio} a {franja.horaFin}</strong>
                    <small>Quedan {franja.cupoLibre} lugares</small>
                  </div>
                  <button type="button" className="btn btn-primary btn-chico" onClick={() => reservar(franja.idFranjaHoraria)} disabled={ocupado}>
                    Reservar
                  </button>
                </div>
              </article>
            ))}
          </div>
        </>
      )}
    </section>
  )
}
