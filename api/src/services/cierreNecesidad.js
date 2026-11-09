// Suma a una necesidad lo que la cubre y la cierra cuando se completa.
// TAREA-12 (DV-13): la usa la recepción de una transferencia ligada a una necesidad.
// TAREA-13 (DV-14): cierre de la necesidad y aviso de agradecimiento.
//
// Criterio: el cierre se dispara solo, cuando unidades_cubiertas llega a unidades_solicitadas. Lo llaman:
//   - el registro de una donación (DV-11, routes/donaciones.routes.js)
//   - la recepción de una transferencia ligada a la necesidad (DV-13, services/transferencias.js)
//   - la corrección de la cantidad pedida, si queda igual a lo cubierto (routes/necesidades.routes.js)
// Al cerrarse:
//   1) la necesidad pasa a "cubierta" y guarda con qué se cubrió (donantes, transferencia o las dos)
//   2) sus convocatorias se cierran, salvo las que el hospital pidió mantener abiertas para reponer stock
//   3) después de guardar, enviarAgradecimientos() avisa a los que todavía no habían ido que ya no hace falta
// Con los que ya tenían turno decide el hospital (routes/cierre.routes.js): los mantiene o les pide que reprogramen.
const prisma = require('../lib/prisma');
const { enviarPush } = require('./alertas');
const { fechaConDia } = require('./recordatorios');
const { enviarCorreoAgradecimiento, enviarCorreoReprogramar } = require('../lib/correo');
const { obtenerFechaHoy } = require('../utils/validaciones');
const { formatearFecha, formatearHora, parsearFecha } = require('../utils/formateadores');

// Criterio: la necesidad cerrada queda en el historial indicando cómo se cubrió.
// Se cuenta lo que sumó mientras estaba abierta: las donaciones que vinieron por sus convocatorias
// y las transferencias recibidas para ella. Devuelve 'donantes', 'transferencia', 'ambas' o null.
async function calcularCubiertaCon(idNecesidad, db) {
  const donaciones = await db.donacion.count({
    where: { resultado: 'realizada', turno: { alerta: { convocatoria: { idNecesidad } } } },
  });
  const transferencias = await db.transferencia.count({ where: { idNecesidad, estado: 'recibida' } });
  if (donaciones > 0 && transferencias > 0) return 'ambas';
  if (transferencias > 0) return 'transferencia';
  if (donaciones > 0) return 'donantes';
  return null;
}

// Si la necesidad sigue abierta y ya tiene todo lo que pidió, la pasa a "cubierta" y cierra sus convocatorias.
// El cambio es condicional (solo si sigue abierta): aunque se llame dos veces, se cierra una sola.
// db puede ser la transacción de quien la llama. Devuelve true si la cerró ahora.
// Los avisos NO salen de acá: quien la llama, después de guardar, llama a enviarAgradecimientos().
async function cerrarSiCubierta(idNecesidad, db = prisma) {
  const necesidad = await db.necesidad.findUnique({ where: { idNecesidad } });
  if (!necesidad || necesidad.estado !== 'abierta' || necesidad.unidadesCubiertas < necesidad.unidadesSolicitadas) {
    return false;
  }
  const cubiertaCon = await calcularCubiertaCon(idNecesidad, db);
  const { count } = await db.necesidad.updateMany({
    where: { idNecesidad, estado: 'abierta' },
    data: { estado: 'cubierta', cerradaEn: new Date(), cubiertaCon },
  });
  if (count === 0) return false;

  // Criterio: se cierra la convocatoria. Las que el hospital pidió mantener abiertas siguen recibiendo donantes
  await db.convocatoria.updateMany({
    where: { idNecesidad, estado: 'enviada', mantenerAbierta: false },
    data: { estado: 'cerrada' },
  });
  return true;
}

// Suma unidades a lo cubierto de una necesidad abierta (sin pasarse de lo que pidió) y la cierra si se completó.
// Si la necesidad ya no está abierta (cubierta, cerrada a mano o vencida), no suma nada:
// las unidades igual entran al stock de la institución.
// db puede ser la transacción de quien la llama. Devuelve la necesidad como quedó.
async function sumarCobertura(idNecesidad, unidades, db = prisma) {
  // Suma atómica: si otra operación suma al mismo tiempo, no se pisan
  const { count } = await db.necesidad.updateMany({
    where: { idNecesidad, estado: 'abierta' },
    data: { unidadesCubiertas: { increment: unidades } },
  });
  if (count === 1) {
    const necesidad = await db.necesidad.findUnique({ where: { idNecesidad } });
    // Si en el medio llegaron donaciones, lo cubierto no puede pasar de lo pedido: lo que sobra va al stock
    if (necesidad.unidadesCubiertas > necesidad.unidadesSolicitadas) {
      await db.necesidad.update({
        where: { idNecesidad },
        data: { unidadesCubiertas: necesidad.unidadesSolicitadas },
      });
    }
    await cerrarSiCubierta(idNecesidad, db);
  }
  return db.necesidad.findUnique({ where: { idNecesidad } });
}

