import { useState } from 'react'

export function Login({ onLoginExitoso, onIrARegistro, onIrAVerificar, apiUrl }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [codigoError, setCodigoError] = useState(null)
  const [cargando, setCargando] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    setCodigoError(null)
    setCargando(true)

    try {
      const res = await fetch(`${apiUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      })
      const data = await res.json()

      if (!res.ok) {
        setCodigoError(data.error?.codigo)
        throw new Error(data.error?.mensaje || 'Error al iniciar sesión')
      }

      onLoginExitoso(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setCargando(false)
    }
  }

  return (
    <div className="card">
      <h2 className="card-title">
        <span>Iniciar Sesión</span>
      </h2>

      {error && (
        <div className="alert alert-danger">
          <strong>{error}</strong>
          {codigoError === 'EMAIL_NO_VERIFICADO' && (
            <div style={{ marginTop: '0.5rem' }}>
              <p style={{ margin: '0.25rem 0' }}>
                Tu cuenta todavía no fue activada porque no se validó el correo.
              </p>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ marginTop: '0.5rem' }}
                onClick={() => onIrAVerificar(email)}
              >
                Validar mi correo ahora
              </button>
            </div>
          )}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="login-email">Correo Electrónico</label>
          <input
            id="login-email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="donante@ejemplo.com"
          />
        </div>

        <div className="form-group">
          <label htmlFor="login-password">Contraseña</label>
          <input
            id="login-password"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem', alignItems: 'center' }}>
          <button type="submit" className="btn btn-primary" disabled={cargando}>
            {cargando ? 'Ingresando...' : 'Iniciar Sesión'}
          </button>
          <button type="button" className="btn btn-secondary" onClick={onIrARegistro}>
            ¿No tenés cuenta? Registrate
          </button>
        </div>
      </form>
    </div>
  )
}
