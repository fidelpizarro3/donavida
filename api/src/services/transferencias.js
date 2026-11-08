// TAREA-12 (DV-13): transferencia de unidades entre instituciones.
//
// Recorrido de una transferencia:
//   pendiente ──aceptar──► aceptada ──recibir──► recibida
//       ├──rechazar (con motivo)──► rechazada
//       └──vence el plazo──► expirada
//
// Las unidades se reservan recién cuando la institución que presta acepta, y pasan a la que pidió
// cuando esta confirma la recepción. Mientras la transferencia está en curso (pendiente o aceptada),
// cada unidad tiene su transferencia_item con activo = true: la base no deja que la misma unidad esté
// en dos transferencias en curso (índice único parcial, CORRECCIÓN 3 del schema).
const prisma = require('../lib/prisma');
const { obtenerFechaHoyArgentina } = require('../utils/validaciones');
const { formatearFecha, parsearFecha } = require('../utils/formateadores');
const { gruposCompatibles } = require('./compatibilidad');
const { distanciaKm } = require('./distancia');
const { calcularDiasRestantes, marcarVencidas } = require('./unidades');
const { sumarCobertura } = require('./cierreNecesidad');

// Cuánto tiene la institución que presta para contestar
const PLAZO_RESPUESTA_HORAS = 24;
const MAX_UNIDADES = 50;
const UNA_HORA = 60 * 60 * 1000;

// Un error que la ruta responde tal cual (status + código + mensaje)
class ErrorTransferencia extends Error {
  constructor(status, codigo, mensaje) {
    super(mensaje);
    this.status = status;
    this.codigo = codigo;
  }
}

// Lo que hace falta para mostrar una transferencia (historial)
const INCLUIR = {
  institucionSolicitante: { select: { idInstitucion: true, nombre: true } },
  institucionProveedora: { select: { idInstitucion: true, nombre: true } },
  necesidad: {
    select: {
      idNecesidad: true, grupoSanguineo: true, factorRh: true, componente: true,
      unidadesSolicitadas: true, unidadesCubiertas: true, estado: true,
    },
  },
  items: {
    include: {
      unidad: {
        select: {
          idUnidadSangre: true, codigo: true, grupoSanguineo: true, factorRh: true,
          componente: true, fechaVencimiento: true, estado: true,
        },
      },
    },
  },
};

// Cómo se devuelve una transferencia, vista desde una institución:
// "enviada" si la pidió ella, "recibida" si se la pidieron
function mapearTransferencia(transferencia, idInstitucion) {
  return {
    idTransferencia: transferencia.idTransferencia,
    estado: transferencia.estado,
    direccion: transferencia.idInstitucionSolicitante === idInstitucion ? 'enviada' : 'recibida',
    institucionSolicitante: transferencia.institucionSolicitante,
    institucionProveedora: transferencia.institucionProveedora,
    necesidad: transferencia.necesidad ?? null, // null si se pidió a mano, sin necesidad publicada
    unidades: transferencia.items
      .map(({ unidad }) => ({ ...unidad, fechaVencimiento: formatearFecha(unidad.fechaVencimiento) }))
      .sort((a, b) => a.fechaVencimiento.localeCompare(b.fechaVencimiento)),
    motivoRechazo: transferencia.motivoRechazo,
    plazoRespuesta: transferencia.plazoRespuesta,
    creadaEn: transferencia.creadaEn,
    recibidaEn: transferencia.recibidaEn,
  };
}

async function obtenerTransferencia(idTransferencia, idInstitucion) {
  const transferencia = await prisma.transferencia.findUnique({ where: { idTransferencia }, include: INCLUIR });
  return mapearTransferencia(transferencia, idInstitucion);
}

