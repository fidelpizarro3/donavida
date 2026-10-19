// TAREA-5: registrar el ingreso de unidades de sangre.
// La ruta revisa permisos y que llegue una sola unidad; la lógica está en services/unidades.js.
const { Router } = require('express');
const prisma = require('../lib/prisma');
const { autenticar, autorizar } = require('../middlewares/auth');
const { datosInvalidos } = require('../utils/validaciones');
const { registrarIngresoUnidad, mapearUnidad } = require('../services/unidades');

const router = Router();

// Solo instituciones aprobadas. Devuelve el id de la institución aprobada del usuario, o null
async function buscarInstitucionAprobada(idUsuario) {
  const vinculo = await prisma.usuarioInstitucion.findFirst({
    where: { idUsuario, institucion: { estado: 'aprobada' } },
  });
  return vinculo ? vinculo.idInstitucion : null;
}

// POST /api/unidades: la institución carga UNA unidad (no una cantidad agrupada)
//   Body: { "grupoSanguineo": "O", "factorRh": "negativo", "componente": "globulos_rojos", "fechaExtraccion": "2026-10-15" }
router.post('/', autenticar, autorizar('institucion'), async (req, res) => {
  const idInstitucion = await buscarInstitucionAprobada(req.usuario.id);
  if (!idInstitucion) {
    return res.status(403).json({
      error: { codigo: 'SIN_PERMISO', mensaje: 'Tu institución no está aprobada para cargar unidades' },
    });
  }

  const datos = req.body;
  if (!datos || typeof datos !== 'object' || Array.isArray(datos)) {
    return datosInvalidos(res, 'Las unidades se cargan de a una: enviá un solo objeto con grupoSanguineo, factorRh, componente y fechaExtraccion');
  }

  // Se toman solo estos campos: la institución y el usuario salen del token, nunca del body
  const { grupoSanguineo, factorRh, componente, fechaExtraccion } = datos;
  const resultado = await registrarIngresoUnidad({
    idInstitucion,
    idUsuario: req.usuario.id,
    grupoSanguineo,
    factorRh,
    componente,
    fechaExtraccion,
  });
  if (resultado.error) return datosInvalidos(res, resultado.error);

  res.status(201).json(mapearUnidad(resultado.unidad));
});

module.exports = router;
