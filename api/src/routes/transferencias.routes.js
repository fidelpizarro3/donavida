// TAREA-12 (DV-13): transferencia de unidades entre instituciones.
// Las rutas revisan permisos y datos de entrada; la lógica está en services/transferencias.js.
const { Router } = require('express');
const prisma = require('../lib/prisma');
const { autenticar, autorizar } = require('../middlewares/auth');
const { GRUPOS_VALIDOS, FACTORES_VALIDOS, esTexto, datosInvalidos } = require('../utils/validaciones');
const {
  pedirTransferencia,
  aceptarTransferencia,
  rechazarTransferencia,
  recibirTransferencia,
  listarTransferencias,
  buscarUnidadesDisponibles,
  ErrorTransferencia,
  MAX_UNIDADES,
} = require('../services/transferencias');

const router = Router();

// Un id mal formado haría fallar a Postgres (columna uuid) con un 500: mejor un 400 claro
const UUID_VALIDO = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const COMPONENTES = ['sangre_entera', 'globulos_rojos', 'plaquetas'];
const DIRECCIONES = ['enviadas', 'recibidas'];

// Solo instituciones aprobadas. Deja en req.idInstitucion la institución aprobada del usuario
async function cargarInstitucionAprobada(req, res, next) {
  const vinculo = await prisma.usuarioInstitucion.findFirst({
    where: { idUsuario: req.usuario.id, institucion: { estado: 'aprobada' } },
  });
  if (!vinculo) {
    return res.status(403).json({
      error: { codigo: 'SIN_PERMISO', mensaje: 'Tu institución no está aprobada para hacer transferencias' },
    });
  }
  req.idInstitucion = vinculo.idInstitucion;
  next();
}

router.use(autenticar, autorizar('institucion'), cargarInstitucionAprobada);

// Un ErrorTransferencia se responde con su status y su mensaje; cualquier otro error sigue al manejador general
const atajarErrores = (ruta) => async (req, res) => {
  try {
    await ruta(req, res);
  } catch (err) {
    if (!(err instanceof ErrorTransferencia)) throw err;
    res.status(err.status).json({ error: { codigo: err.codigo, mensaje: err.message } });
  }
};

// Revisa el :idTransferencia de la URL. Devuelve true si es válido (si no, ya respondió 400)
function idValido(req, res) {
  if (UUID_VALIDO.test(req.params.idTransferencia)) return true;
  datosInvalidos(res, 'idTransferencia no es un identificador válido');
  return false;
}

// GET /api/transferencias/unidades-disponibles?grupoSanguineo=O&factorRh=negativo&componente=globulos_rojos
// Para pedir a mano: qué unidades de ese grupo y componente tienen las otras instituciones de la red
router.get('/unidades-disponibles', async (req, res) => {
  const { grupoSanguineo, factorRh, componente } = req.query;
  if (!GRUPOS_VALIDOS.includes(grupoSanguineo)) return datosInvalidos(res, 'grupoSanguineo debe ser A, B, AB u O');
  if (!FACTORES_VALIDOS.includes(factorRh)) return datosInvalidos(res, 'factorRh debe ser positivo o negativo');
  if (!COMPONENTES.includes(componente)) return datosInvalidos(res, `componente debe ser uno de: ${COMPONENTES.join(', ')}`);

  res.json(await buscarUnidadesDisponibles({ idInstitucion: req.idInstitucion, grupoSanguineo, factorRh, componente }));
});

// GET /api/transferencias?direccion=enviadas|recibidas: historial de mi institución (sin filtro, las dos)
router.get('/', async (req, res) => {
  const { direccion } = req.query;
  if (direccion !== undefined && !DIRECCIONES.includes(direccion)) {
    return datosInvalidos(res, 'direccion debe ser enviadas o recibidas');
  }
  res.json(await listarTransferencias({ idInstitucion: req.idInstitucion, direccion }));
});

// POST /api/transferencias: pedirle unidades a otra institución
//   Body: { "idInstitucionProveedora": "<uuid>", "idsUnidadSangre": ["<uuid>", ...], "idNecesidad": "<uuid>" (opcional) }
router.post('/', atajarErrores(async (req, res) => {
  const { idInstitucionProveedora, idsUnidadSangre, idNecesidad } = req.body ?? {};
  if (typeof idInstitucionProveedora !== 'string' || !UUID_VALIDO.test(idInstitucionProveedora)) {
    return datosInvalidos(res, 'idInstitucionProveedora tiene que ser un identificador válido');
  }
  if (!Array.isArray(idsUnidadSangre) || idsUnidadSangre.length === 0 || idsUnidadSangre.length > MAX_UNIDADES) {
    return datosInvalidos(res, `idsUnidadSangre tiene que ser una lista de 1 a ${MAX_UNIDADES} unidades`);
  }
  if (idsUnidadSangre.some((id) => typeof id !== 'string' || !UUID_VALIDO.test(id))) {
    return datosInvalidos(res, 'idsUnidadSangre tiene identificadores que no son válidos');
  }
  if (new Set(idsUnidadSangre).size !== idsUnidadSangre.length) {
    return datosInvalidos(res, 'Hay unidades repetidas en el pedido');
  }
  if (idNecesidad !== undefined && idNecesidad !== null && (typeof idNecesidad !== 'string' || !UUID_VALIDO.test(idNecesidad))) {
    return datosInvalidos(res, 'idNecesidad tiene que ser un identificador válido (o no enviarse, si se pide a mano)');
  }

  const transferencia = await pedirTransferencia({
    idInstitucionSolicitante: req.idInstitucion,
    idInstitucionProveedora,
    idsUnidadSangre,
    idNecesidad: idNecesidad ?? null,
  });
  res.status(201).json(transferencia);
}));

// POST /api/transferencias/:idTransferencia/aceptar: la institución que presta acepta (las unidades quedan reservadas)
router.post('/:idTransferencia/aceptar', atajarErrores(async (req, res) => {
  if (!idValido(req, res)) return;
  res.json(await aceptarTransferencia({
    idTransferencia: req.params.idTransferencia,
    idInstitucion: req.idInstitucion,
    idUsuario: req.usuario.id,
  }));
}));

// POST /api/transferencias/:idTransferencia/rechazar: la institución que presta rechaza
//   Body: { "motivoRechazo": "No podemos quedar por debajo de nuestro mínimo" }
router.post('/:idTransferencia/rechazar', atajarErrores(async (req, res) => {
  if (!idValido(req, res)) return;
  const { motivoRechazo } = req.body ?? {};
  if (!esTexto(motivoRechazo, 500)) {
    return datosInvalidos(res, 'Para rechazar tenés que escribir el motivo (hasta 500 caracteres)');
  }
  res.json(await rechazarTransferencia({
    idTransferencia: req.params.idTransferencia,
    idInstitucion: req.idInstitucion,
    motivoRechazo: motivoRechazo.trim(),
  }));
}));

// POST /api/transferencias/:idTransferencia/recibir: la institución que pidió confirma la recepción
router.post('/:idTransferencia/recibir', atajarErrores(async (req, res) => {
  if (!idValido(req, res)) return;
  res.json(await recibirTransferencia({
    idTransferencia: req.params.idTransferencia,
    idInstitucion: req.idInstitucion,
    idUsuario: req.usuario.id,
  }));
}));

module.exports = router;
