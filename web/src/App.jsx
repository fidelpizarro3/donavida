import { useState, useEffect } from 'react'
import { Inicio } from './components/Inicio'
import { Logo } from './components/Logo'
import { RegistroDonante } from './components/RegistroDonante'
import { VerificarEmail } from './components/VerificarEmail'
import { Login } from './components/Login'
import { PerfilDonante } from './components/PerfilDonante'
import { PanelInstitucion } from './components/PanelInstitucion'
import { RegistroInstitucion } from './components/instituciones/RegistroInstitucion'
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'

const PASOS_ALTA = ['Tus datos', 'Activar cuenta', 'Iniciar sesión']

// Indicador del alta: registro (0) → activación (1) → login (2)
function PasosAlta({ actual }) {
  return (
    <ol className="pasos-alta">
      {PASOS_ALTA.map((paso, i) => (
        <li key={paso} className={i < actual ? 'hecho' : i === actual ? 'actual' : ''}>
          <span className="pasos-alta-numero">{i < actual ? '✓' : i + 1}</span>
          {paso}
        </li>
      ))}
    </ol>
  )
}

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
    return localStorage.getItem('donavida_token') ? 'perfil' : 'inicio'
  })
  // Token de activación: viene del enlace del correo (?token=...) o, en modo desarrollo, de la respuesta del registro
  const [tokenVerificacion, setTokenVerificacion] = useState(
    () => new URLSearchParams(window.location.search).get('token') || ''
  )
  // Token con el que se abrió la app desde el enlace del correo: con ese, la cuenta se activa sola
  const [tokenDelEnlace] = useState(() => new URLSearchParams(window.location.search).get('token') || '')
  const [emailTemporal, setEmailTemporal] = useState('')
  const [mensajeRegistro, setMensajeRegistro] = useState('')
  // Se completa al terminar el alta, para mostrar el paso 3 en el login
  const [vieneDelAlta, setVieneDelAlta] = useState(false)
  const [estadoApi, setEstadoApi] = useState('verificando...')

  useEffect(() => {
    fetch(`${API_URL}/api/health`)
      .then((res) => res.json())
      .then((data) => setEstadoApi(data.ok ? 'conectada' : 'error'))
      .catch(() => setEstadoApi('desconectada'))
  }, [])

  const irA = (nuevaVista) => {
    setVista(nuevaVista)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleRegistroExitoso = (data) => {
    setEmailTemporal(data.email || '')
    setMensajeRegistro(data.mensaje || '')
    setTokenVerificacion(data.tokenVerificacion || '')
    irA('verificar')
  }

  const handleLoginExitoso = (data) => {
    localStorage.setItem('donavida_token', data.token)
    localStorage.setItem('donavida_usuario', JSON.stringify(data.usuario))
    setToken(data.token)
    setUsuario(data.usuario)
    setVieneDelAlta(false)
    irA('perfil')
  }

  const handleCerrarSesion = () => {
    localStorage.removeItem('donavida_token')
    localStorage.removeItem('donavida_usuario')
    setToken('')
    setUsuario(null)
    irA('inicio')
  }

  const handleIrAVerificar = (email = '') => {
    setEmailTemporal(email)
    setMensajeRegistro('')
    setTokenVerificacion('')
    irA('verificar')
  }

  const handleIrALoginDesdeAlta = (email = '') => {
    setEmailTemporal(email)
    setVieneDelAlta(true)
    irA('login')
  }

  const esDonante = !usuario || usuario.rol === 'donante'
  const enAlta = vista === 'registro' || vista === 'registro-institucion' || vista === 'verificar' || (vista === 'login' && vieneDelAlta)

  return (
    <div className="app">
      <header className="barra">
        <button type="button" className="brand" onClick={() => irA(token ? 'perfil' : 'inicio')}>
          <Logo />
          <span>DonaVida</span>
        </button>

        {!token && (
          <nav className="barra-nav">
            <button type="button" className={`nav-link ${vista === 'inicio' ? 'activo' : ''}`} onClick={() => irA('inicio')}>
              Inicio
            </button>
            <button type="button" className={`nav-link ${vista === 'login' ? 'activo' : ''}`} onClick={() => { setVieneDelAlta(false); irA('login') }}>
              Ingresar
            </button>
            <button type="button" className="btn btn-primary btn-chico" onClick={() => irA('registro')}>
              Quiero donar
            </button>
            <button type="button" className="btn btn-secondary btn-chico" onClick={() => irA('registro-institucion')}>
              Soy una institución
            </button>
          </nav>
        )}

        {token && usuario && (
          <div className="barra-usuario">
            <span className="avatar" aria-hidden="true">{usuario.nombre?.[0]?.toUpperCase()}</span>
            <span className="barra-usuario-nombre">{usuario.nombre} {usuario.apellido}</span>
          </div>
        )}
      </header>

      {vista === 'inicio' && !token && (
        <Inicio onRegistrarse={() => irA('registro')} onIngresar={() => irA('login')} />
      )}

      {vista !== 'inicio' && (
        <main className={`container ${vista === 'perfil' ? '' : 'container-angosto'}`}>
          {enAlta && <PasosAlta actual={{ registro: 0, 'registro-institucion': 0, verificar: 1, login: 2 }[vista]} />}

          {vista === 'registro' && (
            <RegistroDonante
              onRegistroExitoso={handleRegistroExitoso}
              onIrALogin={() => irA('login')}
              apiUrl={API_URL}
            />
          )}

          {vista === 'registro-institucion' && (
            <RegistroInstitucion
              onRegistroExitoso={handleRegistroExitoso}
              onIrALogin={() => irA('login')}
              apiUrl={API_URL}
            />
          )}

          {vista === 'verificar' && (
            <VerificarEmail
              tokenInicial={tokenVerificacion}
              activarAlCargar={Boolean(tokenDelEnlace) && tokenVerificacion === tokenDelEnlace}
              email={emailTemporal}
              mensajeInicial={mensajeRegistro}
              onIrALogin={handleIrALoginDesdeAlta}
              apiUrl={API_URL}
            />
          )}

          {vista === 'login' && (
            <Login
              key={emailTemporal}
              emailInicial={emailTemporal}
              onLoginExitoso={handleLoginExitoso}
              onIrARegistro={() => irA('registro')}
              onIrAVerificar={handleIrAVerificar}
              apiUrl={API_URL}
            />
          )}

          {vista === 'perfil' && token && esDonante && (
            <PerfilDonante token={token} onCerrarSesion={handleCerrarSesion} apiUrl={API_URL} />
          )}

          {vista === 'perfil' && token && usuario?.rol === 'institucion' && (
            <PanelInstitucion usuario={usuario} token={token} apiUrl={API_URL} onCerrarSesion={handleCerrarSesion} />
          )}

          {vista === 'perfil' && token && !esDonante && usuario?.rol !== 'institucion' && (
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
      )}

      <footer className="pie">
        <span>DonaVida · Grupo Código Rojo</span>
        <span className="estado-api">
          <span className={`punto ${estadoApi === 'conectada' ? 'ok' : 'error'}`} />
          API {estadoApi}
        </span>
      </footer>
    </div>
  )
}
