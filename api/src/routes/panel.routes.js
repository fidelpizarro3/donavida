// TAREA-15: cuadro de stock contra demanda.
// La ruta revisa permisos y datos de entrada; las cuentas están en services/stockDemanda.js.
const { Router } = require('express');
const prisma = require('../lib/prisma');
const { autenticar, autorizar } = require('../middlewares/auth');
const { datosInvalidos } = require('../utils/validaciones');
const { armarCuadro } = require('../services/stockDemanda');

const router = Router();

// Solo los componentes que se guardan como unidades (tienen vencimiento definido en DV-5)
const COMPONENTES = ['globulos_rojos', 'plaquetas'];

async function buscarInstitucionAprobada(idUsuario) {
  const vinculo = await prisma.usuarioInstitucion.findFirst({
    where: { idUsuario, institucion: { estado: 'aprobada' } },
  });
  return vinculo ? vinculo.idInstitucion : null;
}

// GET /api/panel/stock-demanda?componente=globulos_rojos
//   - institución: su propio cuadro
//   - admin: el mismo cuadro sumando todas las instituciones de la red
router.get('/stock-demanda', autenticar, autorizar('institucion', 'admin'), async (req, res) => {
  const componente = req.query.componente ?? 'globulos_rojos';
  if (!COMPONENTES.includes(componente)) {
    return datosInvalidos(res, 'componente debe ser globulos_rojos o plaquetas');
  }

  // undefined = sin filtro de institución: el admin ve la red completa
  let idInstitucion;
  if (req.usuario.rol === 'institucion') {
    idInstitucion = await buscarInstitucionAprobada(req.usuario.id);
    if (!idInstitucion) {
      return res.status(403).json({
        error: { codigo: 'SIN_PERMISO', mensaje: 'Tu institución no está aprobada' },
      });
    }
  }

  res.json(await armarCuadro(idInstitucion, componente));
});

module.exports = router;
