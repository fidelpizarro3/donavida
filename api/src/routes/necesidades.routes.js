// TAREA-4: Publicación de una necesidad de sangre
// El hospital carga qué necesita y la necesidad queda abierta hasta que se cubre, se cierra a mano o vence.
const { Router } = require('express');
const prisma = require('../lib/prisma');
const { autenticar, autorizar } = require('../middlewares/auth');
const {
    GRUPOS_VALIDOS,
    FACTORES_VALIDOS,
    esFechaValida,
    esFechaFuturaOPresente,
    obtenerFechaHoy,
    datosInvalidos,
} = require('../utils/validaciones');
const { formatearFecha, parsearFecha } = require('../utils/formateadores');

const router = Router();

const COMPONENTES_VALIDOS = ['sangre_entera', 'globulos_rojos', 'plaquetas'];
const URGENCIAS_VALIDAS = ['urgente', 'normal'];
const ESTADOS_VALIDOS = ['abierta', 'cubierta', 'cerrada_manual', 'vencida'];
const UUID_VALIDO = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;


// ─── Funciones de ayuda ──────────────────────────────────────────────────────

function responderError(res, estado, codigo, mensaje) {
    return res.status(estado).json({ error: { codigo, mensaje } });
}

// Cómo se devuelve una necesidad (contrato GET /api/necesidades en docs/contratos-api.md)
function mapearNecesidad(necesidad) {
    return {
        idNecesidad: necesidad.idNecesidad,
        idInstitucion: necesidad.idInstitucion,
        grupoSanguineo: necesidad.grupoSanguineo,
        factorRh: necesidad.factorRh,
        componente: necesidad.componente,
        unidadesSolicitadas: necesidad.unidadesSolicitadas,
        unidadesCubiertas: necesidad.unidadesCubiertas,
        // Criterio: siempre se ve cuántas faltan. Se calcula, no se guarda en la base
        unidadesFaltantes: necesidad.unidadesSolicitadas - necesidad.unidadesCubiertas,
        urgencia: necesidad.urgencia,
        fechaLimite: formatearFecha(necesidad.fechaLimite),
        estado: necesidad.estado,
        creadaEn: necesidad.creadaEn,
        cerradaEn: necesidad.cerradaEn,
    };
}

// Revisa los datos de una necesidad nueva. Devuelve el mensaje de error, o null si está todo bien
function validarNecesidad(datos) {
    if (!GRUPOS_VALIDOS.includes(datos.grupoSanguineo)) return 'grupoSanguineo debe ser A, B, AB u O';
    if (!FACTORES_VALIDOS.includes(datos.factorRh)) return 'factorRh debe ser positivo o negativo';
    // Criterio: componentes sangre entera, glóbulos rojos o plaquetas
    if (!COMPONENTES_VALIDOS.includes(datos.componente)) return 'componente debe ser sangre_entera, globulos_rojos o plaquetas';
    if (!esCantidadValida(datos.unidadesSolicitadas)) return 'unidadesSolicitadas debe ser un número entero entre 1 y 100';
    if (!URGENCIAS_VALIDAS.includes(datos.urgencia)) return 'urgencia debe ser urgente o normal';
    if (!datos.fechaLimite || !esFechaValida(datos.fechaLimite)) return 'fechaLimite debe tener formato YYYY-MM-DD';
    if (!esFechaFuturaOPresente(datos.fechaLimite)) return 'fechaLimite no puede ser una fecha pasada';
    return null;
}

function esCantidadValida(cantidad) {
    return Number.isInteger(cantidad) && cantidad >= 1 && cantidad <= 100;
}

// Criterio: solo instituciones habilitadas. Devuelve el id de la institución APROBADA del usuario, o null
async function buscarInstitucionHabilitada(idUsuario) {
    const vinculo = await prisma.usuarioInstitucion.findFirst({
        where: { idUsuario, institucion: { estado: 'aprobada' } },
    });
    return vinculo ? vinculo.idInstitucion : null;
}

// Busca una necesidad que sea de la institución del usuario. Devuelve null si no existe o es de otra
async function buscarNecesidadPropia(idNecesidad, idUsuario) {
    if (!UUID_VALIDO.test(idNecesidad)) return null;
    const idInstitucion = await buscarInstitucionHabilitada(idUsuario);
    if (!idInstitucion) return null;
    return prisma.necesidad.findFirst({ where: { idNecesidad, idInstitucion } });
}

// Criterio: al llegar a la fecha límite se cierra sola como "no cubierta" (estado vencida).
// La llama server.js una vez por hora y también las rutas antes de leer, así nunca se ve un estado viejo.
async function cerrarVencidas() {
    const hoy = parsearFecha(obtenerFechaHoy());
    await prisma.necesidad.updateMany({
        where: { estado: 'abierta', fechaLimite: { lt: hoy } },
        data: { estado: 'vencida', cerradaEn: new Date() },
    });
}
// ─── Rutas ───────────────────────────────────────────────────────────────────

