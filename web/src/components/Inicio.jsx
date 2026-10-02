// Portal de inicio: lo primero que ve quien entra sin sesión
const PASOS = [
  { titulo: 'Registrate', texto: 'Cargá tus datos en dos minutos. Si no sabés tu grupo sanguíneo, se completa en tu primera donación.' },
  { titulo: 'Activá tu cuenta', texto: 'Confirmás tu cuenta y elegís en qué horarios querés que te contactemos.' },
  { titulo: 'Recibí un aviso', texto: 'Cuando un hospital cercano necesita tu grupo, te llega una alerta con el motivo y la distancia.' },
  { titulo: 'Doná', texto: 'Reservás un turno, vas con tu código QR y tu donación queda registrada en tu carné.' },
]

const DATOS = [
  { numero: '3', texto: 'personas pueden recibir ayuda de una sola donación' },
  { numero: '8', texto: 'tipos de sangre combinando grupo y factor Rh' },
  { numero: '56', texto: 'días de descanso entre donaciones de sangre entera' },
]

export function Inicio({ onRegistrarse, onIngresar }) {
  return (
    <div className="inicio">
      <section className="hero">
        <div className="hero-texto">
          <span className="eyebrow">Red de donación de sangre en tiempo real</span>
          <h1>
            Tu sangre puede llegar <span className="resaltado">justo a tiempo</span>.
          </h1>
          <p className="hero-bajada">
            DonaVida conecta a hospitales y bancos de sangre con donantes compatibles y cercanos.
            Te avisamos solo cuando hacés falta, y nunca más seguido de lo que elegís.
          </p>
          <div className="hero-acciones">
            <button type="button" className="btn btn-primary btn-grande" onClick={onRegistrarse}>
              Quiero ser donante
            </button>
            <button type="button" className="btn btn-secondary btn-grande" onClick={onIngresar}>
              Ya tengo cuenta
            </button>
          </div>
        </div>

        {/* Ilustración: así se ve una necesidad publicada por un hospital */}
        <div className="hero-visual" aria-hidden="true">
          <div className="necesidad-demo">
            <div className="necesidad-demo-cabecera">
              <span className="grupo-chip">O−</span>
              <div>
                <strong>Hospital Central</strong>
                <small>Glóbulos rojos · a 4,2 km</small>
              </div>
              <span className="badge badge-urgente">Urgente</span>
            </div>
            <div className="progreso">
              <div className="progreso-barra" style={{ width: '66%' }} />
            </div>
            <div className="necesidad-demo-pie">
              <span><strong>4</strong> de 6 unidades cubiertas</span>
              <span>Faltan <strong>2</strong></span>
            </div>
          </div>
          <div className="aviso-flotante">
            <span className="punto-vivo" />
            Alerta enviada a 12 donantes compatibles
          </div>
        </div>
      </section>

      <section className="datos">
        {DATOS.map((dato) => (
          <div key={dato.numero} className="dato">
            <span className="dato-numero">{dato.numero}</span>
            <span className="dato-texto">{dato.texto}</span>
          </div>
        ))}
      </section>

      <section className="seccion">
        <h2 className="seccion-titulo">Cómo funciona</h2>
        <ol className="pasos">
          {PASOS.map((paso, i) => (
            <li key={paso.titulo} className="paso">
              <span className="paso-numero">{i + 1}</span>
              <h3>{paso.titulo}</h3>
              <p>{paso.texto}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="seccion">
        <h2 className="seccion-titulo">Pensado para los dos lados</h2>
        <div className="publicos">
          <article className="publico">
            <h3>Para donantes</h3>
            <ul>
              <li>Sabés si estás en condiciones de donar hoy y, si no, desde cuándo.</li>
              <li>Elegís canales, horarios y un tope de avisos por mes.</li>
              <li>Tu historial y tu próximo turno, siempre a mano.</li>
            </ul>
          </article>
          <article className="publico">
            <h3>Para hospitales y bancos de sangre</h3>
            <ul>
              <li>Publicás una necesidad y ves en todo momento cuánto falta cubrir.</li>
              <li>Convocás solo a donantes habilitados y compatibles.</li>
              <li>Pedís unidades a otros bancos de la red antes de convocar.</li>
            </ul>
          </article>
        </div>
      </section>

      <section className="cta-final">
        <h2>Una hora de tu tiempo puede cambiar el día de alguien.</h2>
        <button type="button" className="btn btn-claro btn-grande" onClick={onRegistrarse}>
          Registrarme como donante
        </button>
      </section>
    </div>
  )
}
