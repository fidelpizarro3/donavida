// TAREA-13 (DV-14): lo que decide el hospital sobre una convocatoria cuando su necesidad se cubre.
//   POST  /api/convocatorias/:idConvocatoria/mantener-abierta → dejarla abierta aunque se cubra (para reponer stock)
//   PATCH /api/convocatorias/:idConvocatoria/turnos           → con los que tenían turno: mantenerlos o pedirles que reprogramen
// El cierre en sí es automático, al cubrirse la necesidad: services/cierreNecesidad.js
const { Router } = require('express');
const prisma = require('../lib/prisma');
const { autenticar, autorizar } = require('../middlewares/auth');
const { datosInvalidos } = require('../utils/validaciones');
const {
  enviarAgradecimientos,
  turnosVigentes,
  pedirQueReprogramen,
  mapearConvocatoria,
} = require('../services/cierreNecesidad');

const router = Router();

const UUID_VALIDO = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ACCIONES_TURNOS = ['mantener', 'reprogramar'];
const ESTADO_NECESIDAD = { abierta: 'abierta', cubierta: 'cubierta', cerrada_manual: 'cerrada a mano', vencida: 'vencida' };

// Un error con su código HTTP: se lanza adentro de la transacción para deshacerla y responder bien
class ErrorCierre extends Error {
  constructor(status, mensaje) {
    super(mensaje);
    this.status = status;
  }
}

function responderError(res, estado, codigo, mensaje) {
  return res.status(estado).json({ error: { codigo, mensaje } });
}

// La convocatoria tiene que ser de una necesidad de la institución APROBADA del usuario.
// Devuelve null si no existe o es de otra institución (se responde 404 en los dos casos)
async function buscarConvocatoriaPropia(idConvocatoria, idUsuario) {
  if (!UUID_VALIDO.test(idConvocatoria)) return null;
  const vinculo = await prisma.usuarioInstitucion.findFirst({
    where: { idUsuario, institucion: { estado: 'aprobada' } },
  });
  if (!vinculo) return null;
  return prisma.convocatoria.findFirst({
    where: { idConvocatoria, necesidad: { idInstitucion: vinculo.idInstitucion } },
    include: { necesidad: true },
  });
}

router.use(autenticar, autorizar('institucion'));

// 1) POST /api/convocatorias/:idConvocatoria/mantener-abierta
//    Body: { "mantener": true | false }
// Criterio: el hospital puede dejar la convocatoria abierta aunque la necesidad esté cubierta, para reponer stock.
// Se elige mientras la necesidad está abierta (así, cuando se cubre, la convocatoria sigue). Si se desmarca
// cuando la necesidad ya está cubierta, la convocatoria se cierra en ese momento y se agradece a los que no fueron.
router.post('/:idConvocatoria/mantener-abierta', async (req, res) => {
  const { mantener } = req.body ?? {};
  if (typeof mantener !== 'boolean') return datosInvalidos(res, 'mantener tiene que ser true o false');

  const convocatoria = await buscarConvocatoriaPropia(req.params.idConvocatoria, req.usuario.id);
  if (!convocatoria) return responderError(res, 404, 'NO_ENCONTRADO', 'La convocatoria no existe');
  const { idConvocatoria, idNecesidad } = convocatoria;

  let actualizada;
  try {
    actualizada = await prisma.$transaction(async (tx) => {
      // Se bloquea la necesidad mientras se decide: si justo se está cubriendo, se espera a que termine y se
      // lee cómo quedó. Así no puede quedar abierta una convocatoria que el hospital ya no quiere mantener.
      await tx.$queryRaw`SELECT 1 FROM necesidad WHERE id_necesidad = ${idNecesidad}::uuid FOR UPDATE`;
      const necesidad = await tx.necesidad.findUnique({ where: { idNecesidad } });
      if (!['abierta', 'cubierta'].includes(necesidad.estado)) {
        throw new ErrorCierre(409, `La necesidad está ${ESTADO_NECESIDAD[necesidad.estado]}: la convocatoria ya no se puede cambiar`);
      }
      const actual = await tx.convocatoria.findUnique({ where: { idConvocatoria } });
      if (actual.estado !== 'enviada') throw new ErrorCierre(409, 'La convocatoria ya está cerrada');

      const cerrarAhora = !mantener && necesidad.estado === 'cubierta';
      return tx.convocatoria.update({
        where: { idConvocatoria },
        data: { mantenerAbierta: mantener, ...(cerrarAhora && { estado: 'cerrada' }) },
      });
    });
  } catch (err) {
    if (err instanceof ErrorCierre) return responderError(res, err.status, 'CONFLICTO', err.message);
    throw err;
  }

  // El aviso sale después de guardar el cierre (nunca adentro de la transacción)
  const agradecidos = actualizada.estado === 'cerrada' ? await enviarAgradecimientos(idNecesidad) : 0;
  res.json(mapearConvocatoria(actualizada, { agradecidos }));
});