// Cuando un cambio de estado no se pudo hacer, averigua por qué para responder el error que corresponde.
// rol: quién puede hacer la acción ('proveedora' o 'solicitante').
async function explicarFallo(db, idTransferencia, idInstitucion, rol, accion) {
  const transferencia = await db.transferencia.findUnique({ where: { idTransferencia } });
  const esSolicitante = transferencia?.idInstitucionSolicitante === idInstitucion;
  const esProveedora = transferencia?.idInstitucionProveedora === idInstitucion;
  // Si no participa, ni siquiera se le dice que existe
  if (!transferencia || (!esSolicitante && !esProveedora)) {
    return new ErrorTransferencia(404, 'NO_ENCONTRADO', 'La transferencia no existe');
  }
  if (rol === 'proveedora' && !esProveedora) {
    return new ErrorTransferencia(403, 'SIN_PERMISO', `Solo la institución que presta puede ${accion} la transferencia`);
  }
  if (rol === 'solicitante' && !esSolicitante) {
    return new ErrorTransferencia(403, 'SIN_PERMISO', `Solo la institución que pidió puede ${accion} la transferencia`);
  }
  if (transferencia.estado === 'pendiente' && transferencia.plazoRespuesta < new Date()) {
    return new ErrorTransferencia(409, 'CONFLICTO', 'Venció el plazo para responder: la transferencia expiró');
  }
  return new ErrorTransferencia(409, 'CONFLICTO', `No se puede ${accion} la transferencia: está ${transferencia.estado}`);
}

// Criterio: si la institución que presta no contesta dentro del plazo, la propuesta cae.
// Pasa a "expirada" las pendientes con el plazo vencido y sus unidades dejan de estar en curso: vuelven a
// contar como faltantes en la necesidad, y el hospital que pidió convoca donantes por ellas.
// Las unidades no se tocan: mientras está pendiente nunca se reservan. Devuelve cuántas expiraron.
async function vencerTransferencias(ahora = new Date()) {
  return prisma.$transaction(async (tx) => {
    // El cambio y la lista de las que cambiaron salen de una sola operación: nada expira dos veces
    const vencidas = await tx.transferencia.updateManyAndReturn({
      where: { estado: 'pendiente', plazoRespuesta: { lt: ahora } },
      data: { estado: 'expirada' },
      select: { idTransferencia: true },
    });
    if (vencidas.length > 0) {
      await tx.transferenciaItem.updateMany({
        where: { idTransferencia: { in: vencidas.map((t) => t.idTransferencia) } },
        data: { activo: false },
      });
    }
    return vencidas.length;
  });
}

// La tarea automática: corre al arrancar y después una vez por hora (la llama server.js).
// En los tests no corre (Jest pone NODE_ENV=test). Devuelve el intervalo, o null si no se programó.
function programarVencimientoTransferencias() {
  if (process.env.NODE_ENV === 'test') return null;
  const correr = () =>
    vencerTransferencias()
      .then((cantidad) => {
        if (cantidad > 0) console.log(`Plazo de respuesta vencido: ${cantidad} ${cantidad === 1 ? 'transferencia pasó' : 'transferencias pasaron'} a expirada`);
      })
      .catch(console.error);
  correr();
  return setInterval(correr, UNA_HORA);
}

// Revisa que la necesidad sea de quien pide, siga abierta y que las unidades le sirvan
async function validarNecesidad(idNecesidad, idInstitucionSolicitante, unidades, hoy) {
  const necesidad = await prisma.necesidad.findUnique({ where: { idNecesidad } });
  if (!necesidad || necesidad.idInstitucion !== idInstitucionSolicitante) {
    throw new ErrorTransferencia(404, 'NO_ENCONTRADO', 'La necesidad no existe');
  }
  if (necesidad.estado !== 'abierta') {
    throw new ErrorTransferencia(409, 'CONFLICTO', `La necesidad ya está ${necesidad.estado}: no se le pueden pedir unidades`);
  }
  if (formatearFecha(necesidad.fechaLimite) < hoy) {
    throw new ErrorTransferencia(409, 'CONFLICTO', 'La necesidad ya pasó su fecha límite');
  }

  const compatibles = gruposCompatibles(necesidad);
  for (const unidad of unidades) {
    const sirve = unidad.componente === necesidad.componente &&
      compatibles.some((g) => g.grupoSanguineo === unidad.grupoSanguineo && g.factorRh === unidad.factorRh);
    if (!sirve) {
      throw new ErrorTransferencia(400, 'DATOS_INVALIDOS', `La unidad ${unidad.codigo} no sirve para esta necesidad`);
    }
  }

  // No se pide más de lo que falta: lo que ya viene en otra transferencia en curso no falta
  const enCamino = await prisma.transferenciaItem.count({ where: { activo: true, transferencia: { idNecesidad } } });
  const faltan = necesidad.unidadesSolicitadas - necesidad.unidadesCubiertas - enCamino;
  if (unidades.length > faltan) {
    const mensaje = faltan <= 0
      ? 'A esta necesidad ya no le faltan unidades: están cubiertas o en camino'
      : `A esta necesidad le ${faltan === 1 ? 'falta 1 unidad' : `faltan ${faltan} unidades`}: no se pueden pedir ${unidades.length}`;
    throw new ErrorTransferencia(409, 'CONFLICTO', mensaje);
  }
}

