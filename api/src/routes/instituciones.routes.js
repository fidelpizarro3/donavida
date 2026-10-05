const { Router } = require("express");
const prisma = require("../lib/prisma");
const { autenticar, autorizar } = require("../middlewares/auth");
const { datosInvalidos } = require("../utils/validaciones");

const router = Router();

// lo que se expone públicamente de una institución (sin documentacionUrl ni motivoRechazo)

function mapearInstitucionPublica(institucion) {
  return {
    idInstitucion: institucion.idInstitucion,
    nombre: institucion.nombre,
    direccion: institucion.direccion,
    tipo: institucion.tipo,
    estado: institucion.estado,
    latitud: Number(institucion.latitud),
    longitud: Number(institucion.longitud),
    intervaloDonacionDias: institucion.intervaloDonacionDias,
  };
}

// GET /api/instituciones/:idInstitucion: muestra datos públicos de una institución

router.get("/:idInstitucion", autenticar, async (req, res) => {
  const institucion = await prisma.institucion.findUnique({
    where: { idInstitucion: req.params.idInstitucion },
  });

  if (!institucion) {
    return res
      .status(404)
      .json({
        error: {
          codigo: "NO_ENCONTRADO",
          mensaje: "institucion no encontrada",
        },
      });
  }
  res.json(mapearInstitucionPublica(institucion));
});


// POST /api/instituciones: alta de una institución (queda pendiente) + su primer usuario_institucion
router.post('/', autenticar, autorizar('institucion'), async (req, res) => {
  const { nombre, direccion, tipo, documentacionUrl, latitud, longitud, cargo } = req.body ?? {};

  // sirve para checkear que los datos obligatorios esten
  if (!nombre || !direccion || !tipo || latitud === undefined || longitud === undefined || !cargo) {
    return datosInvalidos(res, 'Faltan datos obligatorios: nombre, direccion, tipo, latitud, longitud, cargo');
  }

  if (!['hospital', 'banco_de_sangre'].includes(tipo)) {
    return datosInvalidos(res, "tipo debe ser 'hospital' o 'banco_de_sangre'");
  }

  // se crea la institucion primero, y con ese id crea el usuario_institucion
  const institucion = await prisma.$transaction(async (tx) => {
    const nuevaInstitucion = await tx.institucion.create({
      data: {
        nombre,
        direccion,
        tipo,
        documentacionUrl: documentacionUrl ?? null,
        estado: 'pendiente',
        latitud,
        longitud,
      },
    });

    await tx.usuarioInstitucion.create({
      data: {
        idUsuario: req.usuario.id,
        idInstitucion: nuevaInstitucion.idInstitucion,
        cargo,
      },
    });

    return nuevaInstitucion;
  });

  res.status(201).json(mapearInstitucionPublica(institucion));
});

// PATCH /api/instituciones/:idInstitucion/aprobar: el admin habilita una institucion pendiente
router.patch('/:idInstitucion/aprobar', autenticar, autorizar('admin'), async (req, res) => {
  // primero buscamos la institucion para saber en que estado esta antes de tocar nada
  const institucion = await prisma.institucion.findUnique({
    where: { idInstitucion: req.params.idInstitucion },
  });

  if (!institucion) {
    return res.status(404).json({ error: { codigo: 'NO_ENCONTRADO', mensaje: 'institucion no encontrada' } });
  }

  // solo se puede aprobar algo que todavia este pendiente (no tiene sentido aprobar
  // una institucion ya aprobada, rechazada o dada de baja)
  if (institucion.estado !== 'pendiente') {
    return res.status(409).json({
      error: { codigo: 'CONFLICTO', mensaje: 'Solo se puede aprobar una institucion pendiente' },
    });
  }

  // se actualiza el estado y se deja registrado quien la aprobo (req.usuario.id viene del token)
  const institucionActualizada = await prisma.institucion.update({
    where: { idInstitucion: req.params.idInstitucion },
    data: {
      estado: 'aprobada',
      idUsuarioAprobador: req.usuario.id,
    },
  });

  res.json(mapearInstitucionPublica(institucionActualizada));
});

// PATCH /api/instituciones/:idInstitucion/rechazar: el admin rechaza una institucion pendiente, con motivo
router.patch('/:idInstitucion/rechazar', autenticar, autorizar('admin'), async (req, res) => {
  const { motivoRechazo } = req.body ?? {};

  // el motivo es obligatorio: no queremos un rechazo sin explicacion
  if (!motivoRechazo) {
    return datosInvalidos(res, 'Falta el motivoRechazo');
  }

  const institucion = await prisma.institucion.findUnique({
    where: { idInstitucion: req.params.idInstitucion },
  });

  if (!institucion) {
    return res.status(404).json({ error: { codigo: 'NO_ENCONTRADO', mensaje: 'institucion no encontrada' } });
  }

  // mismo criterio que aprobar: solo tiene sentido rechazar algo que esta pendiente
  if (institucion.estado !== 'pendiente') {
    return res.status(409).json({
      error: { codigo: 'CONFLICTO', mensaje: 'Solo se puede rechazar una institucion pendiente' },
    });
  }

  const institucionActualizada = await prisma.institucion.update({
    where: { idInstitucion: req.params.idInstitucion },
    data: {
      estado: 'rechazada',
      motivoRechazo,
    },
  });

  res.json(mapearInstitucionPublica(institucionActualizada));
});

// PATCH /api/instituciones/:idInstitucion/baja: el admin da de baja una institucion ya aprobada
router.patch('/:idInstitucion/baja', autenticar, autorizar('admin'), async (req, res) => {
  const institucion = await prisma.institucion.findUnique({
    where: { idInstitucion: req.params.idInstitucion },
  });

  if (!institucion) {
    return res.status(404).json({ error: { codigo: 'NO_ENCONTRADO', mensaje: 'institucion no encontrada' } });
  }

  // solo se puede dar de baja algo que esta aprobada y funcionando
  // (no tendria sentido dar de baja algo pendiente o ya rechazado)
  if (institucion.estado !== 'aprobada') {
    return res.status(409).json({
      error: { codigo: 'CONFLICTO', mensaje: 'Solo se puede dar de baja una institucion aprobada' },
    });
  }

  const institucionActualizada = await prisma.institucion.update({
    where: { idInstitucion: req.params.idInstitucion },
    data: { estado: 'baja' },
  });

  res.json(mapearInstitucionPublica(institucionActualizada));
});








module.exports = router;
