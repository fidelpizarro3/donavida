// Consultas de turnos que usan varias partes de la API: la agenda (TAREA-10) y el carné del donante (TAREA-18)
const prisma = require('../lib/prisma');
const { obtenerFechaHoy } = require('../utils/validaciones');
const { parsearFecha } = require('../utils/formateadores');

// El próximo turno reservado de un donante, de hoy en adelante, o null si no tiene.
//   - idInstitucion: solo los turnos en ese hospital (cuando consulta una institución)
//   - conInstitucion: trae también el nombre y la dirección del hospital (los muestra el carné)
async function buscarProximoTurno(idDonante, { idInstitucion, conInstitucion = false } = {}) {
  return prisma.turno.findFirst({
    where: {
      idDonante,
      estado: 'reservado',
      // Se puede filtrar por campos de una tabla relacionada: la fecha está en la franja, no en el turno
      franjaHoraria: { fecha: { gte: parsearFecha(obtenerFechaHoy()) }, idInstitucion },
    },
    orderBy: [{ franjaHoraria: { fecha: 'asc' } }, { franjaHoraria: { horaInicio: 'asc' } }],
    include: {
      franjaHoraria: conInstitucion
        ? { include: { institucion: { select: { nombre: true, direccion: true } } } }
        : true,
    },
  });
}

module.exports = { buscarProximoTurno };
