import { useState } from 'react'
import { pedirUbicacion } from './ubicacion'

const CANALES = [
  { campo: 'avisoPush', texto: 'Al celular', detalle: 'para los casos urgentes' },
  { campo: 'avisoEmail', texto: 'Por correo', detalle: 'para los casos que pueden esperar' },
  { campo: 'avisoWhatsapp', texto: 'Por WhatsApp', detalle: 'próximamente: mientras tanto te escribimos por correo' },
]

// DV-2: el donante carga su ubicación y elige por dónde le llegan los avisos.
// Las dos cosas las usan la convocatoria (TAREA-10) y las alertas (TAREA-11).
// guardar(datos, textoExito) hace el PATCH /api/donantes/perfil en PerfilDonante y devuelve true si salió bien.
export function UbicacionYAvisos({ perfil, guardar }) {
  const [canales, setCanales] = useState({
    avisoPush: perfil.avisoPush,
    avisoEmail: perfil.avisoEmail,
    avisoWhatsapp: perfil.avisoWhatsapp,
  })
  const [ocupado, setOcupado] = useState(false)
  const [errorUbicacion, setErrorUbicacion] = useState(null)

  const tieneUbicacion = perfil.latitud !== null && perfil.longitud !== null
  const ningunCanal = !canales.avisoPush && !canales.avisoEmail && !canales.avisoWhatsapp
  const canalesCambiaron = CANALES.some(({ campo }) => canales[campo] !== perfil[campo])

  const handleUbicacion = async () => {
    setOcupado(true)
    setErrorUbicacion(null)
    try {
      const ubicacion = await pedirUbicacion()
      await guardar(ubicacion, 'Ubicación guardada. Ya podés recibir convocatorias de hospitales cercanos.')
    } catch (err) {
      setErrorUbicacion(err.message)
    } finally {
      setOcupado(false)
    }
  }

  const handleGuardarCanales = async (e) => {
    e.preventDefault()
    setOcupado(true)
    await guardar(canales, 'Canales de aviso actualizados.')
    setOcupado(false)
  }

  return (
    <div className="card">
      <h3 className="card-title">
        <span>Ubicación y avisos</span>
      </h3>

      <div className="avisos-push">
        {tieneUbicacion ? (
          <p>📍 <strong>Ubicación cargada.</strong> Te avisamos cuando un hospital cercano te necesite.</p>
        ) : (
          <p>
            <strong>Todavía no cargaste tu ubicación.</strong> Sin ella no podemos avisarte cuando un hospital cercano necesite tu sangre.
          </p>
        )}
        <button type="button" className="btn btn-secondary btn-chico" onClick={handleUbicacion} disabled={ocupado}>
          {tieneUbicacion ? 'Actualizar con mi ubicación actual' : '📍 Usar mi ubicación actual'}
        </button>
      </div>
      {errorUbicacion && <div className="alert alert-danger">{errorUbicacion}</div>}

      <form onSubmit={handleGuardarCanales}>
        <p className="texto-suave" style={{ marginTop: 0 }}>¿Por dónde querés que te avisemos?</p>
        <div className="canales-aviso">
          {CANALES.map(({ campo, texto, detalle }) => (
            <label key={campo}>
              <input
                type="checkbox"
                checked={canales[campo]}
                onChange={(e) => setCanales((prev) => ({ ...prev, [campo]: e.target.checked }))}
              />
              <span>
                <strong>{texto}</strong> <small>{detalle}</small>
              </span>
            </label>
          ))}
        </div>
        {ningunCanal && (
          <div className="alert alert-warning">Si apagás todos los canales no vas a recibir ninguna convocatoria.</div>
        )}
        <button type="submit" className="btn btn-primary" disabled={ocupado || !canalesCambiaron}>
          Guardar canales
        </button>
      </form>
    </div>
  )
}
