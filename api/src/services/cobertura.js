// TAREA-14: antes de convocar donantes, busca si otro hospital de la red puede prestar las unidades.
//
// Esta búsqueda NO modifica nada: solo lee. Por eso no llama a marcarVencidas() (que escribe en la base)
// y filtra las unidades vencidas por fecha.
//   1) Trae las unidades disponibles, no vencidas y compatibles de las otras instituciones aprobadas.
//   2) Cada institución presta lo que le sobra de su stock mínimo, empezando por lo que vence antes.
//   3) Ordena por distancia y por días restantes, y sugiere unidades hasta cubrir lo que falta.
const prisma = require('../lib/prisma');
const { gruposCompatibles } = require('./compatibilidad');
const { distanciaKm } = require('./distancia');
const { calcularDiasRestantes } = require('./unidades');
const { obtenerFechaHoyArgentina } = require('../utils/validaciones');
const { formatearFecha, parsearFecha } = require('../utils/formateadores');

// Unidades de transferencias en curso para esta necesidad. Todavía no suman en unidades_cubiertas
// (eso pasa al recibirlas), pero tampoco hay que convocar donantes por ellas.
// transferencia_item.activo es true mientras la transferencia está en curso.
function unidadesEnCamino(idNecesidad) {
  return prisma.transferenciaItem.count({ where: { activo: true, transferencia: { idNecesidad } } });
}

const claveDeStock = ({ idInstitucion, grupoSanguineo, factorRh, componente }) =>
  `${idInstitucion}|${grupoSanguineo}|${factorRh}|${componente}`;

// Devuelve las unidades que se pueden prestar sin que la institución baje de su stock mínimo.
// El mínimo es por grupo, factor y componente, así que se cuenta por separado para cada combinación.
function unidadesPrestables(unidades, minimos) {
  const minimoDe = new Map(minimos.map((m) => [claveDeStock(m), m.unidadesMinimas]));

  const porStock = new Map();
  for (const unidad of unidades) {
    const clave = claveDeStock(unidad);
    if (!porStock.has(clave)) porStock.set(clave, []);
    porStock.get(clave).push(unidad);
  }

  const prestables = [];
  for (const [clave, delStock] of porStock) {
    const sobran = Math.max(0, delStock.length - (minimoDe.get(clave) ?? 0));
    // Primero se prestan las que vencen antes
    delStock.sort((a, b) => a.diasRestantes - b.diasRestantes);
    prestables.push(...delStock.slice(0, sobran));
  }
  return prestables;
}

// Agrupa las unidades por institución, con su distancia a la que pide
function armarOpciones(prestables, necesidad) {
  const porInstitucion = new Map();
  for (const unidad of prestables) {
    const { idInstitucion, institucion } = unidad;
    if (!porInstitucion.has(idInstitucion)) {
      porInstitucion.set(idInstitucion, {
        idInstitucion,
        nombre: institucion.nombre,
        distanciaKm: distanciaKm(
          Number(necesidad.institucion.latitud), Number(necesidad.institucion.longitud),
          Number(institucion.latitud), Number(institucion.longitud)
        ),
        unidades: [],
      });
    }
    porInstitucion.get(idInstitucion).unidades.push({
      idUnidadSangre: unidad.idUnidadSangre,
      codigo: unidad.codigo,
      grupoSanguineo: unidad.grupoSanguineo,
      factorRh: unidad.factorRh,
      fechaVencimiento: unidad.fechaVencimiento,
      diasRestantes: unidad.diasRestantes,
    });
  }

  const opciones = [...porInstitucion.values()];
  for (const opcion of opciones) {
    opcion.unidades.sort((a, b) => a.diasRestantes - b.diasRestantes);
  }
  // Criterio: ordena por distancia y por los días que le quedan a cada unidad
  opciones.sort((a, b) => (a.distanciaKm - b.distanciaKm) || (a.unidades[0].diasRestantes - b.unidades[0].diasRestantes));
  return opciones;
}

// necesidad debe traer institucion: { latitud, longitud }.
// En cada opción, las primeras "sugeridas" unidades son las que alcanzan para cubrir lo que falta.
async function buscarCoberturaEnRed(necesidad) {
  const enCamino = await unidadesEnCamino(necesidad.idNecesidad);
  const unidadesFaltantes = Math.max(0, necesidad.unidadesSolicitadas - necesidad.unidadesCubiertas - enCamino);
  const resumen = { idNecesidad: necesidad.idNecesidad, unidadesFaltantes, enCamino };

  if (unidadesFaltantes === 0) {
    return { ...resumen, cubiertasEnRed: 0, faltanConvocar: 0, opciones: [] };
  }

  const hoy = obtenerFechaHoyArgentina();
  const unidades = await prisma.unidadSangre.findMany({
    where: {
      estado: 'disponible',
      fechaVencimiento: { gte: parsearFecha(hoy) }, // la que vence hoy todavía se puede usar
      componente: necesidad.componente,
      OR: gruposCompatibles(necesidad),
      idInstitucion: { not: necesidad.idInstitucion },
      institucion: { estado: 'aprobada' },
    },
    include: { institucion: { select: { nombre: true, latitud: true, longitud: true } } },
  });
  const minimos = await prisma.stockMinimo.findMany({
    where: { idInstitucion: { in: [...new Set(unidades.map((u) => u.idInstitucion))] }, componente: necesidad.componente },
  });

  const conDias = unidades.map((unidad) => {
    const fechaVencimiento = formatearFecha(unidad.fechaVencimiento);
    return { ...unidad, fechaVencimiento, diasRestantes: calcularDiasRestantes(fechaVencimiento, hoy) };
  });
  const opciones = armarOpciones(unidadesPrestables(conDias, minimos), necesidad);

  // Sugiere desde la primera opción hasta cubrir lo que falta
  let porCubrir = unidadesFaltantes;
  for (const opcion of opciones) {
    opcion.sugeridas = Math.min(porCubrir, opcion.unidades.length);
    porCubrir -= opcion.sugeridas;
  }

  return { ...resumen, cubiertasEnRed: unidadesFaltantes - porCubrir, faltanConvocar: porCubrir, opciones };
}

module.exports = { buscarCoberturaEnRed, unidadesEnCamino };