// 2) PATCH /api/convocatorias/:idConvocatoria/turnos
//    Body: { "accion": "mantener" | "reprogramar" }
// Criterio: los que tenían turno, el hospital elige mantenerlos o pedirles que reprogramen. Se decide una vez,
// con la necesidad cubierta y la convocatoria cerrada (si sigue abierta para reponer stock, los turnos se mantienen).
//   - mantener: vienen el día que eligieron y su donación va al stock. No se les manda nada.
//   - reprogramar: se les avisa por su canal y pueden elegir otro día, sin el límite de la necesidad.
//     El turno sigue reservado hasta que lo cambien (o lo cancelen).
router.patch('/:idConvocatoria/turnos', async (req, res) => {
  const { accion } = req.body ?? {};
  if (!ACCIONES_TURNOS.includes(accion)) return datosInvalidos(res, 'accion debe ser mantener o reprogramar');

  const convocatoria = await buscarConvocatoriaPropia(req.params.idConvocatoria, req.usuario.id);
  if (!convocatoria) return responderError(res, 404, 'NO_ENCONTRADO', 'La convocatoria no existe');
  const { idConvocatoria, necesidad } = convocatoria;

  if (necesidad.estado === 'abierta') {
    return responderError(res, 409, 'CONFLICTO', 'La necesidad todavía no está cubierta: los turnos siguen como están');
  }
  if (necesidad.estado !== 'cubierta') {
    return responderError(res, 409, 'CONFLICTO', `La necesidad está ${ESTADO_NECESIDAD[necesidad.estado]}: no hay nada que decidir sobre los turnos`);
  }
  if (convocatoria.estado !== 'cerrada') {
    return responderError(res, 409, 'CONFLICTO',
      'La convocatoria sigue abierta para reponer stock, así que los turnos se mantienen. Para pedirles que reprogramen, primero cerrala');
  }
  if (convocatoria.decisionTurnos) {
    return responderError(res, 409, 'CONFLICTO', `Ya decidiste qué pasa con los turnos: ${convocatoria.decisionTurnos === 'mantener' ? 'se mantienen' : 'les pediste que reprogramen'}`);
  }

  const turnos = await turnosVigentes(idConvocatoria);
  if (turnos.length === 0) {
    return responderError(res, 409, 'CONFLICTO', 'En esta convocatoria no queda nadie con turno reservado');
  }

  // Una sola vez: el cambio es condicional. Si dos personas del hospital deciden a la vez, vale la primera
  const { count } = await prisma.convocatoria.updateMany({
    where: { idConvocatoria, decisionTurnos: null },
    data: { decisionTurnos: accion },
  });
  if (count === 0) return responderError(res, 409, 'CONFLICTO', 'Ya decidiste qué pasa con los turnos');

  const avisados = accion === 'reprogramar' ? await pedirQueReprogramen(turnos) : 0;
  res.json({
    ...mapearConvocatoria({ ...convocatoria, decisionTurnos: accion }, { turnosReservados: turnos.length }),
    avisados,
  });
});

module.exports = router;
