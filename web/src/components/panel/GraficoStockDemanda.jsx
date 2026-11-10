import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell } from 'recharts'
import { grupoConFactor } from '../necesidades/textos'
import { SEMAFORO, COLOR_NECESITANDO, textoCobertura, claveDe } from './textos'

// Lo que aparece al pasar el mouse por una barra. Recharts le pasa en "payload" los datos de esa columna
function Detalle({ active, payload }) {
  if (!active || !payload?.length) return null
  const fila = payload[0].payload
  return (
    <div className="grafico-detalle">
      <strong>{fila.nombre}</strong>
      <span>Disponible: {fila.disponible}</span>
      <span>Necesitando: {fila.necesitando}</span>
      <span>Cobertura: {textoCobertura(fila)}</span>
      {fila.porVencer > 0 && <span>Por vencer: {fila.porVencer}</span>}
      <small>Tocá la barra para ver el detalle</small>
    </div>
  )
}

// TAREA-15: barras por grupo sanguíneo. La barra de lo disponible toma el color del semáforo;
// al lado, en bordó, lo que se está necesitando. Tocar una columna elige ese grupo (onElegir).
export function GraficoStockDemanda({ grupos, elegido, onElegir }) {
  // Recharts trabaja con una lista de objetos: cada uno es una columna del gráfico
  const datos = grupos.map((fila) => ({ ...fila, nombre: grupoConFactor(fila.grupoSanguineo, fila.factorRh) }))
  const elegir = (_, indice) => onElegir(claveDe(datos[indice]))

  return (
    <>
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={datos} margin={{ top: 8, right: 8, left: -16, bottom: 0 }} barGap={2}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e9e1df" />
          <XAxis dataKey="nombre" tickLine={false} />
          <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
          <Tooltip content={<Detalle />} cursor={{ fill: '#f4eeec' }} />
          <Bar dataKey="disponible" name="Disponible" radius={[4, 4, 0, 0]} onClick={elegir} cursor="pointer">
            {/* Cell: una barra de distinto color por columna */}
            {datos.map((fila) => (
              <Cell
                key={fila.nombre}
                fill={SEMAFORO[fila.semaforo].color}
                fillOpacity={!elegido || elegido === claveDe(fila) ? 1 : 0.35}
              />
            ))}
          </Bar>
          <Bar dataKey="necesitando" name="Necesitando" fill={COLOR_NECESITANDO} radius={[4, 4, 0, 0]} onClick={elegir} cursor="pointer" />
        </BarChart>
      </ResponsiveContainer>

      <div className="grafico-leyenda">
        {['rojo', 'amarillo', 'verde'].map((color) => (
          <span key={color}><i style={{ background: SEMAFORO[color].color }} /> Disponible · {SEMAFORO[color].texto.toLowerCase()}</span>
        ))}
        <span><i style={{ background: COLOR_NECESITANDO }} /> Necesitando</span>
      </div>
    </>
  )
}
