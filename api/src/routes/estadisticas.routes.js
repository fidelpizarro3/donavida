// TAREA-19: estadísticas de convocatorias y donaciones.
// La ruta revisa permisos y filtros; las cuentas están en services/estadisticas.js.
const { Router } = require('express');
const prisma = require('../lib/prisma');
const { autenticar, autorizar } = require('../middlewares/auth');
const {
  GRUPOS_VALIDOS,
  FACTORES_VALIDOS,
  esFechaValida,
  obtenerFechaHoyArgentina,
  datosInvalidos,
} = require('../utils/validaciones');
const { armarEstadisticas, sumarDias } = require('../services/estadisticas');

const router = Router();

const UUID_VALIDO = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DIAS_POR_DEFECTO = 90; // sin período, los últimos 3 meses

async function buscarInstitucionAprobada(idUsuario) {
  const vinculo = await prisma.usuarioInstitucion.findFirst({
    where: { idUsuario, institucion: { estado: 'aprobada' } },
  });
  return vinculo ? vinculo.idInstitucion : null;
}

// Revisa los filtros. Devuelve el mensaje de error, o null si están bien
function validarFiltros({ desde, hasta, grupoSanguineo, factorRh }) {
  if (!esFechaValida(desde) || !esFechaValida(hasta)) return 'desde y hasta deben tener formato YYYY-MM-DD';
  if (desde > hasta) return 'desde no puede ser posterior a hasta';
  if (grupoSanguineo !== undefined && !GRUPOS_VALIDOS.includes(grupoSanguineo)) return 'grupoSanguineo debe ser A, B, AB u O';
  if (factorRh !== undefined && !FACTORES_VALIDOS.includes(factorRh)) return 'factorRh debe ser positivo o negativo';
  return null;
}

// GET /api/estadisticas/convocatorias?desde=2026-08-01&hasta=2026-11-19&grupoSanguineo=O&factorRh=negativo
//   - institución: las suyas
//   - admin: toda la red, o una institución con ?idInstitucion=
// Criterio: se puede filtrar por período y por grupo sanguíneo
router.get('/convocatorias', autenticar, autorizar('institucion', 'admin'), async (req, res) => {
  const hoy = obtenerFechaHoyArgentina();
  const filtros = {
    desde: req.query.desde ?? sumarDias(hoy, -(DIAS_POR_DEFECTO - 1)),
    hasta: req.query.hasta ?? hoy,
    grupoSanguineo: req.query.grupoSanguineo || undefined,
    factorRh: req.query.factorRh || undefined,
  };
  const mensajeError = validarFiltros(filtros);
  if (mensajeError) return datosInvalidos(res, mensajeError);

  let idInstitucion;
  if (req.usuario.rol === 'institucion') {
    idInstitucion = await buscarInstitucionAprobada(req.usuario.id);
    if (!idInstitucion) {
      return res.status(403).json({ error: { codigo: 'SIN_PERMISO', mensaje: 'Tu institución no está aprobada' } });
    }
  } else if (req.query.idInstitucion) {
    if (!UUID_VALIDO.test(req.query.idInstitucion)) return datosInvalidos(res, 'idInstitucion no es válido');
    idInstitucion = req.query.idInstitucion;
  }

  res.json(await armarEstadisticas({ idInstitucion, ...filtros }));
});

module.exports = router;
