import { useState, useEffect } from 'react'

function obtenerFechaHoy() {
  const ahora = new Date()
  const y = ahora.getFullYear()
  const m = String(ahora.getMonth() + 1).padStart(2, '0')
  const d = String(ahora.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function PerfilDonante({ token, onCerrarSesion, apiUrl }) {
  const [perfil, setPerfil] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [guardandoHorarios, setGuardandoHorarios] = useState(false)
  const [guardandoAlertas, setGuardandoAlertas] = useState(false)
  const [mensaje, setMensaje] = useState(null)
  const [error, setError] = useState(null)

  // Estados locales editables
  const [horaDesde, setHoraDesde] = useState('')
  const [horaHasta, setHoraHasta] = useState('')
  const [fechaPausa, setFechaPausa] = useState('')

  useEffect(() => {
    let activo = true

    async function cargar() {
      setCargando(true)
      setError(null)
      try {
        const res = await fetch(`${apiUrl}/api/donantes/perfil`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        const data = await res.json()
        if (!res.ok) {
          throw new Error(data.error?.mensaje || 'Error al cargar perfil')
        }
        if (activo) {
          setPerfil(data)
          setHoraDesde(data.contactoHoraDesde || '')
          setHoraHasta(data.contactoHoraHasta || '')
        }
      } catch (err) {
        if (activo) setError(err.message)
      } finally {
        if (activo) setCargando(false)
      }
    }

    cargar()
    return () => {
      activo = false
    }
  }, [apiUrl, token])

  // Criterio 2: Elige horarios de contacto preferidos
  const handleGuardarHorarios = async (e) => {
    e.preventDefault()
    setMensaje(null)
    setError(null)
    setGuardandoHorarios(true)

    try {
      const res = await fetch(`${apiUrl}/api/donantes/perfil`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          contactoHoraDesde: horaDesde || null,
          contactoHoraHasta: horaHasta || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error?.mensaje || 'Error al guardar horarios')
      }
      setPerfil(data)
      setMensaje('Horarios de contacto preferidos actualizados con éxito.')
    } catch (err) {
      setError(err.message)
    } finally {
      setGuardandoHorarios(false)
    }
  }

  // Criterio 3: Puede pausar las alertas por un tiempo (o reanudarlas)
  const handlePausarAlertas = async (e) => {
    e.preventDefault()
    if (!fechaPausa) return
    setMensaje(null)
    setError(null)
    setGuardandoAlertas(true)

    try {
      const res = await fetch(`${apiUrl}/api/donantes/perfil`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          alertasPausadasHasta: fechaPausa,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error?.mensaje || 'Error al pausar alertas')
      }
      setPerfil(data)
      setFechaPausa('')
      setMensaje(`Alertas pausadas con éxito hasta el ${data.alertasPausadasHasta}.`)
    } catch (err) {
      setError(err.message)
    } finally {
      setGuardandoAlertas(false)
    }
  }

  const handleReanudarAlertas = async () => {
    setMensaje(null)
    setError(null)
    setGuardandoAlertas(true)

    try {
      const res = await fetch(`${apiUrl}/api/donantes/perfil`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          alertasPausadasHasta: null,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error?.mensaje || 'Error al reanudar alertas')
      }
      setPerfil(data)
      setMensaje('Alertas reactivadas. Volverás a recibir convocatorias normalmente.')
    } catch (err) {
      setError(err.message)
    } finally {
      setGuardandoAlertas(false)
    }
  }

  if (cargando) {
    return <div className="card"><p>Cargando perfil del donante...</p></div>
  }

  if (error && !perfil) {
    return (
      <div className="card">
        <div className="alert alert-danger">{error}</div>
        <button type="button" className="btn btn-secondary" onClick={onCerrarSesion}>
          Cerrar Sesión
        </button>
      </div>
    )
  }

  const hoy = obtenerFechaHoy()
  const alertasPausadas = Boolean(perfil?.alertasPausadasHasta && perfil.alertasPausadasHasta >= hoy)

  return (
    <div>
      {mensaje && <div className="alert alert-success">{mensaje}</div>}
      {error && <div className="alert alert-danger">{error}</div>}

      {/* Tarjeta de Datos Personales */}
      <div className="card">
        <div className="card-title">
          <div>
            <h2 style={{ margin: 0 }}>{perfil.nombre} {perfil.apellido}</h2>
            <small style={{ color: 'var(--text-muted)' }}>{perfil.email}</small>
          </div>
          <button type="button" className="btn btn-secondary" onClick={onCerrarSesion}>
            Cerrar Sesión
          </button>
        </div>

        <div className="form-grid" style={{ marginTop: '1rem' }}>
          <div>
            <label>Documento (DNI)</label>
            <div><strong>{perfil.documento}</strong></div>
          </div>
          <div>
            <label>Fecha de Nacimiento</label>
            <div><strong>{perfil.fechaNacimiento}</strong></div>
          </div>
          <div>
            <label>Sexo</label>
            <div><strong style={{ textTransform: 'capitalize' }}>{perfil.sexo}</strong></div>
          </div>

          {/* Criterio 1: Visualización del grupo sanguíneo */}
          <div>
            <label>Grupo y Factor Sanguíneo</label>
            <div style={{ marginTop: '0.25rem' }}>
              {perfil.grupoSanguineo ? (
                <span className="badge badge-success" style={{ fontSize: '0.95rem' }}>
                  {perfil.grupoSanguineo} {perfil.factorRh === 'positivo' ? '(+)' : '(-)'}
                </span>
              ) : (
                <span className="badge badge-warning" style={{ fontSize: '0.85rem' }}>
                  Pendiente (se completa en tu 1ra donación)
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Criterio 2: Horarios preferidos de contacto */}
      <div className="card">
        <h3 className="card-title">
          <span>Horarios Preferidos de Contacto</span>
        </h3>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: 0 }}>
          Definí la franja horaria en la que preferís que los centros y hospitales se comuniquen con vos.
        </p>

        <form onSubmit={handleGuardarHorarios}>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label htmlFor="perfil-hdesde">Desde</label>
              <input
                id="perfil-hdesde"
                type="time"
                value={horaDesde}
                onChange={(e) => setHoraDesde(e.target.value)}
              />
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label htmlFor="perfil-hhasta">Hasta</label>
              <input
                id="perfil-hhasta"
                type="time"
                value={horaHasta}
                onChange={(e) => setHoraHasta(e.target.value)}
              />
            </div>

            <button type="submit" className="btn btn-primary" disabled={guardandoHorarios}>
              {guardandoHorarios ? 'Guardando...' : 'Guardar Horarios'}
            </button>
          </div>
        </form>
      </div>

      {/* Criterio 3: Pausar alertas por un tiempo */}
      <div className="card">
        <h3 className="card-title">
          <span>Pausa de Alertas y Convocatorias</span>
        </h3>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: 0 }}>
          Podés pausar la recepción de alertas si estás de viaje, convaleciente o temporalmente no disponible para donar.
        </p>

        {alertasPausadas ? (
          <div className="alert alert-warning" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
            <div>
              <strong>⏸️ Tus alertas están pausadas</strong> hasta el{' '}
              <strong>{perfil.alertasPausadasHasta}</strong>. Durante este período no recibirás avisos.
            </div>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleReanudarAlertas}
              disabled={guardandoAlertas}
            >
              {guardandoAlertas ? 'Reanudando...' : 'Reanudar Alertas Ahora'}
            </button>
          </div>
        ) : (
          <form onSubmit={handlePausarAlertas}>
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label htmlFor="perfil-pausa">Pausar alertas hasta</label>
                <input
                  id="perfil-pausa"
                  type="date"
                  required
                  min={hoy}
                  value={fechaPausa}
                  onChange={(e) => setFechaPausa(e.target.value)}
                />
              </div>

              <button type="submit" className="btn btn-secondary" disabled={guardandoAlertas || !fechaPausa}>
                {guardandoAlertas ? 'Guardando...' : 'Pausar Alertas'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
