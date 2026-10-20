// TAREA-10: agenda de la institución.
// Una franja es un RANGO de atención con capacidad ("martes 8 a 11, 12 lugares"), no un turno a minuto:
// así trabaja en la realidad un servicio de hemoterapia, y alcanza para no convocar más gente de la que se puede atender.
const { Router } = require('express');
const prisma = require('../lib/prisma');
const { autenticar, autorizar } = require('../middlewares/auth');
const { datosInvalidos, esFechaValida, esHoraValida, obtenerFechaHoy } = require('../utils/validaciones');
const { formatearFecha, parsearFecha, formatearHora, parsearHora } = require('../utils/formateadores');

const router = Router();

// Un id mal formado haría fallar a Postgres (columna uuid) con un 500: mejor un 400 claro
const UUID_VALIDO = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Mismo criterio que unidades.routes.js: la institución sale del token, nunca del body
async function buscarInstitucionAprobada(idUsuario) {
  const vinculo = await prisma.usuarioInstitucion.findFirst({
    where: { idUsuario, institucion: { estado: 'aprobada' } },
  });
  return vinculo ? vinculo.idInstitucion : null;
}

// Cómo se devuelve una franja. cupoLibre es calculado: no existe en la base
function mapearFranja(franja) {
  return {
    idFranjaHoraria: franja.idFranjaHoraria,
    fecha: formatearFecha(franja.fecha),
    horaInicio: formatearHora(franja.horaInicio),
    horaFin: formatearHora(franja.horaFin),
    cupoTotal: franja.cupoTotal,
    cupoOcupado: franja.cupoOcupado,
    cupoLibre: franja.cupoTotal - franja.cupoOcupado,
    cerrada: franja.cerrada,
  };
}

// POST /api/franjas: la institución abre una franja de atención
//   Body: { "fecha": "2026-10-27", "horaInicio": "08:00", "horaFin": "11:00", "cupoTotal": 12 }
router.post('/', autenticar, autorizar('institucion'), async (req, res) => {
  const idInstitucion = await buscarInstitucionAprobada(req.usuario.id);
  if (!idInstitucion) {
    return res.status(403).json({
      error: { codigo: 'SIN_PERMISO', mensaje: 'Tu institución no está aprobada para cargar su agenda' },
    });
  }

  const { fecha, horaInicio, horaFin, cupoTotal } = req.body ?? {};

  // esFechaValida y esHoraValida dan true si el valor falta (sirven para campos opcionales):
  // acá son obligatorios, así que primero se chequea que sean texto
  if (typeof fecha !== 'string' || !esFechaValida(fecha)) {
    return datosInvalidos(res, 'fecha es obligatoria, con formato YYYY-MM-DD');
  }
  if (fecha < obtenerFechaHoy()) {
    return datosInvalidos(res, 'No se puede abrir una franja en una fecha pasada');
  }
  if (typeof horaInicio !== 'string' || typeof horaFin !== 'string' || !esHoraValida(horaInicio) || !esHoraValida(horaFin)) {
    return datosInvalidos(res, 'horaInicio y horaFin son obligatorias, con formato HH:MM');
  }
  // "08:00" < "11:00" se puede comparar como texto porque siempre tienen 2 dígitos
  if (horaInicio >= horaFin) {
    return datosInvalidos(res, 'horaInicio tiene que ser anterior a horaFin');
  }
  if (!Number.isInteger(cupoTotal) || cupoTotal < 1 || cupoTotal > 200) {
    return datosInvalidos(res, 'cupoTotal debe ser un número entero entre 1 y 200');
  }

  const franja = await prisma.franjaHoraria.create({
    data: {
      idInstitucion,
      fecha: parsearFecha(fecha),
      horaInicio: parsearHora(horaInicio),
      horaFin: parsearHora(horaFin),
      cupoTotal, // cupoOcupado arranca en 0 y cerrada en false (defaults del schema)
    },
  });

  res.status(201).json(mapearFranja(franja));
});

// GET /api/franjas: la agenda de mi institución, de hoy en adelante, en orden
router.get('/', autenticar, autorizar('institucion'), async (req, res) => {
  const idInstitucion = await buscarInstitucionAprobada(req.usuario.id);
  if (!idInstitucion) {
    return res.status(403).json({
      error: { codigo: 'SIN_PERMISO', mensaje: 'Tu institución no está aprobada para ver su agenda' },
    });
  }

  const franjas = await prisma.franjaHoraria.findMany({
    where: { idInstitucion, fecha: { gte: parsearFecha(obtenerFechaHoy()) } },
    // orderBy con una lista: primero por fecha y, dentro del mismo día, por hora
    orderBy: [{ fecha: 'asc' }, { horaInicio: 'asc' }],
  });

  res.json(franjas.map(mapearFranja));
});

// PATCH /api/franjas/:idFranjaHoraria/cerrar: deja de ofrecer la franja.
// Los turnos ya reservados en ella se mantienen: cerrar no le cancela el turno a nadie
router.patch('/:idFranjaHoraria/cerrar', autenticar, autorizar('institucion'), async (req, res) => {
  const idInstitucion = await buscarInstitucionAprobada(req.usuario.id);
  if (!idInstitucion) {
    return res.status(403).json({
      error: { codigo: 'SIN_PERMISO', mensaje: 'Tu institución no está aprobada para modificar su agenda' },
    });
  }

  const { idFranjaHoraria } = req.params;
  if (!UUID_VALIDO.test(idFranjaHoraria)) {
    return datosInvalidos(res, 'idFranjaHoraria no es un identificador válido');
  }

  // Solo cambia si la franja es mía y estaba abierta (mismo patrón que "usar" una unidad)
  const { count } = await prisma.franjaHoraria.updateMany({
    where: { idFranjaHoraria, idInstitucion, cerrada: false },
    data: { cerrada: true },
  });

  if (count === 0) {
    const franja = await prisma.franjaHoraria.findFirst({ where: { idFranjaHoraria, idInstitucion } });
    if (!franja) {
      return res.status(404).json({ error: { codigo: 'NO_ENCONTRADO', mensaje: 'La franja no existe en tu agenda' } });
    }
    return res.status(409).json({ error: { codigo: 'CONFLICTO', mensaje: 'La franja ya estaba cerrada' } });
  }

  const franja = await prisma.franjaHoraria.findUnique({ where: { idFranjaHoraria } });
  res.json(mapearFranja(franja));
});

module.exports = router;
