// TAREA-11 (DV-9): envío de las alertas a los donantes convocados.
//
// Cuando el hospital confirma una convocatoria (TAREA-8), cada alerta queda "pendiente" con su canal.
// Acá se manda cada una:
//   - push: notificación al celular (aunque la app esté cerrada) a todas las suscripciones del donante.
//     Si no tiene ninguna, o el push no está configurado, se usa el correo como respaldo.
//   - email: correo con nodemailer (en desarrollo lo recibe Mailpit).
//   - whatsapp: todavía no hay integración, se usa el correo como respaldo.
// Antes de mandar se revisa de nuevo el tope del mes y la pausa: si no corresponde, la alerta se cancela.
const webpush = require('web-push');
const prisma = require('../lib/prisma');
const { enviarCorreoAlerta } = require('../lib/correo');
const { obtenerFechaHoyArgentina } = require('../utils/validaciones');
const { parsearFecha } = require('../utils/formateadores');

// Claves VAPID: identifican a nuestro servidor ante el servicio de push del navegador.
// Se generan una vez con "npx web-push generate-vapid-keys" y van en api/.env
const PUSH_CONFIGURADO = Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
if (PUSH_CONFIGURADO) {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:no-responder@donavida.local',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
}

// Primer instante del mes en curso, en hora de Argentina (UTC-3)
function inicioDelMes() {
  const [anio, mes] = obtenerFechaHoyArgentina().split('-');
  return new Date(`${anio}-${mes}-01T00:00:00-03:00`);
}

// Criterio: el tope es "por mes". En vez de reiniciar un contador, se cuentan las alertas enviadas este mes
async function alertasEnviadasEsteMes(idDonante, db = prisma) {
  return db.alerta.count({ where: { idDonante, enviadaEn: { gte: inicioDelMes() } } });
}

function estaPausado(donante) {
  if (!donante.alertasPausadasHasta) return false;
  return donante.alertasPausadasHasta >= parsearFecha(obtenerFechaHoyArgentina());
}

// Título y texto del aviso: criterio "muestra el motivo, el hospital y la distancia"
function armarAviso(alerta) {
  const { necesidad } = alerta.convocatoria;
  const urgente = necesidad.urgencia === 'urgente';
  return {
    titulo: `${urgente ? '🚨 Urgente: ' : ''}${necesidad.institucion.nombre} necesita tu sangre`,
    cuerpo: `A ${Number(alerta.distanciaKm)} km. ${alerta.motivo}`,
  };
}

// Manda la notificación a todas las suscripciones activas del usuario. Devuelve true si llegó a alguna.
// Si el navegador dice que la suscripción ya no existe (404/410), se desactiva.
async function enviarPush(idUsuario, aviso) {
  if (!PUSH_CONFIGURADO) return false;
  const suscripciones = await prisma.suscripcionPush.findMany({ where: { idUsuario, activo: true } });

  let llego = false;
  for (const s of suscripciones) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify({ ...aviso, url: process.env.APP_URL || 'http://localhost:5173' })
      );
      llego = true;
    } catch (err) {
      if (err.statusCode === 404 || err.statusCode === 410) {
        await prisma.suscripcionPush.update({ where: { idSuscripcionPush: s.idSuscripcionPush }, data: { activo: false } });
      } else {
        console.error('No se pudo mandar el push:', err.message);
      }
    }
  }
  return llego;
}

async function enviarCorreo(alerta, aviso) {
  const { donante, convocatoria } = alerta;
  await enviarCorreoAlerta({
    email: donante.usuario.email,
    nombre: donante.usuario.nombre,
    titulo: aviso.titulo,
    motivo: alerta.motivo,
    institucion: convocatoria.necesidad.institucion.nombre,
    direccion: convocatoria.necesidad.institucion.direccion,
    distanciaKm: Number(alerta.distanciaKm),
  });
}

// Manda una alerta. Devuelve { estado, canal } con lo que pasó.
async function enviarAlerta(alerta) {
  const { donante } = alerta;

  // Criterio: respeta el tope del mes y las alertas pausadas (pudo cambiar desde que se armó la convocatoria)
  const enviadas = await alertasEnviadasEsteMes(donante.idDonante);
  if (enviadas >= donante.topeAlertasMes || estaPausado(donante)) {
    await prisma.alerta.update({ where: { idAlerta: alerta.idAlerta }, data: { estado: 'cancelada' } });
    return { estado: 'cancelada', canal: alerta.canal };
  }

  const aviso = armarAviso(alerta);
  let canal = null;

  // Criterio: urgente → push; normal → correo. El canal ya viene elegido por TAREA-8 según la urgencia
  // y los canales que activó el donante. Si el push no llega, el correo es el respaldo (si lo tiene activado)
  if (alerta.canal === 'push' && (await enviarPush(donante.idUsuario, aviso))) {
    canal = 'push';
  } else if (donante.avisoEmail) {
    await enviarCorreo(alerta, aviso);
    canal = 'email';
  }

  if (!canal) {
    // No hay por dónde avisarle: queda pendiente (por ejemplo, push sin suscripción y correo apagado)
    return { estado: 'pendiente', canal: alerta.canal };
  }

  await prisma.alerta.update({
    where: { idAlerta: alerta.idAlerta },
    data: { estado: 'enviada', canal, enviadaEn: new Date() },
  });
  // alertasMesActual queda como resumen para mostrar en el perfil (la fuente de verdad es el conteo)
  await prisma.donante.update({
    where: { idDonante: donante.idDonante },
    data: { alertasMesActual: enviadas + 1 },
  });
  return { estado: 'enviada', canal };
}

// Manda todas las alertas pendientes de una convocatoria. Lo llama la ruta de TAREA-8 al confirmar.
// Devuelve [{ idDonante, estado, canal }]. Si una falla, sigue con las demás.
async function enviarAlertasDeConvocatoria(idConvocatoria) {
  const alertas = await prisma.alerta.findMany({
    where: { idConvocatoria, estado: 'pendiente' },
    include: {
      donante: { include: { usuario: { select: { email: true, nombre: true } } } },
      convocatoria: { include: { necesidad: { include: { institucion: { select: { nombre: true, direccion: true } } } } } },
    },
  });

  const resultados = [];
  for (const alerta of alertas) {
    try {
      resultados.push({ idDonante: alerta.idDonante, ...(await enviarAlerta(alerta)) });
    } catch (err) {
      console.error('No se pudo mandar la alerta', alerta.idAlerta, err.message);
      resultados.push({ idDonante: alerta.idDonante, estado: 'pendiente', canal: alerta.canal });
    }
  }
  return resultados;
}

module.exports = {
  PUSH_CONFIGURADO,
  enviarPush, // también lo usa el recordatorio del turno (TAREA-10)
  inicioDelMes,
  alertasEnviadasEsteMes,
  enviarAlertasDeConvocatoria,
};
