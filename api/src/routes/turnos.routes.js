// TAREA-10: el donante reserva un turno en una franja de la institución que lo convocó.
// "Turno" = confirmar que va en ese rango de atención (no una cita a minuto exacto).
const { Router } = require('express');
const { randomBytes } = require('crypto');
const prisma = require('../lib/prisma');
const { autenticar, autorizar } = require('../middlewares/auth');
const { datosInvalidos, obtenerFechaHoy } = require('../utils/validaciones');
const { formatearFecha, formatearHora, parsearFecha } = require('../utils/formateadores');
const { obtenerHabilitacion } = require('../services/habilitacion');

const router = Router();

// Un id mal formado haría fallar a Postgres (columna uuid) con un 500: mejor un 400 claro
const UUID_VALIDO = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Lo que va en el QR del carné (TAREA-18): largo y al azar, imposible de adivinar
function generarCodigoQr() {
  return randomBytes(16).toString('hex');
}

// Un error con su código HTTP: se lanza adentro de la transacción para deshacerla y responder bien
class ErrorReserva extends Error {
  constructor(status, codigo, mensaje) {
    super(mensaje);
    this.status = status;
    this.codigo = codigo;
  }
}

// Cómo se devuelve un turno (misma forma que GET /api/turnos/proximo en docs/contratos-api.md)
function mapearTurno(turno) {
  return {
    idTurno: turno.idTurno,
    estado: turno.estado,
    codigoQr: turno.codigoQr,
    fecha: formatearFecha(turno.franjaHoraria.fecha),
    horaInicio: formatearHora(turno.franjaHoraria.horaInicio),
    horaFin: formatearHora(turno.franjaHoraria.horaFin),
    idInstitucion: turno.franjaHoraria.idInstitucion,
  };
}

// Mismo criterio que unidades y franjas: la institución sale del token
async function buscarInstitucionAprobada(idUsuario) {
  const vinculo = await prisma.usuarioInstitucion.findFirst({
    where: { idUsuario, institucion: { estado: 'aprobada' } },
  });
  return vinculo ? vinculo.idInstitucion : null;
}

// GET /api/turnos/proximo: el próximo turno reservado de un donante, o null si no tiene
//   - donante: el suyo (sale del token, no hace falta ?idDonante)
//   - institución: ?idDonante=... (al escanear el carné), y solo ve turnos en su propio hospital
router.get('/proximo', autenticar, autorizar('donante', 'institucion'), async (req, res) => {
  let idDonante;
  let idInstitucion; // solo se usa cuando consulta una institución

  if (req.usuario.rol === 'donante') {
    const donante = await prisma.donante.findUnique({ where: { idUsuario: req.usuario.id } });
    if (!donante) {
      return res.status(404).json({ error: { codigo: 'NO_ENCONTRADO', mensaje: 'Perfil de donante no encontrado' } });
    }
    idDonante = donante.idDonante;
  } else {
    idInstitucion = await buscarInstitucionAprobada(req.usuario.id);
    if (!idInstitucion) {
      return res.status(403).json({ error: { codigo: 'SIN_PERMISO', mensaje: 'Tu institución no está aprobada' } });
    }
    idDonante = req.query.idDonante;
    if (!UUID_VALIDO.test(idDonante ?? '')) {
      return datosInvalidos(res, 'idDonante es obligatorio y tiene que ser un identificador válido');
    }
  }

  const turno = await prisma.turno.findFirst({
    where: {
      idDonante,
      estado: 'reservado',
      // Se puede filtrar por campos de una tabla relacionada: la fecha está en la franja, no en el turno
      franjaHoraria: { fecha: { gte: parsearFecha(obtenerFechaHoy()) }, idInstitucion },
    },
    orderBy: [{ franjaHoraria: { fecha: 'asc' } }, { franjaHoraria: { horaInicio: 'asc' } }],
    include: { franjaHoraria: true },
  });

  res.json(turno ? mapearTurno(turno) : null);
});

