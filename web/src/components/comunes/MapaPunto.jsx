import { MapContainer, TileLayer, CircleMarker, Tooltip } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'

// Mapa chico con un solo punto (por ejemplo, el hospital del turno). OpenStreetMap: gratis y sin claves.
export function MapaPunto({ latitud, longitud, nombre }) {
  if (latitud == null || longitud == null) return null
  return (
    <MapContainer center={[latitud, longitud]} zoom={15} scrollWheelZoom={false} className="mapa mapa-chico">
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <CircleMarker center={[latitud, longitud]} radius={12} pathOptions={{ color: '#fff', weight: 3, fillColor: '#c92a2a', fillOpacity: 1 }}>
        <Tooltip permanent direction="top" offset={[0, -12]}>{nombre}</Tooltip>
      </CircleMarker>
    </MapContainer>
  )
}
