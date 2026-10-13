import { NecesidadesInstitucion } from './necesidades/NecesidadesInstitucion'
import { DatosInstitucion } from './instituciones/DatosInstitucion'

// Panel del usuario de una institución (hospital o banco de sangre).
// Cada funcionalidad de la institución suma acá su sección:
//   - TAREA-4: necesidades de sangre
//   - TAREA-1: datos y estado de la institución
export function PanelInstitucion({ usuario, token, apiUrl, onCerrarSesion }) {
  return (
    <>
      <div className="card">
        <div className="card-title">
          <div>
            <h2 style={{ margin: 0 }}>Panel de la institución</h2>
            <small className="texto-suave">{usuario.nombre} {usuario.apellido} · {usuario.email}</small>
          </div>
          <button type="button" className="btn btn-secondary" onClick={onCerrarSesion}>
            Cerrar sesión
          </button>
        </div>
      </div>

      <DatosInstitucion token={token} apiUrl={apiUrl} />
      <NecesidadesInstitucion token={token} apiUrl={apiUrl} />
    </>
  )
}
