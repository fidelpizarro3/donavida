import { useState, useEffect, useCallback } from 'react'
import { fechaLarga, hoy, sumarDias, ESTADOS_TURNO, RESULTADOS_DONACION } from './textos'
import { grupoConFactor } from '../necesidades/textos'
import { AvisoFlotante } from '../comunes/AvisoFlotante'
import { Esqueleto } from '../comunes/Esqueleto'

// DV-11 en el front, lado del hospital: los turnos del día y qué pasó con cada uno.
// Al marcar "Donó", la unidad entra sola al stock y el donante arranca su período de espera.
export function TurnosDelDia({ token, apiUrl }) {
  const [fecha, setFecha] = useState(hoy)
  const [turnos, setTurnos] = useState([])
  const [cargando, setCargando] = useState(true)
  const [ocupado, setOcupado] = useState(false)
  const [mensaje, setMensaje] = useState(null)
  const [error, setError] = useState(null)
  const [version, setVersion] = useState(0)
  // El turno que se está registrando como "Donó" (abre el detalle con el componente y el grupo)
  const [registrando, setRegistrando] = useState(null)
  const [detalle, setDetalle] = useState({ componente: 'globulos_rojos', grupoSanguineo: 'O', factorRh: 'positivo' })

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
    pedir(`/api/turnos?fecha=${fecha}`)
      .then((datos) => { if (activo) setTurnos(datos) })
      .catch((err) => { if (activo) setError(err.message) })
      .finally(() => { if (activo) setCargando(false) })
    return () => {
      activo = false
    }
  }, [pedir, fecha, version])

  const cambiarDia = (nuevaFecha) => {
    setCargando(true)
    setRegistrando(null)
    setFecha(nuevaFecha)
  }

  const registrar = async (turno, resultado, extra = {}) => {
    setOcupado(true)
    setMensaje(null)
    setError(null)
    try {
      const datos = await pedir('/api/donaciones', {
        method: 'POST',
        body: JSON.stringify({ idTurno: turno.idTurno, resultado, ...extra }),
      })
      const nombre = `${turno.donante.nombre} ${turno.donante.apellido}`
      setMensaje({
        realizada: `¡Gracias, ${nombre}! La unidad ${datos.unidad?.codigo} ya está en el stock. Puede volver a donar desde el ${datos.aptoDesde}.`,
        rechazada: `Quedó registrado que ${nombre} no pasó el control médico.`,
        ausente: `Quedó registrado que ${nombre} no vino (sin penalización).`,
      }[resultado])
      setRegistrando(null)
      setVersion((v) => v + 1)
    } catch (err) {
      setError(err.message)
    } finally {
      setOcupado(false)
    }
  }

  const abrirRegistro = (turno) => {
    setDetalle({
      componente: 'globulos_rojos',
      grupoSanguineo: turno.donante.grupoSanguineo || 'O',
      factorRh: turno.donante.factorRh || 'positivo',
    })
    setRegistrando(turno.idTurno)
  }

  const cambiarDetalle = (e) => setDetalle((prev) => ({ ...prev, [e.target.name]: e.target.value }))
  const esHoyOAntes = fecha <= hoy()
  const pendientes = turnos.filter((t) => t.estado === 'reservado').length

  return (
    <section className="card">
      <div className="card-title">
        <div>
          <h3 style={{ margin: 0 }}>Turnos y donaciones</h3>
          <small className="texto-suave">El día del turno, marcá qué pasó con cada persona.</small>
        </div>
        {pendientes > 0 && <span className="badge badge-urgente">{pendientes} por registrar</span>}
      </div>

      <div className="selector-dia">
        <button type="button" className="btn btn-secondary btn-chico" onClick={() => cambiarDia(sumarDias(fecha, -1))} aria-label="Día anterior">‹</button>
        <strong>{fecha === hoy() ? 'Hoy, ' : ''}{fechaLarga(fecha)}</strong>
        <button type="button" className="btn btn-secondary btn-chico" onClick={() => cambiarDia(sumarDias(fecha, 1))} aria-label="Día siguiente">›</button>
        {fecha !== hoy() && <button type="button" className="btn-link" onClick={() => cambiarDia(hoy())}>Volver a hoy</button>}
      </div>

      <AvisoFlotante mensaje={mensaje} onCerrar={() => setMensaje(null)} />
      {error && <div className="alert alert-danger">{error}</div>}
      {cargando && <Esqueleto />}
      {!cargando && turnos.length === 0 && (
        <div className="vacio">
          <span aria-hidden="true">🩸</span>
          <p>No hay turnos reservados para este día.</p>
        </div>
      )}

      <div className="necesidades-lista">
        {turnos.map((turno) => {
          const { donante } = turno
          const resultado = RESULTADOS_DONACION[turno.resultadoDonacion]
          const estado = resultado ?? ESTADOS_TURNO[turno.estado]
          return (
            <article key={turno.idTurno} className={`necesidad-tarjeta ${turno.estado === 'reservado' ? '' : 'necesidad-cerrada'}`}>
              <div className="necesidad-cabecera">
                <span className={`grupo-chip grupo-chip-chico ${donante.grupoSanguineo ? '' : 'grupo-chip-vacio'}`}>
                  {donante.grupoSanguineo ? grupoConFactor(donante.grupoSanguineo, donante.factorRh) : '?'}
                </span>
                <div className="necesidad-datos">
                  <strong>{donante.nombre} {donante.apellido}</strong>
                  <small>DNI {donante.documento} · de {turno.horaInicio} a {turno.horaFin}</small>
                </div>
                <span className={`badge ${estado.clase}`}>{estado.texto}</span>
              </div>

              {turno.estado === 'reservado' && esHoyOAntes && registrando !== turno.idTurno && (
                <div className="necesidad-acciones">
                  <button type="button" className="btn btn-primary btn-chico" onClick={() => abrirRegistro(turno)} disabled={ocupado}>
                    ✓ Donó
                  </button>
                  <button type="button" className="btn btn-secondary btn-chico" onClick={() => registrar(turno, 'rechazada')} disabled={ocupado}>
                    No apto en el control
                  </button>
                  <button type="button" className="btn btn-secondary btn-chico" onClick={() => registrar(turno, 'ausente')} disabled={ocupado}>
                    No vino
                  </button>
                </div>
              )}
              {turno.estado === 'reservado' && !esHoyOAntes && (
                <p className="texto-suave" style={{ margin: '0.75rem 0 0' }}>Se registra el día del turno.</p>
              )}

              {registrando === turno.idTurno && (
                <div className="registro-donacion">
                  <div className="form-group">
                    <label htmlFor={`comp-${turno.idTurno}`}>Qué se obtuvo</label>
                    <select id={`comp-${turno.idTurno}`} name="componente" value={detalle.componente} onChange={cambiarDetalle}>
                      <option value="globulos_rojos">Glóbulos rojos (vence en 42 días)</option>
                      <option value="plaquetas">Plaquetas (vence en 5 días)</option>
                    </select>
                  </div>
                  {/* Criterio: si el grupo no estaba cargado, se completa acá */}
                  {!donante.grupoSanguineo && (
                    <div className="form-group">
                      <label>Grupo confirmado en el análisis</label>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <select name="grupoSanguineo" value={detalle.grupoSanguineo} onChange={cambiarDetalle} aria-label="Grupo">
                          {['O', 'A', 'B', 'AB'].map((g) => <option key={g} value={g}>{g}</option>)}
                        </select>
                        <select name="factorRh" value={detalle.factorRh} onChange={cambiarDetalle} aria-label="Factor">
                          <option value="positivo">+</option>
                          <option value="negativo">−</option>
                        </select>
                      </div>
                    </div>
                  )}
                  <div className="necesidad-acciones" style={{ marginTop: 0 }}>
                    <button
                      type="button"
                      className="btn btn-primary btn-chico"
                      disabled={ocupado}
                      onClick={() => registrar(turno, 'realizada', {
                        componente: detalle.componente,
                        ...(!donante.grupoSanguineo && { grupoSanguineo: detalle.grupoSanguineo, factorRh: detalle.factorRh }),
                      })}
                    >
                      Registrar donación
                    </button>
                    <button type="button" className="btn btn-secondary btn-chico" onClick={() => setRegistrando(null)} disabled={ocupado}>
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
            </article>
          )
        })}
      </div>
    </section>
  )
}
