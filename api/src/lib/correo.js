const nodemailer = require('nodemailer');

// En desarrollo los correos los recibe Mailpit (docker compose) y se ven en http://localhost:8025
const transporte = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'localhost',
  port: Number(process.env.SMTP_PORT) || 1025,
  auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
});

const REMITENTE = process.env.MAIL_FROM || 'DonaVida <no-responder@donavida.local>';

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
  });
}

module.exports = { enviarCorreoVerificacion };
