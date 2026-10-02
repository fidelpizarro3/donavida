import { useState } from 'react'

export function RegistroDonante({ onRegistroExitoso, onIrALogin, apiUrl }) {
  const [formData, setFormData] = useState({
    nombre: '',
    apellido: '',
    email: '',
    password: '',
    documento: '',
    fechaNacimiento: '',
    sexo: 'femenino',
    sabeGrupo: false, // Criterio 1: control explícito
    grupoSanguineo: 'O',
    factorRh: 'positivo',
    contactoHoraDesde: '09:00', // Criterio 2: horarios preferidos
    contactoHoraHasta: '18:00',
  })
  const [error, setError] = useState(null)
  const [cargando, setCargando] = useState(false)

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    setCargando(true)

    // Criterio 1: Si no sabe su grupo, se envía null
    const payload = {
      rol: 'donante',
      nombre: formData.nombre,
      apellido: formData.apellido,
      email: formData.email,
      password: formData.password,
      documento: formData.documento,
      fechaNacimiento: formData.fechaNacimiento,
      sexo: formData.sexo,
      grupoSanguineo: formData.sabeGrupo ? formData.grupoSanguineo : null,
      factorRh: formData.sabeGrupo ? formData.factorRh : null,
      contactoHoraDesde: formData.contactoHoraDesde || null,
      contactoHoraHasta: formData.contactoHoraHasta || null,
    }

    try {
      const res = await fetch(`${apiUrl}/api/auth/registro`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error?.mensaje || 'Error al registrar donante')
      }

      onRegistroExitoso(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setCargando(false)
    }
  }

  return (
    <div className="card">
      <h2 className="card-title">
        <span>Registro de Donante</span>
      </h2>

      {error && <div className="alert alert-danger">{error}</div>}

      <form onSubmit={handleSubmit}>
        <div className="form-grid">
          <div className="form-group">
            <label htmlFor="reg-nombre">Nombre *</label>
            <input
              id="reg-nombre"
              name="nombre"
              type="text"
              required
              value={formData.nombre}
              onChange={handleChange}
              placeholder="Juan"
            />
          </div>

          <div className="form-group">
            <label htmlFor="reg-apellido">Apellido *</label>
            <input
              id="reg-apellido"
              name="apellido"
              type="text"
              required
              value={formData.apellido}
              onChange={handleChange}
              placeholder="Pérez"
            />
          </div>

          <div className="form-group">
            <label htmlFor="reg-email">Correo Electrónico *</label>
            <input
              id="reg-email"
              name="email"
              type="email"
              required
              value={formData.email}
              onChange={handleChange}
              placeholder="juan@ejemplo.com"
            />
          </div>

          <div className="form-group">
            <label htmlFor="reg-password">Contraseña *</label>
            <input
              id="reg-password"
              name="password"
              type="password"
              required
              minLength={8}
              value={formData.password}
              onChange={handleChange}
              placeholder="Mínimo 8 caracteres"
            />
          </div>

          <div className="form-group">
            <label htmlFor="reg-doc">Documento (DNI) *</label>
            <input
              id="reg-doc"
              name="documento"
              type="text"
              required
              value={formData.documento}
              onChange={handleChange}
              placeholder="38123456"
            />
          </div>

          <div className="form-group">
            <label htmlFor="reg-fnac">Fecha de Nacimiento *</label>
            <input
              id="reg-fnac"
              name="fechaNacimiento"
              type="date"
              required
              value={formData.fechaNacimiento}
              onChange={handleChange}
            />
          </div>

          <div className="form-group">
            <label htmlFor="reg-sexo">Sexo *</label>
            <select
              id="reg-sexo"
              name="sexo"
              value={formData.sexo}
              onChange={handleChange}
            >
              <option value="femenino">Femenino</option>
              <option value="masculino">Masculino</option>
              <option value="x">X</option>
            </select>
          </div>

          {/* Criterio 1: Registro sin saber grupo sanguíneo */}
          <div className="form-group full-width" style={{ marginTop: '0.5rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
              <input
                type="checkbox"
                name="sabeGrupo"
                checked={formData.sabeGrupo}
                onChange={handleChange}
              />
              <span>Conozco mi grupo sanguíneo y factor Rh</span>
            </label>
            {!formData.sabeGrupo && (
              <small style={{ color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                ℹ️ Si no conocés tu grupo, podés registrarte igual: se completará automáticamente en tu 1ra donación.
              </small>
            )}
          </div>

          {formData.sabeGrupo && (
            <>
              <div className="form-group">
                <label htmlFor="reg-grupo">Grupo Sanguíneo</label>
                <select
                  id="reg-grupo"
                  name="grupoSanguineo"
                  value={formData.grupoSanguineo}
                  onChange={handleChange}
                >
                  <option value="O">O</option>
                  <option value="A">A</option>
                  <option value="B">B</option>
                  <option value="AB">AB</option>
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="reg-factor">Factor Rh</label>
                <select
                  id="reg-factor"
                  name="factorRh"
                  value={formData.factorRh}
                  onChange={handleChange}
                >
                  <option value="positivo">Positivo (+)</option>
                  <option value="negativo">Negativo (-)</option>
                </select>
              </div>
            </>
          )}

          {/* Criterio 2: Horarios preferidos de contacto */}
          <div className="form-group full-width" style={{ marginTop: '0.5rem' }}>
            <strong>Horarios preferidos de contacto (opcional)</strong>
            <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem' }}>
              <div style={{ flex: 1 }}>
                <label htmlFor="reg-hdesde">Desde</label>
                <input
                  id="reg-hdesde"
                  name="contactoHoraDesde"
                  type="time"
                  value={formData.contactoHoraDesde}
                  onChange={handleChange}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label htmlFor="reg-hhasta">Hasta</label>
                <input
                  id="reg-hhasta"
                  name="contactoHoraHasta"
                  type="time"
                  value={formData.contactoHoraHasta}
                  onChange={handleChange}
                />
              </div>
            </div>
          </div>
        </div>

        <div style={{ marginTop: '1.5rem', display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <button type="submit" className="btn btn-primary" disabled={cargando}>
            {cargando ? 'Registrando...' : 'Completar Registro'}
          </button>
          <button type="button" className="btn btn-secondary" onClick={onIrALogin}>
            Ya tengo cuenta (Iniciar sesión)
          </button>
        </div>
      </form>
    </div>
  )
}
