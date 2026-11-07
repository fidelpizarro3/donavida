import { useState, useEffect, useCallback } from 'react'
import { TarjetaAdminInstitucion } from './TarjetaAdminInstitucion'
import { AvisoFlotante } from '../comunes/AvisoFlotante'
import { Esqueleto } from '../comunes/Esqueleto'

// Filtros del listado: cada uno se manda como ?estado= (vacío = todas)
const FILTROS = [
  { estado: 'pendiente', texto: 'Pendientes' },
  { estado: 'aprobada', texto: 'Aprobadas' },
  { estado: 'rechazada', texto: 'Rechazadas' },
  { estado: 'baja', texto: 'Dadas de baja' },
  { estado: '', texto: 'Todas' },
]

// TAREA-1, lado del admin: revisar las instituciones que pidieron el alta y aprobarlas o rechazarlas.
// Mismo patrón que DatosInstitucion: pedir() para hablar con la API, "version" para recargar.
export function PanelAdmin({ usuario, token, apiUrl, onCerrarSesion }) {
  const [instituciones, setInstituciones] = useState([])
  const [filtro, setFiltro] = useState('pendiente')
  const [cargando, setCargando] = useState(true)
  const [ocupado, setOcupado] = useState(false)
  const [mensaje, setMensaje] = useState(null)
  const [error, setError] = useState(null)
  const [version, setVersion] = useState(0)

  const pedir = useCallback(async (ruta, opciones = {}) => {
    const res = await fetch(`${apiUrl}/api/instituciones${ruta}`, {
      ...opciones,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error?.mensaje || 'Error al comunicarse con el servidor')
    return data
  }, [apiUrl, token])

  // Trae el listado al entrar, al cambiar de filtro y después de cada acción
  useEffect(() => {
    let activo = true
    setCargando(true)
    pedir(filtro ? `?estado=${filtro}` : '')
      .then((datos) => { if (activo) setInstituciones(datos) })
      .catch((err) => { if (activo) setError(err.message) })
      .finally(() => { if (activo) setCargando(false) })
    return () => {
      activo = false
    }
  }, [pedir, filtro, version])

  // Ejecuta una acción (aprobar, rechazar, dar de baja), muestra el resultado y recarga. Devuelve true si salió bien.
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

  const aprobar = (institucion) =>
    ejecutar(
      () => pedir(`/${institucion.idInstitucion}/aprobar`, { method: 'PATCH' }),
      `${institucion.nombre} quedó aprobada: ya puede publicar necesidades y cargar stock.`
    )

  const rechazar = (institucion, motivoRechazo) =>
    ejecutar(
      () => pedir(`/${institucion.idInstitucion}/rechazar`, { method: 'PATCH', body: JSON.stringify({ motivoRechazo }) }),
      `${institucion.nombre} quedó rechazada. La institución ve el motivo en su panel.`
    )

  const darDeBaja = (institucion) =>
    ejecutar(
      () => pedir(`/${institucion.idInstitucion}/baja`, { method: 'PATCH' }),
      `${institucion.nombre} quedó dada de baja.`
    )

  return (
    <>
      <div className="card panel-cabecera">
        <div className="card-title" style={{ marginBottom: 0 }}>
          <div>
            <h2 style={{ margin: 0 }}>Panel de administración</h2>
            <small className="texto-suave">{usuario.nombre} {usuario.apellido} · {usuario.email}</small>
          </div>
          <button type="button" className="btn btn-secondary" onClick={onCerrarSesion}>
            Cerrar sesión
          </button>
        </div>

        <nav className="pestanas" role="tablist">
          {FILTROS.map(({ estado, texto }) => (
            <button
              key={texto}
              type="button"
              role="tab"
              aria-selected={filtro === estado}
              className={`pestana ${filtro === estado ? 'activa' : ''}`}
              onClick={() => setFiltro(estado)}
            >
              {texto}
            </button>
          ))}
        </nav>
      </div>

      <section className="card">
        <h3 style={{ margin: 0 }}>Instituciones</h3>

        <AvisoFlotante mensaje={mensaje} onCerrar={() => setMensaje(null)} />
        {error && <div className="alert alert-danger">{error}</div>}

        {cargando && <Esqueleto />}

        {!cargando && instituciones.length === 0 && (
          <div className="vacio">
            <span aria-hidden="true">🏥</span>
            <p>{filtro === 'pendiente' ? 'No hay instituciones esperando aprobación.' : 'No hay instituciones en este estado.'}</p>
          </div>
        )}

        {!cargando && instituciones.length > 0 && (
          <div className="necesidades-lista">
            {instituciones.map((institucion) => (
              <TarjetaAdminInstitucion
                key={institucion.idInstitucion}
                institucion={institucion}
                onAprobar={aprobar}
                onRechazar={rechazar}
                onDarDeBaja={darDeBaja}
                ocupado={ocupado}
              />
            ))}
          </div>
        )}
      </section>
    </>
  )
}
