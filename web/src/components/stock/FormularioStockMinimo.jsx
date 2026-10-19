import { useState } from 'react'
import { COMPONENTES } from '../necesidades/textos'
import { GRUPOS, COMPONENTES_STOCK, separarGrupo } from './textos'

// Criterio: la institución define su stock mínimo de seguridad por grupo y componente.
// Si ya había uno para esa combinación, se reemplaza. Le avisa al padre con onGuardar(datos).
export function FormularioStockMinimo({ onGuardar, guardando }) {
  const [grupo, setGrupo] = useState(GRUPOS[0].valor)
  const [componente, setComponente] = useState(COMPONENTES_STOCK[0])
  const [unidadesMinimas, setUnidadesMinimas] = useState(1)

  const handleSubmit = (e) => {
    e.preventDefault()
    // La API espera un número entero, y los inputs siempre devuelven texto
    onGuardar({ ...separarGrupo(grupo), componente, unidadesMinimas: Number(unidadesMinimas) })
  }

  return (
    <form className="card" onSubmit={handleSubmit}>
      <h3 className="card-title">Stock mínimo de seguridad</h3>
      <p className="texto-suave">
        Cuántas unidades querés tener siempre de cada grupo. Si las disponibles quedan por debajo, el resumen lo marca.
        Con 0 se quita el mínimo.
      </p>

      <div className="form-grid form-grid-tres">
        <div className="form-group">
          <label htmlFor="min-grupo">Grupo</label>
          <select id="min-grupo" value={grupo} onChange={(e) => setGrupo(e.target.value)}>
            {GRUPOS.map((g) => (
              <option key={g.valor} value={g.valor}>{g.texto}</option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label htmlFor="min-componente">Componente</label>
          <select id="min-componente" value={componente} onChange={(e) => setComponente(e.target.value)}>
            {COMPONENTES_STOCK.map((valor) => (
              <option key={valor} value={valor}>{COMPONENTES[valor]}</option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label htmlFor="min-unidades">Unidades mínimas</label>
          <input
            id="min-unidades"
            type="number"
            min="0"
            max="1000"
            required
            value={unidadesMinimas}
            onChange={(e) => setUnidadesMinimas(e.target.value)}
          />
        </div>
      </div>

      <button type="submit" className="btn btn-primary" disabled={guardando}>
        {guardando ? 'Guardando...' : 'Guardar mínimo'}
      </button>
    </form>
  )
}