// POST /api/transferencias: la institución que pide (solicitante) le pide unidades a otra (proveedora).
// Criterio: se puede iniciar a mano, sin necesidad publicada (idNecesidad vacío).
async function pedirTransferencia({ idInstitucionSolicitante, idInstitucionProveedora, idsUnidadSangre, idNecesidad = null }) {
  if (idInstitucionProveedora === idInstitucionSolicitante) {
    throw new ErrorTransferencia(400, 'DATOS_INVALIDOS', 'No podés pedirle unidades a tu propia institución');
  }
  const proveedora = await prisma.institucion.findUnique({ where: { idInstitucion: idInstitucionProveedora } });
  if (!proveedora || proveedora.estado !== 'aprobada') {
    throw new ErrorTransferencia(404, 'NO_ENCONTRADO', 'La institución a la que le pedís no existe o no está aprobada');
  }

  const unidades = await prisma.unidadSangre.findMany({ where: { idUnidadSangre: { in: idsUnidadSangre } } });
  if (unidades.length !== idsUnidadSangre.length || unidades.some((u) => u.idInstitucion !== idInstitucionProveedora)) {
    throw new ErrorTransferencia(404, 'NO_ENCONTRADO', 'Alguna de las unidades no existe o no es de esa institución');
  }
  const hoy = obtenerFechaHoyArgentina();
  for (const unidad of unidades) {
    // Criterio: una unidad vencida no se puede transferir (DV-7), aunque la tarea automática todavía no la haya marcado
    if (unidad.estado === 'vencida' || formatearFecha(unidad.fechaVencimiento) < hoy) {
      throw new ErrorTransferencia(409, 'CONFLICTO', `La unidad ${unidad.codigo} está vencida: no se puede transferir`);
    }
    if (unidad.estado !== 'disponible') {
      throw new ErrorTransferencia(409, 'CONFLICTO', `La unidad ${unidad.codigo} no está disponible (está ${unidad.estado})`);
    }
  }
  const yaPedidas = await prisma.transferenciaItem.findMany({
    where: { activo: true, idUnidadSangre: { in: idsUnidadSangre } },
    include: { unidad: { select: { codigo: true } } },
  });
  if (yaPedidas.length > 0) {
    throw new ErrorTransferencia(409, 'CONFLICTO', `La unidad ${yaPedidas[0].unidad.codigo} ya está pedida en otra transferencia en curso`);
  }

  if (idNecesidad) await validarNecesidad(idNecesidad, idInstitucionSolicitante, unidades, hoy);

  try {
    const creada = await prisma.$transaction(async (tx) => {
      const transferencia = await tx.transferencia.create({
        data: {
          idInstitucionSolicitante,
          idInstitucionProveedora,
          idNecesidad,
          estado: 'pendiente',
          plazoRespuesta: new Date(Date.now() + PLAZO_RESPUESTA_HORAS * UNA_HORA),
        },
      });
      await tx.transferenciaItem.createMany({
        data: idsUnidadSangre.map((idUnidadSangre) => ({ idTransferencia: transferencia.idTransferencia, idUnidadSangre })),
      });
      return transferencia;
    });
    return obtenerTransferencia(creada.idTransferencia, idInstitucionSolicitante);
  } catch (err) {
    // Dos pedidos de la misma unidad al mismo tiempo: el índice único parcial deja pasar uno solo
    if (err.code === 'P2002') {
      throw new ErrorTransferencia(409, 'CONFLICTO', 'Alguna de las unidades ya está pedida en otra transferencia en curso');
    }
    throw err;
  }
}

