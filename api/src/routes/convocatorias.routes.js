// TAREA-8: Selección de donantes a convocar
// El hospital pide una lista sugerida para una necesidad abierta, la ajusta (saca o agrega personas)
// y confirma. Al confirmar se guarda la convocatoria con sus alertas; el envío de los avisos es DV-9.
const { Router } = require('express');
const prisma = require('../lib/prisma');
const { autenticar, autorizar } = require('../middlewares/auth');
const { datosInvalidos } = require('../utils/validaciones');
const { cerrarVencidas } = require('./necesidades.routes');
const { buscarCandidatos, cupoLibre } = require('../services/convocatoria');

const router = Router();

const RADIO_POR_DEFECTO_KM = 20;
const RADIO_MAXIMO_KM = 500;
const UUID_VALIDO = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;


// ─── Funciones de ayuda ──────────────────────────────────────────────────────

function responderError(res, estado, codigo, mensaje) {
    return res.status(estado).json({ error: { codigo, mensaje } });
}

// radioKm es opcional: si no viene se usa el valor por defecto. Devuelve null si no es válido
function leerRadio(radioKm) {
    if (radioKm === undefined) return RADIO_POR_DEFECTO_KM;
    if (typeof radioKm !== 'number' || !(radioKm > 0) || radioKm > RADIO_MAXIMO_KM) return null;
    return radioKm;
}

// Busca la necesidad, con la ubicación de su institución, solo si es de la institución APROBADA del usuario.
// Devuelve null si no existe o es de otra institución (se responde 404 en los dos casos)
async function buscarNecesidadPropia(idNecesidad, idUsuario) {
    if (!UUID_VALIDO.test(idNecesidad)) return null;
    const vinculo = await prisma.usuarioInstitucion.findFirst({
        where: { idUsuario, institucion: { estado: 'aprobada' } },
    });
    if (!vinculo) return null;
    return prisma.necesidad.findFirst({
        where: { idNecesidad, idInstitucion: vinculo.idInstitucion },
        include: { institucion: { select: { latitud: true, longitud: true } } },
    });
}

// Criterio: parte de una necesidad abierta. Responde el error y devuelve null si no se puede convocar
async function necesidadParaConvocar(req, res) {
    await cerrarVencidas();
    const necesidad = await buscarNecesidadPropia(req.params.idNecesidad, req.usuario.id);
    if (!necesidad) {
        responderError(res, 404, 'NO_ENCONTRADO', 'La necesidad no existe');
        return null;
    }
    if (necesidad.estado !== 'abierta') {
        responderError(res, 409, 'CONFLICTO', `La necesidad ya está ${necesidad.estado}: no se puede convocar`);
        return null;
    }
    return necesidad;
}

// Revisa la lista de donantes elegidos por el hospital. Devuelve el mensaje de error, o null si está bien
function validarIdsDonantes(idsDonantes) {
    if (!Array.isArray(idsDonantes) || idsDonantes.length === 0) return 'idsDonantes debe ser una lista con al menos un donante';
    if (!idsDonantes.every((id) => typeof id === 'string' && UUID_VALIDO.test(id))) return 'idsDonantes tiene ids no válidos';
    if (new Set(idsDonantes).size !== idsDonantes.length) return 'idsDonantes tiene donantes repetidos';
    return null;
}

// ─── Rutas ───────────────────────────────────────────────────────────────────

