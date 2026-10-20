// TAREA-10: el donante reserva un turno en una franja de la institución que lo convocó.
// "Turno" = confirmar que va en ese rango de atención (no una cita a minuto exacto).
const { Router } = require('express');
const { randomBytes } = require('crypto');
const prisma = require('../lib/prisma');
const { autenticar, autorizar } = require('../middlewares/auth');
const { datosInvalidos, esFechaValida, obtenerFechaHoy } = require('../utils/validaciones');
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
    idAlerta: turno.idAlerta, // con la alerta, el front sabe hasta qué fecha puede reprogramar
  };
}

// Busca un turno del donante logueado, con lo necesario para cancelarlo o reprogramarlo.
// Devuelve null si no existe o es de otro donante (se responde 404 en los dos casos)
async function buscarTurnoPropio(idTurno, idUsuario) {
  if (!UUID_VALIDO.test(idTurno ?? '')) return null;
  return prisma.turno.findFirst({
    where: { idTurno, donante: { idUsuario } },
    include: { franjaHoraria: true, alerta: { include: { convocatoria: { include: { necesidad: true } } } } },
  });
}

// Solo se puede cambiar un turno reservado que todavía no pasó. Devuelve el mensaje de error, o null
function motivoParaNoCambiar(turno) {
  if (turno.estado === 'cancelado') return 'Ese turno ya está cancelado';
  if (turno.estado !== 'reservado') return 'Ese turno ya pasó y quedó registrado';
  if (turno.franjaHoraria.fecha < parsearFecha(obtenerFechaHoy())) return 'Ese turno ya pasó';
  return null;
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

// GET /api/turnos?fecha=YYYY-MM-DD: los turnos de un día en mi institución (por defecto, hoy).
// Es la lista con la que el hospital registra quién vino y quién donó (TAREA-11 / DV-11)
router.get('/', autenticar, autorizar('institucion'), async (req, res) => {
  const idInstitucion = await buscarInstitucionAprobada(req.usuario.id);
  if (!idInstitucion) {
    return res.status(403).json({ error: { codigo: 'SIN_PERMISO', mensaje: 'Tu institución no está aprobada' } });
  }

  const fecha = req.query.fecha ?? obtenerFechaHoy();
  if (typeof fecha !== 'string' || !esFechaValida(fecha)) {
    return datosInvalidos(res, 'fecha debe tener formato YYYY-MM-DD');
  }

  const turnos = await prisma.turno.findMany({
    where: {
      estado: { not: 'cancelado' },
      franjaHoraria: { idInstitucion, fecha: parsearFecha(fecha) },
    },
    include: {
      franjaHoraria: true,
      donacion: true,
      donante: { include: { usuario: { select: { nombre: true, apellido: true } } } },
    },
    orderBy: [{ franjaHoraria: { horaInicio: 'asc' } }],
  });

  res.json(turnos.map((turno) => ({
    ...mapearTurno(turno),
    donante: {
      idDonante: turno.donante.idDonante,
      nombre: turno.donante.usuario.nombre,
      apellido: turno.donante.usuario.apellido,
      documento: turno.donante.documento,
      grupoSanguineo: turno.donante.grupoSanguineo, // null si todavía no lo sabe: se confirma al donar
      factorRh: turno.donante.factorRh,
    },
    resultadoDonacion: turno.donacion?.resultado ?? null,
  })));
});

// PATCH /api/turnos/:idTurno: el donante reprograma su turno a otra franja del mismo hospital
//   Body: { "idFranjaHoraria": "<uuid>" }
// Se modifica el mismo turno (no se crea otro): así se respeta "una alerta = un turno"
router.patch('/:idTurno', autenticar, autorizar('donante'), async (req, res) => {
  const turno = await buscarTurnoPropio(req.params.idTurno, req.usuario.id);
  if (!turno) {
    return res.status(404).json({ error: { codigo: 'NO_ENCONTRADO', mensaje: 'No tenés ese turno' } });
  }
  const motivo = motivoParaNoCambiar(turno);
  if (motivo) {
    return res.status(409).json({ error: { codigo: 'CONFLICTO', mensaje: motivo } });
  }

  const { idFranjaHoraria } = req.body ?? {};
  if (!UUID_VALIDO.test(idFranjaHoraria ?? '')) {
    return datosInvalidos(res, 'idFranjaHoraria es obligatorio y tiene que ser un identificador válido');
  }
  if (idFranjaHoraria === turno.idFranjaHoraria) {
    return datosInvalidos(res, 'Ya tenés el turno en esa franja');
  }

  const nueva = await prisma.franjaHoraria.findUnique({ where: { idFranjaHoraria } });
  if (!nueva) {
    return res.status(404).json({ error: { codigo: 'NO_ENCONTRADO', mensaje: 'La franja no existe' } });
  }
  if (nueva.idInstitucion !== turno.franjaHoraria.idInstitucion) {
    return datosInvalidos(res, 'Elegí un horario del mismo hospital');
  }
  const { necesidad } = turno.alerta.convocatoria;
  if (nueva.fecha > necesidad.fechaLimite) {
    return datosInvalidos(res, `La necesidad es hasta el ${formatearFecha(necesidad.fechaLimite)}: elegí una franja anterior`);
  }

  let actualizado;
  try {
    actualizado = await prisma.$transaction(async (tx) => {
      // Ocupa el lugar nuevo solo si queda cupo (mismo control que al reservar)...
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
      // ...y libera el viejo: el lugar vuelve a quedar disponible
      await tx.franjaHoraria.update({
        where: { idFranjaHoraria: turno.idFranjaHoraria },
        data: { cupoOcupado: { decrement: 1 } },
      });
      return tx.turno.update({
        where: { idTurno: turno.idTurno },
        // Cambió el día: el recordatorio se vuelve a mandar el día anterior al nuevo turno
        data: { idFranjaHoraria, recordatorioEnviadoEn: null },
        include: { franjaHoraria: true },
      });
    });
  } catch (err) {
    if (err instanceof ErrorReserva) {
      return res.status(err.status).json({ error: { codigo: err.codigo, mensaje: err.message } });
    }
    throw err;
  }

  res.json(mapearTurno(actualizado));
});

// POST /api/turnos/:idTurno/cancelar: el donante avisa que no va.
// El lugar vuelve a quedar disponible y la alerta pasa a "rechazada" (no se lo penaliza)
router.post('/:idTurno/cancelar', autenticar, autorizar('donante'), async (req, res) => {
  const turno = await buscarTurnoPropio(req.params.idTurno, req.usuario.id);
  if (!turno) {
    return res.status(404).json({ error: { codigo: 'NO_ENCONTRADO', mensaje: 'No tenés ese turno' } });
  }
  const motivo = motivoParaNoCambiar(turno);
  if (motivo) {
    return res.status(409).json({ error: { codigo: 'CONFLICTO', mensaje: motivo } });
  }

  const cancelado = await prisma.$transaction(async (tx) => {
    await tx.franjaHoraria.update({
      where: { idFranjaHoraria: turno.idFranjaHoraria },
      data: { cupoOcupado: { decrement: 1 } },
    });
    await tx.alerta.update({
      where: { idAlerta: turno.idAlerta },
      data: { estado: 'rechazada', respondidaEn: new Date() },
    });
    return tx.turno.update({
      where: { idTurno: turno.idTurno },
      data: { estado: 'cancelado' },
      include: { franjaHoraria: true },
    });
  });

  res.json(mapearTurno(cancelado));
});

module.exports = router;
