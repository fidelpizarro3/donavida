import { useState, useEffect, useCallback } from 'react'
import { FormularioNecesidad } from './FormularioNecesidad'
import { TarjetaNecesidad } from './TarjetaNecesidad'
import { ESTADOS } from './textos'

// TAREA-4 en el front: publicar, ver, corregir y cerrar las necesidades de la institución.
// Toda la comunicación con la API pasa por la función pedir().
export function NecesidadesInstitucion({ token, apiUrl }) {
  const [necesidades, setNecesidades] = useState([])
  const [filtro, setFiltro] = useState('') // '' = todas
  const [cargando, setCargando] = useState(true)
  const [ocupado, setOcupado] = useState(false)
  const [mensaje, setMensaje] = useState(null)
  const [error, setError] = useState(null)

  // Hace el pedido con el token. Si la API responde un error, lo lanza con su mensaje.
  const pedir = useCallback(async (ruta, opciones = {}) => {
    const res = await fetch(`${apiUrl}/api/necesidades${ruta}`, {
      ...opciones,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error?.mensaje || 'Error al comunicarse con el servidor')
    return data
  }, [apiUrl, token])

  // Cada vez que cambia esto, se vuelve a pedir la lista (después de publicar, corregir o cerrar)
  const [version, setVersion] = useState(0)

  // Trae la lista al entrar, al cambiar el filtro y después de cada acción.
  // "activo" evita guardar la respuesta si el componente ya se cerró.
  useEffect(() => {
    let activo = true
    pedir(filtro ? `?estado=${filtro}` : '')
      .then((datos) => { if (activo) setNecesidades(datos) })
      .catch((err) => { if (activo) setError(err.message) })
      .finally(() => { if (activo) setCargando(false) })
    return () => {
      activo = false
    }
  }, [pedir, filtro, version])

  const cambiarFiltro = (nuevoFiltro) => {
    setCargando(true)
    setFiltro(nuevoFiltro)
  }

  // Ejecuta una acción (publicar, corregir, cerrar), muestra el resultado y recarga la lista.
  // Devuelve true si salió bien.
  const ejecutar = async (accion, textoExito) => {
    setOcupado(true)
    setMensaje(null)
    setError(null)
    try {
      await accion()
      setMensaje(textoExito)
      setVersion((v) => v + 1) // recarga la lista
      return true
    } catch (err) {
      // Por ejemplo, 403 si la institución no está aprobada: la API ya manda el mensaje
      setError(err.message)
      return false
    } finally {
      setOcupado(false)
    }
  }

  const publicar = (datos) =>
    ejecutar(() => pedir('', { method: 'POST', body: JSON.stringify(datos) }), 'Necesidad publicada: quedó abierta.')

  const corregir = (idNecesidad, unidadesSolicitadas) =>
    ejecutar(
      () => pedir(`/${idNecesidad}`, { method: 'PATCH', body: JSON.stringify({ unidadesSolicitadas }) }),
      'Cantidad corregida.'
    )

  const cerrar = (idNecesidad) =>
    ejecutar(() => pedir(`/${idNecesidad}/cerrar`, { method: 'POST' }), 'Necesidad cerrada.')

  return (
    <>
      {mensaje && <div className="alert alert-success">{mensaje}</div>}
      {error && <div className="alert alert-danger">{error}</div>}

      <FormularioNecesidad onPublicar={publicar} publicando={ocupado} />

      <section className="card">
        <div className="card-title">
          <h3 style={{ margin: 0 }}>Necesidades publicadas</h3>
          <select value={filtro} onChange={(e) => cambiarFiltro(e.target.value)} aria-label="Filtrar por estado">
            <option value="">Todas</option>
            {Object.entries(ESTADOS).map(([valor, { texto }]) => (
              <option key={valor} value={valor}>{texto}</option>
            ))}
          </select>
        </div>

        {cargando && <p className="texto-suave">Cargando...</p>}
        {!cargando && necesidades.length === 0 && (
          <p className="texto-suave">No hay necesidades {filtro ? 'con ese estado' : 'publicadas todavía'}.</p>
        )}

        <div className="necesidades-lista">
          {necesidades.map((necesidad) => (
            <TarjetaNecesidad
              // La key cambia con la cantidad, así la tarjeta se reinicia después de corregir
              key={`${necesidad.idNecesidad}-${necesidad.unidadesSolicitadas}-${necesidad.estado}`}
              necesidad={necesidad}
              onCorregir={corregir}
              onCerrar={cerrar}
              ocupado={ocupado}
            />
          ))}
        </div>
      </section>
    </>
  )
}
