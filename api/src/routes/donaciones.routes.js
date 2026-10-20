// TAREA-11 de la planilla de Fidel (DV-11): registro de la donación e historial del donante.
// El día del turno el hospital marca qué pasó. Con eso, sin que el donante haga nada:
//   - la unidad entra al stock (función de DV-5, no se escribe directo en unidad_sangre)
//   - arranca el nuevo período de espera de 56 días (función de DV-3)
//   - si no sabía su grupo, queda completado
//   - su historial se actualiza
const { Router } = require('express');
const prisma = require('../lib/prisma');
const { autenticar, autorizar } = require('../middlewares/auth');
const { datosInvalidos, obtenerFechaHoy, GRUPOS_VALIDOS, FACTORES_VALIDOS } = require('../utils/validaciones');
const { formatearFecha } = require('../utils/formateadores');
const { registrarIngresoUnidad } = require('../services/unidades');
const { registrarDonacion, obtenerHabilitacion } = require('../services/habilitacion');

const router = Router();

const UUID_VALIDO = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Lo que puede pasar el día del turno: donó / lo rechazó el control médico / no se presentó
const RESULTADOS = ['realizada', 'rechazada', 'ausente'];
// Lo que se obtiene de la donación y entra al stock (los que tienen vencimiento definido en DV-5)
const COMPONENTES = ['globulos_rojos', 'plaquetas'];

// Un error con su código HTTP: se lanza adentro de la transacción para deshacerla y responder bien
class ErrorDonacion extends Error {
  constructor(status, codigo, mensaje) {
    super(mensaje);
    this.status = status;
    this.codigo = codigo;
  }
}

function responderError(res, estado, codigo, mensaje) {
  return res.status(estado).json({ error: { codigo, mensaje } });
}

async function buscarInstitucionAprobada(idUsuario) {
  const vinculo = await prisma.usuarioInstitucion.findFirst({
    where: { idUsuario, institucion: { estado: 'aprobada' } },
  });
  return vinculo ? vinculo.idInstitucion : null;
}

// Revisa el body. Devuelve el mensaje de error, o null si está bien
function validarRegistro({ idTurno, resultado, grupoSanguineo, factorRh, componente }) {
  if (!UUID_VALIDO.test(idTurno ?? '')) return 'idTurno es obligatorio y tiene que ser un identificador válido';
  if (!RESULTADOS.includes(resultado)) return 'resultado debe ser realizada, rechazada o ausente';
  if (componente !== undefined && !COMPONENTES.includes(componente)) return 'componente debe ser globulos_rojos o plaquetas';
  if (Boolean(grupoSanguineo) !== Boolean(factorRh)) return 'grupoSanguineo y factorRh van juntos';
  if (grupoSanguineo && !GRUPOS_VALIDOS.includes(grupoSanguineo)) return 'grupoSanguineo debe ser A, B, AB u O';
  if (factorRh && !FACTORES_VALIDOS.includes(factorRh)) return 'factorRh debe ser positivo o negativo';
  return null;
}

// ─── Rutas ───────────────────────────────────────────────────────────────────

