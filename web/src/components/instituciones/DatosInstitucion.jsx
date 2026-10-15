import { useState, useEffect, useCallback } from 'react'
import { FormularioAltaInstitucion } from './FormularioAltaInstitucion'
import { TarjetaInstitucion } from './TarjetaInstitucion'

// TAREA-1 en el front: alta, estado y usuarios de las instituciones del usuario logueado.
// Toda la comunicación con la API pasa por la función pedir().
export function DatosInstitucion({ token, apiUrl }) {
  const [instituciones, setInstituciones] = useState([])
  const [cargando, setCargando] = useState(true)
  const [ocupado, setOcupado] = useState(false)
  const [mensaje, setMensaje] = useState(null)
  const [error, setError] = useState(null)

  const pedir = useCallback(async (ruta, opciones = {}) => {
    const res = await fetch(`${apiUrl}/api/instituciones${ruta}`, {
      ...opciones,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error?.mensaje || 'Error al comunicarse con el servidor')
    return data
  }, [apiUrl, token])

  // Cada vez que cambia esto, se vuelve a pedir la lista (después de dar de alta o sumar un usuario)
  const [version, setVersion] = useState(0)

  // Trae la lista al entrar y después de cada acción.
  // "activo" evita guardar la respuesta si el componente ya se cerró.
  useEffect(() => {
    let activo = true
    pedir('/mis-instituciones')
      .then((datos) => { if (activo) setInstituciones(datos) })
      .catch((err) => { if (activo) setError(err.message) })
      .finally(() => { if (activo) setCargando(false) })
    return () => {
      activo = false
    }
  }, [pedir, version])

  // Ejecuta una acción (alta, sumar usuario), muestra el resultado y recarga la lista.
  // Devuelve true si salió bien.
  const ejecutar = async (accion, textoExito) => {
    setOcupado(true)
    setMensaje(null)
    setError(null)
    try {
      await accion()
      setMensaje(textoExito)
      setVersion((v) => v + 1)
      return true
    } catch (err) {
      setError(err.message)
      return false
    } finally {
      setOcupado(false)
    }
  }

  const darDeAlta = (datos) =>
    ejecutar(() => pedir('', { method: 'POST', body: JSON.stringify(datos) }), 'Institución dada de alta: queda pendiente de aprobación.')

  const sumarUsuario = (idInstitucion, email, cargo) =>
    ejecutar(
      () => pedir(`/${idInstitucion}/usuarios`, { method: 'POST', body: JSON.stringify({ email, cargo }) }),
      'Usuario agregado a la institución.'
    )

  return (
    <section className="card">
      <h3 style={{ margin: 0 }}>Mi institución</h3>

      {mensaje && <div className="alert alert-success">{mensaje}</div>}
      {error && <div className="alert alert-danger">{error}</div>}

      {cargando && <p className="texto-suave">Cargando...</p>}

      {!cargando && instituciones.length === 0 && (
        <FormularioAltaInstitucion onDarDeAlta={darDeAlta} ocupado={ocupado} />
      )}

      {!cargando && instituciones.length > 0 && (
        <div className="necesidades-lista">
          {instituciones.map((institucion) => (
            <TarjetaInstitucion
              key={institucion.idInstitucion}
              institucion={institucion}
              onSumarUsuario={sumarUsuario}
              ocupado={ocupado}
            />
          ))}
        </div>
      )}
    </section>
  )
}