// POST /api/turnos: reservar un lugar en una franja, a partir de una alerta aceptada
//   Body: { "idAlerta": "<uuid>", "idFranjaHoraria": "<uuid>" }
router.post('/', autenticar, autorizar('donante'), async (req, res) => {
  const { idAlerta, idFranjaHoraria } = req.body ?? {};
  if (!UUID_VALIDO.test(idAlerta ?? '') || !UUID_VALIDO.test(idFranjaHoraria ?? '')) {
    return datosInvalidos(res, 'idAlerta e idFranjaHoraria son obligatorios y tienen que ser identificadores válidos');
  }

  const donante = await prisma.donante.findUnique({ where: { idUsuario: req.usuario.id } });
  if (!donante) {
    return res.status(404).json({ error: { codigo: 'NO_ENCONTRADO', mensaje: 'Perfil de donante no encontrado' } });
  }

  // 1. La alerta es mía y la acepté: solo reserva quien fue convocado
  const alerta = await prisma.alerta.findUnique({
    where: { idAlerta },
    include: { convocatoria: { include: { necesidad: true } } },
  });
  if (!alerta || alerta.idDonante !== donante.idDonante) {
    return res.status(404).json({ error: { codigo: 'NO_ENCONTRADO', mensaje: 'No tenés esa alerta' } });
  }
  if (alerta.estado !== 'aceptada') {
    return res.status(409).json({ error: { codigo: 'CONFLICTO', mensaje: 'Primero tenés que aceptar la alerta' } });
  }
  const necesidad = alerta.convocatoria.necesidad;
  if (necesidad.estado !== 'abierta') {
    return res.status(409).json({ error: { codigo: 'CONFLICTO', mensaje: 'Esa necesidad ya se cubrió o se cerró: no hace falta que vayas' } });
  }

  // 2. La franja es del hospital que me convocó, y antes de que la necesidad venza
  const franja = await prisma.franjaHoraria.findUnique({ where: { idFranjaHoraria } });
  if (!franja) {
    return res.status(404).json({ error: { codigo: 'NO_ENCONTRADO', mensaje: 'La franja no existe' } });
  }
  if (franja.idInstitucion !== necesidad.idInstitucion) {
    return datosInvalidos(res, 'La franja es de otra institución: elegí un horario del hospital que te convocó');
  }
  if (franja.fecha > necesidad.fechaLimite) {
    return datosInvalidos(res, `La necesidad es hasta el ${formatearFecha(necesidad.fechaLimite)}: elegí una franja anterior`);
  }

  // 3. Habilitado para donar hoy (función de la TAREA-3). Si no, el motivo y desde cuándo, no un "no" seco
  const habilitacion = await obtenerHabilitacion(donante.idDonante);
  if (!habilitacion.habilitado) {
    const reingreso = habilitacion.aptoDesde ? ` Podés volver a donar desde el ${habilitacion.aptoDesde}.` : '';
    return res.status(409).json({
      error: { codigo: 'CONFLICTO', mensaje: `Hoy no estás habilitado para donar: ${habilitacion.motivo}.${reingreso}` },
    });
  }

  // 4. Ocupar el lugar y crear el turno, juntos o ninguno
  let turno;
  try {
    turno = await prisma.$transaction(async (tx) => {
      // Ocupa un lugar SOLO si la franja sigue abierta, no pasó y le queda cupo: chequear y cambiar
      // en una sola operación, para que dos donantes no se queden con el último lugar a la vez
      const { count } = await tx.franjaHoraria.updateMany({
        where: {
          idFranjaHoraria,
          cerrada: false,
          fecha: { gte: parsearFecha(obtenerFechaHoy()) },
          cupoOcupado: { lt: prisma.franjaHoraria.fields.cupoTotal },
        },
        data: { cupoOcupado: { increment: 1 } },
      });
      if (count === 0) {
        throw new ErrorReserva(409, 'CONFLICTO', 'Esa franja se llenó o se cerró: elegí otro horario');
      }

      return tx.turno.create({
        data: { idFranjaHoraria, idDonante: donante.idDonante, idAlerta, estado: 'reservado', codigoQr: generarCodigoQr() },
        include: { franjaHoraria: true },
      });
    });
  } catch (err) {
    if (err instanceof ErrorReserva) {
      return res.status(err.status).json({ error: { codigo: err.codigo, mensaje: err.message } });
    }
    // P2002: la base rechazó un duplicado (una alerta = un turno). La transacción ya liberó el lugar
    if (err.code === 'P2002') {
      return res.status(409).json({ error: { codigo: 'CONFLICTO', mensaje: 'Ya reservaste un turno para esta convocatoria' } });
    }
    throw err;
  }

  res.status(201).json(mapearTurno(turno));
});

module.exports = router;
