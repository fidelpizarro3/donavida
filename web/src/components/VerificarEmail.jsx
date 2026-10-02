import { useState } from 'react'

// El enlace de activación llega por correo y abre la app con ?token=... (tokenInicial).
// Sin token, la pantalla avisa que revise el correo y permite pedir un enlace nuevo.
export function VerificarEmail({ tokenInicial = '', email = '', mensajeInicial = '', onIrALogin, apiUrl }) {
  const [emailReenvio, setEmailReenvio] = useState(email)
  const [verificado, setVerificado] = useState(false)
  const [mensajeExito, setMensajeExito] = useState(null)
  const [error, setError] = useState(null)
  const [cargando, setCargando] = useState(false)

  const enviar = async (ruta, body, mensajeError) => {
    setError(null)
    setMensajeExito(null)
    setCargando(true)
    try {
      const res = await fetch(`${apiUrl}${ruta}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error?.mensaje || mensajeError)
      }
      setMensajeExito(data.mensaje)
      return true
    } catch (err) {
      setError(err.message)
      return false
    } finally {
      setCargando(false)
    }
  }

  const handleVerificar = async () => {
    if (await enviar('/api/auth/verificar-email', { token: tokenInicial }, 'Error al verificar el correo')) {
      setVerificado(true)
      // Saca el token de la barra de direcciones
      window.history.replaceState(null, '', window.location.pathname)
    }
  }

  const handleReenviar = async (e) => {
    e.preventDefault()
    await enviar('/api/auth/reenviar-verificacion', { email: emailReenvio.trim() }, 'Error al reenviar el enlace')
  }

  return (
    <div className="card">
      <h2 className="card-title">
        <span>Validación de Correo Electrónico</span>
      </h2>

      <div className="alert alert-warning">
        🔒 <strong>Activación requerida:</strong> El correo se valida antes de activar la cuenta (<code>email_verificado</code>). No podrás iniciar sesión hasta completar este paso.
      </div>

      {mensajeExito && <div className="alert alert-success">{mensajeExito}</div>}
      {error && <div className="alert alert-danger">{error}</div>}

      {tokenInicial ? (
        <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
          {!verificado && (
            <button type="button" className="btn btn-primary" onClick={handleVerificar} disabled={cargando}>
              {cargando ? 'Verificando...' : 'Activar mi cuenta'}
            </button>
          )}
          <button type="button" className={`btn ${verificado ? 'btn-primary' : 'btn-secondary'}`} onClick={onIrALogin}>
            Ir a Iniciar Sesión
          </button>
        </div>
      ) : (
        <>
          {mensajeInicial && !mensajeExito && !error && <p>{mensajeInicial}</p>}
          {email && !mensajeInicial && (
            <p>
              Te enviamos un enlace de activación a <strong>{email}</strong>. Abrilo desde tu correo para activar la cuenta.
            </p>
          )}

          <form onSubmit={handleReenviar}>
            <div className="form-group">
              <label htmlFor="reenvio-email">¿No te llegó o venció? Pedí un enlace nuevo</label>
              <input
                id="reenvio-email"
                type="email"
                required
                placeholder="tu@correo.com"
                value={emailReenvio}
                onChange={(e) => setEmailReenvio(e.target.value)}
              />
            </div>

            <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
              <button type="submit" className="btn btn-primary" disabled={cargando || !emailReenvio.trim()}>
                {cargando ? 'Enviando...' : 'Reenviar enlace'}
              </button>
              <button type="button" className="btn btn-secondary" onClick={onIrALogin}>
                Ir a Iniciar Sesión
              </button>
            </div>
          </form>
        </>
      )}
    </div>
  )
}