// POST /api/donaciones: el hospital registra qué pasó con un turno
//   Body: { "idTurno": "<uuid>", "resultado": "realizada" | "rechazada" | "ausente",
//           "grupoSanguineo": "O", "factorRh": "negativo",   ← obligatorio si el donante no lo tenía cargado
//           "componente": "globulos_rojos" }                  ← opcional, por defecto glóbulos rojos
router.post('/', autenticar, autorizar('institucion'), async (req, res) => {
  const datos = req.body ?? {};
  const mensajeError = validarRegistro(datos);
  if (mensajeError) return datosInvalidos(res, mensajeError);

  const idInstitucion = await buscarInstitucionAprobada(req.usuario.id);
  if (!idInstitucion) {
    return responderError(res, 403, 'SIN_PERMISO', 'Tu institución no está aprobada');
  }

  // El turno tiene que ser de MI institución y seguir reservado (no se registra dos veces)
  const turno = await prisma.turno.findFirst({
    where: { idTurno: datos.idTurno, franjaHoraria: { idInstitucion } },
    include: { franjaHoraria: true, donante: true, alerta: { include: { convocatoria: true } } },
  });
  if (!turno) return responderError(res, 404, 'NO_ENCONTRADO', 'El turno no existe en tu agenda');
  if (turno.estado !== 'reservado') {
    const yaPaso = turno.estado === 'cancelado' ? 'El donante canceló ese turno' : 'Ese turno ya fue registrado';
    return responderError(res, 409, 'CONFLICTO', yaPaso);
  }
  const fecha = formatearFecha(turno.franjaHoraria.fecha);
  if (fecha > obtenerFechaHoy()) {
    return responderError(res, 409, 'CONFLICTO', `El turno es el ${fecha}: se registra ese día`);
  }

  // Criterio: si no se presenta, queda registrado sin penalizarlo (no hay donación ni diferimiento)
  if (datos.resultado === 'ausente') {
    await prisma.turno.update({ where: { idTurno: turno.idTurno }, data: { estado: 'ausente' } });
    return res.status(201).json({ idTurno: turno.idTurno, estadoTurno: 'ausente', donacion: null, unidad: null });
  }

  // Criterio: si el grupo no estaba cargado, se completa acá
  const grupoSanguineo = datos.grupoSanguineo || turno.donante.grupoSanguineo;
  const factorRh = datos.factorRh || turno.donante.factorRh;
  if (datos.resultado === 'realizada' && (!grupoSanguineo || !factorRh)) {
    return datosInvalidos(res, 'El donante no tenía el grupo cargado: indicá grupoSanguineo y factorRh');
  }

  let resultado;
  try {
    resultado = await prisma.$transaction(async (tx) => {
      const donacion = await tx.donacion.create({
        data: {
          idTurno: turno.idTurno,
          idDonante: turno.idDonante,
          idInstitucion,
          fecha: turno.franjaHoraria.fecha,
          resultado: datos.resultado,
          grupoConfirmado: grupoSanguineo ?? null,
          factorRhConfirmado: factorRh ?? null,
        },
      });
      await tx.turno.update({ where: { idTurno: turno.idTurno }, data: { estado: 'asistio' } });

      // Criterio: si la rechaza el control médico, no genera unidad
      if (datos.resultado === 'rechazada') return { donacion, unidad: null };

      // Criterio: crea la unidad con la función de DV-5 (dentro de esta misma transacción)
      const { unidad, error } = await registrarIngresoUnidad({
        idInstitucion,
        idDonacion: donacion.idDonacion,
        idUsuario: req.usuario.id,
        grupoSanguineo,
        factorRh,
        componente: datos.componente ?? 'globulos_rojos',
        fechaExtraccion: fecha,
      }, tx);
      if (error) throw new ErrorDonacion(400, 'DATOS_INVALIDOS', error);

      // La unidad cubre una de las que pidió la necesidad que originó la convocatoria (DV-4).
      // Si con esta se completa, la necesidad queda cubierta
      const necesidad = await tx.necesidad.findUnique({ where: { idNecesidad: turno.alerta.convocatoria.idNecesidad } });
      if (necesidad.estado === 'abierta') {
        const cubiertas = necesidad.unidadesCubiertas + 1;
        const completa = cubiertas >= necesidad.unidadesSolicitadas;
        await tx.necesidad.update({
          where: { idNecesidad: necesidad.idNecesidad },
          data: { unidadesCubiertas: cubiertas, ...(completa && { estado: 'cubierta', cerradaEn: new Date() }) },
        });
      }
      return { donacion, unidad };
    });
  } catch (err) {
    if (err instanceof ErrorDonacion) return responderError(res, err.status, err.codigo, err.message);
    throw err;
  }

  // Criterio: arranca el nuevo período de espera (lo lee DV-3) y se completa el grupo si no estaba.
  // Va después de la transacción porque la función de DV-3 abre la suya
  let habilitacion = null;
  if (datos.resultado === 'realizada') {
    habilitacion = await registrarDonacion(turno.idDonante, { fecha, grupoSanguineo, factorRh });
  }

  const { donacion, unidad } = resultado;
  res.status(201).json({
    idTurno: turno.idTurno,
    estadoTurno: 'asistio',
    donacion: { idDonacion: donacion.idDonacion, fecha, resultado: donacion.resultado },
    unidad: unidad && {
      codigo: unidad.codigo,
      componente: unidad.componente,
      fechaVencimiento: formatearFecha(unidad.fechaVencimiento),
    },
    aptoDesde: habilitacion?.aptoDesde ?? null,
  });
});

// GET /api/donaciones/mias: el historial del donante (dónde donó, cuándo y desde qué fecha puede volver)
router.get('/mias', autenticar, autorizar('donante'), async (req, res) => {
  const donante = await prisma.donante.findUnique({ where: { idUsuario: req.usuario.id } });
  if (!donante) return responderError(res, 404, 'NO_ENCONTRADO', 'Perfil de donante no encontrado');

  const [donaciones, habilitacion] = await Promise.all([
    prisma.donacion.findMany({
      where: { idDonante: donante.idDonante },
      include: { institucion: { select: { nombre: true, direccion: true } } },
      orderBy: { fecha: 'desc' },
    }),
    obtenerHabilitacion(donante.idDonante),
  ]);

  res.json({
    habilitado: habilitacion.habilitado,
    aptoDesde: habilitacion.aptoDesde,
    motivo: habilitacion.motivo,
    totalDonaciones: donaciones.filter((d) => d.resultado === 'realizada').length,
    donaciones: donaciones.map((d) => ({
      idDonacion: d.idDonacion,
      fecha: formatearFecha(d.fecha),
      resultado: d.resultado,
      institucion: d.institucion,
    })),
  });
});

module.exports = router;
