// TAREA-15: cuadro de stock contra demanda, por grupo sanguíneo.
// Compara lo que hay (stock disponible) contra lo que se necesita (necesidades abiertas)
// y lo que se consume habitualmente (usos de los últimos 30 días).
// Solo lee: unidad_sangre, movimiento_unidad, necesidad, stock_minimo.
const prisma = require('../lib/prisma');
const { obtenerFechaHoy } = require('../utils/validaciones');
const { parsearFecha, formatearFecha } = require('../utils/formateadores');
const { enCaminoPorNecesidad } = require('./cobertura');
const { calcularDiasRestantes, estaPorVencer } = require('./unidades');

const DIAS_CONSUMO = 30;
const MS_POR_DIA = 24 * 60 * 60 * 1000;

// Los 8 grupos del cuadro, siempre en el mismo orden (aunque alguno no tenga datos)
const GRUPOS = ['O', 'A', 'B', 'AB'].flatMap((grupoSanguineo) =>
  ['negativo', 'positivo'].map((factorRh) => ({ grupoSanguineo, factorRh }))
);

// Semáforo según los días de cobertura que quedan
const DIAS_ROJO = 3; // menos de 3 días: rojo
const DIAS_AMARILLO = 7; // de 3 a 7 días: amarillo; más: verde

const esDelGrupo = (grupo) => (x) => x.grupoSanguineo === grupo.grupoSanguineo && x.factorRh === grupo.factorRh;

// Trae todo lo que hace falta para el cuadro, de un componente.
// idInstitucion undefined = el admin, que ve la red completa (Prisma ignora los filtros undefined)
async function cargarDatos(idInstitucion, componente) {
  const hoy = parsearFecha(obtenerFechaHoy());
  const desde = new Date(Date.now() - DIAS_CONSUMO * MS_POR_DIA);

  const [unidades, necesidades, usos] = await Promise.all([
    // Lo que hay: disponibles y sin vencer
    prisma.unidadSangre.findMany({
      where: { idInstitucion, componente, estado: 'disponible', fechaVencimiento: { gte: hoy } },
    }),
    // Lo que se necesita: necesidades todavía abiertas
    prisma.necesidad.findMany({
      where: { idInstitucion, componente, estado: 'abierta' },
    }),
    // Lo que se consume: cada "usar" dejó un movimiento de tipo uso
    prisma.movimientoUnidad.findMany({
      where: { tipo: 'uso', ocurridoEn: { gte: desde }, idInstitucionOrigen: idInstitucion, unidad: { componente } },
      include: { unidad: { select: { grupoSanguineo: true, factorRh: true } } },
    }),
  ]);

  // Lo pedido a otros hospitales todavía no llegó, pero ya no hay que conseguirlo (TAREA-14 de Mateo)
  const enCamino = await enCaminoPorNecesidad(necesidades.map((n) => n.idNecesidad));

  return { unidades, necesidades, usos, enCamino };
}

// Cuántas unidades se llegan a usar antes de vencer, consumiendo primero la que vence antes.
// Con un consumo de 2 por día, la unidad número 6 (en orden de vencimiento) se usa recién el día 3:
// si vence antes, se pierde y no cuenta para la cobertura.
// diasRestantesOrdenados: los días que le quedan a cada unidad, de menor a mayor.
function unidadesQueSeLleganAUsar(diasRestantesOrdenados, consumoDiario) {
  return diasRestantesOrdenados.filter((dias, i) => dias >= Math.floor(i / consumoDiario)).length;
}

function calcularSemaforo({ balance, diasCobertura, disponible }) {
  if (balance < 0) return 'rojo'; // no alcanza ni para lo que ya se está pidiendo
  if (diasCobertura === null) return disponible > 0 ? 'verde' : 'sin_datos'; // sin consumo reciente
  if (diasCobertura < DIAS_ROJO) return 'rojo';
  if (diasCobertura < DIAS_AMARILLO) return 'amarillo';
  return 'verde';
}

