import { useState } from 'react'
import { NecesidadesInstitucion } from './necesidades/NecesidadesInstitucion'
import { DatosInstitucion } from './instituciones/DatosInstitucion'
import { StockInstitucion } from './stock/StockInstitucion'
import { AgendaInstitucion } from './agenda/AgendaInstitucion'
import { TurnosDelDia } from './agenda/TurnosDelDia'

// Panel del usuario de una institución (hospital o banco de sangre), organizado en pestañas.
// Cada funcionalidad de la institución suma acá su sección:
//   - TAREA-4 y 8: necesidades de sangre y convocatoria de donantes
//   - TAREA-10 y DV-11: agenda de atención y registro de las donaciones
//   - TAREA-6 y 7: stock de unidades
//   - TAREA-1: datos y estado de la institución
const PESTANAS = [
  { id: 'necesidades', texto: 'Necesidades', icono: '🩸' },
  { id: 'agenda', texto: 'Agenda y turnos', icono: '🗓️' },
  { id: 'stock', texto: 'Stock', icono: '📦' },
  { id: 'institucion', texto: 'Mi institución', icono: '🏥' },
]

export function PanelInstitucion({ usuario, token, apiUrl, onCerrarSesion }) {
  // La última pestaña abierta queda guardada: al recargar la página se vuelve ahí
  const [pestana, setPestana] = useState(() => {
    try {
      return localStorage.getItem('donavida_pestana') || 'necesidades'
    } catch {
      return 'necesidades'
    }
  })

  const elegir = (id) => {
    setPestana(id)
    try {
      localStorage.setItem('donavida_pestana', id)
    } catch {
      // Sin almacenamiento: solo no se recuerda la pestaña
    }
  }

  return (
    <>
      <div className="card panel-cabecera">
        <div className="card-title" style={{ marginBottom: 0 }}>
          <div>
            <h2 style={{ margin: 0 }}>Panel de la institución</h2>
            <small className="texto-suave">{usuario.nombre} {usuario.apellido} · {usuario.email}</small>
          </div>
          <button type="button" className="btn btn-secondary" onClick={onCerrarSesion}>
            Cerrar sesión
          </button>
        </div>

        <nav className="pestanas" role="tablist">
          {PESTANAS.map(({ id, texto, icono }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={pestana === id}
              className={`pestana ${pestana === id ? 'activa' : ''}`}
              onClick={() => elegir(id)}
            >
              <span aria-hidden="true">{icono}</span> {texto}
            </button>
          ))}
        </nav>
      </div>

      {pestana === 'necesidades' && <NecesidadesInstitucion token={token} apiUrl={apiUrl} />}
      {pestana === 'agenda' && (
        <>
          <TurnosDelDia token={token} apiUrl={apiUrl} />
          <AgendaInstitucion token={token} apiUrl={apiUrl} />
        </>
      )}
      {pestana === 'stock' && <StockInstitucion token={token} apiUrl={apiUrl} />}
      {pestana === 'institucion' && <DatosInstitucion token={token} apiUrl={apiUrl} />}
    </>
  )
}
