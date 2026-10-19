// TAREA-8: distancia en km entre dos puntos (latitud/longitud), con la fórmula de Haversine.
// Tiene en cuenta que la Tierra es redonda. Es distancia "en línea recta", no por calles.
const RADIO_TIERRA_KM = 6371;

const aRadianes = (grados) => (grados * Math.PI) / 180;

function distanciaKm(lat1, lon1, lat2, lon2) {
  const dLat = aRadianes(lat2 - lat1);
  const dLon = aRadianes(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(aRadianes(lat1)) * Math.cos(aRadianes(lat2)) * Math.sin(dLon / 2) ** 2;
  const km = 2 * RADIO_TIERRA_KM * Math.asin(Math.sqrt(a));
  return Math.round(km * 100) / 100; // 2 decimales, como la columna alerta.distancia_km
}

module.exports = { distanciaKm };
