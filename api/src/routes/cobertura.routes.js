// TAREA-14: búsqueda de cobertura en la red antes de convocar donantes.
// POST /:idNecesidad/cobertura/aceptar se agrega con DV-13 (transferencias), que todavía no está.
const { Router } = require('express');
const { autenticar, autorizar } = require('../middlewares/auth');
const { obtenerFechaHoy } = require('../utils/validaciones');
const { parsearFecha } = require('../utils/formateadores');
const { buscarNecesidadPropia } = require('./convocatorias.routes');
const { buscarCoberturaEnRed } = require('../services/cobertura');

const router = Router();

function responderError(res, estado, codigo, mensaje) {
    return res.status(estado).json({ error: { codigo, mensaje } });
}

// GET /api/necesidades/:idNecesidad/cobertura: opciones en la red (NO guarda nada).
// No usa cerrarVencidas() porque escribe en la base: si la fecha límite pasó, solo responde el error.
router.get('/:idNecesidad/cobertura', autenticar, autorizar('institucion'), async (req, res) => {
    const necesidad = await buscarNecesidadPropia(req.params.idNecesidad, req.usuario.id);
    if (!necesidad) {
        return responderError(res, 404, 'NO_ENCONTRADO', 'La necesidad no existe');
    }
    if (necesidad.estado !== 'abierta') {
        return responderError(res, 409, 'CONFLICTO', `La necesidad ya está ${necesidad.estado}: no se puede buscar cobertura`);
    }
    if (necesidad.fechaLimite < parsearFecha(obtenerFechaHoy())) {
        return responderError(res, 409, 'CONFLICTO', 'La necesidad ya pasó su fecha límite: no se puede buscar cobertura');
    }

    res.json(await buscarCoberturaEnRed(necesidad));
});

module.exports = router;
