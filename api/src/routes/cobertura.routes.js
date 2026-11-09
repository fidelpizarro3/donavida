// TAREA-14: búsqueda de cobertura en la red antes de convocar donantes.
//   GET  /:idNecesidad/cobertura          → opciones en la red (no guarda nada)
//   POST /:idNecesidad/cobertura/aceptar  → pide las unidades elegidas con las transferencias de TAREA-12
const { Router } = require('express');
const { autenticar, autorizar } = require('../middlewares/auth');
const { obtenerFechaHoy, datosInvalidos } = require('../utils/validaciones');
const { parsearFecha } = require('../utils/formateadores');
const { buscarNecesidadPropia } = require('./convocatorias.routes');
const { buscarCoberturaEnRed } = require('../services/cobertura');
const { pedirTransferencia, ErrorTransferencia, MAX_UNIDADES } = require('../services/transferencias');

const router = Router();

const UUID_VALIDO = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function responderError(res, estado, codigo, mensaje) {
    return res.status(estado).json({ error: { codigo, mensaje } });
}

// La necesidad tiene que ser de la institución del usuario, estar abierta y en fecha.
// No usa cerrarVencidas() porque escribe en la base: si la fecha límite pasó, solo responde el error.
// Responde el error y devuelve null si no se puede buscar cobertura.
async function necesidadParaCobertura(req, res) {
    const necesidad = await buscarNecesidadPropia(req.params.idNecesidad, req.usuario.id);
    if (!necesidad) {
        responderError(res, 404, 'NO_ENCONTRADO', 'La necesidad no existe');
        return null;
    }
    if (necesidad.estado !== 'abierta') {
        responderError(res, 409, 'CONFLICTO', `La necesidad ya está ${necesidad.estado}: no se puede buscar cobertura`);
        return null;
    }
    if (necesidad.fechaLimite < parsearFecha(obtenerFechaHoy())) {
        responderError(res, 409, 'CONFLICTO', 'La necesidad ya pasó su fecha límite: no se puede buscar cobertura');
        return null;
    }
    return necesidad;
}

// Revisa la lista de unidades elegidas. Devuelve el mensaje de error, o null si está bien
function validarIdsUnidades(idsUnidadSangre) {
    if (!Array.isArray(idsUnidadSangre) || idsUnidadSangre.length === 0 || idsUnidadSangre.length > MAX_UNIDADES) {
        return `idsUnidadSangre tiene que ser una lista de 1 a ${MAX_UNIDADES} unidades`;
    }
    if (!idsUnidadSangre.every((id) => typeof id === 'string' && UUID_VALIDO.test(id))) return 'idsUnidadSangre tiene ids no válidos';
    if (new Set(idsUnidadSangre).size !== idsUnidadSangre.length) return 'Hay unidades repetidas en el pedido';
    return null;
}

// GET /api/necesidades/:idNecesidad/cobertura: opciones en la red (NO guarda nada)
router.get('/:idNecesidad/cobertura', autenticar, autorizar('institucion'), async (req, res) => {
    const necesidad = await necesidadParaCobertura(req, res);
    if (!necesidad) return;
    res.json(await buscarCoberturaEnRed(necesidad));
});

// POST /api/necesidades/:idNecesidad/cobertura/aceptar: el hospital acepta la propuesta (o parte de ella).
//   Body: { "idsUnidadSangre": ["<uuid>", ...] }
// Criterio: si acepta, se crea la transferencia con TAREA-12: una por cada hospital que presta, porque cada uno
// responde por su cuenta. Lo que no se cubra se convoca después (el cupo descuenta lo que viene en camino).
router.post('/:idNecesidad/cobertura/aceptar', autenticar, autorizar('institucion'), async (req, res) => {
    const { idsUnidadSangre } = req.body ?? {};
    const mensajeError = validarIdsUnidades(idsUnidadSangre);
    if (mensajeError) return datosInvalidos(res, mensajeError);

    const necesidad = await necesidadParaCobertura(req, res);
    if (!necesidad) return;

    // Se vuelve a buscar: desde que el hospital vio la propuesta, una unidad pudo usarse, vencer o pedirla otro,
    // y el hospital que presta no puede quedar por debajo de su stock mínimo.
    const cobertura = await buscarCoberturaEnRed(necesidad);
    if (idsUnidadSangre.length > cobertura.unidadesFaltantes) {
        return responderError(res, 409, 'CONFLICTO', cobertura.unidadesFaltantes === 0
            ? 'A esta necesidad ya no le faltan unidades: están cubiertas o en camino'
            : `A esta necesidad le faltan ${cobertura.unidadesFaltantes}: no se pueden pedir ${idsUnidadSangre.length}`);
    }
    const proveedoraDe = new Map();
    for (const opcion of cobertura.opciones) {
        for (const unidad of opcion.unidades) proveedoraDe.set(unidad.idUnidadSangre, opcion.idInstitucion);
    }
    const noPrestables = idsUnidadSangre.filter((id) => !proveedoraDe.has(id));
    if (noPrestables.length > 0) {
        return responderError(res, 409, 'CONFLICTO',
            `${noPrestables.length === 1 ? '1 de las unidades ya no se puede' : `${noPrestables.length} de las unidades ya no se pueden`} pedir. Volvé a buscar en la red`);
    }

    // Una transferencia por hospital, en el orden de la propuesta (el más cercano primero)
    const porProveedora = new Map();
    for (const id of idsUnidadSangre) {
        const idProveedora = proveedoraDe.get(id);
        if (!porProveedora.has(idProveedora)) porProveedora.set(idProveedora, []);
        porProveedora.get(idProveedora).push(id);
    }

    const transferencias = [];
    for (const [idInstitucionProveedora, ids] of porProveedora) {
        try {
            transferencias.push(await pedirTransferencia({
                idInstitucionSolicitante: necesidad.idInstitucion,
                idInstitucionProveedora,
                idsUnidadSangre: ids,
                idNecesidad: necesidad.idNecesidad,
            }));
        } catch (err) {
            if (!(err instanceof ErrorTransferencia)) throw err;
            // Las que ya se pidieron quedan pedidas (cada hospital responde la suya); se avisa cuáles
            const yaPedidas = transferencias.length === 0 ? '' : `Se ${transferencias.length === 1 ? 'pidió 1 transferencia' : `pidieron ${transferencias.length} transferencias`}, pero otra no: `;
            return res.status(err.status).json({ error: { codigo: err.codigo, mensaje: yaPedidas + err.message }, transferencias });
        }
    }

    res.status(201).json({ idNecesidad: necesidad.idNecesidad, unidadesPedidas: idsUnidadSangre.length, transferencias });
});

module.exports = router;
