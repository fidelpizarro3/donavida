// TAREA-18: utilidades del carné del donante y del lector de QR del hospital

// Así es el código del QR de un turno: 32 caracteres hexadecimales (la API lo genera así)
export const CODIGO_QR = /^[0-9a-f]{32}$/

// Lo que escribe un lector USB, se pega o se lee de una imagen: sin espacios y en minúsculas
export function normalizarCodigo(texto) {
  return String(texto ?? '').replace(/\s/g, '').toLowerCase()
}

// "0123456789abcdef…" → "0123 4567 89ab cdef …" (se lee y se copia más fácil)
export function agruparCodigo(codigo) {
  return codigo.match(/.{1,4}/g).join(' ')
}

// El carné se guarda para verlo sin conexión, con una clave por usuario:
// así, en un celular compartido, nadie ve el carné de otra persona
const PREFIJO_CARNE = 'donavida_carne_'
export const claveCarne = (idUsuario) => `${PREFIJO_CARNE}${idUsuario}`

// Al cerrar sesión se borra la copia guardada del carné
export function borrarCarnesGuardados() {
  try {
    Object.keys(localStorage)
      .filter((clave) => clave.startsWith(PREFIJO_CARNE))
      .forEach((clave) => localStorage.removeItem(clave))
  } catch {
    // Sin acceso al almacenamiento (modo privado): no había nada guardado
  }
}

// Descarga un archivo (Blob) con ese nombre
export function descargarArchivo(blob, nombre) {
  const url = URL.createObjectURL(blob)
  const enlace = document.createElement('a')
  enlace.href = url
  enlace.download = nombre
  document.body.appendChild(enlace)
  enlace.click()
  enlace.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