// POST /api/transferencias/:id/aceptar: la institución que presta acepta.
// Criterio: mientras está en curso, las unidades no pueden asignarse a otra necesidad: pasan a "reservada",
// todas juntas en una sola operación. Si alguna ya no está disponible (se usó o venció), no se reserva ninguna.
async function aceptarTransferencia({ idTransferencia, idInstitucion, idUsuario }) {
  await vencerTransferencias();
  const hoy = parsearFecha(obtenerFechaHoyArgentina());

  await prisma.$transaction(async (tx) => {
    const { count } = await tx.transferencia.updateMany({
      where: { idTransferencia, idInstitucionProveedora: idInstitucion, estado: 'pendiente', plazoRespuesta: { gte: new Date() } },
      data: { estado: 'aceptada' },
    });
    if (count === 0) throw await explicarFallo(tx, idTransferencia, idInstitucion, 'proveedora', 'aceptar');

    const transferencia = await tx.transferencia.findUnique({ where: { idTransferencia }, include: { items: true } });
    const ids = transferencia.items.map((item) => item.idUnidadSangre);
    const { count: reservadas } = await tx.unidadSangre.updateMany({
      where: { idUnidadSangre: { in: ids }, idInstitucion, estado: 'disponible', fechaVencimiento: { gte: hoy } },
      data: { estado: 'reservada' },
    });
    if (reservadas !== ids.length) {
      // Se deshace todo, también el "aceptada"
      throw new ErrorTransferencia(409, 'CONFLICTO', 'Alguna de las unidades ya no está disponible (se usó o venció): rechazá la transferencia');
    }
    await tx.movimientoUnidad.createMany({
      data: ids.map((idUnidadSangre) => ({
        idUnidadSangre,
        tipo: 'reserva',
        estadoAnterior: 'disponible',
        estadoNuevo: 'reservada',
        idInstitucionOrigen: idInstitucion,
        idInstitucionDestino: transferencia.idInstitucionSolicitante,
        idUsuario,
      })),
    });
  });

  return obtenerTransferencia(idTransferencia, idInstitucion);
}

// POST /api/transferencias/:id/rechazar: la institución que presta rechaza, con un motivo (criterio).
// Las unidades nunca se reservaron (eso pasa al aceptar), así que no cambian.
async function rechazarTransferencia({ idTransferencia, idInstitucion, motivoRechazo }) {
  await vencerTransferencias();

  await prisma.$transaction(async (tx) => {
    const { count } = await tx.transferencia.updateMany({
      where: { idTransferencia, idInstitucionProveedora: idInstitucion, estado: 'pendiente', plazoRespuesta: { gte: new Date() } },
      data: { estado: 'rechazada', motivoRechazo },
    });
    if (count === 0) throw await explicarFallo(tx, idTransferencia, idInstitucion, 'proveedora', 'rechazar');
    await tx.transferenciaItem.updateMany({ where: { idTransferencia }, data: { activo: false } });
  });

  return obtenerTransferencia(idTransferencia, idInstitucion);
}

// POST /api/transferencias/:id/recibir: la institución que pidió confirma que le llegaron.
// Criterio: las unidades pasan a la otra institución y queda un movimiento por cada una (origen y destino).
// Criterio: si está ligada a una necesidad, suma las unidades a lo cubierto y la cierra si se completó.
async function recibirTransferencia({ idTransferencia, idInstitucion, idUsuario }) {
  await prisma.$transaction(async (tx) => {
    const { count } = await tx.transferencia.updateMany({
      where: { idTransferencia, idInstitucionSolicitante: idInstitucion, estado: 'aceptada' },
      data: { estado: 'recibida', recibidaEn: new Date() },
    });
    if (count === 0) throw await explicarFallo(tx, idTransferencia, idInstitucion, 'solicitante', 'confirmar la recepción de');

    const transferencia = await tx.transferencia.findUnique({ where: { idTransferencia }, include: { items: true } });
    const ids = transferencia.items.map((item) => item.idUnidadSangre);
    const { count: movidas } = await tx.unidadSangre.updateMany({
      where: { idUnidadSangre: { in: ids }, idInstitucion: transferencia.idInstitucionProveedora, estado: 'reservada' },
      data: { idInstitucion, estado: 'disponible' },
    });
    if (movidas !== ids.length) {
      throw new ErrorTransferencia(409, 'CONFLICTO', 'Alguna de las unidades ya no está reservada para esta transferencia');
    }
    await tx.movimientoUnidad.createMany({
      data: ids.map((idUnidadSangre) => ({
        idUnidadSangre,
        tipo: 'transferencia',
        estadoAnterior: 'reservada',
        estadoNuevo: 'disponible',
        idInstitucionOrigen: transferencia.idInstitucionProveedora,
        idInstitucionDestino: idInstitucion,
        idUsuario,
      })),
    });
    await tx.transferenciaItem.updateMany({ where: { idTransferencia }, data: { activo: false } });

    if (transferencia.idNecesidad) {
      await sumarCobertura(transferencia.idNecesidad, ids.length, tx);
    }
  });

  // Caso borde: una unidad que venció entre que se aceptó y se recibió llega igual (ya está en este hospital)
  // y la tarea de vencimiento la marca como vencida en su nuevo destino, ahora mismo
  await marcarVencidas();

  return obtenerTransferencia(idTransferencia, idInstitucion);
}

