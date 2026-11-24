import { useState, useEffect } from 'react'
import { fechaLegible } from '../necesidades/textos'
import { partesDeFecha, RESULTADOS_DONACION, guardarSinConexion, leerSinConexion } from './textos'
import { descargarArchivo } from '../carne/textos'

const CLAVE_SIN_CONEXION = 'donavida_historial'

// DV-11 en el front, lado del donante: dónde donó, cuándo y desde qué fecha puede volver.
// Se actualiza solo cuando el hospital registra la donación, y se guarda para verlo sin conexión.
// "actualizar" lo cambia el perfil para volver a pedirlo.
// TAREA-18: de cada donación realizada se puede descargar el comprobante en PDF
export function HistorialDonante({ token, apiUrl, actualizar = 0 }) {
  const [historial, setHistorial] = useState(null)
  const [sinConexion, setSinConexion] = useState(false)
  const [error, setError] = useState(null)
  const [descargando, setDescargando] = useState(null) // la donación cuyo comprobante se está bajando
  const [problema, setProblema] = useState(null) // no se pudo bajar el comprobante (el historial se sigue viendo)

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

  const descargarComprobante = async (donacion) => {
    setDescargando(donacion.idDonacion)
    setProblema(null)
    try {
      const res = await fetch(`${apiUrl}/api/donaciones/${donacion.idDonacion}/comprobante`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error?.mensaje || 'No se pudo descargar el comprobante')
      }
      descargarArchivo(await res.blob(), `comprobante-donacion-${donacion.fecha}.pdf`)
    } catch (err) {
      setProblema(navigator.onLine ? err.message : 'Para descargar el comprobante hace falta conexión.')
    } finally {
      setDescargando(null)
    }
  }

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

      {problema && <div className="alert alert-danger">{problema}</div>}

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
                  {/* Criterio: después de donar puede descargar un comprobante (el PDF lo arma la API: necesita conexión) */}
                  {d.resultado === 'realizada' && !sinConexion && (
                    <button
                      type="button"
                      className="btn-link linea-tiempo-comprobante"
                      onClick={() => descargarComprobante(d)}
                      disabled={descargando !== null}
                    >
                      {descargando === d.idDonacion ? 'Descargando...' : 'Descargar comprobante (PDF)'}
                    </button>
                  )}
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
