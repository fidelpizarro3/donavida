import { useState, useEffect, useRef } from 'react'

// El token de activación llega de dos formas:
// - por el enlace del correo, que abre la app con ?token=... (tokenInicial + activarAlCargar):
//   la cuenta se activa sola, sin apretar nada
// - en modo desarrollo (VERIFICACION_SIN_CORREO=true), en la respuesta del registro o del reenvío
// Sin token, la pantalla avisa que revise el correo y permite pedir un enlace nuevo.
export function VerificarEmail({ tokenInicial = '', activarAlCargar = false, email = '', mensajeInicial = '', onIrALogin, apiUrl }) {
  const [token, setToken] = useState(tokenInicial)
  // En desarrollo React ejecuta los efectos dos veces: esto evita activar la cuenta dos veces
  const activacionPedida = useRef(false)
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
      return data
    } catch (err) {
      setError(err.message)
      return null
    } finally {
      setCargando(false)
    }
  }

  const handleVerificar = async () => {
    if (await enviar('/api/auth/verificar-email', { token }, 'Error al verificar el correo')) {
      setVerificado(true)
      // Saca el token de la barra de direcciones
      window.history.replaceState(null, '', window.location.pathname)
    }
  }

  useEffect(() => {
    if (activarAlCargar && tokenInicial && !activacionPedida.current) {
      activacionPedida.current = true
      handleVerificar()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al abrir el enlace
  }, [])

  const handleReenviar = async (e) => {
    e.preventDefault()
    const data = await enviar('/api/auth/reenviar-verificacion', { email: emailReenvio.trim() }, 'Error al reenviar el enlace')
    if (data?.tokenVerificacion) setToken(data.tokenVerificacion)
  }

  if (verificado) {
    return (
      <div className="card card-centrada">
        <div className="icono-estado icono-exito" aria-hidden="true">✓</div>
        <h2>¡Cuenta activada!</h2>
        <p className="texto-suave">Ya podés iniciar sesión y completar tu perfil de donante.</p>
        <button type="button" className="btn btn-primary btn-grande" onClick={() => onIrALogin(email)}>
          Iniciar sesión
        </button>
      </div>
    )
  }

  return (
    <div className="card card-centrada">
      <div className="icono-estado" aria-hidden="true">✉</div>
      <h2>Activá tu cuenta</h2>

      {error && <div className="alert alert-danger">{error}</div>}

      {token ? (
        <>
          <p className="texto-suave">
            {email
              ? <>Tu cuenta <strong>{email}</strong> está creada. Falta un solo paso para poder iniciar sesión.</>
              : 'Falta un solo paso para poder iniciar sesión.'}
          </p>
          <button type="button" className="btn btn-primary btn-grande" onClick={handleVerificar} disabled={cargando}>
            {cargando ? 'Activando...' : 'Activar mi cuenta'}
          </button>
        </>
      ) : (
        <>
          {mensajeExito && <div className="alert alert-success">{mensajeExito}</div>}
          <p className="texto-suave">
            {mensajeInicial || (email
              ? <>Te enviamos un enlace de activación a <strong>{email}</strong>. Abrilo desde tu correo.</>
              : 'Te enviamos un enlace de activación por correo. Abrilo para activar tu cuenta.')}
          </p>

          <form onSubmit={handleReenviar} className="form-reenvio">
            <div className="form-group">
              <label htmlFor="reenvio-email">¿No te llegó o venció? Pedí uno nuevo</label>
              <input
                id="reenvio-email"
                type="email"
                required
                placeholder="tu@correo.com"
                value={emailReenvio}
                onChange={(e) => setEmailReenvio(e.target.value)}
              />
            </div>
            <button type="submit" className="btn btn-secondary" disabled={cargando || !emailReenvio.trim()}>
              {cargando ? 'Enviando...' : 'Reenviar enlace'}
            </button>
          </form>
        </>
      )}

      <button type="button" className="btn-link" onClick={() => onIrALogin(email)}>
        Volver a iniciar sesión
      </button>
    </div>
  )
}
