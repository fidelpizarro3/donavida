// TAREA-11 (DV-9): el donante ve las alertas que le llegaron y las acepta o rechaza.
const { Router } = require('express');
const prisma = require('../lib/prisma');
const { autenticar, autorizar } = require('../middlewares/auth');
const { formatearFecha } = require('../utils/formateadores');

const router = Router();

const UUID_VALIDO = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// El donante solo ve las que ya le llegaron: las pendientes todavía no se mandaron y las canceladas nunca salieron
const ESTADOS_VISIBLES = ['enviada', 'aceptada', 'rechazada'];

// Lo que hace falta traer de la base para armar la respuesta
const DATOS_ALERTA = {
    convocatoria: {
        include: {
            necesidad: {
                include: { institucion: { select: { idInstitucion: true, nombre: true, direccion: true } } },
            },
        },
    },
};


// ─── Funciones de ayuda ──────────────────────────────────────────────────────

function responderError(res, estado, codigo, mensaje) {
    return res.status(estado).json({ error: { codigo, mensaje } });
}

// Criterio: la alerta muestra el motivo, el hospital y la distancia
function mapearAlerta(alerta) {
    const { necesidad } = alerta.convocatoria;
    return {
        idAlerta: alerta.idAlerta,
        estado: alerta.estado,
        canal: alerta.canal,
        motivo: alerta.motivo,
        distanciaKm: Number(alerta.distanciaKm),
        enviadaEn: alerta.enviadaEn,
        respondidaEn: alerta.respondidaEn,
        // Solo se puede responder si todavía no respondió y la necesidad sigue abierta
        puedeResponder: alerta.estado === 'enviada' && necesidad.estado === 'abierta',
        institucion: necesidad.institucion,
        necesidad: {
            grupoSanguineo: necesidad.grupoSanguineo,
            factorRh: necesidad.factorRh,
            componente: necesidad.componente,
            urgencia: necesidad.urgencia,
            fechaLimite: formatearFecha(necesidad.fechaLimite),
            estado: necesidad.estado,
        },
    };
}

// Busca una alerta solo si es del donante logueado. Devuelve null si no existe o es de otro
async function buscarAlertaPropia(idAlerta, idUsuario) {
    if (!UUID_VALIDO.test(idAlerta)) return null;
    return prisma.alerta.findFirst({
        where: { idAlerta, donante: { idUsuario } },
        include: DATOS_ALERTA,
    });
}

// Aceptar y rechazar hacen lo mismo, cambia solo el estado final
async function responderAlerta(req, res, nuevoEstado) {
    const alerta = await buscarAlertaPropia(req.params.idAlerta, req.usuario.id);
    if (!alerta || !ESTADOS_VISIBLES.includes(alerta.estado)) {
        return responderError(res, 404, 'NO_ENCONTRADO', 'La alerta no existe');
    }
    if (alerta.estado !== 'enviada') {
        return responderError(res, 409, 'CONFLICTO', `Ya respondiste esta alerta (quedó ${alerta.estado})`);
    }
    if (alerta.convocatoria.necesidad.estado !== 'abierta') {
        return responderError(res, 409, 'CONFLICTO', 'La institución ya no necesita esta donación. ¡Gracias igual!');
    }

    const actualizada = await prisma.alerta.update({
        where: { idAlerta: alerta.idAlerta },
        data: { estado: nuevoEstado, respondidaEn: new Date() },
        include: DATOS_ALERTA,
    });
    return actualizada;
}

// ─── Rutas ───────────────────────────────────────────────────────────────────

router.use(autenticar, autorizar('donante'));

// 1) GET /api/alertas/mias: las alertas que le llegaron al donante, la más nueva primero
router.get('/mias', async (req, res) => {
    const alertas = await prisma.alerta.findMany({
        where: { donante: { idUsuario: req.usuario.id }, estado: { in: ESTADOS_VISIBLES } },
        include: DATOS_ALERTA,
        orderBy: { enviadaEn: 'desc' },
    });
    res.json(alertas.map(mapearAlerta));
});

// 2) POST /api/alertas/:idAlerta/aceptar: el donante va a ir a donar
//    Después tiene que reservar un turno en la agenda de esa institución (TAREA-10, Fidel)
router.post('/:idAlerta/aceptar', async (req, res) => {
    const alerta = await responderAlerta(req, res, 'aceptada');
    if (!alerta) return;
    const respuesta = mapearAlerta(alerta);
    res.json({
        ...respuesta,
        siguientePaso: `Reservá un turno en ${respuesta.institucion.nombre}`,
    });
});

// 3) POST /api/alertas/:idAlerta/rechazar: no puede ir esta vez (no se lo penaliza)
router.post('/:idAlerta/rechazar', async (req, res) => {
    const alerta = await responderAlerta(req, res, 'rechazada');
    if (!alerta) return;
    res.json(mapearAlerta(alerta));
});

module.exports = router;
