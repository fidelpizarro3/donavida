import { useState } from 'react'
import { CANALES, grupoConFactor } from './textos'

// TAREA-8 en el front: pide la lista sugerida de donantes, deja sacar o agregar personas y confirma.
// pedir() es la misma función de NecesidadesInstitucion (ya lleva el token).
// onConfirmar(datos) devuelve true si se guardó la convocatoria.
export function ConvocatoriaNecesidad({ necesidad, pedir, onConfirmar, onCancelar, ocupado }) {
  const [radioKm, setRadioKm] = useState(20)
  const [propuesta, setPropuesta] = useState(null)
  const [elegidos, setElegidos] = useState([]) // ids de los donantes tildados
  const [buscando, setBuscando] = useState(false)
  const [error, setError] = useState(null)

  const buscar = async () => {
    setBuscando(true)
    setError(null)
    try {
      const datos = await pedir(`/${necesidad.idNecesidad}/convocatoria/propuesta`, {
        method: 'POST',
        body: JSON.stringify({ radioKm: Number(radioKm) }),
      })
      setPropuesta(datos)
      // Arranca con los sugeridos tildados; el hospital puede cambiarlo
      setElegidos(datos.sugeridos.map((d) => d.idDonante))
    } catch (err) {
      setError(err.message)
    } finally {
      setBuscando(false)
    }
  }

  const alternar = (idDonante) => {
    setElegidos((prev) => (prev.includes(idDonante) ? prev.filter((id) => id !== idDonante) : [...prev, idDonante]))
  }

  const handleConfirmar = async () => {
    const guardada = await onConfirmar({ radioKm: propuesta.radioKm, idsDonantes: elegidos })
    if (guardada) onCancelar()
  }

  const candidatos = propuesta ? [...propuesta.sugeridos, ...propuesta.otrosCandidatos] : []
  const cupo = propuesta?.cupo.disponible ?? 0
  const sePasaDelCupo = elegidos.length > cupo

  return (
    <div className="convocatoria">
      <div className="necesidad-acciones">
        <label htmlFor={`radio-${necesidad.idNecesidad}`}>Buscar hasta</label>
        <input
          id={`radio-${necesidad.idNecesidad}`}
          type="number"
          min="1"
          max="500"
          value={radioKm}
          onChange={(e) => setRadioKm(e.target.value)}
        />
        <span>km</span>
        <button type="button" className="btn btn-primary btn-chico" onClick={buscar} disabled={buscando || ocupado}>
          {buscando ? 'Buscando...' : propuesta ? 'Volver a buscar' : 'Buscar donantes'}
        </button>
        <button type="button" className="btn btn-secondary btn-chico" onClick={onCancelar} disabled={ocupado}>
          Cancelar
        </button>
      </div>

      {error && <div className="alert alert-danger">{error}</div>}

      {propuesta && (
        <>
          <p className="convocatoria-cupo">
            Hay lugar para <strong>{cupo}</strong> {cupo === 1 ? 'persona' : 'personas'}.
            {propuesta.cupo.segun === 'unidades_faltantes' && ' (Todavía no hay agenda cargada: se usan las unidades que faltan.)'}
          </p>

          {candidatos.length === 0 ? (
            <p className="texto-suave">No hay donantes que cumplan los criterios en ese radio. Probá con más km.</p>
          ) : (
            <ul className="convocatoria-lista">
              {candidatos.map((c) => (
                <li key={c.idDonante} className={elegidos.includes(c.idDonante) ? 'convocatoria-elegido' : ''}>
                  <label>
                    <input
                      type="checkbox"
                      checked={elegidos.includes(c.idDonante)}
                      onChange={() => alternar(c.idDonante)}
                    />
                    <span className="grupo-chip grupo-chip-chico">{grupoConFactor(c.grupoSanguineo, c.factorRh)}</span>
                    <span className="convocatoria-persona">
                      <strong>{c.nombre} {c.apellido}</strong>
                      <small>{c.motivo} Aviso por {CANALES[c.canal]}.</small>
                    </span>
                    <span className="convocatoria-km">{c.distanciaKm} km</span>
                  </label>
                </li>
              ))}
            </ul>
          )}

          <div className="necesidad-acciones">
            <span>
              Elegiste <strong>{elegidos.length}</strong> de {cupo}
              {sePasaDelCupo && ' — sacá a alguien para poder confirmar'}
            </span>
            <button
              type="button"
              className="btn btn-primary btn-chico"
              onClick={handleConfirmar}
              disabled={ocupado || elegidos.length === 0 || sePasaDelCupo}
            >
              Confirmar convocatoria
            </button>
          </div>
        </>
      )}
    </div>
  )
}
