// TAREA-5: registrar el ingreso de unidades de sangre.
// TAREA-6: consultar el stock de la institución.
// La ruta revisa permisos y que llegue una sola unidad; la lógica está en services/unidades.js.
const { Router } = require('express');
const prisma = require('../lib/prisma');
const { autenticar, autorizar } = require('../middlewares/auth');
const { datosInvalidos, GRUPOS_VALIDOS, FACTORES_VALIDOS, obtenerFechaHoy } = require('../utils/validaciones');
const { parsearFecha } = require('../utils/formateadores');
const {
  registrarIngresoUnidad,
  mapearUnidad,
  calcularDiasRestantes,
  estaPorVencer,
  mapearMovimiento,
} = require('../services/unidades');

const router = Router();

// Valores del schema (enums EstadoUnidad y Componente): sirven para validar los filtros
// antes de consultar, así un valor inventado da 400 y no un error 500 de Prisma
const ESTADOS_UNIDAD = ['disponible', 'reservada', 'usada', 'vencida', 'descartada'];
const COMPONENTES = ['sangre_entera', 'globulos_rojos', 'plaquetas'];

// Un id mal formado haría fallar a Postgres (columna uuid) con un 500: mejor un 400 claro
const UUID_VALIDO = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

// En qué contador del resumen suma una unidad según su estado
const CONTADOR_POR_ESTADO = {
  disponible: 'disponibles',
  reservada: 'reservadas',
  usada: 'usadas',
  vencida: 'vencidas',
  descartada: 'descartadas',
};

// GET /api/unidades/resumen: totales de mi stock por grupo, factor y componente,
// comparados con el stock mínimo que haya definido la institución
router.get('/resumen', autenticar, autorizar('institucion'), async (req, res) => {
  const idInstitucion = await buscarInstitucionAprobada(req.usuario.id);
  if (!idInstitucion) {
    return res.status(403).json({
      error: { codigo: 'SIN_PERMISO', mensaje: 'Tu institución no está aprobada para consultar stock' },
    });
  }

  // Las dos consultas no dependen una de la otra: se hacen a la vez
  const [unidades, minimos] = await Promise.all([
    prisma.unidadSangre.findMany({ where: { idInstitucion } }),
    prisma.stockMinimo.findMany({ where: { idInstitucion } }),
  ]);

  // Una fila por combinación "O|negativo|plaquetas". El Map la crea la primera vez que aparece
  const filas = new Map();
  function filaDe(grupoSanguineo, factorRh, componente) {
    const clave = `${grupoSanguineo}|${factorRh}|${componente}`;
    if (!filas.has(clave)) {
      filas.set(clave, {
        grupoSanguineo, factorRh, componente,
        disponibles: 0, porVencer: 0, reservadas: 0, usadas: 0, vencidas: 0, descartadas: 0,
        minimo: null,
      });
    }
    return filas.get(clave);
  }

  const hoy = obtenerFechaHoy();
  for (const unidad of unidades) {
    const u = mapearUnidadConVencimiento(unidad, hoy);
    // Hasta que corra el descarte automático (TAREA-7), una vencida puede seguir "disponible"
    // en la base: para el resumen ya no sirve, así que se cuenta como vencida
    const estado = u.estado === 'disponible' && u.diasRestantes < 0 ? 'vencida' : u.estado;
    const fila = filaDe(u.grupoSanguineo, u.factorRh, u.componente);
    fila[CONTADOR_POR_ESTADO[estado]] += 1;
    if (u.porVencer) fila.porVencer += 1;
  }

  // El mínimo aparece aunque no haya ninguna unidad de ese grupo: justo ahí es cuando más falta
  for (const minimo of minimos) {
    filaDe(minimo.grupoSanguineo, minimo.factorRh, minimo.componente).minimo = minimo.unidadesMinimas;
  }

  const resumen = [...filas.values()]
    .map((fila) => ({ ...fila, bajoMinimo: fila.minimo !== null && fila.disponibles < fila.minimo }))
    .sort((a, b) =>
      `${a.grupoSanguineo}${a.factorRh}${a.componente}`.localeCompare(`${b.grupoSanguineo}${b.factorRh}${b.componente}`)
    );

  res.json(resumen);
});

// GET /api/unidades/:idUnidadSangre: el detalle de una unidad de mi institución y todo su recorrido:
// cuándo ingresó y de dónde vino (idDonacion; null si se cargó a mano), y qué pasó con ella (movimientos).
// Va DESPUÉS de /resumen: si estuviera antes, Express tomaría "resumen" como un idUnidadSangre.
router.get('/:idUnidadSangre', autenticar, autorizar('institucion'), async (req, res) => {
  const idInstitucion = await buscarInstitucionAprobada(req.usuario.id);
  if (!idInstitucion) {
    return res.status(403).json({
      error: { codigo: 'SIN_PERMISO', mensaje: 'Tu institución no está aprobada para consultar stock' },
    });
  }

  const { idUnidadSangre } = req.params;
  if (!UUID_VALIDO.test(idUnidadSangre)) {
    return datosInvalidos(res, 'idUnidadSangre no es un identificador válido');
  }

  // Solo si es de mi institución: la de otra da 404, sin revelar que existe
  const unidad = await prisma.unidadSangre.findFirst({
    where: { idUnidadSangre, idInstitucion },
    include: {
      movimientos: {
        orderBy: { ocurridoEn: 'asc' }, // del primero (el ingreso) al último
        include: {
          institucionOrigen: { select: { idInstitucion: true, nombre: true } },
          institucionDestino: { select: { idInstitucion: true, nombre: true } },
          usuario: { select: { nombre: true, apellido: true } },
        },
      },
    },
  });
  if (!unidad) {
    return res.status(404).json({ error: { codigo: 'NO_ENCONTRADO', mensaje: 'La unidad no existe en tu institución' } });
  }

  res.json({
    ...mapearUnidadConVencimiento(unidad, obtenerFechaHoy()),
    movimientos: unidad.movimientos.map(mapearMovimiento),
  });
});