// Una convocatoria sigue recibiendo donantes (pueden aceptar el aviso y reservar turno) mientras su necesidad
// está abierta. Criterio: si ya se cubrió pero el hospital la mantuvo abierta para reponer stock, también,
// hasta la fecha límite. La usan alertas.routes.js y turnos.routes.js con lo que traen de la base.
function recibeDonantes(convocatoria, necesidad) {
  if (necesidad.estado === 'abierta') return true;
  return (
    necesidad.estado === 'cubierta' &&
    convocatoria.estado === 'enviada' &&
    convocatoria.mantenerAbierta === true &&
    necesidad.fechaLimite >= parsearFecha(obtenerFechaHoy())
  );
}

// Criterio: el aviso le llega por su canal. Igual que las alertas (TAREA-11): al celular si ese fue su canal
// y, si el push no llega, al correo (si lo tiene activado). Devuelve el canal por el que salió, o null.
async function avisarPorSuCanal({ canal, donante }, aviso, mandarCorreo) {
  if (canal === 'push' && (await enviarPush(donante.idUsuario, aviso))) return 'push';
  if (donante.avisoEmail) {
    await mandarCorreo();
    return 'email';
  }
  return null;
}

// Los que todavía no habían ido: no respondieron el aviso, o lo aceptaron pero no llegaron a reservar turno.
// Los que tienen turno no entran: con ellos decide el hospital (los mantiene o les pide que reprogramen).
const TODAVIA_NO_IBAN = { OR: [{ estado: 'enviada' }, { estado: 'aceptada', turno: { is: null } }] };

// Criterio: cuando la necesidad queda cubierta, les avisa a los que todavía no habían ido que ya no hace
// falta que vayan, agradeciéndoles igual. Se llama DESPUÉS de guardar el cierre (nunca se manda un aviso
// adentro de una transacción). Toma las alertas de las convocatorias cerradas de una necesidad cubierta:
// si no hay ninguna (la necesidad sigue abierta, o la convocatoria se mantuvo abierta), no hace nada.
// Nunca falla: el cierre ya quedó guardado. Devuelve a cuántos donantes les llegó el aviso.
async function enviarAgradecimientos(idNecesidad) {
  try {
    const deEstaNecesidad = { idNecesidad, estado: 'cerrada', necesidad: { estado: 'cubierta' } };

    // Las que nunca salieron (no había por dónde avisarle) se cancelan sin mandar nada
    await prisma.alerta.updateMany({
      where: { estado: 'pendiente', convocatoria: deEstaNecesidad },
      data: { estado: 'cancelada' },
    });

    // Criterio: un donante no recibe el agradecimiento dos veces. Se cancelan y se devuelven en una sola
    // operación: si dos cierres corren a la vez, cada alerta la toma uno solo. Si después el aviso falla,
    // no se reintenta (es preferible a mandarlo dos veces).
    const canceladas = await prisma.alerta.updateManyAndReturn({
      where: { ...TODAVIA_NO_IBAN, convocatoria: deEstaNecesidad },
      data: { estado: 'cancelada' },
    });
    if (canceladas.length === 0) return 0;

    const alertas = await prisma.alerta.findMany({
      where: { idAlerta: { in: canceladas.map((a) => a.idAlerta) } },
      include: {
        donante: { include: { usuario: { select: { email: true, nombre: true } } } },
        convocatoria: { include: { necesidad: { include: { institucion: { select: { nombre: true } } } } } },
      },
    });

    let avisados = 0;
    for (const alerta of alertas) {
      const institucion = alerta.convocatoria.necesidad.institucion.nombre;
      const { email, nombre } = alerta.donante.usuario;
      const aviso = {
        titulo: '¡Gracias! Ya no hace falta que vayas',
        cuerpo: `${institucion} ya consiguió la sangre que necesitaba. ¡Gracias por estar! Te avisamos la próxima vez.`,
      };
      try {
        const canal = await avisarPorSuCanal(alerta, aviso, () => enviarCorreoAgradecimiento({ email, nombre, institucion }));
        if (canal) avisados++;
      } catch (err) {
        console.error('No se pudo mandar el agradecimiento de la alerta', alerta.idAlerta, err.message);
      }
    }
    return avisados;
  } catch (err) {
    console.error('No se pudieron mandar los agradecimientos:', err.message);
    return 0;
  }
}

