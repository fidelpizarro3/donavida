import { useEffect } from 'react'
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { useEnVivo } from './enVivo'
import { COMPONENTES, grupoConFactor } from '../necesidades/textos'

// Centro por defecto si todavía no hay instituciones: Neuquén
const CENTRO_POR_DEFECTO = [-38.9516, -68.0591]

// Encuadra el mapa para que entren todas las instituciones
function Encuadrar({ puntos }) {
  const mapa = useMap()
  const clave = puntos.map((p) => p.join(',')).join('|')
  useEffect(() => {
    if (puntos.length === 1) mapa.setView(puntos[0], 13)
    if (puntos.length > 1) mapa.fitBounds(puntos, { padding: [40, 40], maxZoom: 14 })
    // Solo cuando cambian los puntos, no en cada actualización en vivo
  }, [mapa, clave]) // eslint-disable-line react-hooks/exhaustive-deps
  return null
}

// Mapa de la red: cada institución aprobada es un punto.
// Rojo si tiene un pedido urgente, rosa si tiene pedidos normales, gris si está cubierta.
// Usa OpenStreetMap: es gratis y no necesita ninguna clave.
export function MapaRed({ apiUrl }) {
  const { datos: instituciones } = useEnVivo(`${apiUrl}/api/publico/instituciones`)
  const { datos: necesidades } = useEnVivo(`${apiUrl}/api/publico/necesidades`)

  const conUbicacion = (instituciones ?? []).filter((i) => i.latitud != null && i.longitud != null)
  const puntos = conUbicacion.map((i) => [i.latitud, i.longitud])

  return (
    <div className="mapa-red">
      <MapContainer center={CENTRO_POR_DEFECTO} zoom={12} scrollWheelZoom={false} className="mapa">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Encuadrar puntos={puntos} />
        {conUbicacion.map((inst) => {
          const pedidos = (necesidades ?? []).filter((n) => n.institucion.idInstitucion === inst.idInstitucion)
          const color = inst.hayUrgente ? '#c92a2a' : inst.necesidadesAbiertas > 0 ? '#ef6a6a' : '#9a8f8f'
          return (
            <CircleMarker
              key={inst.idInstitucion}
              center={[inst.latitud, inst.longitud]}
              radius={inst.hayUrgente ? 13 : 10}
              pathOptions={{ color: '#fff', weight: 3, fillColor: color, fillOpacity: 1 }}
            >
              <Popup>
                <strong>{inst.nombre}</strong>
                <br />
                <small>{inst.direccion}</small>
                {pedidos.length === 0 && <p className="mapa-popup-ok">Sin pedidos abiertos ✓</p>}
                {pedidos.map((n) => (
                  <p key={n.idNecesidad} className="mapa-popup-pedido">
                    <b>{grupoConFactor(n.grupoSanguineo, n.factorRh)}</b> {COMPONENTES[n.componente]} · faltan {n.unidadesFaltantes}
                    {n.urgencia === 'urgente' && ' · 🚨 urgente'}
                  </p>
                ))}
              </Popup>
            </CircleMarker>
          )
        })}
      </MapContainer>

      <div className="mapa-leyenda">
        <span><i style={{ background: '#c92a2a' }} /> Pedido urgente</span>
        <span><i style={{ background: '#ef6a6a' }} /> Pedido abierto</span>
        <span><i style={{ background: '#9a8f8f' }} /> Cubierto</span>
      </div>
    </div>
  )
}
