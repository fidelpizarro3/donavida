import { useState } from 'react'
import { COMPONENTES } from './textos'

// Fecha de hoy + días, en formato YYYY-MM-DD (lo que espera <input type="date"> y la API)
function fechaDentroDe(dias) {
  const fecha = new Date()
  fecha.setDate(fecha.getDate() + dias)
  const y = fecha.getFullYear()
  const m = String(fecha.getMonth() + 1).padStart(2, '0')
  const d = String(fecha.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

const VALORES_INICIALES = {
  grupoSanguineo: 'O',
  factorRh: 'negativo',
  componente: 'globulos_rojos',
  unidadesSolicitadas: 1,
  urgencia: 'normal',
  fechaLimite: fechaDentroDe(7),
}

// Formulario para publicar una necesidad. Le avisa al padre con onPublicar(datos),
// que devuelve true si se publicó (así se limpia el formulario).
export function FormularioNecesidad({ onPublicar, publicando }) {
  const [datos, setDatos] = useState(VALORES_INICIALES)

  const handleChange = (e) => {
    const { name, value } = e.target
    setDatos((prev) => ({ ...prev, [name]: value }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    // La API espera un número entero, y los inputs siempre devuelven texto
    const publicada = await onPublicar({ ...datos, unidadesSolicitadas: Number(datos.unidadesSolicitadas) })
    if (publicada) setDatos(VALORES_INICIALES)
  }

  return (
    <form className="card" onSubmit={handleSubmit}>
      <h3 className="card-title">Publicar una necesidad</h3>

      <div className="form-grid">
        <div className="form-group">
          <label htmlFor="nec-grupo">Grupo sanguíneo</label>
          <select id="nec-grupo" name="grupoSanguineo" value={datos.grupoSanguineo} onChange={handleChange}>
            <option value="O">O</option>
            <option value="A">A</option>
            <option value="B">B</option>
            <option value="AB">AB</option>
          </select>
        </div>

        <div className="form-group">
          <label htmlFor="nec-factor">Factor Rh</label>
          <select id="nec-factor" name="factorRh" value={datos.factorRh} onChange={handleChange}>
            <option value="negativo">Negativo (−)</option>
            <option value="positivo">Positivo (+)</option>
          </select>
        </div>

        {/* Criterio: solo sangre entera, glóbulos rojos o plaquetas */}
        <div className="form-group">
          <label htmlFor="nec-componente">Componente</label>
          <select id="nec-componente" name="componente" value={datos.componente} onChange={handleChange}>
            {Object.entries(COMPONENTES).map(([valor, texto]) => (
              <option key={valor} value={valor}>{texto}</option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label htmlFor="nec-unidades">Unidades</label>
          <input
            id="nec-unidades"
            name="unidadesSolicitadas"
            type="number"
            min="1"
            max="100"
            required
            value={datos.unidadesSolicitadas}
            onChange={handleChange}
          />
        </div>

        <div className="form-group">
          <label htmlFor="nec-urgencia">Urgencia</label>
          <select id="nec-urgencia" name="urgencia" value={datos.urgencia} onChange={handleChange}>
            <option value="normal">Normal (aviso por correo)</option>
            <option value="urgente">Urgente (aviso al celular)</option>
          </select>
        </div>

        <div className="form-group">
          <label htmlFor="nec-fecha">Hasta cuándo sirve</label>
          <input
            id="nec-fecha"
            name="fechaLimite"
            type="date"
            required
            min={fechaDentroDe(0)}
            value={datos.fechaLimite}
            onChange={handleChange}
          />
        </div>
      </div>

      <button type="submit" className="btn btn-primary" disabled={publicando}>
        {publicando ? 'Publicando...' : 'Publicar necesidad'}
      </button>
    </form>
  )
}
