import { useState, useEffect } from 'react'
import { RegistroDonante } from './components/RegistroDonante'
import { VerificarEmail } from './components/VerificarEmail'
import { Login } from './components/Login'
import { PerfilDonante } from './components/PerfilDonante'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'

export default function App() {
  const [token, setToken] = useState(() => localStorage.getItem('donavida_token') || '')
  const [usuario, setUsuario] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('donavida_usuario') || 'null')
    } catch {
      return null
    }
  })
  const [vista, setVista] = useState(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('token')) return 'verificar'
    return localStorage.getItem('donavida_token') ? 'perfil' : 'registro'
  })
  // Token del enlace de activación que llega por correo (?token=...)
  const [tokenVerificacion] = useState(() => new URLSearchParams(window.location.search).get('token') || '')
  const [emailTemporal, setEmailTemporal] = useState('')
  const [mensajeRegistro, setMensajeRegistro] = useState('')
  const [estadoApi, setEstadoApi] = useState('verificando...')

  useEffect(() => {
    fetch(`${API_URL}/api/health`)
      .then((res) => res.json())
      .then((data) => setEstadoApi(data.ok ? 'conectada' : 'error'))
      .catch(() => setEstadoApi('desconectada'))
  }, [])

  const handleRegistroExitoso = (data) => {
    setEmailTemporal(data.email || '')
    setMensajeRegistro(data.mensaje || '')
    setVista('verificar')
  }

  const handleLoginExitoso = (data) => {
    localStorage.setItem('donavida_token', data.token)
    localStorage.setItem('donavida_usuario', JSON.stringify(data.usuario))
    setToken(data.token)
    setUsuario(data.usuario)
    setVista('perfil')
  }

  const handleCerrarSesion = () => {
    localStorage.removeItem('donavida_token')
    localStorage.removeItem('donavida_usuario')
    setToken('')
    setUsuario(null)
    setVista('login')
  }

  const handleIrAVerificar = (email = '') => {
    setEmailTemporal(email)
    setVista('verificar')
  }

  const esDonante = !usuario || usuario.rol === 'donante'

  return (
    <div>
      <header>
        <div className="brand">
          <span className="brand-icon">🩸</span>
          <span>DonaVida</span>
        </div>
        <div>
          <small style={{ color: 'var(--text-muted)' }}>
            API: <strong style={{ color: estadoApi === 'conectada' ? 'var(--success)' : 'var(--danger)' }}>{estadoApi}</strong>
          </small>
        </div>
      </header>

      <main className="container">
        {!token && (
          <nav className="nav-tabs">
            <button
              type="button"
              className={`tab-btn ${vista === 'registro' ? 'active' : ''}`}
              onClick={() => setVista('registro')}
            >
              Registro Donante
            </button>
            <button
              type="button"
              className={`tab-btn ${vista === 'verificar' ? 'active' : ''}`}
              onClick={() => setVista('verificar')}
            >
              Verificar Email
            </button>
            <button
              type="button"
              className={`tab-btn ${vista === 'login' ? 'active' : ''}`}
              onClick={() => setVista('login')}
            >
              Iniciar Sesión
            </button>
          </nav>
        )}

        {vista === 'registro' && (
          <RegistroDonante
            onRegistroExitoso={handleRegistroExitoso}
            onIrALogin={() => setVista('login')}
            apiUrl={API_URL}
          />
        )}

        {vista === 'verificar' && (
          <VerificarEmail
            tokenInicial={tokenVerificacion}
            email={emailTemporal}
            mensajeInicial={mensajeRegistro}
            onIrALogin={() => setVista('login')}
            apiUrl={API_URL}
          />
        )}

        {vista === 'login' && (
          <Login
            onLoginExitoso={handleLoginExitoso}
            onIrARegistro={() => setVista('registro')}
            onIrAVerificar={handleIrAVerificar}
            apiUrl={API_URL}
          />
        )}

        {vista === 'perfil' && token && esDonante && (
          <PerfilDonante
            token={token}
            onCerrarSesion={handleCerrarSesion}
            apiUrl={API_URL}
          />
        )}

        {vista === 'perfil' && token && !esDonante && (
          <div className="card">
            <h2>Panel de Donante</h2>
            <div className="alert alert-warning">
              Has iniciado sesión como <strong>{usuario.rol}</strong> ({usuario.email}).
              Este módulo está destinado exclusivamente a la gestión de donantes de sangre.
            </div>
            <button type="button" className="btn btn-secondary" onClick={handleCerrarSesion}>
              Cerrar Sesión
            </button>
          </div>
        )}
      </main>
    </div>
  )
}
