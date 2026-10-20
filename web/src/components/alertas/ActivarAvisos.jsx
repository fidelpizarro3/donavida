import { useState } from 'react'

// La clave pública llega como texto base64-url y el navegador la pide como bytes
function claveABytes(base64) {
  const relleno = '='.repeat((4 - (base64.length % 4)) % 4)
  const texto = atob((base64 + relleno).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(texto, (c) => c.charCodeAt(0))
}

const SOPORTA_PUSH = typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window

// TAREA-11: pide permiso para notificaciones y guarda la suscripción del navegador en la API.
// Con eso las alertas urgentes llegan al celular aunque DonaVida esté cerrada.
export function ActivarAvisos({ token, apiUrl }) {
  const [estado, setEstado] = useState(() => {
    if (!SOPORTA_PUSH) return 'no-soportado'
    if (Notification.permission === 'denied') return 'bloqueado'
    return 'inicial'
  })
  const [error, setError] = useState(null)

  const activar = async () => {
    setEstado('activando')
    setError(null)
    try {
      const permiso = await Notification.requestPermission()
      if (permiso !== 'granted') {
        setEstado('bloqueado')
        return
      }

      const resClave = await fetch(`${apiUrl}/api/push/clave-publica`)
      const { clavePublica, error: errorClave } = await resClave.json()
      if (!resClave.ok) throw new Error(errorClave?.mensaje || 'No se pudo activar')

      const registro = await navigator.serviceWorker.ready
      const suscripcion =
        (await registro.pushManager.getSubscription()) ||
        (await registro.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: claveABytes(clavePublica) }))

      const res = await fetch(`${apiUrl}/api/push/suscripcion`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(suscripcion.toJSON()),
      })
      if (!res.ok) throw new Error((await res.json()).error?.mensaje || 'No se pudo activar')
      setEstado('activado')
    } catch (err) {
      setError(err.message)
      setEstado('inicial')
    }
  }

  if (estado === 'no-soportado') {
    return <p className="texto-suave">Este navegador no permite avisos al celular: te vamos a escribir por correo.</p>
  }

  return (
    <div className="avisos-push">
      {estado === 'activado' && <span className="badge badge-success">Avisos al celular activados</span>}
      {estado === 'bloqueado' && (
        <p className="texto-suave">Bloqueaste las notificaciones: habilitalas desde la configuración del navegador.</p>
      )}
      {(estado === 'inicial' || estado === 'activando') && (
        <>
          <p className="texto-suave">Activá los avisos para enterarte de los casos urgentes aunque no tengas DonaVida abierta.</p>
          <button type="button" className="btn btn-primary btn-chico" onClick={activar} disabled={estado === 'activando'}>
            {estado === 'activando' ? 'Activando...' : 'Activar avisos al celular'}
          </button>
        </>
      )}
      {error && <div className="alert alert-danger">{error}</div>}
    </div>
  )
}
