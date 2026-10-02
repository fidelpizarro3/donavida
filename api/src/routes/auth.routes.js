const { Router } = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const prisma = require('../lib/prisma');
const { enviarCorreoVerificacion } = require('../lib/correo');
const { autenticar } = require('../middlewares/auth');
const {
  GRUPOS_VALIDOS,
  FACTORES_VALIDOS,
  SEXOS_VALIDOS,
  esTexto,
  esEmailValido,
  normalizarDocumento,
  esDocumentoValido,
  validarHorarioContacto,
  esFechaNacimientoValida,
  datosInvalidos,
} = require('../utils/validaciones');
const {
  parsearHora,
  parsearFecha,
} = require('../utils/formateadores');

const router = Router();

// admin no se puede registrar solo: se crea con `npm run crear-admin`
const ROLES_REGISTRABLES = ['donante', 'institucion'];
const DURACION_TOKEN_SESION = '8h';
const DURACION_TOKEN_VERIFICACION = '24h';

// Secreto criptográfico independiente para los tokens de validación de correo.
// Evita que un token de verificación pueda usarse para autenticar rutas protegidas.
function getSecretVerificacion() {
  return process.env.JWT_SECRET + '_email_verif_unique';
}

// Lo que se puede mostrar de un usuario (nunca el hash de la contraseña)
function datosPublicos(usuario) {
  const { idUsuario, email, nombre, apellido, rol, emailVerificado } = usuario;
  return { idUsuario, email, nombre, apellido, rol, emailVerificado };
}

// Genera un token JWT de propósito único para validar el correo
function generarTokenVerificacion(idUsuario) {
  return jwt.sign(
    { sub: idUsuario, proposito: 'verificar_email' },
    getSecretVerificacion(),
    { expiresIn: DURACION_TOKEN_VERIFICACION }
  );
}

// Criterio 4: el enlace de activación llega solo por correo (el token nunca viaja en una respuesta).
// Si el envío falla la cuenta ya existe, y se puede pedir otro enlace con /reenviar-verificacion.
async function enviarEnlaceVerificacion(usuario) {
  try {
    await enviarCorreoVerificacion({
      email: usuario.email,
      nombre: usuario.nombre,
      token: generarTokenVerificacion(usuario.idUsuario),
    });
    return true;
  } catch (err) {
    console.error(`No se pudo enviar el correo de verificación a ${usuario.email}:`, err.message);
    return false;
  }
}

// POST /api/auth/registro
router.post('/registro', async (req, res) => {
  const {
    email,
    password,
    nombre,
    apellido,
    rol,
    // Campos específicos para donante (TAREA-2)
    documento,
    fechaNacimiento,
    sexo,
    grupoSanguineo,
    factorRh,
    contactoHoraDesde,
    contactoHoraHasta,
  } = req.body ?? {};

  // Validaciones comunes de usuario
  if (!esEmailValido(email)) {
    return datosInvalidos(res, 'El email no es válido');
  }
  // bcrypt solo tiene en cuenta los primeros 72 bytes de la contraseña
  if (typeof password !== 'string' || password.length < 8 || Buffer.byteLength(password) > 72) {
    return datosInvalidos(res, 'La contraseña debe tener entre 8 y 72 caracteres');
  }
  if (!esTexto(nombre, 100) || !esTexto(apellido, 100)) {
    return datosInvalidos(res, 'Nombre y apellido son obligatorios (máximo 100 caracteres)');
  }
  if (!ROLES_REGISTRABLES.includes(rol)) {
    return datosInvalidos(res, 'El rol debe ser donante o institucion');
  }

  let docNormalizado = '';
  // Validaciones específicas si es donante
  if (rol === 'donante') {
    if (!esDocumentoValido(documento)) {
      return datosInvalidos(res, 'El documento debe tener entre 6 y 20 caracteres alfanuméricos');
    }
    docNormalizado = normalizarDocumento(documento);

    if (!fechaNacimiento || !esFechaNacimientoValida(fechaNacimiento)) {
      return datosInvalidos(res, 'La fecha de nacimiento no es válida (debe ser una fecha pasada y tener al menos 16 años)');
    }
    if (!SEXOS_VALIDOS.includes(sexo)) {
      return datosInvalidos(res, 'El sexo debe ser femenino, masculino o x');
    }

    // Criterio 1: Puede registrarse sin saber su grupo.
    // Si informa uno, debe informar ambos (grupo y factor) de forma consistente.
    const tieneGrupo = Boolean(grupoSanguineo);
    const tieneFactor = Boolean(factorRh);
    if (tieneGrupo !== tieneFactor) {
      return datosInvalidos(res, 'Si indicas el grupo sanguíneo, debes indicar también el factor Rh (positivo o negativo), o bien omitir ambos');
    }
    if (tieneGrupo && !GRUPOS_VALIDOS.includes(grupoSanguineo)) {
      return datosInvalidos(res, 'El grupo sanguíneo debe ser A, B, AB u O');
    }
    if (tieneFactor && !FACTORES_VALIDOS.includes(factorRh)) {
      return datosInvalidos(res, 'El factor Rh debe ser positivo o negativo');
    }

    // Criterio 2: horarios preferidos de contacto (opcionales; si informa uno, van los dos)
    const errorHorario = validarHorarioContacto(contactoHoraDesde, contactoHoraHasta);
    if (errorHorario) {
      return datosInvalidos(res, errorHorario);
    }
  }

  try {
    const passwordHash = await bcrypt.hash(password, 10);
    const emailNormalizado = email.trim().toLowerCase();

    // Creación atómica de usuario y donante
    const usuarioCreado = await prisma.$transaction(async (tx) => {
      const usuario = await tx.usuario.create({
        data: {
          email: emailNormalizado,
          passwordHash,
          nombre: nombre.trim(),
          apellido: apellido.trim(),
          rol,
          emailVerificado: false, // Criterio 4: requiere validación posterior
        },
      });

      if (rol === 'donante') {
        await tx.donante.create({
          data: {
            idUsuario: usuario.idUsuario,
            documento: docNormalizado,
            fechaNacimiento: parsearFecha(fechaNacimiento),
            sexo,
            grupoSanguineo: grupoSanguineo || null, // null si no lo conoce (Criterio 1)
            factorRh: factorRh || null,
            contactoHoraDesde: contactoHoraDesde ? parsearHora(contactoHoraDesde) : null,
            contactoHoraHasta: contactoHoraHasta ? parsearHora(contactoHoraHasta) : null,
          },
        });
      }

      return usuario;
    });

    const correoEnviado = await enviarEnlaceVerificacion(usuarioCreado);

    res.status(201).json({
      ...datosPublicos(usuarioCreado),
      mensaje: correoEnviado
        ? 'Registro exitoso. Te enviamos un correo con el enlace para activar la cuenta.'
        : 'Registro exitoso, pero no pudimos enviar el correo de activación. Pedí un enlace nuevo desde "Verificar email".',
    });
  } catch (err) {
    if (err.code === 'P2002') {
      const campo = err.meta?.target?.[0];
      const mensaje = campo === 'documento'
        ? 'Ya existe un donante registrado con ese documento'
        : 'Ya existe una cuenta con ese email';
      return res.status(409).json({ error: { codigo: 'CONFLICTO', mensaje } });
    }
    throw err;
  }
});

