import { useState, useEffect, useCallback } from 'react'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, PieChart, Pie, Cell,
} from 'recharts'
import { grupoConFactor } from '../necesidades/textos'
import { Esqueleto } from '../comunes/Esqueleto'
import { descargarCsv } from './informe'

// Recharts dibuja en SVG y necesita los colores como valor: son los de --primary, --primary-dark, --success y --warning
const COLORES = {
  publicadas: '#7a1414', cubiertas: '#c92a2a', vencidas: '#b35c00',
  donantes: '#c92a2a', transferencia: '#2b8a3e', ambas: '#e8a100', sinRegistrar: '#b8b0ae',
}

const PERIODOS = [
  { id: '30', texto: 'Último mes', dias: 30 },
  { id: '90', texto: 'Últimos 3 meses', dias: 90 },
  { id: '365', texto: 'Último año', dias: 365 },
  { id: 'otro', texto: 'Elegir fechas' },
]
const GRUPOS = ['O', 'A', 'B', 'AB'].flatMap((g) => ['negativo', 'positivo'].map((f) => `${g}|${f}`))
const NOMBRE_MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

// Fecha de hoy menos N días, en formato YYYY-MM-DD
function haceDias(dias) {
  const fecha = new Date()
  fecha.setDate(fecha.getDate() - dias)
  return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')}`
}

// 30 → "1 día y 6 h"; 5 → "5 h"
function textoHoras(horas) {
  if (horas < 24) return `${Math.round(horas)} h`
  const dias = Math.floor(horas / 24)
  const resto = Math.round(horas - dias * 24)
  const textoDias = dias === 1 ? '1 día' : `${dias} días`
  return resto === 0 ? textoDias : `${textoDias} y ${resto} h`
}

const textoMes = (mes) => `${NOMBRE_MES[Number(mes.slice(5, 7)) - 1]} ${mes.slice(2, 4)}`

function Tarjeta({ titulo, valor, detalle }) {
  return (
    <div className="estadistica-tarjeta">
      <span className="estadistica-titulo">{titulo}</span>
      <strong className="estadistica-valor">{valor}</strong>
      {detalle && <small>{detalle}</small>}
    </div>
  )
}

