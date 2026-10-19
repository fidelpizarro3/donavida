// TAREA-8: selección de donantes a convocar para una necesidad.
//
// Pasos para armar la lista:
//   1) La base filtra: grupo compatible, habilitación vigente (TAREA-3), alertas no pausadas,
//      con ubicación cargada y que no hayan sido convocados ya para esta misma necesidad.
//   2) En JS: tope de alertas del mes, canal de aviso, distancia y radio.
//   3) Se ordena: primero grupo exacto, después compatible; dentro de cada uno, el más cercano primero.
//   4) Se recorta al cupo libre de la agenda (eso lo hacen las rutas con cupoLibre()).
const prisma = require('../lib/prisma');
const { filtroDonantesHabilitados } = require('./habilitacion');
const { gruposCompatibles, esGrupoExacto } = require('./compatibilidad');
const { distanciaKm } = require('./distancia');
const { obtenerFechaHoy } = require('../utils/validaciones');
const { parsearFecha } = require('../utils/formateadores');

const COMPONENTES_TEXTO = {
  sangre_entera: 'sangre entera',
  globulos_rojos: 'glóbulos rojos',
  plaquetas: 'plaquetas',
};

// "O" + "negativo" → "O−"
const grupoConFactor = (grupo, factor) => `${grupo}${factor === 'positivo' ? '+' : '−'}`;

// Urgente → primero al celular. Normal → primero por correo. Se usa el primero que el donante tenga activado.
// Devuelve null si el donante apagó todos los canales.
function elegirCanal(donante, urgencia) {
  const activados = { push: donante.avisoPush, email: donante.avisoEmail, whatsapp: donante.avisoWhatsapp };
  const orden = urgencia === 'urgente' ? ['push', 'whatsapp', 'email'] : ['email', 'push', 'whatsapp'];
  return orden.find((canal) => activados[canal]) ?? null;
}

// Criterio: "mostrando por qué entró cada persona". Este texto también lo ve el donante en la alerta (DV-9)
function armarMotivo(donante, necesidad, km) {
  const suGrupo = grupoConFactor(donante.grupoSanguineo, donante.factorRh);
  const pedido = grupoConFactor(necesidad.grupoSanguineo, necesidad.factorRh);
  const grupo = esGrupoExacto(donante, necesidad)
    ? `Mismo grupo (${suGrupo})`
    : `Grupo compatible: ${suGrupo} puede donar ${COMPONENTES_TEXTO[necesidad.componente]} para ${pedido}`;
  return `${grupo}. Habilitado para donar. A ${km} km de la institución.`;
}

// Donantes que pueden ser convocados para la necesidad, ya ordenados. No recorta por cupo.
// institucion: { latitud, longitud }. radioKm: distancia máxima.
async function buscarCandidatos(necesidad, institucion, radioKm) {
  const hoy = parsearFecha(obtenerFechaHoy());

  const donantes = await prisma.donante.findMany({
    where: {
      ...filtroDonantesHabilitados(),
      usuario: { activo: true },
      latitud: { not: null },
      longitud: { not: null },
      // Si ya tiene una alerta de una convocatoria de esta necesidad, no se lo vuelve a convocar
      alertas: { none: { convocatoria: { idNecesidad: necesidad.idNecesidad } } },
      AND: [
        { OR: gruposCompatibles(necesidad) },
        // Alertas no pausadas: sin pausa, o la pausa ya terminó
        { OR: [{ alertasPausadasHasta: null }, { alertasPausadasHasta: { lt: hoy } }] },
      ],
    },
    include: { usuario: { select: { nombre: true, apellido: true } } },
  });

  const candidatos = [];
  for (const donante of donantes) {
    if (donante.alertasMesActual >= donante.topeAlertasMes) continue; // llegó a su tope del mes
    const canal = elegirCanal(donante, necesidad.urgencia);
    if (!canal) continue;

    // Prisma devuelve los Decimal como objeto: se pasan a Number
    const km = distanciaKm(
      Number(institucion.latitud), Number(institucion.longitud),
      Number(donante.latitud), Number(donante.longitud)
    );
    if (km > radioKm) continue;

    candidatos.push({
      idDonante: donante.idDonante,
      nombre: donante.usuario.nombre,
      apellido: donante.usuario.apellido,
      grupoSanguineo: donante.grupoSanguineo,
      factorRh: donante.factorRh,
      grupoExacto: esGrupoExacto(donante, necesidad),
      distanciaKm: km,
      canal,
      motivo: armarMotivo(donante, necesidad, km),
    });
  }

  // Criterio: ordena por compatibilidad (exacto primero) y después por distancia
  candidatos.sort((a, b) => (b.grupoExacto - a.grupoExacto) || (a.distanciaKm - b.distanciaKm));
  return candidatos;
}

// Criterio: la cantidad se ajusta al cupo libre de la agenda (DV-10).
// Suma los lugares libres de las franjas abiertas desde hoy hasta la fecha límite.
// Mientras la institución no tenga ninguna franja cargada (DV-10 todavía no está), se usan las unidades que faltan.
async function cupoLibre(necesidad) {
  const hoy = parsearFecha(obtenerFechaHoy());
  const tieneAgenda = (await prisma.franjaHoraria.count({ where: { idInstitucion: necesidad.idInstitucion } })) > 0;

  if (!tieneAgenda) {
    return { disponible: necesidad.unidadesSolicitadas - necesidad.unidadesCubiertas, segun: 'unidades_faltantes' };
  }

  const franjas = await prisma.franjaHoraria.findMany({
    where: { idInstitucion: necesidad.idInstitucion, cerrada: false, fecha: { gte: hoy, lte: necesidad.fechaLimite } },
  });
  const disponible = franjas.reduce((total, f) => total + Math.max(0, f.cupoTotal - f.cupoOcupado), 0);
  return { disponible, segun: 'agenda' };
}

module.exports = { elegirCanal, armarMotivo, buscarCandidatos, cupoLibre };
