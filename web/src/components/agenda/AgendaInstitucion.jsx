import { useState, useEffect, useCallback } from 'react'

// TAREA-10 en el front, lado del hospital: abrir franjas de atención y ver cuánto cupo les queda.
// Una franja es un rango de atención con capacidad ("martes 8 a 11, 12 lugares"), no un turno a minuto.
export function AgendaInstitucion({ token, apiUrl }) {
  const [franjas, setFranjas] = useState([])
  const [cargando, setCargando] = useState(true)
  const [ocupado, setOcupado] = useState(false)
  const [mensaje, setMensaje] = useState(null)
  const [error, setError] = useState(null)
  const [version, setVersion] = useState(0)
  const [formData, setFormData] = useState({ fecha: '', horaInicio: '08:00', horaFin: '11:00', cupoTotal: 10 })

  // Mismo patrón que DatosInstitucion: toda la comunicación con la API pasa por acá
  const pedir = useCallback(async (ruta, opciones = {}) => {
    const res = await fetch(`${apiUrl}/api/franjas${ruta}`, {
      ...opciones,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error?.mensaje || 'Error al comunicarse con el servidor')
    return data
  }, [apiUrl, token])

  // Trae la agenda al entrar y después de cada acción (cuando cambia "version")
  useEffect(() => {
    let activo = true
    pedir('')
      .then((datos) => { if (activo) setFranjas(datos) })
      .catch((err) => { if (activo) setError(err.message) })
      .finally(() => { if (activo) setCargando(false) })
    return () => {
      activo = false
    }
  }, [pedir, version])

  const ejecutar = async (accion, textoExito) => {
    setOcupado(true)
    setMensaje(null)
    setError(null)
    try {
      await accion()
      setMensaje(textoExito)
      setVersion((v) => v + 1)
      return true
    } catch (err) {
      setError(err.message)
      return false
    } finally {
      setOcupado(false)
    }
  }

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  const abrirFranja = async (e) => {
    e.preventDefault()
    // cupoTotal llega del input como texto: la API espera un número
    const datos = { ...formData, cupoTotal: Number(formData.cupoTotal) }
    await ejecutar(() => pedir('', { method: 'POST', body: JSON.stringify(datos) }), 'Franja abierta.')
  }

  const cerrarFranja = (idFranjaHoraria) =>
    ejecutar(() => pedir(`/${idFranjaHoraria}/cerrar`, { method: 'PATCH' }), 'Franja cerrada: ya no se ofrece a nuevos donantes.')

  return (
    <section className="card">
      <h3 style={{ margin: 0 }}>Agenda de atención</h3>
      <p className="texto-suave">
        Cargá los horarios en que recibís donantes y cuántos podés atender. Una franja llena deja de ofrecerse sola.
      </p>

      {mensaje && <div className="alert alert-success">{mensaje}</div>}
      {error && <div className="alert alert-danger">{error}</div>}

      <form onSubmit={abrirFranja}>
        <div className="form-grid">
          <div className="form-group">
            <label htmlFor="franja-fecha">Día *</label>
            <input id="franja-fecha" name="fecha" type="date" required value={formData.fecha} onChange={handleChange} />
          </div>
          <div className="form-group">
            <label htmlFor="franja-cupo">Donantes que podés recibir *</label>
            <input id="franja-cupo" name="cupoTotal" type="number" min="1" max="200" required value={formData.cupoTotal} onChange={handleChange} />
          </div>
          <div className="form-group">
            <label htmlFor="franja-desde">Desde *</label>
            <input id="franja-desde" name="horaInicio" type="time" required value={formData.horaInicio} onChange={handleChange} />
          </div>
          <div className="form-group">
            <label htmlFor="franja-hasta">Hasta *</label>
            <input id="franja-hasta" name="horaFin" type="time" required value={formData.horaFin} onChange={handleChange} />
          </div>
        </div>
        <button type="submit" className="btn btn-primary" disabled={ocupado} style={{ marginTop: '1rem' }}>
          {ocupado ? 'Guardando...' : 'Abrir franja'}
        </button>
      </form>

      <h4 style={{ marginTop: '1.5rem' }}>Próximas franjas</h4>
      {cargando && <p className="texto-suave">Cargando...</p>}
      {!cargando && franjas.length === 0 && <p className="texto-suave">Todavía no cargaste ninguna franja.</p>}

      <div className="necesidades-lista">
        {franjas.map((franja) => (
          <article key={franja.idFranjaHoraria} className={`necesidad-tarjeta ${franja.cerrada ? 'necesidad-cerrada' : ''}`}>
            <div className="necesidad-cabecera">
              <div className="necesidad-datos">
                <strong>{franja.fecha} · {franja.horaInicio} a {franja.horaFin}</strong>
                <small>{franja.cupoOcupado} de {franja.cupoTotal} lugares ocupados · quedan {franja.cupoLibre}</small>
              </div>
              {franja.cerrada && <span className="badge badge-neutro">Cerrada</span>}
              {!franja.cerrada && franja.cupoLibre === 0 && <span className="badge badge-warning">Llena</span>}
              {!franja.cerrada && franja.cupoLibre > 0 && <span className="badge badge-success">Abierta</span>}
            </div>
            {!franja.cerrada && (
              <div className="necesidad-acciones">
                <button type="button" className="btn btn-secondary btn-chico" onClick={() => cerrarFranja(franja.idFranjaHoraria)} disabled={ocupado}>
                  Cerrar franja
                </button>
              </div>
            )}
          </article>
        ))}
      </div>
    </section>
  )
}
