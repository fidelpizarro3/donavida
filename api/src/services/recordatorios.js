// TAREA-10 (DV-10): recordatorio el día anterior al turno, con la dirección y cómo llegar.
// Corre al arrancar el servidor y después una vez por hora: manda el recordatorio de los turnos de MAÑANA
// que todavía no lo recibieron (turno.recordatorioEnviadoEn), así nunca llega dos veces.
const prisma = require('../lib/prisma');
const { enviarCorreoRecordatorio } = require('../lib/correo');
const { enviarPush } = require('./alertas');
const { obtenerFechaHoyArgentina } = require('../utils/validaciones');
const { formatearFecha, formatearHora, parsearFecha } = require('../utils/formateadores');

const UN_DIA = 24 * 60 * 60 * 1000;
const UNA_HORA = 60 * 60 * 1000;

// "2026-10-21" → "martes 21/10"
function fechaConDia(fecha) {
  const dia = new Date(`${fecha}T12:00:00Z`).toLocaleDateString('es-AR', { weekday: 'long', timeZone: 'UTC' });
  const [, mes, numero] = fecha.split('-');
  return `${dia} ${numero}/${mes}`;
}

// Link de Google Maps con la ubicación de la institución ("cómo llegar")
function enlaceMapa(institucion) {
  return `https://www.google.com/maps/search/?api=1&query=${Number(institucion.latitud)},${Number(institucion.longitud)}`;
}

async function enviarRecordatorios() {
  const manana = formatearFecha(new Date(parsearFecha(obtenerFechaHoyArgentina()).getTime() + UN_DIA));

  const turnos = await prisma.turno.findMany({
    where: { estado: 'reservado', recordatorioEnviadoEn: null, franjaHoraria: { fecha: parsearFecha(manana) } },
    include: {
      franjaHoraria: { include: { institucion: true } },
      donante: { include: { usuario: { select: { email: true, nombre: true } } } },
    },
  });

  let enviados = 0;
  for (const turno of turnos) {
    const { franjaHoraria: franja, donante } = turno;
    const datos = {
      email: donante.usuario.email,
      nombre: donante.usuario.nombre,
      institucion: franja.institucion.nombre,
      direccion: franja.institucion.direccion,
      fecha: fechaConDia(manana),
      horaInicio: formatearHora(franja.horaInicio),
      horaFin: formatearHora(franja.horaFin),
      enlaceMapa: enlaceMapa(franja.institucion),
    };
    try {
      // El recordatorio es un aviso que el donante pidió (reservó): va por correo siempre,
      // y además al celular si tiene los avisos push activados
      await enviarCorreoRecordatorio(datos);
      if (donante.avisoPush) {
        await enviarPush(donante.idUsuario, {
          titulo: `Mañana te esperamos en ${datos.institucion}`,
          cuerpo: `${datos.fecha}, de ${datos.horaInicio} a ${datos.horaFin}. ${datos.direccion}`,
        });
      }
      await prisma.turno.update({ where: { idTurno: turno.idTurno }, data: { recordatorioEnviadoEn: new Date() } });
      enviados++;
    } catch (err) {
      console.error('No se pudo mandar el recordatorio del turno', turno.idTurno, err.message);
    }
  }
  return enviados;
}

// En los tests no corre (Jest pone NODE_ENV=test), igual que el vencimiento de unidades (TAREA-7)
function programarRecordatorios() {
  if (process.env.NODE_ENV === 'test') return null;
  const correr = () => enviarRecordatorios().catch((err) => console.error('Recordatorios:', err.message));
  correr();
  return setInterval(correr, UNA_HORA);
}

module.exports = { enviarRecordatorios, programarRecordatorios, fechaConDia, enlaceMapa };
