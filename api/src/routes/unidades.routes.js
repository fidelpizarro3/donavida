// TAREA-5: registrar el ingreso de unidades de sangre.
// TAREA-6: consultar el stock de la institución.
// La ruta revisa permisos y que llegue una sola unidad; la lógica está en services/unidades.js.
const { Router } = require('express');
const prisma = require('../lib/prisma');
const { autenticar, autorizar } = require('../middlewares/auth');
const { datosInvalidos, GRUPOS_VALIDOS, FACTORES_VALIDOS, obtenerFechaHoy } = require('../utils/validaciones');
const {
  registrarIngresoUnidad,
  mapearUnidad,
  calcularDiasRestantes,
  estaPorVencer,
} = require('../services/unidades');

const router = Router();

// Valores del schema (enums EstadoUnidad y Componente): sirven para validar los filtros
// antes de consultar, así un valor inventado da 400 y no un error 500 de Prisma
const ESTADOS_UNIDAD = ['disponible', 'reservada', 'usada', 'vencida', 'descartada'];
const COMPONENTES = ['sangre_entera', 'globulos_rojos', 'plaquetas'];

// Una unidad como la ve la pantalla de stock: los datos de siempre más cuánto le queda.
// "porVencer" solo aplica a las disponibles: una unidad ya usada no se tiene que apurar.
function mapearUnidadConVencimiento(unidad, hoy) {
  const datos = mapearUnidad(unidad);
  const diasRestantes = calcularDiasRestantes(datos.fechaVencimiento, hoy);
  return {
    ...datos,
    diasRestantes,
    porVencer: datos.estado === 'disponible' && estaPorVencer(datos.componente, diasRestantes),
  };
}

// Solo instituciones aprobadas. Devuelve el id de la institución aprobada del usuario, o null
async function buscarInstitucionAprobada(idUsuario) {
  const vinculo = await prisma.usuarioInstitucion.findFirst({
    where: { idUsuario, institucion: { estado: 'aprobada' } },
  });
  return vinculo ? vinculo.idInstitucion : null;
}

// GET /api/unidades: las unidades de mi institución, de la que vence primero a la última
//   Filtros opcionales: ?estado=disponible&grupoSanguineo=O&factorRh=negativo&componente=plaquetas
router.get('/', autenticar, autorizar('institucion'), async (req, res) => {
  const idInstitucion = await buscarInstitucionAprobada(req.usuario.id);
  if (!idInstitucion) {
    return res.status(403).json({
      error: { codigo: 'SIN_PERMISO', mensaje: 'Tu institución no está aprobada para consultar stock' },
    });
  }

  // Los filtros vienen en la URL, después del "?". Los que no se mandan quedan undefined
  const { estado, grupoSanguineo, factorRh, componente } = req.query;
  if (estado && !ESTADOS_UNIDAD.includes(estado)) {
    return datosInvalidos(res, `estado debe ser uno de: ${ESTADOS_UNIDAD.join(', ')}`);
  }
  if (grupoSanguineo && !GRUPOS_VALIDOS.includes(grupoSanguineo)) {
    return datosInvalidos(res, `grupoSanguineo debe ser uno de: ${GRUPOS_VALIDOS.join(', ')}`);
  }
  if (factorRh && !FACTORES_VALIDOS.includes(factorRh)) {
    return datosInvalidos(res, `factorRh debe ser uno de: ${FACTORES_VALIDOS.join(', ')}`);
  }
  if (componente && !COMPONENTES.includes(componente)) {
    return datosInvalidos(res, `componente debe ser uno de: ${COMPONENTES.join(', ')}`);
  }

  // Prisma ignora las condiciones que valen undefined: un filtro que no vino no filtra nada
  const unidades = await prisma.unidadSangre.findMany({
    where: { idInstitucion, estado, grupoSanguineo, factorRh, componente },
    orderBy: { fechaVencimiento: 'asc' }, // la que vence primero, arriba: es la que hay que usar antes
  });

  const hoy = obtenerFechaHoy();
  res.json(unidades.map((unidad) => mapearUnidadConVencimiento(unidad, hoy)));
});

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
