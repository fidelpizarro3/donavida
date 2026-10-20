import { useEffect, useRef } from 'react'

const DURACION_MS = 5000

// Aviso de "salió bien" que aparece abajo a la derecha y se va solo a los 5 segundos.
// Reemplaza al cartel verde fijo: no corre la pantalla ni hay que cerrarlo a mano.
// Se usa así: <AvisoFlotante mensaje={mensaje} onCerrar={() => setMensaje(null)} />
export function AvisoFlotante({ mensaje, onCerrar }) {
  // onCerrar es una función nueva en cada dibujo de la pantalla: se guarda aparte
  // para que el temporizador arranque una sola vez por mensaje
  const cerrar = useRef(onCerrar)
  useEffect(() => {
    cerrar.current = onCerrar
  })

  useEffect(() => {
    if (!mensaje) return undefined
    const temporizador = setTimeout(() => cerrar.current(), DURACION_MS)
    return () => clearTimeout(temporizador)
  }, [mensaje])

  if (!mensaje) return null
  return (
    <div className="toast" role="status" key={mensaje}>
      <span className="toast-icono" aria-hidden="true">✓</span>
      <span>{mensaje}</span>
      <button type="button" className="toast-cerrar" onClick={() => cerrar.current()} aria-label="Cerrar aviso">×</button>
    </div>
  )
}
