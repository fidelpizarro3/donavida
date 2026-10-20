import { useState, useEffect } from 'react'
import { fechaLegible } from '../necesidades/textos'
import { partesDeFecha, RESULTADOS_DONACION, guardarSinConexion, leerSinConexion } from './textos'

const CLAVE_SIN_CONEXION = 'donavida_historial'

// DV-11 en el front, lado del donante: dónde donó, cuándo y desde qué fecha puede volver.
// Se actualiza solo cuando el hospital registra la donación, y se guarda para verlo sin conexión.
// "actualizar" lo cambia el perfil para volver a pedirlo.
export function HistorialDonante({ token, apiUrl, actualizar = 0 }) {
  const [historial, setHistorial] = useState(null)
  const [sinConexion, setSinConexion] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    let activo = true
    fetch(`${apiUrl}/api/donaciones/mias`, { headers: { Authorization: `Bearer ${token}` } })
      .then(async (res) => {
        const data = await res.json()
        if (!res.ok) throw new Error(data.error?.mensaje || 'Error al cargar el historial')
        return data
      })
      .then((datos) => {
        if (!activo) return
        setHistorial(datos)
        setSinConexion(false)
        guardarSinConexion(CLAVE_SIN_CONEXION, datos)
      })
      .catch((err) => {
        if (!activo) return
        const guardado = leerSinConexion(CLAVE_SIN_CONEXION)
        if (!navigator.onLine && guardado?.datos) {
          setHistorial(guardado.datos)
          setSinConexion(true)
        } else {
          setError(err.message)
        }
      })
    return () => {
      activo = false
    }
  }, [apiUrl, token, actualizar])

  if (error) return <div className="card"><div className="alert alert-danger">{error}</div></div>
  if (!historial) return null

  const { totalDonaciones, donaciones, habilitado, aptoDesde } = historial

  return (
    <section className="card">
      <div className="card-title">
        <h3 style={{ margin: 0 }}>Mis donaciones</h3>
        {sinConexion && <span className="badge badge-warning">Sin conexión</span>}
      </div>

      <div className="historial-resumen">
        <div className="historial-numero">
          <strong>{totalDonaciones}</strong>
          <span>{totalDonaciones === 1 ? 'donación' : 'donaciones'}</span>
        </div>
        <div className="historial-numero">
          <strong>{totalDonaciones * 3}</strong>
          <span>vidas que ayudaste a salvar*</span>
        </div>
        <div className={`historial-proxima ${habilitado ? 'historial-proxima-ok' : ''}`}>
          {habilitado ? (
            <><strong>✓ Podés donar</strong><span>Te avisamos cuando un hospital cercano te necesite</span></>
          ) : aptoDesde ? (
            <><strong>Podés volver a donar desde el {fechaLegible(aptoDesde)}</strong><span>Entre donaciones tienen que pasar 56 días</span></>
          ) : (
            <><strong>Todavía no podés donar</strong><span>Completá el cuestionario de aptitud</span></>
          )}
        </div>
      </div>

      {donaciones.length === 0 ? (
        <p className="texto-suave">Todavía no tenés donaciones registradas. ¡La primera es la más importante!</p>
      ) : (
        <ol className="linea-tiempo">
          {donaciones.map((d) => {
            const { numero, mes } = partesDeFecha(d.fecha)
            const resultado = RESULTADOS_DONACION[d.resultado]
            return (
              <li key={d.idDonacion}>
                <span className="linea-tiempo-fecha">{numero} {mes} {d.fecha.slice(0, 4)}</span>
                <span className="linea-tiempo-datos">
                  <strong>{d.institucion.nombre}</strong>
                  <small>{d.institucion.direccion}</small>
                </span>
                <span className={`badge ${resultado.clase}`}>{resultado.texto}</span>
              </li>
            )
          })}
        </ol>
      )}
      {totalDonaciones > 0 && <p className="texto-suave" style={{ fontSize: '0.8rem' }}>* Cada donación puede ayudar hasta a 3 personas.</p>}
    </section>
  )
}