// 1) POST /api/necesidades/:idNecesidad/convocatoria/propuesta: lista sugerida (NO guarda nada)
//    Body (opcional): { "radioKm": 20 }
//    "sugeridos" son los que entran en el cupo; "otrosCandidatos" los que el hospital puede agregar a mano.
router.post('/:idNecesidad/convocatoria/propuesta', autenticar, autorizar('institucion'), async (req, res) => {
    const radioKm = leerRadio(req.body?.radioKm);
    if (radioKm === null) {
        return datosInvalidos(res, `radioKm debe ser un número mayor a 0 y hasta ${RADIO_MAXIMO_KM}`);
    }

    const necesidad = await necesidadParaConvocar(req, res);
    if (!necesidad) return;

    const cupo = await cupoLibre(necesidad);
    const candidatos = await buscarCandidatos(necesidad, necesidad.institucion, radioKm);

    res.json({
        idNecesidad: necesidad.idNecesidad,
        radioKm,
        cupo,
        sugeridos: candidatos.slice(0, cupo.disponible),
        otrosCandidatos: candidatos.slice(cupo.disponible),
    });
});

// 2) POST /api/necesidades/:idNecesidad/convocatoria: el hospital confirma y se guarda
//    Body: { "radioKm": 20, "idsDonantes": ["<uuid>", ...] }
router.post('/:idNecesidad/convocatoria', autenticar, autorizar('institucion'), async (req, res) => {
    const { idsDonantes } = req.body ?? {};
    const radioKm = leerRadio(req.body?.radioKm);
    if (radioKm === null) {
        return datosInvalidos(res, `radioKm debe ser un número mayor a 0 y hasta ${RADIO_MAXIMO_KM}`);
    }
    const mensajeError = validarIdsDonantes(idsDonantes);
    if (mensajeError) {
        return datosInvalidos(res, mensajeError);
    }

    const necesidad = await necesidadParaConvocar(req, res);
    if (!necesidad) return;

    const cupo = await cupoLibre(necesidad);
    if (idsDonantes.length > cupo.disponible) {
        return responderError(res, 409, 'CONFLICTO', `Hay lugar para ${cupo.disponible} personas y elegiste ${idsDonantes.length}`);
    }

    // Se vuelve a revisar a cada persona: pudo haber pausado sus alertas o dejado de estar habilitada
    // desde que se armó la propuesta. Además evita que se mande cualquier id.
    const candidatos = await buscarCandidatos(necesidad, necesidad.institucion, radioKm);
    const porId = new Map(candidatos.map((c) => [c.idDonante, c]));
    const noValidos = idsDonantes.filter((id) => !porId.has(id));
    if (noValidos.length > 0) {
        return responderError(res, 409, 'CONFLICTO', `${noValidos.length} de las personas elegidas ya no se pueden convocar. Volvé a pedir la propuesta`);
    }

    // Criterio: se guarda la convocatoria con sus criterios (radio y cupo) y quién la confirmó.
    // Convocatoria y alertas van juntas: si falla una, no se guarda nada.
    const convocatoria = await prisma.$transaction(async (tx) => {
        const creada = await tx.convocatoria.create({
            data: {
                idNecesidad: necesidad.idNecesidad,
                radioKm,
                cupoDisponible: cupo.disponible,
                estado: 'enviada', // las alertas quedan "pendiente" hasta que DV-9 las mande
                idUsuarioConfirmador: req.usuario.id,
            },
        });
        await tx.alerta.createMany({
            data: idsDonantes.map((id) => ({
                idConvocatoria: creada.idConvocatoria,
                idDonante: id,
                canal: porId.get(id).canal,
                motivo: porId.get(id).motivo,
                distanciaKm: porId.get(id).distanciaKm,
            })),
        });
        return creada;
    });

    res.status(201).json({
        idConvocatoria: convocatoria.idConvocatoria,
        idNecesidad: convocatoria.idNecesidad,
        radioKm: Number(convocatoria.radioKm),
        cupoDisponible: convocatoria.cupoDisponible,
        estado: convocatoria.estado,
        idUsuarioConfirmador: convocatoria.idUsuarioConfirmador,
        creadaEn: convocatoria.creadaEn,
        alertas: idsDonantes.map((id) => {
            const { nombre, apellido, canal, motivo, distanciaKm } = porId.get(id);
            return { idDonante: id, nombre, apellido, canal, motivo, distanciaKm, estado: 'pendiente' };
        }),
    });
});

module.exports = router;
