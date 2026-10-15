import { useState } from 'react'

// El formulario de alta real de la institución (func. 1): se muestra cuando el usuario
// logueado todavía no pertenece a ninguna institución.
export function FormularioAltaInstitucion({ onDarDeAlta, ocupado }) {
  const [formData, setFormData] = useState({
    nombre: '',
    direccion: '',
    tipo: 'hospital',
    documentacionUrl: '',
    latitud: '',
    longitud: '',
    cargo: '',
  })

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    await onDarDeAlta({
      nombre: formData.nombre,
      direccion: formData.direccion,
      tipo: formData.tipo,
      documentacionUrl: formData.documentacionUrl || null,
      latitud: Number(formData.latitud),
      longitud: Number(formData.longitud),
      cargo: formData.cargo,
    })
  }

  return (
    <form onSubmit={handleSubmit}>
      <p className="texto-suave">
        Cargá los datos de tu hospital o banco de sangre. Queda <strong>pendiente</strong> hasta
        que la administración de la red lo revise.
      </p>

      <div className="form-grid">
        <div className="form-group">
          <label htmlFor="alta-nombre">Nombre de la institución *</label>
          <input
            id="alta-nombre"
            name="nombre"
            type="text"
            required
            value={formData.nombre}
            onChange={handleChange}
            placeholder="Hospital Central"
          />
        </div>

        <div className="form-group">
          <label htmlFor="alta-direccion">Dirección *</label>
          <input
            id="alta-direccion"
            name="direccion"
            type="text"
            required
            value={formData.direccion}
            onChange={handleChange}
            placeholder="Av. Argentina 1200"
          />
        </div>

        <div className="form-group">
          <label htmlFor="alta-tipo">Tipo *</label>
          <select id="alta-tipo" name="tipo" value={formData.tipo} onChange={handleChange}>
            <option value="hospital">Hospital</option>
            <option value="banco_de_sangre">Banco de sangre</option>
          </select>
        </div>

        <div className="form-group">
          <label htmlFor="alta-doc">URL de documentación (opcional)</label>
          <input
            id="alta-doc"
            name="documentacionUrl"
            type="url"
            value={formData.documentacionUrl}
            onChange={handleChange}
            placeholder="https://..."
          />
        </div>

        <div className="form-group">
          <label htmlFor="alta-lat">Latitud *</label>
          <input
            id="alta-lat"
            name="latitud"
            type="number"
            step="any"
            required
            value={formData.latitud}
            onChange={handleChange}
            placeholder="-38.95"
          />
        </div>

        <div className="form-group">
          <label htmlFor="alta-lon">Longitud *</label>
          <input
            id="alta-lon"
            name="longitud"
            type="number"
            step="any"
            required
            value={formData.longitud}
            onChange={handleChange}
            placeholder="-68.06"
          />
        </div>

        <div className="form-group full-width">
          <label htmlFor="alta-cargo">Tu cargo en la institución *</label>
          <input
            id="alta-cargo"
            name="cargo"
            type="text"
            required
            value={formData.cargo}
            onChange={handleChange}
            placeholder="Director, Jefe de banco de sangre, etc."
          />
        </div>
      </div>

      <button type="submit" className="btn btn-primary" disabled={ocupado} style={{ marginTop: '1rem' }}>
        {ocupado ? 'Enviando...' : 'Dar de alta la institución'}
      </button>
    </form>
  )
}