// Una fila del cuadro por grupo sanguíneo (O−, O+, A−, ...), con los datos de cargarDatos()
function armarFilas({ unidades, necesidades, usos, enCamino }, componente) {
  const hoy = obtenerFechaHoy();

  return GRUPOS.map((grupo) => {
    const diasRestantes = unidades
      .filter(esDelGrupo(grupo))
      .map((u) => calcularDiasRestantes(formatearFecha(u.fechaVencimiento), hoy))
      .sort((a, b) => a - b);

    // Lo que todavía falta conseguir de cada necesidad (lo que ya viene por transferencia no cuenta).
    // Se devuelve cada una para poder asociarle la transferencia que se pida desde el cuadro
    const faltantes = necesidades
      .filter(esDelGrupo(grupo))
      .map((n) => ({
        idNecesidad: n.idNecesidad,
        faltan: Math.max(0, n.unidadesSolicitadas - n.unidadesCubiertas - (enCamino.get(n.idNecesidad) ?? 0)),
      }))
      .filter((n) => n.faltan > 0);
    const necesitando = faltantes.reduce((total, n) => total + n.faltan, 0);

    const usados = usos.filter((m) => esDelGrupo(grupo)(m.unidad)).length;
    const consumoDiario = usados / DIAS_CONSUMO;

    const disponible = diasRestantes.length;
    const balance = disponible - necesitando;

    // Sin consumo no hay cobertura que calcular (sería dividir por cero)
    let diasCobertura = null;
    let seVencenSinUsar = 0;
    if (consumoDiario > 0) {
      const utiles = unidadesQueSeLleganAUsar(diasRestantes, consumoDiario);
      seVencenSinUsar = disponible - utiles;
      diasCobertura = Math.floor(utiles / consumoDiario);
    }

    return {
      ...grupo,
      disponible,
      porVencer: diasRestantes.filter((dias) => estaPorVencer(componente, dias)).length,
      seVencenSinUsar,
      necesitando,
      necesidades: faltantes,
      balance,
      consumoDiario: Math.round(consumoDiario * 10) / 10, // un decimal alcanza para mostrar
      diasCobertura,
      semaforo: calcularSemaforo({ balance, diasCobertura, disponible }),
    };
  });
}

// ─── Donantes a citar ────────────────────────────────────────────────────────

const DIAS_HISTORIAL = 90;
const MINIMO_ALERTAS = 10; // con menos datos que esto, la tasa propia no es confiable
const TASA_POR_DEFECTO = 0.5; // supuesto inicial: de cada 2 convocados, 1 termina donando

// De cada persona convocada, cuántas terminan donando: donaciones realizadas / alertas enviadas (últimos 90 días).
// Se mide con los datos reales de la institución (o de la red, para el admin).
async function estimarTasaPresentacion(idInstitucion) {
  const desde = new Date(Date.now() - DIAS_HISTORIAL * MS_POR_DIA);
  const [alertas, donaciones] = await Promise.all([
    prisma.alerta.count({
      where: { enviadaEn: { gte: desde }, convocatoria: { necesidad: { idInstitucion } } },
    }),
    prisma.donacion.count({
      where: { resultado: 'realizada', fecha: { gte: desde }, idInstitucion },
    }),
  ]);

  if (alertas < MINIMO_ALERTAS || donaciones === 0) {
    return { tasa: TASA_POR_DEFECTO, segun: 'supuesto' };
  }
  return { tasa: Math.min(1, donaciones / alertas), segun: 'historial', alertas, donaciones };
}

// Para cubrir lo que falta hay que citar más gente de la que hace falta, porque no todos vienen.
// Faltan 3 y dona 1 de cada 2 → hay que citar 6.
function donantesACitar(balance, tasa) {
  const faltante = Math.max(0, -balance);
  return Math.ceil(faltante / tasa);
}

// ─── Todo junto ──────────────────────────────────────────────────────────────

// El cuadro completo. idInstitucion undefined = toda la red (admin)
async function armarCuadro(idInstitucion, componente) {
  const [datos, presentacion] = await Promise.all([
    cargarDatos(idInstitucion, componente),
    estimarTasaPresentacion(idInstitucion),
  ]);

  const grupos = armarFilas(datos, componente).map((fila) => ({
    ...fila,
    donantesACitar: donantesACitar(fila.balance, presentacion.tasa),
  }));

  return {
    componente,
    alcance: idInstitucion ? 'institucion' : 'red',
    diasConsumo: DIAS_CONSUMO,
    tasaPresentacion: presentacion,
    grupos,
  };
}

module.exports = {
  armarCuadro,
  // Lógica pura, exportada para los tests
  armarFilas,
  unidadesQueSeLleganAUsar,
  calcularSemaforo,
  donantesACitar,
};
