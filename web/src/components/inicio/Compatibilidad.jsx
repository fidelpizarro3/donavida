import { useState } from 'react'

const GRUPOS = ['O', 'A', 'B', 'AB']
const FACTORES = [{ valor: 'negativo', signo: '−' }, { valor: 'positivo', signo: '+' }]

// Glóbulos rojos: a qué grupos ABO le puede donar cada grupo
// (es la misma regla que usa la convocatoria en api/src/services/compatibilidad.js, vista del lado del donante)
const LE_DONA_A = {
  O: ['O', 'A', 'B', 'AB'],
  A: ['A', 'AB'],
  B: ['B', 'AB'],
  AB: ['AB'],
}

// ¿Este donante le sirve a este paciente? Negativo le dona a todos; positivo solo a positivos
function sirve(donante, paciente) {
  const grupoOk = LE_DONA_A[donante.grupo].includes(paciente.grupo)
  const factorOk = donante.factor === 'negativo' || paciente.factor === 'positivo'
  return grupoOk && factorOk
}

// "¿A quién le podés donar?": elegís tu grupo y se iluminan los grupos a los que les servís
export function Compatibilidad() {
  const [donante, setDonante] = useState({ grupo: 'O', factor: 'negativo' })
  const pacientes = GRUPOS.flatMap((grupo) => FACTORES.map(({ valor, signo }) => ({ grupo, factor: valor, signo })))
  const cuantos = pacientes.filter((p) => sirve(donante, p)).length

  return (
    <div className="compatibilidad">
      <div className="compatibilidad-elegir">
        <span className="texto-suave">Mi grupo es</span>
        <div className="compatibilidad-botones">
          {pacientes.map((p) => {
            const elegido = p.grupo === donante.grupo && p.factor === donante.factor
            return (
              <button
                key={p.grupo + p.factor}
                type="button"
                className={`grupo-boton ${elegido ? 'elegido' : ''}`}
                onClick={() => setDonante({ grupo: p.grupo, factor: p.factor })}
                aria-pressed={elegido}
              >
                {p.grupo}{p.signo}
              </button>
            )
          })}
        </div>
      </div>

      <div className="compatibilidad-resultado">
        <p>
          Con glóbulos rojos le podés donar a <strong>{cuantos} de los 8</strong> grupos
          {cuantos === 8 && <> — <strong>¡sos donante universal!</strong></>}
        </p>
        <div className="compatibilidad-grilla">
          {pacientes.map((p) => (
            <span key={p.grupo + p.factor} className={`grupo-celda ${sirve(donante, p) ? 'si' : ''}`}>
              {p.grupo}{p.signo}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
