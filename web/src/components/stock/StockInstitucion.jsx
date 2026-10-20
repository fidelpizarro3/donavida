import { useState, useEffect, useCallback } from 'react'
import { AvisoPorVencer } from './AvisoPorVencer'
import { ResumenStock } from './ResumenStock'
import { FormularioStockMinimo } from './FormularioStockMinimo'
import { FormularioUnidad } from './FormularioUnidad'
import { UnidadesStock } from './UnidadesStock'
import { COMPONENTES, fechaLegible } from '../necesidades/textos'
import { GRUPOS } from './textos'
import { AvisoFlotante } from '../comunes/AvisoFlotante'

const SIN_FILTROS = { grupo: '', componente: '', estado: '' }

// TAREA-6 en el front: el stock de la institución.
//   - Aviso de las unidades que vencen pronto, para usarlas primero
//   - Resumen por grupo, factor y componente, comparado con el stock mínimo
//   - Formulario para definir el stock mínimo
//   - Listado con filtros y el detalle (recorrido) de cada unidad
//   - TAREA-7: confirmar el descarte de las unidades vencidas
//   - TAREA-5: cargar una unidad, y usar una disponible desde el listado
// Toda la comunicación con la API pasa por la función pedir().
export function StockInstitucion({ token, apiUrl }) {
  const [resumen, setResumen] = useState([])
  const [porVencer, setPorVencer] = useState([])
  const [unidades, setUnidades] = useState([])
  const [filtros, setFiltros] = useState(SIN_FILTROS)
  const [cargandoResumen, setCargandoResumen] = useState(true)
  const [cargandoUnidades, setCargandoUnidades] = useState(true)
  const [ocupado, setOcupado] = useState(false)
  const [mensaje, setMensaje] = useState(null)
  const [error, setError] = useState(null)

  // Hace el pedido con el token. Si la API responde un error, lo lanza con su mensaje.
  const pedir = useCallback(async (ruta, opciones = {}) => {
    const res = await fetch(`${apiUrl}/api/unidades${ruta}`, {
      ...opciones,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error?.mensaje || 'Error al comunicarse con el servidor')
    return data
  }, [apiUrl, token])

  // Cada vez que cambia esto, se vuelve a pedir todo (después de guardar un mínimo)
  const [version, setVersion] = useState(0)

  // Resumen y aviso: no dependen de los filtros del listado.
  // "activo" evita guardar la respuesta si el componente ya se cerró.
  useEffect(() => {
    let activo = true
    Promise.all([pedir('/resumen'), pedir('?estado=disponible')])
      .then(([filas, disponibles]) => {
        if (!activo) return
        setResumen(filas)
        // Vienen ordenadas de la que vence primero a la última
        setPorVencer(disponibles.filter((unidad) => unidad.porVencer))
      })
      .catch((err) => { if (activo) setError(err.message) })
      .finally(() => { if (activo) setCargandoResumen(false) })
    return () => {
      activo = false
    }
  }, [pedir, version])

  // Listado: se vuelve a pedir cada vez que cambia un filtro
  useEffect(() => {
    let activo = true
    const grupo = GRUPOS.find((g) => g.valor === filtros.grupo)
    const consulta = new URLSearchParams()
    if (grupo) {
      consulta.set('grupoSanguineo', grupo.grupoSanguineo)
      consulta.set('factorRh', grupo.factorRh)
    }
    if (filtros.componente) consulta.set('componente', filtros.componente)
    if (filtros.estado) consulta.set('estado', filtros.estado)
    const texto = consulta.toString()

    pedir(texto ? `?${texto}` : '')
      .then((datos) => { if (activo) setUnidades(datos) })
      .catch((err) => { if (activo) setError(err.message) })
      .finally(() => { if (activo) setCargandoUnidades(false) })
    return () => {
      activo = false
    }
  }, [pedir, filtros, version])

  const cambiarFiltro = (campo, valor) => {
    setCargandoUnidades(true)
    setFiltros((prev) => ({ ...prev, [campo]: valor }))
  }

  // Ejecuta una acción (cargar, usar o descartar una unidad, guardar un mínimo), muestra el texto que devuelve
  // y recarga todo. Devuelve true si salió bien.
  const ejecutar = async (accion) => {
    setOcupado(true)
    setMensaje(null)
    setError(null)
    try {
      setMensaje(await accion())
      setVersion((v) => v + 1) // recarga el aviso, el resumen y el listado
      return true
    } catch (err) {
      // Por ejemplo, 403 si la institución no está aprobada: la API ya manda el mensaje
      setError(err.message)
      return false
    } finally {
      setOcupado(false)
    }
  }

  const guardarMinimo = (datos) =>
    ejecutar(async () => {
      const guardado = await pedir('/stock-minimo', { method: 'PUT', body: JSON.stringify(datos) })
      const grupo = GRUPOS.find((g) => g.grupoSanguineo === guardado.grupoSanguineo && g.factorRh === guardado.factorRh)
      return guardado.unidadesMinimas === 0
        ? `${grupo.texto} ${COMPONENTES[guardado.componente].toLowerCase()}: sin stock mínimo.`
        : `Stock mínimo guardado: ${grupo.texto} ${COMPONENTES[guardado.componente].toLowerCase()}, ${guardado.unidadesMinimas} ${guardado.unidadesMinimas === 1 ? 'unidad' : 'unidades'}.`
    })

  // TAREA-5: la institución carga una unidad. Se muestran el código y el vencimiento que puso la API
  const cargarUnidad = (datos) =>
    ejecutar(async () => {
      const unidad = await pedir('', { method: 'POST', body: JSON.stringify(datos) })
      return `Unidad ${unidad.codigo} cargada: vence el ${fechaLegible(unidad.fechaVencimiento)}.`
    })

  // TAREA-6: usar una unidad disponible (sale del stock disponible y queda el movimiento de uso)
  const usar = (unidad) =>
    ejecutar(async () => {
      await pedir(`/${unidad.idUnidadSangre}/usar`, { method: 'PATCH' })
      return `Unidad ${unidad.codigo} usada: salió del stock disponible.`
    })

  // TAREA-7: la institución confirma el descarte de una unidad vencida
  const descartar = (unidad) =>
    ejecutar(async () => {
      await pedir(`/${unidad.idUnidadSangre}/descartar`, { method: 'POST' })
      return `Unidad ${unidad.codigo} descartada: cerró su recorrido.`
    })

  return (
    <>
      <AvisoFlotante mensaje={mensaje} onCerrar={() => setMensaje(null)} />
      {error && <div className="alert alert-danger">{error}</div>}

      <section className="card">
        <h3 className="card-title">Stock de sangre</h3>
        <AvisoPorVencer unidades={porVencer} />
        <ResumenStock filas={resumen} cargando={cargandoResumen} />
      </section>

      <FormularioUnidad onCargar={cargarUnidad} cargando={ocupado} />

      <FormularioStockMinimo onGuardar={guardarMinimo} guardando={ocupado} />

      <UnidadesStock
        unidades={unidades}
        filtros={filtros}
        onCambiarFiltro={cambiarFiltro}
        cargando={cargandoUnidades}
        pedir={pedir}
        onUsar={usar}
        onDescartar={descartar}
        ocupado={ocupado}
        version={version}
      />
    </>
  )
}