// Todas las rutas de este archivo necesitan estar logueado
router.use(autenticar);

// 1) POST /api/necesidades: el hospital publica lo que necesita
router.post('/', autorizar('institucion'), async (req, res) => {
    const datos = req.body ?? {};

    const mensajeError = validarNecesidad(datos);
    if (mensajeError) {
        return datosInvalidos(res, mensajeError);
    }

    const idInstitucion = await buscarInstitucionHabilitada(req.usuario.id);
    if (!idInstitucion) {
        return responderError(res, 403, 'SIN_PERMISO', 'Tu institución no está habilitada para publicar necesidades');
    }

    // Se guardan solo estos campos. El estado arranca en "abierta" (valor por defecto del schema)
    const necesidad = await prisma.necesidad.create({
        data: {
            idInstitucion,
            grupoSanguineo: datos.grupoSanguineo,
            factorRh: datos.factorRh,
            componente: datos.componente,
            unidadesSolicitadas: datos.unidadesSolicitadas,
            urgencia: datos.urgencia,
            fechaLimite: parsearFecha(datos.fechaLimite),
        },
    });

    res.status(201).json(mapearNecesidad(necesidad));
});

// 2) GET /api/necesidades: lista de necesidades (se puede filtrar con ?estado=abierta)
//    Una institución ve solo las suyas; un admin ve todas (o las de ?idInstitucion=)
router.get('/', autorizar('institucion', 'admin'), async (req, res) => {
    const { estado, idInstitucion } = req.query;
    const filtro = {};

    if (estado) {
        if (!ESTADOS_VALIDOS.includes(estado)) {
            return datosInvalidos(res, 'estado debe ser abierta, cubierta, cerrada_manual o vencida');
        }
        filtro.estado = estado;
    }

    if (req.usuario.rol === 'institucion') {
        const idPropia = await buscarInstitucionHabilitada(req.usuario.id);
        if (!idPropia) return res.json([]);
        filtro.idInstitucion = idPropia;
    } else if (idInstitucion) {
        if (!UUID_VALIDO.test(idInstitucion)) {
            return datosInvalidos(res, 'idInstitucion no es válido');
        }
        filtro.idInstitucion = idInstitucion;
    }

    await cerrarVencidas();
    const necesidades = await prisma.necesidad.findMany({ where: filtro, orderBy: { fechaLimite: 'asc' } });
    res.json(necesidades.map(mapearNecesidad));
});

// 3) PATCH /api/necesidades/:idNecesidad: corregir la cantidad pedida
//    Body: { "unidadesSolicitadas": 8 }
router.patch('/:idNecesidad', autorizar('institucion'), async (req, res) => {
    await cerrarVencidas();
    const necesidad = await buscarNecesidadPropia(req.params.idNecesidad, req.usuario.id);

    if (!necesidad) {
        return responderError(res, 404, 'NO_ENCONTRADO', 'La necesidad no existe');
    }
    if (necesidad.estado !== 'abierta') {
        return responderError(res, 409, 'CONFLICTO', `La necesidad ya está ${necesidad.estado}`);
    }

    const { unidadesSolicitadas } = req.body ?? {};
    if (!esCantidadValida(unidadesSolicitadas)) {
        return datosInvalidos(res, 'unidadesSolicitadas debe ser un número entero entre 1 y 100');
    }
    if (unidadesSolicitadas < necesidad.unidadesCubiertas) {
        return responderError(res, 409, 'CONFLICTO', `Ya hay ${necesidad.unidadesCubiertas} unidades cubiertas: no se puede pedir menos`);
    }

    const cambios = { unidadesSolicitadas };
    // Si lo pedido queda igual a lo que ya está cubierto, la necesidad se da por cubierta
    if (unidadesSolicitadas === necesidad.unidadesCubiertas) {
        cambios.estado = 'cubierta';
        cambios.cerradaEn = new Date();
    }

    const actualizada = await prisma.necesidad.update({
        where: { idNecesidad: necesidad.idNecesidad },
        data: cambios,
    });
    res.json(mapearNecesidad(actualizada));
});

// 4) POST /api/necesidades/:idNecesidad/cerrar: el hospital la cierra a mano
router.post('/:idNecesidad/cerrar', autorizar('institucion'), async (req, res) => {
    await cerrarVencidas();
    const necesidad = await buscarNecesidadPropia(req.params.idNecesidad, req.usuario.id);

    if (!necesidad) {
        return responderError(res, 404, 'NO_ENCONTRADO', 'La necesidad no existe');
    }
    if (necesidad.estado !== 'abierta') {
        return responderError(res, 409, 'CONFLICTO', `La necesidad ya está ${necesidad.estado}`);
    }

    const cerrada = await prisma.necesidad.update({
        where: { idNecesidad: necesidad.idNecesidad },
        data: { estado: 'cerrada_manual', cerradaEn: new Date() },
    });
    res.json(mapearNecesidad(cerrada));
});

module.exports = router;
module.exports.cerrarVencidas = cerrarVencidas;