// Los turnos de una convocatoria que siguen reservados, de hoy en adelante (los que el hospital puede
// mantener o pedir que se reprogramen)
function turnosVigentes(idConvocatoria) {
  return prisma.turno.findMany({
    where: {
      estado: 'reservado',
      franjaHoraria: { fecha: { gte: parsearFecha(obtenerFechaHoy()) } },
      alerta: { idConvocatoria },
    },
    include: {
      franjaHoraria: { include: { institucion: { select: { nombre: true } } } },
      donante: { include: { usuario: { select: { email: true, nombre: true } } } },
      alerta: { select: { canal: true } },
    },
  });
}

// Criterio: el hospital pidió que reprogramen. Se les avisa por su canal; el turno sigue reservado hasta que
// el donante lo cambie, y ahora puede elegir cualquier día (sin el límite de la necesidad, ver turnos.routes.js).
// Devuelve a cuántos les llegó el aviso.
async function pedirQueReprogramen(turnos) {
  let avisados = 0;
  for (const turno of turnos) {
    const { franjaHoraria: franja, donante } = turno;
    const institucion = franja.institucion.nombre;
    const fecha = fechaConDia(formatearFecha(franja.fecha));
    const horaInicio = formatearHora(franja.horaInicio);
    const horaFin = formatearHora(franja.horaFin);
    const aviso = {
      titulo: `${institucion} te pide cambiar el día de tu turno`,
      cuerpo: `Ya consiguió la sangre que necesitaba. Elegí otro día en DonaVida: tu turno del ${fecha} sigue reservado hasta que lo cambies.`,
    };
    try {
      const canal = await avisarPorSuCanal({ canal: turno.alerta.canal, donante }, aviso, () =>
        enviarCorreoReprogramar({ email: donante.usuario.email, nombre: donante.usuario.nombre, institucion, fecha, horaInicio, horaFin })
      );
      if (canal) avisados++;
    } catch (err) {
      console.error('No se pudo pedir que reprograme el turno', turno.idTurno, err.message);
    }
  }
  return avisados;
}

// Cómo se devuelve una convocatoria en la tarjeta de la necesidad (GET /api/necesidades) y en cierre.routes.js
function mapearConvocatoria(convocatoria, { turnosReservados = 0, agradecidos = 0 } = {}) {
  return {
    idConvocatoria: convocatoria.idConvocatoria,
    estado: convocatoria.estado,
    mantenerAbierta: convocatoria.mantenerAbierta,
    decisionTurnos: convocatoria.decisionTurnos,
    creadaEn: convocatoria.creadaEn,
    turnosReservados,
    agradecidos,
  };
}

// Para la lista de necesidades del hospital: las convocatorias de cada una, con cuántos tienen turno
// reservado y a cuántos se les agradeció. Devuelve un Map idNecesidad → [convocatoria]
async function convocatoriasPorNecesidad(idsNecesidad) {
  const porNecesidad = new Map();
  if (idsNecesidad.length === 0) return porNecesidad;
  const deEstas = { idNecesidad: { in: idsNecesidad } };

  const convocatorias = await prisma.convocatoria.findMany({
    where: { ...deEstas, estado: { not: 'propuesta' } },
    orderBy: { creadaEn: 'asc' },
  });
  if (convocatorias.length === 0) return porNecesidad;

  const turnos = await prisma.turno.findMany({
    where: { estado: 'reservado', franjaHoraria: { fecha: { gte: parsearFecha(obtenerFechaHoy()) } }, alerta: { convocatoria: deEstas } },
    select: { alerta: { select: { idConvocatoria: true } } },
  });
  // Las alertas canceladas que habían salido son las de los que recibieron el agradecimiento
  // (las que se cancelan por el tope del mes o la pausa nunca salen: no tienen enviada_en)
  const agradecidas = await prisma.alerta.findMany({
    where: { estado: 'cancelada', enviadaEn: { not: null }, convocatoria: deEstas },
    select: { idConvocatoria: true },
  });
  const contar = (ids) => ids.reduce((cuenta, id) => cuenta.set(id, (cuenta.get(id) ?? 0) + 1), new Map());
  const turnosDe = contar(turnos.map((t) => t.alerta.idConvocatoria));
  const agradecidosDe = contar(agradecidas.map((a) => a.idConvocatoria));

  for (const convocatoria of convocatorias) {
    const lista = porNecesidad.get(convocatoria.idNecesidad) ?? [];
    lista.push(mapearConvocatoria(convocatoria, {
      turnosReservados: turnosDe.get(convocatoria.idConvocatoria) ?? 0,
      agradecidos: agradecidosDe.get(convocatoria.idConvocatoria) ?? 0,
    }));
    porNecesidad.set(convocatoria.idNecesidad, lista);
  }
  return porNecesidad;
}

module.exports = {
  cerrarSiCubierta,
  sumarCobertura,
  recibeDonantes,
  enviarAgradecimientos,
  turnosVigentes,
  pedirQueReprogramen,
  mapearConvocatoria,
  convocatoriasPorNecesidad,
};
