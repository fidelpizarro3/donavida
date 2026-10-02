const { Router } = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const prisma = require('../lib/prisma');
const { autenticar } = require('../middlewares/auth');

const router = Router();

// admin no se puede registrar solo: se crea con `npm run crear-admin`
const ROLES_REGISTRABLES = ['donante', 'institucion'];
const EMAIL_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DURACION_TOKEN = '8h';

function datosInvalidos(res, mensaje) {
  return res.status(400).json({ error: { codigo: 'DATOS_INVALIDOS', mensaje } });
}

function esTexto(valor, largoMaximo) {
  return typeof valor === 'string' && valor.trim().length > 0 && valor.trim().length <= largoMaximo;
}

// Lo que se puede mostrar de un usuario (nunca el hash de la contraseña)
function datosPublicos(usuario) {
  const { idUsuario, email, nombre, apellido, rol } = usuario;
  return { idUsuario, email, nombre, apellido, rol };
}

router.post('/registro', async (req, res) => {
  const { email, password, nombre, apellido, rol } = req.body ?? {};

  if (!esTexto(email, 255) || !EMAIL_VALIDO.test(email.trim())) {
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

  try {
    const usuario = await prisma.usuario.create({
      data: {
        email: email.trim().toLowerCase(),
        passwordHash: await bcrypt.hash(password, 10),
        nombre: nombre.trim(),
        apellido: apellido.trim(),
        rol,
      },
    });
    res.status(201).json(datosPublicos(usuario));
  } catch (err) {
    // P2002: violación de UNIQUE (el email ya está registrado)
    if (err.code === 'P2002') {
      return res.status(409).json({ error: { codigo: 'CONFLICTO', mensaje: 'Ya existe una cuenta con ese email' } });
    }
    throw err;
  }
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body ?? {};
  const usuario = typeof email === 'string'
    ? await prisma.usuario.findUnique({ where: { email: email.trim().toLowerCase() } })
    : null;
  const passwordCorrecta = usuario && typeof password === 'string' && await bcrypt.compare(password, usuario.passwordHash);

  if (!passwordCorrecta) {
    // Mismo mensaje si falla el email o la contraseña: así no se revela qué emails están registrados
    return res.status(401).json({ error: { codigo: 'CREDENCIALES_INVALIDAS', mensaje: 'Email o contraseña incorrectos' } });
  }
  if (!usuario.activo) {
    return res.status(403).json({ error: { codigo: 'CUENTA_INACTIVA', mensaje: 'La cuenta está desactivada' } });
  }

  const token = jwt.sign({ sub: usuario.idUsuario, rol: usuario.rol }, process.env.JWT_SECRET, { expiresIn: DURACION_TOKEN });
  res.json({ token, usuario: datosPublicos(usuario) });
});

// El front la usa para saber quién está logueado (por ejemplo, al recargar la página)
router.get('/me', autenticar, async (req, res) => {
  const usuario = await prisma.usuario.findUnique({ where: { idUsuario: req.usuario.id } });
  if (!usuario) {
    return res.status(404).json({ error: { codigo: 'NO_ENCONTRADO', mensaje: 'El usuario ya no existe' } });
  }
  res.json(datosPublicos(usuario));
});

module.exports = router;
