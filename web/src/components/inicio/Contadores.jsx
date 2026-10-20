import { useState, useEffect } from 'react'
import { useEnVivo } from './enVivo'

// Quien prefiere menos movimiento (configuración del sistema) ve el número directo, sin animación
const SIN_ANIMACION = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

// Número que sube animado desde el valor anterior hasta el nuevo
function NumeroAnimado({ valor }) {
  const [mostrado, setMostrado] = useState(0)

  useEffect(() => {
    if (SIN_ANIMACION) return undefined
    let cuadro
    const desde = mostrado
    const inicio = performance.now()
    const DURACION = 1200
    const paso = (ahora) => {
      const t = Math.min(1, (ahora - inicio) / DURACION)
      const suave = 1 - (1 - t) ** 3 // arranca rápido y frena al final
      setMostrado(Math.round(desde + (valor - desde) * suave))
      if (t < 1) cuadro = requestAnimationFrame(paso)
    }
    cuadro = requestAnimationFrame(paso)
    return () => cancelAnimationFrame(cuadro)
    // Solo se anima cuando cambia el valor que llega de la API
  }, [valor]) // eslint-disable-line react-hooks/exhaustive-deps

  return <>{(SIN_ANIMACION ? valor : mostrado).toLocaleString('es-AR')}</>
}

const CONTADORES = [
  { campo: 'donantes', texto: 'donantes en la red' },
  { campo: 'donaciones', texto: 'donaciones registradas' },
  { campo: 'vidas', texto: 'vidas que se pudieron ayudar' },
  { campo: 'instituciones', texto: 'hospitales y bancos de sangre' },
]

// Contadores de la red, en vivo (salen de GET /api/publico/estadisticas)
export function Contadores({ apiUrl }) {
  const { datos } = useEnVivo(`${apiUrl}/api/publico/estadisticas`)

  return (
    <section className="datos datos-cuatro">
      {CONTADORES.map(({ campo, texto }) => (
        <div key={campo} className="dato">
          <span className="dato-numero">
            {datos ? <NumeroAnimado valor={datos[campo]} /> : <span className="esqueleto esqueleto-numero" />}
          </span>
          <span className="dato-texto">{texto}</span>
        </div>
      ))}
    </section>
  )
}