// POST /api/auth/verificar-email (Criterio 4: validación del correo para activar cuenta)
router.post('/verificar-email', async (req, res) => {
  const token = req.body?.token || req.query?.token;

  if (!token || typeof token !== 'string') {
    return datosInvalidos(res, 'Falta el token de verificación');
  }

  let payload;
  try {
    payload = jwt.verify(token, getSecretVerificacion());
  } catch {
    return res.status(400).json({
      error: { codigo: 'TOKEN_INVALIDO', mensaje: 'El token de verificación es inválido o ha expirado' },
    });
  }

  if (payload.proposito !== 'verificar_email' || !payload.sub) {
    return res.status(400).json({
      error: { codigo: 'TOKEN_INVALIDO', mensaje: 'El token no corresponde a una verificación de correo' },
    });
  }

  const usuario = await prisma.usuario.findUnique({
    where: { idUsuario: payload.sub },
  });

  if (!usuario) {
    return res.status(404).json({ error: { codigo: 'NO_ENCONTRADO', mensaje: 'Usuario no encontrado' } });
  }

  if (usuario.emailVerificado) {
    return res.json({ ok: true, mensaje: 'El correo ya fue verificado previamente' });
  }

  const usuarioActualizado = await prisma.usuario.update({
    where: { idUsuario: usuario.idUsuario },
    data: { emailVerificado: true },
  });

  res.json({
    ok: true,
    mensaje: 'Correo verificado exitosamente. Tu cuenta está activa.',
    usuario: datosPublicos(usuarioActualizado),
  });
});

// POST /api/auth/reenviar-verificacion: manda un enlace nuevo (si el anterior venció o no llegó)
router.post('/reenviar-verificacion', async (req, res) => {
  const { email } = req.body ?? {};
  if (!esEmailValido(email)) {
    return datosInvalidos(res, 'El email no es válido');
  }

  const usuario = await prisma.usuario.findUnique({ where: { email: email.trim().toLowerCase() } });
  if (usuario && !usuario.emailVerificado) {
    await enviarEnlaceVerificacion(usuario);
  }

  // Misma respuesta exista o no la cuenta: así no se revela qué emails están registrados
  res.json({ ok: true, mensaje: 'Si el email está registrado y sin verificar, te enviamos un nuevo enlace de activación.' });
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body ?? {};
  const usuario = typeof email === 'string'
    ? await prisma.usuario.findUnique({ where: { email: email.trim().toLowerCase() } })
    : null;
  const passwordCorrecta = usuario && typeof password === 'string' && await bcrypt.compare(password, usuario.passwordHash);

  if (!passwordCorrecta) {
    // Mismo mensaje si falla el email o la contraseña: no revela qué emails están registrados
    return res.status(401).json({ error: { codigo: 'CREDENCIALES_INVALIDAS', mensaje: 'Email o contraseña incorrectos' } });
  }

  // Criterio 4: El correo se valida antes de activar la cuenta
  if (!usuario.emailVerificado) {
    return res.status(403).json({
      error: {
        codigo: 'EMAIL_NO_VERIFICADO',
        mensaje: 'Debes verificar tu correo antes de activar la cuenta',
      },
    });
  }

  if (!usuario.activo) {
    return res.status(403).json({ error: { codigo: 'CUENTA_INACTIVA', mensaje: 'La cuenta está desactivada' } });
  }

  const token = jwt.sign(
    { sub: usuario.idUsuario, rol: usuario.rol },
    process.env.JWT_SECRET,
    { expiresIn: DURACION_TOKEN_SESION }
  );

  res.json({ token, usuario: datosPublicos(usuario) });
});

// GET /api/auth/me
router.get('/me', autenticar, async (req, res) => {
  const usuario = await prisma.usuario.findUnique({ where: { idUsuario: req.usuario.id } });
  if (!usuario) {
    return res.status(404).json({ error: { codigo: 'NO_ENCONTRADO', mensaje: 'El usuario ya no existe' } });
  }
  res.json(datosPublicos(usuario));
});

module.exports = router;
