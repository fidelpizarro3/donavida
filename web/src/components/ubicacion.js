// Le pide al navegador la ubicación actual del donante (DV-2).
// La usa la convocatoria (TAREA-10) para calcular a cuántos km está del hospital.
// Devuelve { latitud, longitud } con 6 decimales (lo que guarda la base), o lanza un error con un texto claro.
export function pedirUbicacion() {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new Error('Este navegador no permite compartir la ubicación'))
      return
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => resolve({
        latitud: Number(coords.latitude.toFixed(6)),
        longitud: Number(coords.longitude.toFixed(6)),
      }),
      (err) => reject(new Error(
        err.code === err.PERMISSION_DENIED
          ? 'No diste permiso para usar tu ubicación: habilitalo desde el navegador'
          : 'No se pudo obtener tu ubicación, probá de nuevo'
      )),
      { enableHighAccuracy: false, timeout: 10000 }
    )
  })
}
