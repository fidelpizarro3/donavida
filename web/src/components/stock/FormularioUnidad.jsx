import { useState } from 'react'
import { COMPONENTES } from '../necesidades/textos'
import { GRUPOS, COMPONENTES_STOCK, separarGrupo } from './textos'

// Fecha de hoy en la hora de la computadora (YYYY-MM-DD). No se usa toISOString: eso es la hora UTC,
// que a la noche ya es "mañana" y dejaría elegir una fecha que la API rechaza por futura
function hoyLocal() {
  const ahora = new Date()
  const m = String(ahora.getMonth() + 1).padStart(2, '0')
  const d = String(ahora.getDate()).padStart(2, '0')
  return `${ahora.getFullYear()}-${m}-${d}`
}

// TAREA-5 en el front: la institución carga UNA unidad que entra a su inventario.
// El código y el vencimiento los pone la API (el vencimiento depende del componente).
// Después de cargar se mantienen los valores, para cargar la siguiente de una en una.
// Le avisa al padre con onCargar(datos).
export function FormularioUnidad({ onCargar, cargando }) {
  const [grupo, setGrupo] = useState(GRUPOS[0].valor)
  const [componente, setComponente] = useState(COMPONENTES_STOCK[0])
  const [fechaExtraccion, setFechaExtraccion] = useState(hoyLocal)

  const handleSubmit = (e) => {
    e.preventDefault()
    onCargar({ ...separarGrupo(grupo), componente, fechaExtraccion })
  }

  return (
    <form className="card" onSubmit={handleSubmit}>
      <h3 className="card-title">Cargar una unidad</h3>
      <p className="texto-suave">
        Cada unidad se carga por separado. El sistema le asigna un código y calcula el vencimiento:
        los glóbulos rojos duran 42 días y las plaquetas 5, desde la extracción.
      </p>

      <div className="form-grid form-grid-tres">
        <div className="form-group">
          <label htmlFor="unidad-grupo">Grupo</label>
          <select id="unidad-grupo" value={grupo} onChange={(e) => setGrupo(e.target.value)}>
            {GRUPOS.map((g) => (
              <option key={g.valor} value={g.valor}>{g.texto}</option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label htmlFor="unidad-componente">Componente</label>
          <select id="unidad-componente" value={componente} onChange={(e) => setComponente(e.target.value)}>
            {COMPONENTES_STOCK.map((valor) => (
              <option key={valor} value={valor}>{COMPONENTES[valor]}</option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label htmlFor="unidad-extraccion">Fecha de extracción</label>
          <input
            id="unidad-extraccion"
            type="date"
            required
            max={hoyLocal()}
            value={fechaExtraccion}
            onChange={(e) => setFechaExtraccion(e.target.value)}
          />
        </div>
      </div>

      <button type="submit" className="btn btn-primary" disabled={cargando}>
        {cargando ? 'Cargando...' : 'Cargar unidad'}
      </button>
    </form>
  )
}
