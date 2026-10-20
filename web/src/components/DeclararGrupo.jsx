import { useState } from 'react'

// El donante que no sabía su grupo al registrarse lo puede declarar acá, una sola vez:
// después no se puede cambiar. Si no lo sabe, se completa cuando done.
// guardar(datos, textoExito) hace el PATCH /api/donantes/perfil en PerfilDonante y devuelve true si salió bien.
export function DeclararGrupo({ guardar }) {
  const [abierto, setAbierto] = useState(false)
  const [grupoSanguineo, setGrupoSanguineo] = useState('')
  const [factorRh, setFactorRh] = useState('')
  const [guardando, setGuardando] = useState(false)

  if (!abierto) {
    return (
      <button type="button" className="btn-link declarar-grupo-abrir" onClick={() => setAbierto(true)}>
        ¿Ya sabés tu grupo? Cargalo
      </button>
    )
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setGuardando(true)
    // Si sale bien, el perfil se actualiza con el grupo y este formulario deja de mostrarse
    await guardar({ grupoSanguineo, factorRh }, `Grupo sanguíneo guardado: ${grupoSanguineo} ${factorRh === 'positivo' ? '(+)' : '(-)'}.`)
    setGuardando(false)
  }

  return (
    <form className="declarar-grupo" onSubmit={handleSubmit}>
      <div className="declarar-grupo-campos">
        <select value={grupoSanguineo} onChange={(e) => setGrupoSanguineo(e.target.value)} required aria-label="Grupo sanguíneo">
          <option value="" disabled>Grupo</option>
          <option value="O">O</option>
          <option value="A">A</option>
          <option value="B">B</option>
          <option value="AB">AB</option>
        </select>
        <select value={factorRh} onChange={(e) => setFactorRh(e.target.value)} required aria-label="Factor Rh">
          <option value="" disabled>Factor</option>
          <option value="positivo">Positivo (+)</option>
          <option value="negativo">Negativo (−)</option>
        </select>
      </div>
      <small className="declarar-grupo-aviso">
        Revisalo bien: una vez guardado no lo vas a poder cambiar. Si no estás seguro, dejalo así y se carga cuando dones.
      </small>
      <div className="declarar-grupo-acciones">
        <button type="submit" className="btn btn-primary btn-chico" disabled={guardando || !grupoSanguineo || !factorRh}>
          {guardando ? 'Guardando...' : 'Guardar mi grupo'}
        </button>
        <button type="button" className="btn btn-secondary btn-chico" onClick={() => setAbierto(false)} disabled={guardando}>
          Cancelar
        </button>
      </div>
    </form>
  )
}
