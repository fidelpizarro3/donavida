// TAREA-18: la tarjeta para compartir cuántas veces donó.
// Criterio: sin datos personales sensibles. Lleva solo el nombre de pila y la cantidad de donaciones:
// nada de apellido, documento, grupo sanguíneo, hospital ni fechas
import { descargarArchivo } from './textos'

const LADO = 1080 // cuadrada: entra bien en las historias y en los chats
const FUENTE = 'system-ui, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'
const NOMBRE_ARCHIVO = 'mis-donaciones-donavida.png'

// Una gota de sangre centrada en (x, y)
function dibujarGota(c, x, y, r) {
  c.beginPath()
  c.moveTo(x, y - r * 1.7)
  c.bezierCurveTo(x + r * 0.9, y - r * 0.6, x + r, y - r * 0.2, x + r, y + r * 0.25)
  c.arc(x, y + r * 0.25, r, 0, Math.PI, false)
  c.bezierCurveTo(x - r, y - r * 0.2, x - r * 0.9, y - r * 0.6, x, y - r * 1.7)
  c.closePath()
  c.fill()
}

// Dibuja la tarjeta y devuelve el canvas
export function dibujarTarjeta({ nombre, totalDonaciones }) {
  const canvas = document.createElement('canvas')
  canvas.width = LADO
  canvas.height = LADO
  const c = canvas.getContext('2d')

  // Fondo con el rojo de DonaVida
  const fondo = c.createLinearGradient(0, 0, LADO, LADO)
  fondo.addColorStop(0, '#c92a2a')
  fondo.addColorStop(1, '#7a1414')
  c.fillStyle = fondo
  c.fillRect(0, 0, LADO, LADO)
  c.fillStyle = 'rgba(255, 255, 255, 0.1)'
  dibujarGota(c, 880, 300, 210)

  c.fillStyle = '#ffffff'
  c.textBaseline = 'alphabetic'
  c.textAlign = 'left'
  c.font = `800 56px ${FUENTE}`
  c.fillText('DonaVida', 90, 140)

  c.textAlign = 'center'
  c.font = `600 64px ${FUENTE}`
  c.fillText('Ya doné sangre', LADO / 2, 400)
  c.font = `800 300px ${FUENTE}`
  c.fillText(String(totalDonaciones), LADO / 2, 690)
  c.font = `600 64px ${FUENTE}`
  c.fillText(totalDonaciones === 1 ? 'vez' : 'veces', LADO / 2, 780)

  c.globalAlpha = 0.9
  c.font = `400 40px ${FUENTE}`
  c.fillText('Cada donación puede ayudar hasta a 3 personas', LADO / 2, 880)
  c.font = `600 38px ${FUENTE}`
  c.fillText(`${nombre} · donante de DonaVida`, LADO / 2, 990)
  c.globalAlpha = 1

  return canvas
}

// ¿El navegador puede compartir imágenes con el menú del sistema (celular, Windows)?
export function puedeCompartirImagenes() {
  try {
    return Boolean(navigator.canShare?.({ files: [new File([''], NOMBRE_ARCHIVO, { type: 'image/png' })] }))
  } catch {
    return false
  }
}

const aBlob = (canvas) => new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))

// Comparte la tarjeta con el menú del sistema; si el navegador no puede, la descarga.
// Devuelve 'compartida', 'descargada' o 'cancelada' (cerró el menú sin elegir nada)
export async function compartirTarjeta(datos, { soloDescargar = false } = {}) {
  const blob = await aBlob(dibujarTarjeta(datos))
  if (!soloDescargar && puedeCompartirImagenes()) {
    const veces = datos.totalDonaciones === 1 ? 'vez' : 'veces'
    try {
      await navigator.share({
        files: [new File([blob], NOMBRE_ARCHIVO, { type: 'image/png' })],
        title: 'Mis donaciones',
        text: `Ya doné sangre ${datos.totalDonaciones} ${veces}. Cada donación puede ayudar hasta a 3 personas. ¡Sumate a DonaVida!`,
      })
      return 'compartida'
    } catch (err) {
      if (err.name === 'AbortError') return 'cancelada'
      // Si el sistema no pudo compartir, queda la descarga
    }
  }
  descargarArchivo(blob, NOMBRE_ARCHIVO)
  return 'descargada'
}