// GET /api/transferencias: historial de la institución, enviadas y recibidas (criterio).
// direccion: 'enviadas', 'recibidas' o undefined (las dos)
async function listarTransferencias({ idInstitucion, direccion }) {
  await vencerTransferencias(); // así nunca se ve una pendiente que en realidad ya expiró
  const where = {
    enviadas: { idInstitucionSolicitante: idInstitucion },
    recibidas: { idInstitucionProveedora: idInstitucion },
  }[direccion] ?? { OR: [{ idInstitucionSolicitante: idInstitucion }, { idInstitucionProveedora: idInstitucion }] };

  const transferencias = await prisma.transferencia.findMany({ where, include: INCLUIR, orderBy: { creadaEn: 'desc' } });
  return transferencias.map((t) => mapearTransferencia(t, idInstitucion));
}

// GET /api/transferencias/unidades-disponibles: para pedir a mano. Las unidades disponibles y no vencidas de
// ese grupo, factor y componente en las otras instituciones aprobadas, sin las que ya están pedidas en otra
// transferencia en curso. Agrupadas por institución: primero la más cercana, y dentro de cada una lo que vence antes.
async function buscarUnidadesDisponibles({ idInstitucion, grupoSanguineo, factorRh, componente }) {
  const hoy = obtenerFechaHoyArgentina();
  const [propia, unidades] = await Promise.all([
    prisma.institucion.findUnique({ where: { idInstitucion } }),
    prisma.unidadSangre.findMany({
      where: {
        estado: 'disponible',
        fechaVencimiento: { gte: parsearFecha(hoy) },
        grupoSanguineo,
        factorRh,
        componente,
        idInstitucion: { not: idInstitucion },
        institucion: { estado: 'aprobada' },
        itemsTransferencia: { none: { activo: true } },
      },
      include: { institucion: { select: { nombre: true, direccion: true, latitud: true, longitud: true } } },
      orderBy: { fechaVencimiento: 'asc' },
    }),
  ]);

  const porInstitucion = new Map();
  for (const unidad of unidades) {
    if (!porInstitucion.has(unidad.idInstitucion)) {
      const { institucion } = unidad;
      const km = distanciaKm(
        Number(propia.latitud), Number(propia.longitud),
        Number(institucion.latitud), Number(institucion.longitud)
      );
      porInstitucion.set(unidad.idInstitucion, {
        idInstitucion: unidad.idInstitucion,
        nombre: institucion.nombre,
        direccion: institucion.direccion,
        distanciaKm: Math.round(km * 10) / 10,
        unidades: [],
      });
    }
    const fechaVencimiento = formatearFecha(unidad.fechaVencimiento);
    porInstitucion.get(unidad.idInstitucion).unidades.push({
      idUnidadSangre: unidad.idUnidadSangre,
      codigo: unidad.codigo,
      grupoSanguineo: unidad.grupoSanguineo,
      factorRh: unidad.factorRh,
      componente: unidad.componente,
      fechaVencimiento,
      diasRestantes: calcularDiasRestantes(fechaVencimiento, hoy),
    });
  }

  return [...porInstitucion.values()].sort(
    (a, b) => (a.distanciaKm - b.distanciaKm) || (a.unidades[0].diasRestantes - b.unidades[0].diasRestantes)
  );
}

module.exports = {
  // Para las rutas
  pedirTransferencia,
  aceptarTransferencia,
  rechazarTransferencia,
  recibirTransferencia,
  listarTransferencias,
  buscarUnidadesDisponibles,
  ErrorTransferencia,
  // Tarea automática (server.js la programa)
  vencerTransferencias,
  programarVencimientoTransferencias,
  // Para los tests
  PLAZO_RESPUESTA_HORAS,
  MAX_UNIDADES,
};
