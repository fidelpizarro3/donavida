import { useState } from 'react'

export function RegistroInstitucion({ onRegistroExitoso, onIrALogin, apiUrl }) {
  const [formData, setFormData] = useState({
    nombre: '',
    apellido: '',
    email: '',
    password: '',
  })
  const [error, setError] = useState(null)
  const [cargando, setCargando] = useState(false)

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    setCargando(true)

    const payload = {
      rol: 'institucion',
      nombre: formData.nombre,
      apellido: formData.apellido,
      email: formData.email,
      password: formData.password,
    }

    try {
      const res = await fetch(`${apiUrl}/api/auth/registro`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error?.mensaje || 'Error al registrar institución')
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
        <span>Registro de Institución</span>
      </h2>

      <p style={{ color: 'var(--text-muted)', marginBottom: '1rem' }}>
        Esta cuenta es para la persona responsable que va a gestionar la institución.
        Los datos del hospital o banco de sangre (nombre, dirección, tipo) se cargan en el paso siguiente.
      </p>

      {error && <div className="alert alert-danger">{error}</div>}

      <form onSubmit={handleSubmit}>
        <div className="form-grid">
          <div className="form-group">
            <label htmlFor="reg-inst-nombre">Nombre *</label>
            <input
              id="reg-inst-nombre"
              name="nombre"
              type="text"
              required
              value={formData.nombre}
              onChange={handleChange}
              placeholder="María"
            />
          </div>

          <div className="form-group">
            <label htmlFor="reg-inst-apellido">Apellido *</label>
            <input
              id="reg-inst-apellido"
              name="apellido"
              type="text"
              required
              value={formData.apellido}
              onChange={handleChange}
              placeholder="Gómez"
            />
          </div>

          <div className="form-group">
            <label htmlFor="reg-inst-email">Correo Electrónico *</label>
            <input
              id="reg-inst-email"
              name="email"
              type="email"
              required
              value={formData.email}
              onChange={handleChange}
              placeholder="responsable@hospital.com"
            />
          </div>

          <div className="form-group">
            <label htmlFor="reg-inst-password">Contraseña *</label>
            <input
              id="reg-inst-password"
              name="password"
              type="password"
              required
              minLength={8}
              value={formData.password}
              onChange={handleChange}
              placeholder="Mínimo 8 caracteres"
            />
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
