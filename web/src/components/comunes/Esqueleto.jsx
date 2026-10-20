// "Esqueleto" de carga: tarjetas grises que titilan mientras llegan los datos.
// Se ve más prolijo que un "Cargando..." y la pantalla no salta cuando aparecen los datos.
export function Esqueleto({ filas = 3 }) {
  return (
    <div className="esqueleto-lista" aria-busy="true" aria-label="Cargando">
      {Array.from({ length: filas }, (_, i) => (
        <div key={i} className="esqueleto-tarjeta">
          <div className="esqueleto esqueleto-chip" />
          <div className="esqueleto-lineas">
            <div className="esqueleto esqueleto-titulo" />
            <div className="esqueleto esqueleto-corto" />
          </div>
        </div>
      ))}
    </div>
  )
}