// PUT /api/unidades/stock-minimo: la institución fija su mínimo de seguridad para un grupo y componente.
// Si ya había uno, se reemplaza (por eso PUT y upsert: mandar lo mismo dos veces deja todo igual)
//   Body: { "grupoSanguineo": "O", "factorRh": "negativo", "componente": "plaquetas", "unidadesMinimas": 4 }
router.put('/stock-minimo', autenticar, autorizar('institucion'), async (req, res) => {
  const idInstitucion = await buscarInstitucionAprobada(req.usuario.id);
  if (!idInstitucion) {
    return res.status(403).json({
      error: { codigo: 'SIN_PERMISO', mensaje: 'Tu institución no está aprobada para definir stock mínimo' },
    });
  }

  const { grupoSanguineo, factorRh, componente, unidadesMinimas } = req.body ?? {};
  if (!GRUPOS_VALIDOS.includes(grupoSanguineo)) {
    return datosInvalidos(res, `grupoSanguineo debe ser uno de: ${GRUPOS_VALIDOS.join(', ')}`);
  }
  if (!FACTORES_VALIDOS.includes(factorRh)) {
    return datosInvalidos(res, `factorRh debe ser uno de: ${FACTORES_VALIDOS.join(', ')}`);
  }
  if (!COMPONENTES.includes(componente)) {
    return datosInvalidos(res, `componente debe ser uno de: ${COMPONENTES.join(', ')}`);
  }
  // Un número entero, sin decimales ni negativos (0 = sin mínimo para ese grupo)
  if (!Number.isInteger(unidadesMinimas) || unidadesMinimas < 0 || unidadesMinimas > 1000) {
    return datosInvalidos(res, 'unidadesMinimas debe ser un número entero entre 0 y 1000');
  }

  // La clave compuesta de stock_minimo son estos 4 campos: Prisma les arma un nombre combinado
  const clave = { idInstitucion, grupoSanguineo, factorRh, componente };
  const minimo = await prisma.stockMinimo.upsert({
    where: { idInstitucion_grupoSanguineo_factorRh_componente: clave },
    create: { ...clave, unidadesMinimas }, // si no existía: se crea
    update: { unidadesMinimas }, // si ya existía: solo cambia el número
  });

  res.json({
    grupoSanguineo: minimo.grupoSanguineo,
    factorRh: minimo.factorRh,
    componente: minimo.componente,
    unidadesMinimas: minimo.unidadesMinimas,
  });
});

// PATCH /api/unidades/:idUnidadSangre/usar: la institución usa una unidad y sale del stock disponible
router.patch('/:idUnidadSangre/usar', autenticar, autorizar('institucion'), async (req, res) => {
  const idInstitucion = await buscarInstitucionAprobada(req.usuario.id);
  if (!idInstitucion) {
    return res.status(403).json({
      error: { codigo: 'SIN_PERMISO', mensaje: 'Tu institución no está aprobada para usar unidades' },
    });
  }

  const { idUnidadSangre } = req.params;
  if (!UUID_VALIDO.test(idUnidadSangre)) {
    return datosInvalidos(res, 'idUnidadSangre no es un identificador válido');
  }

  const hoy = obtenerFechaHoy();
  const seUso = await prisma.$transaction(async (tx) => {
    // Chequear y cambiar en UNA sola operación: solo cambia si la unidad es mía, está disponible
    // y no venció. Si dos personas la usan a la vez, la segunda encuentra 0 filas y no la usa de nuevo
    const { count } = await tx.unidadSangre.updateMany({
      where: { idUnidadSangre, idInstitucion, estado: 'disponible', fechaVencimiento: { gte: parsearFecha(hoy) } },
      data: { estado: 'usada' },
    });
    if (count === 0) return false;

    await tx.movimientoUnidad.create({
      data: {
        idUnidadSangre,
        tipo: 'uso',
        estadoAnterior: 'disponible',
        estadoNuevo: 'usada',
        idInstitucionOrigen: idInstitucion, // sale de esta institución
        idUsuario: req.usuario.id,
      },
    });
    return true;
  });

  if (!seUso) {
    // No se pudo: averiguamos por qué para responder el error que corresponde
    const unidad = await prisma.unidadSangre.findFirst({ where: { idUnidadSangre, idInstitucion } });
    if (!unidad) {
      return res.status(404).json({ error: { codigo: 'NO_ENCONTRADO', mensaje: 'La unidad no existe en tu institución' } });
    }
    const motivo = unidad.estado === 'disponible' ? 'está vencida' : `está ${unidad.estado}`;
    return res.status(409).json({ error: { codigo: 'CONFLICTO', mensaje: `La unidad no se puede usar: ${motivo}` } });
  }

  const unidad = await prisma.unidadSangre.findUnique({ where: { idUnidadSangre } });
  res.json(mapearUnidadConVencimiento(unidad, hoy));
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
