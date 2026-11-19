// TAREA-19: estadísticas de las convocatorias y donaciones de una institución (o de toda la red, para el admin).
// Responde: cuántas necesidades publicó y cuántas cubrió, en cuánto tiempo, si se cubrieron con donantes o con
// transferencias, cuántos donantes respondieron y cuántas unidades se vencieron.
//
// Solo lee. El período se aplica a la fecha en que se publicó cada necesidad y a la fecha en que se venció cada unidad.
const prisma = require('../lib/prisma');
const { obtenerFechaHoyArgentina } = require('../utils/validaciones');

const MS_POR_HORA = 60 * 60 * 1000;

// Argentina es UTC-3 todo el año: el día "2026-11-01" empieza a las 03:00 UTC
const inicioDelDia = (fecha) => new Date(`${fecha}T03:00:00.000Z`);

function sumarDias(fecha, dias) {
  const d = new Date(`${fecha}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

// "2026-11" del momento dado, en hora de Argentina
const mesDe = (momento) => obtenerFechaHoyArgentina(momento).slice(0, 7);

// Todos los meses entre desde y hasta (incluidos), así el gráfico no saltea los meses sin datos
function mesesEntre(desde, hasta) {
  const meses = [];
  let [anio, mes] = desde.slice(0, 7).split('-').map(Number);
  const ultimo = hasta.slice(0, 7);
  for (;;) {
    const actual = `${anio}-${String(mes).padStart(2, '0')}`;
    meses.push(actual);
    if (actual >= ultimo) return meses;
    mes += 1;
    if (mes === 13) { mes = 1; anio += 1; }
  }
}

const redondear = (numero) => Math.round(numero * 10) / 10;
const porcentaje = (parte, total) => (total === 0 ? null : Math.round((parte / total) * 100));

function resumirNecesidades(necesidades) {
  const contar = (estado) => necesidades.filter((n) => n.estado === estado).length;
  const cubiertas = contar('cubierta');
  return {
    publicadas: necesidades.length,
    cubiertas,
    porcentajeCubiertas: porcentaje(cubiertas, necesidades.length),
    vencidasSinCubrir: contar('vencida'),
    cerradasAMano: contar('cerrada_manual'),
    abiertas: contar('abierta'),
  };
}

// Horas desde que se publicó hasta que se cubrió. null si ninguna se cubrió
function tiempoHastaCubrir(necesidades) {
  const horas = necesidades
    .filter((n) => n.estado === 'cubierta' && n.cerradaEn)
    .map((n) => (new Date(n.cerradaEn) - new Date(n.creadaEn)) / MS_POR_HORA);
  if (horas.length === 0) return null;
  return {
    horasPromedio: redondear(horas.reduce((a, b) => a + b, 0) / horas.length),
    horasMinimo: redondear(Math.min(...horas)),
    horasMaximo: redondear(Math.max(...horas)),
  };
}

// Criterio: cuántas se cubrieron con transferencia y cuántas con donantes (lo guarda TAREA-13 en cubierta_con).
// Las que se cubrieron antes de TAREA-13 no tienen el dato: van en "sinRegistrar" para que los números cierren.
function comoSeCubrieron(necesidades) {
  const cubiertas = necesidades.filter((n) => n.estado === 'cubierta');
  const contar = (forma) => cubiertas.filter((n) => n.cubiertaCon === forma).length;
  return { donantes: contar('donantes'), transferencia: contar('transferencia'), ambas: contar('ambas'), sinRegistrar: contar(null) };
}

// Solo cuentan las alertas que le llegaron al donante (las canceladas antes de enviarse, no)
function respuestaDonantes(alertas) {
  const contar = (condicion) => alertas.filter(condicion).length;
  const convocados = alertas.length;
  const aceptaron = contar((a) => a.estado === 'aceptada');
  const respondieron = aceptaron + contar((a) => a.estado === 'rechazada');
  const fueronAlTurno = contar((a) => a.turno?.estado === 'asistio');
  return {
    convocados,
    respondieron,
    porcentajeRespondieron: porcentaje(respondieron, convocados),
    aceptaron,
    fueronAlTurno,
    faltaronAlTurno: contar((a) => a.turno?.estado === 'ausente'),
  };
}

function resumirVencidas(vencimientos) {
  const porGrupo = new Map();
  for (const { unidad } of vencimientos) {
    const clave = `${unidad.grupoSanguineo}|${unidad.factorRh}`;
    if (!porGrupo.has(clave)) porGrupo.set(clave, { grupoSanguineo: unidad.grupoSanguineo, factorRh: unidad.factorRh, cantidad: 0 });
    porGrupo.get(clave).cantidad += 1;
  }
  return {
    total: vencimientos.length,
    porGrupo: [...porGrupo.values()].sort((a, b) => b.cantidad - a.cantidad),
  };
}

function porMes(desde, hasta, necesidades, vencimientos) {
  const filas = new Map(mesesEntre(desde, hasta).map((mes) => [mes, { mes, publicadas: 0, cubiertas: 0, vencidas: 0 }]));
  for (const n of necesidades) {
    const fila = filas.get(mesDe(new Date(n.creadaEn)));
    if (!fila) continue;
    fila.publicadas += 1;
    if (n.estado === 'cubierta') fila.cubiertas += 1;
  }
  for (const v of vencimientos) {
    const fila = filas.get(mesDe(new Date(v.ocurridoEn)));
    if (fila) fila.vencidas += 1;
  }
  return [...filas.values()];
}

// idInstitucion undefined = toda la red (admin). grupoSanguineo y factorRh son opcionales.
// Prisma ignora los filtros undefined, así un mismo where sirve para todos los casos.
async function armarEstadisticas({ idInstitucion, desde, hasta, grupoSanguineo, factorRh }) {
  const periodo = { gte: inicioDelDia(desde), lt: inicioDelDia(sumarDias(hasta, 1)) };
  const filtroNecesidad = { idInstitucion, grupoSanguineo, factorRh, creadaEn: periodo };

  const [necesidades, alertas, vencimientos] = await Promise.all([
    prisma.necesidad.findMany({
      where: filtroNecesidad,
      select: { estado: true, cubiertaCon: true, creadaEn: true, cerradaEn: true },
    }),
    prisma.alerta.findMany({
      where: { enviadaEn: { not: null }, convocatoria: { necesidad: filtroNecesidad } },
      select: { estado: true, turno: { select: { estado: true } } },
    }),
    // TAREA-7 deja un movimiento "vencimiento" cuando una unidad se vence: es el historial que no se borra.
    // movimiento_unidad es del dominio C: esta consulta solo lee (a acordar con Joaquín si prefiere una función suya)
    prisma.movimientoUnidad.findMany({
      where: { tipo: 'vencimiento', ocurridoEn: periodo, idInstitucionOrigen: idInstitucion, unidad: { grupoSanguineo, factorRh } },
      select: { ocurridoEn: true, unidad: { select: { grupoSanguineo: true, factorRh: true } } },
    }),
  ]);

  return {
    alcance: idInstitucion ? 'institucion' : 'red',
    periodo: { desde, hasta },
    filtros: { grupoSanguineo: grupoSanguineo ?? null, factorRh: factorRh ?? null },
    necesidades: resumirNecesidades(necesidades),
    tiempoHastaCubrir: tiempoHastaCubrir(necesidades),
    cubiertasCon: comoSeCubrieron(necesidades),
    donantes: respuestaDonantes(alertas),
    unidadesVencidas: resumirVencidas(vencimientos),
    porMes: porMes(desde, hasta, necesidades, vencimientos),
  };
}

module.exports = { armarEstadisticas, mesesEntre, sumarDias };
