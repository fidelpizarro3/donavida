const nodemailer = require('nodemailer');

// En desarrollo los correos los recibe Mailpit (docker compose) y se ven en http://localhost:8025
const transporte = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'localhost',
  port: Number(process.env.SMTP_PORT) || 1025,
  auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
});

const REMITENTE = process.env.MAIL_FROM || 'DonaVida <no-responder@donavida.local>';

// El nombre lo escribe el usuario: se escapa para que no pueda meter HTML en el correo
function escaparHtml(texto) {
  return String(texto).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// El enlace lleva al front, que toma el token de la URL y llama a POST /api/auth/verificar-email
async function enviarCorreoVerificacion({ email, nombre, token }) {
  const enlace = `${process.env.APP_URL || 'http://localhost:5173'}/?token=${encodeURIComponent(token)}`;
  await transporte.sendMail({
    from: REMITENTE,
    to: email,
    subject: 'Activá tu cuenta de DonaVida',
    text: [
      `Hola ${nombre}:`,
      '',
      'Para activar tu cuenta de DonaVida abrí este enlace (vence en 24 horas):',
      enlace,
      '',
      'Si no te registraste en DonaVida, ignorá este correo.',
    ].join('\n'),
    // Versión con formato: la mayoría de los clientes de correo muestran esta y usan el texto de respaldo
    html: `
      <div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;color:#1f1a1a">
        <h1 style="color:#c92a2a;font-size:24px;margin:0 0 24px">DonaVida</h1>
        <p style="font-size:16px;line-height:1.5">Hola ${escaparHtml(nombre)}:</p>
        <p style="font-size:16px;line-height:1.5">Gracias por sumarte como donante. Para activar tu cuenta tocá el botón:</p>
        <p style="text-align:center;margin:32px 0">
          <a href="${enlace}" style="background:#c92a2a;color:#fff;text-decoration:none;font-weight:bold;padding:14px 28px;border-radius:999px;display:inline-block">Activar mi cuenta</a>
        </p>
        <p style="font-size:13px;color:#6b6262;line-height:1.5">El enlace vence en 24 horas. Si no te registraste en DonaVida, ignorá este correo.</p>
      </div>`,
  });
}

// TAREA-11: aviso a un donante convocado. Lleva el motivo, la institución y la distancia (DV-9)
async function enviarCorreoAlerta({ email, nombre, titulo, motivo, institucion, direccion, distanciaKm }) {
  const enlace = process.env.APP_URL || 'http://localhost:5173';
  await transporte.sendMail({
    from: REMITENTE,
    to: email,
    subject: titulo,
    text: [
      `Hola ${nombre}:`,
      '',
      `${institucion} (${direccion}, a ${distanciaKm} km) necesita donantes.`,
      `Por qué te llegó a vos: ${motivo}`,
      '',
      `Entrá a DonaVida para aceptar o rechazar: ${enlace}`,
    ].join('\n'),
    html: `
      <div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;color:#1f1a1a">
        <h1 style="color:#c92a2a;font-size:24px;margin:0 0 24px">DonaVida</h1>
        <p style="font-size:16px;line-height:1.5">Hola ${escaparHtml(nombre)}:</p>
        <p style="font-size:16px;line-height:1.5"><strong>${escaparHtml(institucion)}</strong> necesita donantes.</p>
        <p style="font-size:15px;line-height:1.5;margin:0">📍 ${escaparHtml(direccion)} · a ${distanciaKm} km</p>
        <p style="font-size:14px;line-height:1.5;color:#6b6262">Por qué te llegó a vos: ${escaparHtml(motivo)}</p>
        <p style="text-align:center;margin:32px 0">
          <a href="${enlace}" style="background:#c92a2a;color:#fff;text-decoration:none;font-weight:bold;padding:14px 28px;border-radius:999px;display:inline-block">Ver la alerta</a>
        </p>
        <p style="font-size:13px;color:#6b6262;line-height:1.5">Podés pausar las alertas desde tu perfil.</p>
      </div>`,
  });
}

// TAREA-10 (DV-10): recordatorio el día anterior al turno, con la dirección y cómo llegar
async function enviarCorreoRecordatorio({ email, nombre, institucion, direccion, fecha, horaInicio, horaFin, enlaceMapa }) {
  await transporte.sendMail({
    from: REMITENTE,
    to: email,
    subject: `Mañana te esperamos en ${institucion}`,
    text: [
      `Hola ${nombre}:`,
      '',
      `Te recordamos tu turno para donar sangre: mañana ${fecha}, entre las ${horaInicio} y las ${horaFin}.`,
      `Dónde: ${institucion}, ${direccion}`,
      `Cómo llegar: ${enlaceMapa}`,
      '',
      'Antes de donar: desayuná liviano, tomá mucha agua y llevá tu DNI.',
      'Si no podés ir, cancelá el turno desde DonaVida así el lugar queda para otra persona.',
    ].join('\n'),
    html: `
      <div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;color:#1f1a1a">
        <h1 style="color:#c92a2a;font-size:24px;margin:0 0 24px">DonaVida</h1>
        <p style="font-size:16px;line-height:1.5">Hola ${escaparHtml(nombre)}:</p>
        <p style="font-size:16px;line-height:1.5">Mañana te esperamos para donar sangre. ¡Gracias!</p>
        <div style="background:#f4eeec;border-radius:12px;padding:16px 20px;margin:24px 0">
          <p style="margin:0 0 8px;font-size:16px"><strong>📅 ${escaparHtml(fecha)}</strong>, de ${horaInicio} a ${horaFin}</p>
          <p style="margin:0;font-size:15px">📍 ${escaparHtml(institucion)} · ${escaparHtml(direccion)}</p>
        </div>
        <p style="text-align:center;margin:24px 0">
          <a href="${enlaceMapa}" style="background:#c92a2a;color:#fff;text-decoration:none;font-weight:bold;padding:14px 28px;border-radius:999px;display:inline-block">Cómo llegar</a>
        </p>
        <p style="font-size:14px;line-height:1.5">Antes de donar: desayuná liviano, tomá mucha agua y llevá tu DNI.</p>
        <p style="font-size:13px;color:#6b6262;line-height:1.5">Si no podés ir, cancelá el turno desde DonaVida así el lugar queda para otra persona.</p>
      </div>`,
  });
}

module.exports = { enviarCorreoVerificacion, enviarCorreoAlerta, enviarCorreoRecordatorio };
