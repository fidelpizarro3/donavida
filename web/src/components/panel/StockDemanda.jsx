import { useState, useEffect, useCallback } from 'react'
import { GraficoStockDemanda } from './GraficoStockDemanda'
import { ProponerTransferencia } from './ProponerTransferencia'
import { SEMAFORO, textoCobertura, claveDe } from './textos'
import { COMPONENTES, grupoConFactor } from '../necesidades/textos'
import { AvisoFlotante } from '../comunes/AvisoFlotante'
import { Esqueleto } from '../comunes/Esqueleto'

// TAREA-15: cuadro de stock contra demanda por grupo sanguíneo.
// El hospital ve el suyo; el admin (esAdmin) ve el de toda la red y no pide transferencias.
// Tocar un grupo (en el gráfico o en las fichas) abre su detalle, y desde ahí se propone la transferencia.
export function StockDemanda({ token, apiUrl, esAdmin = false }) {
  const [cuadro, setCuadro] = useState(null)
  const [componente, setComponente] = useState('globulos_rojos')
  const [elegido, setElegido] = useState(null) // clave del grupo abierto, ej. "O|negativo"
  const [cargando, setCargando] = useState(true)
  const [mensaje, setMensaje] = useState(null)
  const [error, setError] = useState(null)
  const [version, setVersion] = useState(0)

  // Esta sección usa dos recursos (panel y transferencias), por eso recibe la ruta completa
  const pedir = useCallback(async (ruta, opciones = {}) => {
    const res = await fetch(`${apiUrl}${ruta}`, {
      ...opciones,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error?.mensaje || 'Error al comunicarse con el servidor')
    return data
  }, [apiUrl, token])

  useEffect(() => {
    let activo = true
    pedir(`/api/panel/stock-demanda?componente=${componente}`)
      .then((datos) => { if (activo) setCuadro(datos) })
      .catch((err) => { if (activo) setError(err.message) })
      .finally(() => { if (activo) setCargando(false) })
    return () => {
      activo = false
    }
  }, [pedir, componente, version])

  const cambiarComponente = (nuevo) => {
    setComponente(nuevo)
    setElegido(null)
    setCargando(true)
  }

  // Tocar el grupo abierto lo cierra
  const elegir = (clave) => setElegido((actual) => (actual === clave ? null : clave))

  const transferenciaPedida = (texto) => {
    setMensaje(texto)
    setVersion((v) => v + 1) // lo pedido queda "en camino": el grupo deja de faltar
  }

  const fila = cuadro?.grupos.find((g) => claveDe(g) === elegido)
  const criticos = cuadro?.grupos.filter((g) => g.semaforo === 'rojo').length ?? 0

  return (
    <section className="card">
      <div className="card-title">
        <div>
          <h3 style={{ margin: 0 }}>{esAdmin ? 'Stock y demanda de la red' : 'Stock y demanda'}</h3>
          <small className="texto-suave">
            Lo que hay contra lo que se necesita. La cobertura usa el consumo de los últimos {cuadro?.diasConsumo ?? 30} días
            y descuenta lo que se vencería antes de usarse.
          </small>
        </div>
        {criticos > 0 && <span className="badge badge-danger">{criticos} {criticos === 1 ? 'grupo crítico' : 'grupos críticos'}</span>}
      </div>

      <nav className="pestanas pestanas-chicas" role="tablist">
        {['globulos_rojos', 'plaquetas'].map((c) => (
          <button key={c} type="button" role="tab" aria-selected={componente === c} className={`pestana ${componente === c ? 'activa' : ''}`} onClick={() => cambiarComponente(c)}>
            {COMPONENTES[c]}
          </button>
        ))}
      </nav>

      <AvisoFlotante mensaje={mensaje} onCerrar={() => setMensaje(null)} />
      {error && <div className="alert alert-danger">{error}</div>}
      {cargando && <Esqueleto />}

      {!cargando && cuadro && (
        <>
          <GraficoStockDemanda grupos={cuadro.grupos} elegido={elegido} onElegir={elegir} />

          {/* Las mismas columnas como fichas: con el semáforo y la cobertura a la vista */}
          <div className="grupos-grilla">
            {cuadro.grupos.map((g) => {
              const semaforo = SEMAFORO[g.semaforo]
              return (
                <button
                  key={claveDe(g)}
                  type="button"
                  className={`grupo-ficha ${elegido === claveDe(g) ? 'elegido' : ''}`}
                  style={{ borderLeftColor: semaforo.color }}
                  onClick={() => elegir(claveDe(g))}
                >
                  <span className="grupo-ficha-nombre">{grupoConFactor(g.grupoSanguineo, g.factorRh)}</span>
                  <span className={`badge ${semaforo.clase}`}>{semaforo.texto}</span>
                  <small>{textoCobertura(g)}</small>
                </button>
              )
            })}
          </div>

          {fila && (
            <div className="grupo-detalle">
              <h4>{grupoConFactor(fila.grupoSanguineo, fila.factorRh)} · {COMPONENTES[componente]}</h4>
              <ul className="grupo-numeros">
                <li><strong>{fila.disponible}</strong> disponibles</li>
                <li><strong>{fila.necesitando}</strong> pedidas en necesidades abiertas</li>
                <li><strong>{fila.consumoDiario}</strong> usadas por día</li>
                <li><strong>{textoCobertura(fila)}</strong> de cobertura</li>
              </ul>

              {fila.porVencer > 0 && (
                <div className="alert alert-warning">{fila.porVencer} por vencer: conviene usarlas primero.</div>
              )}
              {fila.seVencenSinUsar > 0 && (
                <div className="alert alert-warning">
                  Al ritmo de uso actual, {fila.seVencenSinUsar} se vencerían antes de usarse: otro hospital podría aprovecharlas.
                </div>
              )}

              {fila.balance < 0 && (
                <div className="alert alert-danger">
                  Faltan {-fila.balance}. Para cubrirlo con donantes habría que citar unas <strong>{fila.donantesACitar} personas</strong>
                  {cuadro.tasaPresentacion.segun === 'historial'
                    ? ` (de cada 10 convocados, donan ${Math.round(cuadro.tasaPresentacion.tasa * 10)}).`
                    : ' (estimado suponiendo que dona la mitad de los convocados: todavía no hay historial suficiente).'}
                </div>
              )}

              {/* El admin mira la red; las transferencias las pide cada hospital */}
              {!esAdmin && fila.semaforo !== 'verde' && (
                <ProponerTransferencia key={`${elegido}|${version}`} fila={fila} componente={componente} pedir={pedir} onPedida={transferenciaPedida} />
              )}
            </div>
          )}
        </>
      )}
    </section>
  )
}
