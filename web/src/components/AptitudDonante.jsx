import { useState, useEffect } from 'react'

// TAREA-3: muestra si el donante puede donar hoy (o el motivo y la fecha de reingreso)
// y le deja responder el cuestionario de aptitud.

function fechaDeHoy() {
  const ahora = new Date()
  const y = ahora.getFullYear()
  const m = String(ahora.getMonth() + 1).padStart(2, '0')
  const d = String(ahora.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

// '2026-11-20' → '20/11/2026'
function fechaLegible(fecha) {
  const [anio, mes, dia] = fecha.split('-')
  return `${dia}/${mes}/${anio}`
}

// Cómo se guarda una respuesta: 'si', 'no', o la fecha del hecho en las preguntas de fecha
function respuestaLegible(valor) {
  if (valor === 'no') return 'No'
  if (valor === 'si') return 'Sí'
  return `Sí, el ${fechaLegible(valor)}`
}

async function pedir(url, token, body) {
  const res = await fetch(url, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: body && JSON.stringify(body),
  })
  const data = await res.json()
  if (!res.ok) {
    throw new Error(data.error?.mensaje || 'Ocurrió un error')
  }
  return data
}

export function AptitudDonante({ token, apiUrl, idDonante }) {
  const [habilitacion, setHabilitacion] = useState(null)
  const [preguntas, setPreguntas] = useState(null) // null = cuestionario cerrado
  const [respuestas, setRespuestas] = useState({}) // idPregunta → { opcion: 'si' | 'no', fecha }
  const [ocupado, setOcupado] = useState(false)
  const [guardado, setGuardado] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    let activo = true
    pedir(`${apiUrl}/api/donantes/${idDonante}/habilitacion`, token)
      .then((data) => { if (activo) setHabilitacion(data) })
      .catch((err) => { if (activo) setError(err.message) })
    return () => {
      activo = false
    }
  }, [apiUrl, token, idDonante])

  const abrirCuestionario = async () => {
    setError(null)
    setGuardado(false)
    setOcupado(true)
    try {
      const data = await pedir(`${apiUrl}/api/donantes/cuestionario`, token)
      setPreguntas(data.preguntas)
      setRespuestas({})
    } catch (err) {
      setError(err.message)
    } finally {
      setOcupado(false)
    }
  }

  const elegir = (idPregunta, cambios) => {
    setRespuestas((previas) => ({ ...previas, [idPregunta]: { ...previas[idPregunta], ...cambios } }))
  }

  const enviarCuestionario = async (e) => {
    e.preventDefault()
    setError(null)
    setOcupado(true)
    try {
      // Solo se envían las preguntas que había que responder: las que no cambian las conserva la API
      const body = {
        respuestas: preguntas.filter((p) => p.hayQueResponder).map((p) => {
          const elegida = respuestas[p.idPregunta] ?? {}
          const valor = p.tipo === 'fecha' && elegida.opcion === 'si' ? elegida.fecha : elegida.opcion
          return { idPregunta: p.idPregunta, valor }
        }),
      }
      setHabilitacion(await pedir(`${apiUrl}/api/donantes/cuestionario`, token, body))
      setPreguntas(null)
      setGuardado(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setOcupado(false)
    }
  }

  const hoy = fechaDeHoy()

  return (
    <div className="card">
      <h3 className="card-title">
        <span>¿Podés donar hoy?</span>
        {habilitacion && (
          <span className={`badge ${habilitacion.habilitado ? 'badge-success' : 'badge-warning'}`}>
            {habilitacion.habilitado ? 'Habilitado' : 'No habilitado'}
          </span>
        )}
      </h3>

      {guardado && <div className="alert alert-success">Guardamos tus respuestas.</div>}
      {error && <div className="alert alert-danger">{error}</div>}
      {!habilitacion && !error && <p>Consultando tu habilitación...</p>}

      {habilitacion?.habilitado && (
        <p>Según tus respuestas y tus donaciones, hoy estás en condiciones de donar sangre.</p>
      )}

      {/* Criterio: nunca un "no" sin explicación; siempre el motivo y la fecha de reingreso */}
      {habilitacion && !habilitacion.habilitado && (
        habilitacion.diferimientos.length > 0 ? (
          <>
            <p>
              {habilitacion.aptoDesde
                ? <>Hoy no podés donar. Vas a poder volver a donar desde el <strong>{fechaLegible(habilitacion.aptoDesde)}</strong>.</>
                : 'Hoy no podés donar, y por ahora no hay una fecha de reingreso.'}
            </p>
            <ul className="lista-motivos">
              {habilitacion.diferimientos.map((d) => (
                <li key={d.idDiferimiento}>
                  {d.motivo}{' '}
                  <span className="motivo-fecha">
                    {d.hasta ? `Hasta el ${fechaLegible(d.hasta)}.` : 'Sin fecha de reingreso.'}
                  </span>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p>{habilitacion.motivo}. Respondelo para saber si podés donar.</p>
        )
      )}

      {habilitacion && !preguntas && (
        <button type="button" className="btn btn-primary" onClick={abrirCuestionario} disabled={ocupado}>
          {habilitacion.cuestionarioCompleto ? 'Actualizar mis respuestas' : 'Responder el cuestionario'}
        </button>
      )}

      {preguntas && (
        <form onSubmit={enviarCuestionario}>
          {preguntas.map((p) => {
            const elegida = respuestas[p.idPregunta] ?? {}

            // Criterio: solo se repregunta lo que puede cambiar
            if (!p.hayQueResponder) {
              return (
                <div key={p.idPregunta} className="pregunta">
                  <p className="pregunta-texto">{p.texto}</p>
                  <small className="pregunta-ayuda">
                    Ya respondiste: <strong>{respuestaLegible(p.respuestaAnterior)}</strong>. No hace falta que la respondas de nuevo.
                  </small>
                </div>
              )
            }

            return (
              <div key={p.idPregunta} className="pregunta" role="group" aria-labelledby={`pregunta-${p.idPregunta}`}>
                <p className="pregunta-texto" id={`pregunta-${p.idPregunta}`}>{p.texto}</p>
                {p.respuestaAnterior && (
                  <small className="pregunta-ayuda">La última vez respondiste: {respuestaLegible(p.respuestaAnterior)}.</small>
                )}
                <div className="pregunta-opciones">
                  <label>
                    <input
                      type="radio"
                      name={p.idPregunta}
                      required
                      checked={elegida.opcion === 'no'}
                      onChange={() => elegir(p.idPregunta, { opcion: 'no' })}
                    />
                    No
                  </label>
                  <label>
                    <input
                      type="radio"
                      name={p.idPregunta}
                      required
                      checked={elegida.opcion === 'si'}
                      onChange={() => elegir(p.idPregunta, { opcion: 'si' })}
                    />
                    Sí
                  </label>
                  {p.tipo === 'fecha' && elegida.opcion === 'si' && (
                    <input
                      type="date"
                      required
                      max={hoy}
                      aria-label="Fecha"
                      value={elegida.fecha || ''}
                      onChange={(e) => elegir(p.idPregunta, { fecha: e.target.value })}
                    />
                  )}
                </div>
              </div>
            )
          })}

          <div className="pregunta-acciones">
            <button type="submit" className="btn btn-primary" disabled={ocupado}>
              {ocupado ? 'Guardando...' : 'Guardar respuestas'}
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => setPreguntas(null)} disabled={ocupado}>
              Cancelar
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