// TAREA-19: estadísticas de convocatorias y donaciones.
// El hospital ve las suyas; el admin (esAdmin) ve toda la red sumada.
// Criterios: filtro por período y grupo, cubiertas con transferencia o con donantes, informe descargable.
export function Estadisticas({ token, apiUrl, esAdmin = false }) {
  const [periodo, setPeriodo] = useState('90')
  const [fechas, setFechas] = useState({ desde: haceDias(89), hasta: haceDias(0) })
  const [grupo, setGrupo] = useState('') // '' = todos, o "O|negativo"
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState(null)

  const pedir = useCallback(async (ruta) => {
    const res = await fetch(`${apiUrl}${ruta}`, { headers: { Authorization: `Bearer ${token}` } })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error?.mensaje || 'Error al comunicarse con el servidor')
    return data
  }, [apiUrl, token])

  useEffect(() => {
    let activo = true
    const query = new URLSearchParams({ desde: fechas.desde, hasta: fechas.hasta })
    if (grupo) {
      const [grupoSanguineo, factorRh] = grupo.split('|')
      query.set('grupoSanguineo', grupoSanguineo)
      query.set('factorRh', factorRh)
    }
    pedir(`/api/estadisticas/convocatorias?${query}`)
      .then((respuesta) => { if (activo) { setDatos(respuesta); setError(null) } })
      .catch((err) => { if (activo) setError(err.message) })
    return () => {
      activo = false
    }
  }, [pedir, fechas, grupo])

  const elegirPeriodo = (id) => {
    setPeriodo(id)
    const elegido = PERIODOS.find((p) => p.id === id)
    if (elegido.dias) setFechas({ desde: haceDias(elegido.dias - 1), hasta: haceDias(0) })
  }

  const cambiarFecha = (e) => {
    const { name, value } = e.target
    if (value) setFechas((prev) => ({ ...prev, [name]: value }))
  }

  const n = datos?.necesidades
  const d = datos?.donantes
  const formas = datos
    ? [
        { nombre: 'Con donantes', clave: 'donantes', valor: datos.cubiertasCon.donantes },
        { nombre: 'Con transferencia', clave: 'transferencia', valor: datos.cubiertasCon.transferencia },
        { nombre: 'Con las dos cosas', clave: 'ambas', valor: datos.cubiertasCon.ambas },
        // Cubiertas antes de que el sistema guardara cómo (TAREA-13)
        { nombre: 'Sin registrar', clave: 'sinRegistrar', valor: datos.cubiertasCon.sinRegistrar },
      ].filter((f) => f.valor > 0)
    : []
  const meses = datos?.porMes.map((fila) => ({ ...fila, nombre: textoMes(fila.mes) })) ?? []
  const vencidas = datos?.unidadesVencidas.porGrupo.map((fila) => ({ ...fila, nombre: grupoConFactor(fila.grupoSanguineo, fila.factorRh) })) ?? []

  return (
    <section className="card estadisticas">
      <div className="card-title">
        <h3 style={{ margin: 0 }}>{esAdmin ? 'Estadísticas de toda la red' : 'Estadísticas de convocatorias y donaciones'}</h3>
        {datos && (
          <div className="estadisticas-acciones">
            <button type="button" className="btn btn-secondary btn-chico" onClick={() => descargarCsv(datos)}>
              Descargar informe (Excel)
            </button>
            <button type="button" className="btn btn-secondary btn-chico" onClick={() => window.print()}>
              Imprimir o guardar PDF
            </button>
          </div>
        )}
      </div>

      <div className="estadisticas-filtros">
        <div className="form-group">
          <label htmlFor="est-periodo">Período</label>
          <select id="est-periodo" value={periodo} onChange={(e) => elegirPeriodo(e.target.value)}>
            {PERIODOS.map((p) => <option key={p.id} value={p.id}>{p.texto}</option>)}
          </select>
        </div>
        {periodo === 'otro' && (
          <>
            <div className="form-group">
              <label htmlFor="est-desde">Desde</label>
              <input id="est-desde" name="desde" type="date" value={fechas.desde} max={fechas.hasta} onChange={cambiarFecha} />
            </div>
            <div className="form-group">
              <label htmlFor="est-hasta">Hasta</label>
              <input id="est-hasta" name="hasta" type="date" value={fechas.hasta} min={fechas.desde} onChange={cambiarFecha} />
            </div>
          </>
        )}
        <div className="form-group">
          <label htmlFor="est-grupo">Grupo sanguíneo</label>
          <select id="est-grupo" value={grupo} onChange={(e) => setGrupo(e.target.value)}>
            <option value="">Todos</option>
            {GRUPOS.map((clave) => <option key={clave} value={clave}>{grupoConFactor(...clave.split('|'))}</option>)}
          </select>
        </div>
      </div>

      {error && <div className="alert alert-danger">{error}</div>}
      {!datos && !error && <Esqueleto />}

      {datos && (
        <>
          <p className="texto-suave estadisticas-periodo">
            Del {datos.periodo.desde.split('-').reverse().join('/')} al {datos.periodo.hasta.split('-').reverse().join('/')}
            {grupo && ` · Grupo ${grupoConFactor(...grupo.split('|'))}`}
          </p>

          <div className="estadisticas-tarjetas">
            <Tarjeta
              titulo="Necesidades cubiertas"
              valor={`${n.cubiertas} de ${n.publicadas}`}
              detalle={n.publicadas === 0 ? 'No se publicaron necesidades' : `${n.porcentajeCubiertas}% · ${n.vencidasSinCubrir} vencieron sin cubrirse · ${n.abiertas} abiertas`}
            />
            <Tarjeta
              titulo="Tiempo hasta cubrir"
              valor={datos.tiempoHastaCubrir ? textoHoras(datos.tiempoHastaCubrir.horasPromedio) : '—'}
              detalle={datos.tiempoHastaCubrir
                ? `En promedio · la más rápida en ${textoHoras(datos.tiempoHastaCubrir.horasMinimo)}`
                : 'Todavía no se cubrió ninguna'}
            />
            <Tarjeta
              titulo="Donantes que respondieron"
              valor={`${d.respondieron} de ${d.convocados}`}
              detalle={d.convocados === 0 ? 'No se convocó a nadie' : `${d.porcentajeRespondieron}% · ${d.fueronAlTurno} fueron al turno · ${d.faltaronAlTurno} faltaron`}
            />
            <Tarjeta
              titulo="Unidades vencidas"
              valor={datos.unidadesVencidas.total}
              detalle={datos.unidadesVencidas.total === 0 ? 'No se venció ninguna en el período' : 'Sangre que se perdió sin usarse'}
            />
          </div>

          <div className="estadisticas-graficos">
            <div className="estadistica-grafico">
              <h4>Necesidades por mes</h4>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={meses} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e9e1df" />
                  <XAxis dataKey="nombre" tickLine={false} />
                  <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
                  <Tooltip cursor={{ fill: '#f4eeec' }} />
                  <Legend />
                  <Bar dataKey="publicadas" name="Publicadas" fill={COLORES.publicadas} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="cubiertas" name="Cubiertas" fill={COLORES.cubiertas} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="vencidas" name="Unidades vencidas" fill={COLORES.vencidas} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="estadistica-grafico">
              <h4>Cómo se cubrieron</h4>
              {formas.length === 0 ? (
                <p className="texto-suave">Todavía no se cubrió ninguna necesidad en este período.</p>
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <PieChart>
                    <Pie data={formas} dataKey="valor" nameKey="nombre" innerRadius={50} outerRadius={85} paddingAngle={2} label>
                      {formas.map((f) => <Cell key={f.clave} fill={COLORES[f.clave]} />)}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="estadistica-grafico">
              <h4>Unidades vencidas por grupo</h4>
              {vencidas.length === 0 ? (
                <p className="texto-suave">No se venció ninguna unidad en este período.</p>
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={vencidas} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e9e1df" />
                    <XAxis dataKey="nombre" tickLine={false} />
                    <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
                    <Tooltip cursor={{ fill: '#f4eeec' }} />
                    <Bar dataKey="cantidad" name="Vencidas" fill={COLORES.vencidas} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </>
      )}
    </section>
  )
}
