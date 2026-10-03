const { Router } = require("express");
const prisma = require("../lib/prisma");
const { autenticar } = require("../middlewares/auth");

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

module.exports = router;
