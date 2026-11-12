import { useState } from 'react'
import { NecesidadesInstitucion } from './necesidades/NecesidadesInstitucion'
import { StockInstitucion } from './stock/StockInstitucion'
import { AgendaInstitucion } from './agenda/AgendaInstitucion'
import { TurnosDelDia } from './agenda/TurnosDelDia'
import { StockDemanda } from './panel/StockDemanda'
import { TransferenciasInstitucion } from './transferencias/TransferenciasInstitucion'

// Panel del usuario de una institución (hospital o banco de sangre), organizado en pestañas.
// Cada funcionalidad de la institución suma acá su sección:
//   - TAREA-4 y 8: necesidades de sangre y convocatoria de donantes
//   - TAREA-10 y DV-11: agenda de atención y registro de las donaciones
//   - TAREA-6 y 7: stock de unidades
//   - TAREA-15: stock contra demanda
//   - TAREA-12: transferencias de unidades entre instituciones
// Los datos de la institución (TAREA-1) no son una pestaña: se abren desde "Mi institución" en la barra de arriba (App.jsx)
const PESTANAS = [
  { id: 'necesidades', texto: 'Necesidades', icono: '🩸' },
  { id: 'agenda', texto: 'Agenda y turnos', icono: '🗓️' },
  { id: 'stock', texto: 'Stock', icono: '📦' },
  { id: 'demanda', texto: 'Stock y demanda', icono: '📊' },
  { id: 'transferencias', texto: 'Transferencias', icono: '🔄' },
]

export function PanelInstitucion({ usuario, token, apiUrl, onCerrarSesion }) {
  // La última pestaña abierta queda guardada: al recargar la página se vuelve ahí.
  // Si la guardada ya no existe (ej. "institucion", que pasó a la barra de arriba), se abre Necesidades
  const [pestana, setPestana] = useState(() => {
    try {
      const guardada = localStorage.getItem('donavida_pestana')
      return PESTANAS.some((p) => p.id === guardada) ? guardada : 'necesidades'
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
      {pestana === 'demanda' && <StockDemanda token={token} apiUrl={apiUrl} />}
      {pestana === 'transferencias' && <TransferenciasInstitucion token={token} apiUrl={apiUrl} />}    </>
  )
}
