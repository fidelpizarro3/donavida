// TAREA-3: cuestionario de aptitud y control de habilitación.
// Las rutas solo revisan permisos y datos de entrada; la lógica está en services/habilitacion.js.
// Se montan en /api/donantes (ver app.js).
const { Router } = require('express');
const prisma = require('../lib/prisma');
const { autenticar, autorizar } = require('../middlewares/auth');
const {
  GRUPOS_VALIDOS,
  FACTORES_VALIDOS,
  esTexto,
  esFechaValida,
  obtenerFechaHoy,
  datosInvalidos,
} = require('../utils/validaciones');
const {
  obtenerHabilitacion,
  obtenerCuestionario,
  responderCuestionario,
  registrarDonacion,
  marcarNoApto,
} = require('../services/habilitacion');

const router = Router();

const UUID_VALIDO = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function responderError(res, estado, codigo, mensaje) {
  return res.status(estado).json({ error: { codigo, mensaje } });
}

function esFechaObligatoria(fecha) {
  return typeof fecha === 'string' && esFechaValida(fecha);
}

// El donante del usuario logueado. Corta con 404 si el usuario no tiene perfil de donante.
async function cargarDonantePropio(req, res, next) {
  req.donante = await prisma.donante.findUnique({ where: { idUsuario: req.usuario.id } });
  if (!req.donante) return responderError(res, 404, 'NO_ENCONTRADO', 'Perfil de donante no encontrado');
  next();
}

// El donante de la URL (:idDonante). Corta con 404 si no existe.
async function cargarDonanteDeLaUrl(req, res, next) {
  const { idDonante } = req.params;
  req.donante = UUID_VALIDO.test(idDonante) ? await prisma.donante.findUnique({ where: { idDonante } }) : null;
  if (!req.donante) return responderError(res, 404, 'NO_ENCONTRADO', 'Donante no encontrado');
  next();
}

// Solo el personal de una institución APROBADA puede ver o cambiar la habilitación de un donante
async function tieneInstitucionAprobada(idUsuario) {
  const vinculo = await prisma.usuarioInstitucion.findFirst({
    where: { idUsuario, institucion: { estado: 'aprobada' } },
  });
  return Boolean(vinculo);
}

async function exigirInstitucionAprobada(req, res, next) {
  if (!(await tieneInstitucionAprobada(req.usuario.id))) {
    return responderError(res, 403, 'SIN_PERMISO', 'Tu institución todavía no está aprobada');
  }
  next();
}

// Las respuestas del cuestionario son datos de salud: la institución ve si puede donar y desde
// cuándo, pero no qué respondió el donante.
function ocultarDetalleMedico(habilitacion) {
  const esPorCuestionario = habilitacion.diferimientos[0]?.origen === 'cuestionario';
  return {
    habilitado: habilitacion.habilitado,
    aptoDesde: habilitacion.aptoDesde,
    motivo: esPorCuestionario ? 'No apto según sus respuestas al cuestionario de aptitud' : habilitacion.motivo,
    cuestionarioCompleto: habilitacion.cuestionarioCompleto,
  };
}

// ─── Donante: cuestionario ───────────────────────────────────────────────────

// GET /api/donantes/cuestionario: las preguntas, con la respuesta anterior y si hay que volver a responderlas
router.get('/cuestionario', autenticar, autorizar('donante'), cargarDonantePropio, async (req, res) => {
  res.json(await obtenerCuestionario(req.donante));
});

// POST /api/donantes/cuestionario: guarda las respuestas y devuelve cómo quedó la habilitación
router.post('/cuestionario', autenticar, autorizar('donante'), cargarDonantePropio, async (req, res) => {
  const resultado = await responderCuestionario(req.donante, req.body?.respuestas);
  if (resultado.error) return datosInvalidos(res, resultado.error);
  res.status(201).json(resultado.habilitacion);
});

// ─── Habilitación ────────────────────────────────────────────────────────────

// GET /api/donantes/:idDonante/habilitacion: ¿puede donar hoy? Si no, motivo y fecha de reingreso.
// El donante solo puede consultar la suya; la institución ve una versión sin el detalle médico.
router.get('/:idDonante/habilitacion', autenticar, autorizar('donante', 'institucion'), cargarDonanteDeLaUrl, async (req, res) => {
  const habilitacion = await obtenerHabilitacion(req.donante.idDonante);

  if (req.usuario.rol === 'donante') {
    if (req.donante.idUsuario !== req.usuario.id) {
      return responderError(res, 403, 'SIN_PERMISO', 'Solo podés consultar tu propia habilitación');
    }
    return res.json(habilitacion);
  }

  if (!(await tieneInstitucionAprobada(req.usuario.id))) {
    return responderError(res, 403, 'SIN_PERMISO', 'Tu institución todavía no está aprobada');
  }
  res.json(ocultarDetalleMedico(habilitacion));
});

// ─── Institución ─────────────────────────────────────────────────────────────

// POST /api/donantes/:idDonante/diferimientos: el hospital lo marca no apto por un motivo médico
router.post('/:idDonante/diferimientos', autenticar, autorizar('institucion'), exigirInstitucionAprobada, cargarDonanteDeLaUrl, async (req, res) => {
  const hoy = obtenerFechaHoy();
  const { motivo, desde = hoy, hasta = null } = req.body ?? {};

  if (!esTexto(motivo, 500)) {
    return datosInvalidos(res, 'El motivo es obligatorio (máximo 500 caracteres)');
  }
  if (!esFechaObligatoria(desde) || desde > hoy) {
    return datosInvalidos(res, 'desde debe ser una fecha YYYY-MM-DD que no sea futura (si se omite, es hoy)');
  }
  // hasta = primer día en que puede volver a donar. Sin hasta, el diferimiento no tiene fecha de fin.
  if (hasta !== null && (!esFechaObligatoria(hasta) || hasta <= hoy)) {
    return datosInvalidos(res, 'hasta debe ser una fecha YYYY-MM-DD futura, o null si no tiene fecha de fin');
  }

  const { idDiferimiento, habilitado, aptoDesde } = await marcarNoApto(req.donante.idDonante, { motivo, desde, hasta });
  res.status(201).json({ idDiferimiento, habilitado, aptoDesde });
});

// POST /api/donantes/:idDonante/donacion-registrada: empieza la espera de 56 días.
// La llama quien registra la donación (DV-11); también completa el grupo si el donante no lo sabía.
router.post('/:idDonante/donacion-registrada', autenticar, autorizar('institucion'), exigirInstitucionAprobada, cargarDonanteDeLaUrl, async (req, res) => {
  const { fecha, grupoSanguineo, factorRh } = req.body ?? {};

  if (!esFechaObligatoria(fecha) || fecha > obtenerFechaHoy()) {
    return datosInvalidos(res, 'fecha es obligatoria, con formato YYYY-MM-DD, y no puede ser futura');
  }
  if (Boolean(grupoSanguineo) !== Boolean(factorRh)) {
    return datosInvalidos(res, 'grupoSanguineo y factorRh se envían juntos, o se omiten los dos');
  }
  if (grupoSanguineo && (!GRUPOS_VALIDOS.includes(grupoSanguineo) || !FACTORES_VALIDOS.includes(factorRh))) {
    return datosInvalidos(res, 'grupoSanguineo debe ser A, B, AB u O y factorRh positivo o negativo');
  }

  const { habilitado, aptoDesde } = await registrarDonacion(req.donante.idDonante, { fecha, grupoSanguineo, factorRh });
  res.json({ habilitado, aptoDesde });
});

module.exports = router;
