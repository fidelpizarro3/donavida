// TAREA-18: los datos del carné digital del donante ("Mi carné").
// Nombre, grupo, cuántas veces donó, desde qué fecha vuelve a estar habilitado y el QR de su próximo turno.
// Solo lee: el donante (dominio A), y sus donaciones y su próximo turno (dominio B)
const prisma = require('../lib/prisma');
const { obtenerHabilitacion } = require('./habilitacion');
const { buscarProximoTurno } = require('./turnos');
const { formatearFecha, formatearHora } = require('../utils/formateadores');

// El carné del donante de ese usuario, o null si no tiene perfil de donante
async function armarCarne(idUsuario) {
  const donante = await prisma.donante.findUnique({
    where: { idUsuario },
    include: { usuario: { select: { nombre: true, apellido: true } } },
  });
  if (!donante) return null;

  const [totalDonaciones, habilitacion, turno] = await Promise.all([
    // Cuentan las donaciones hechas: si lo rechazó el control médico, no donó
    prisma.donacion.count({ where: { idDonante: donante.idDonante, resultado: 'realizada' } }),
    obtenerHabilitacion(donante.idDonante),
    buscarProximoTurno(donante.idDonante, { conInstitucion: true }),
  ]);

  return {
    // Con el usuario, el front sabe de quién es la copia que guarda para verla sin conexión
    idUsuario,
    nombre: donante.usuario.nombre,
    apellido: donante.usuario.apellido,
    grupoSanguineo: donante.grupoSanguineo, // null si todavía no lo sabe: se confirma en su primera donación
    factorRh: donante.factorRh,
    totalDonaciones,
    habilitado: habilitacion.habilitado,
    aptoDesde: habilitacion.aptoDesde, // "YYYY-MM-DD" o null
    motivo: habilitacion.motivo,
    // Criterio: el QR es el código del turno (turno.codigo_qr), distinto en cada turno
    proximoTurno: turno && {
      idTurno: turno.idTurno,
      codigoQr: turno.codigoQr,
      fecha: formatearFecha(turno.franjaHoraria.fecha),
      horaInicio: formatearHora(turno.franjaHoraria.horaInicio),
      horaFin: formatearHora(turno.franjaHoraria.horaFin),
      institucion: turno.franjaHoraria.institucion,
    },
  };
}

module.exports = { armarCarne };
