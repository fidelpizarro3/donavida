// TAREA-18: dibujar y leer códigos QR. Las dos librerías se usan solo desde acá
import QRCode from 'qrcode'
import jsQR from 'jsqr'

// El QR del texto como imagen (data URL PNG). Funciona sin conexión: la librería viene con la app
export function dibujarQr(texto) {
  return QRCode.toDataURL(texto, {
    width: 260,
    margin: 2,
    errorCorrectionLevel: 'M',
    color: { dark: '#1f1a1a', light: '#ffffff' },
  })
}

// Busca un QR en los píxeles de una imagen (los de un canvas) y devuelve su texto, o null si no hay
export function leerQr(imagen) {
  return jsQR(imagen.data, imagen.width, imagen.height)?.data ?? null
}

// Lee el QR de una imagen pegada (Ctrl+V) o elegida. Devuelve su texto, o null si no encuentra ninguno
export async function leerQrDeArchivo(archivo) {
  const imagen = await createImageBitmap(archivo)
  const canvas = document.createElement('canvas')
  canvas.width = imagen.width
  canvas.height = imagen.height
  const contexto = canvas.getContext('2d', { willReadFrequently: true })
  contexto.drawImage(imagen, 0, 0)
  imagen.close?.()
  return leerQr(contexto.getImageData(0, 0, canvas.width, canvas.height))
}

// Lee el QR del cuadro actual de un <video> (la cámara). Devuelve su texto, o null.
// Achica el cuadro a 640 px de ancho como mucho: alcanza para leer y no recarga la computadora
export function leerQrDeVideo(video, canvas) {
  if (video.readyState < 2 || !video.videoWidth) return null
  const escala = Math.min(1, 640 / video.videoWidth)
  canvas.width = Math.round(video.videoWidth * escala)
  canvas.height = Math.round(video.videoHeight * escala)
  const contexto = canvas.getContext('2d', { willReadFrequently: true })
  contexto.drawImage(video, 0, 0, canvas.width, canvas.height)
  return leerQr(contexto.getImageData(0, 0, canvas.width, canvas.height))
}
