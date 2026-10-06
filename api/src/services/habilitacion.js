// TAREA-3: cuestionario de aptitud y control de habilitación del donante.
//
// Idea central: todo lo que impide donar es un DIFERIMIENTO, con un motivo y (si se sabe) una fecha
// de fin. Puede venir de tres lados (diferimiento.origen):
//   - cuestionario: una respuesta del donante dispara una regla (tatuaje, cirugía, etc.)
//   - donacion:     se registró una donación y hay que esperar 56 días
//   - institucion:  el hospital lo marcó no apto por un motivo médico
// Estar habilitado = tener el cuestionario respondido y ningún diferimiento vigente hoy.
//
// Las fechas se manejan como texto 'YYYY-MM-DD' (se comparan con < y >) y se convierten a Date
// solo al leer o escribir en la base.
const prisma = require('../lib/prisma');
const { esTexto, esFechaValida, obtenerFechaHoy } = require('../utils/validaciones');
const { formatearFecha, parsearFecha } = require('../utils/formateadores');

const CODIGO_REGLA_INTERVALO = 'INTERVALO_SANGRE_ENTERA';
const MOTIVO_SIN_CUESTIONARIO = 'Todavía no respondiste el cuestionario de aptitud';
const MS_POR_DIA = 24 * 60 * 60 * 1000;

// ─── Lógica pura (no toca la base) ───────────────────────────────────────────

function sumarDias(fecha, dias) {
  return formatearFecha(new Date(parsearFecha(fecha).getTime() + dias * MS_POR_DIA));
}

// '2026-11-20' → '20/11/2026', para los textos que lee una persona
function fechaLegible(fecha) {
  const [anio, mes, dia] = fecha.split('-');
  return `${dia}/${mes}/${anio}`;
}

// "hasta" es el primer día en que puede volver a donar: el diferimiento rige mientras hoy < hasta.
// hasta = null significa que no tiene fecha de fin.
function estaVigente(diferimiento, hoy) {
  return diferimiento.desde <= hoy && (diferimiento.hasta === null || diferimiento.hasta > hoy);
}

function terminaDespues(a, b) {
  if (a.hasta === null) return b.hasta !== null;
  return b.hasta !== null && a.hasta > b.hasta;
}

// Resuelve si el donante está habilitado hoy y, si no, por qué y desde cuándo vuelve a estarlo.
function resumirHabilitacion({ hoy, cuestionarioCompleto, diferimientos }) {
  // Primero el que termina último: ese define la fecha de reingreso
  const vigentes = diferimientos
    .filter((d) => estaVigente(d, hoy))
    .sort((a, b) => (terminaDespues(a, b) ? -1 : terminaDespues(b, a) ? 1 : 0));

  if (vigentes.length > 0) {
    return { habilitado: false, aptoDesde: vigentes[0].hasta, motivo: vigentes[0].motivo, cuestionarioCompleto, diferimientos: vigentes };
  }
  if (!cuestionarioCompleto) {
    return { habilitado: false, aptoDesde: null, motivo: MOTIVO_SIN_CUESTIONARIO, cuestionarioCompleto, diferimientos: [] };
  }
  return { habilitado: true, aptoDesde: null, motivo: null, cuestionarioCompleto, diferimientos: [] };
}

// Revisa una respuesta según el tipo de pregunta. Devuelve el mensaje de error, o null si es válida.
//   si_no: "si" o "no"        fecha: la fecha del hecho (no futura) o "no" si no le pasó
function validarValor(pregunta, valor, hoy) {
  if (pregunta.tipo === 'si_no') {
    return valor === 'si' || valor === 'no' ? null : 'se responde "si" o "no"';
  }
  if (pregunta.tipo === 'fecha') {
    if (valor === 'no') return null;
    if (typeof valor !== 'string' || !esFechaValida(valor)) return 'se responde con una fecha YYYY-MM-DD o "no"';
    return valor > hoy ? 'la fecha no puede ser futura' : null;
  }
  return esTexto(valor, 500) ? null : 'es obligatoria';
}

// Qué diferimiento genera una respuesta. Devuelve null si esa respuesta no impide donar.
function diferimientoPorRespuesta({ pregunta, valor, hoy }) {
  const regla = pregunta.regla;
  if (!regla || valor === 'no') return null;

  // En las preguntas de fecha el plazo corre desde el hecho; en las de sí/no, desde hoy
  const desde = pregunta.tipo === 'fecha' ? valor : hoy;
  const hasta = regla.diasDiferimiento === null ? null : sumarDias(desde, regla.diasDiferimiento);
  if (hasta !== null && hasta <= hoy) return null; // el plazo ya se cumplió

  // El motivo explica el porqué; la fecha de reingreso viaja aparte, en "hasta"
  const titulo = pregunta.texto.split('?')[0] + '?';
  const respuesta = pregunta.tipo === 'fecha' ? `Sí, el ${fechaLegible(valor)}.` : 'Sí.';
  const plazo = hasta === null ? '' : ` Deben pasar ${regla.diasDiferimiento} días.`;
  return {
    idReglaElegibilidad: regla.idReglaElegibilidad,
    desde,
    hasta,
    motivo: `${titulo} ${respuesta}${plazo}`.slice(0, 500),
  };
}

// La pregunta de embarazo, por ejemplo, no se le hace a un donante de sexo masculino
function aplicaAlSexo(regla, sexo) {
  return !regla || regla.sexoAplica === 'todos' || sexo === 'x' || regla.sexoAplica === sexo;
}

// ─── Consultas de habilitación ───────────────────────────────────────────────

function diferimientoATexto(d) {
  return {
    idDiferimiento: d.idDiferimiento,
    origen: d.origen,
    motivo: d.motivo,
    desde: formatearFecha(d.desde),
    hasta: formatearFecha(d.hasta),
  };
}

// Detalle de la habilitación de un donante, o null si el donante no existe.
// db permite llamarla dentro de una transacción.
async function obtenerHabilitacion(idDonante, db = prisma) {
  const hoy = obtenerFechaHoy();
  const donante = await db.donante.findUnique({
    where: { idDonante },
    select: {
      cuestionarios: { where: { completadoEn: { not: null } }, select: { idCuestionarioAptitud: true }, take: 1 },
      diferimientos: { where: { OR: [{ hasta: null }, { hasta: { gt: parsearFecha(hoy) } }] } },
    },
  });
  if (!donante) return null;

  return resumirHabilitacion({
    hoy,
    cuestionarioCompleto: donante.cuestionarios.length > 0,
    diferimientos: donante.diferimientos.map(diferimientoATexto),
  });
}

// La función "está habilitado" que pide el issue para DV-8 (selección de donantes a convocar)
async function estaHabilitado(idDonante) {
  const habilitacion = await obtenerHabilitacion(idDonante);
  return habilitacion?.habilitado === true;
}

// Lo mismo, pero para filtrar muchos donantes en una sola consulta:
//   prisma.donante.findMany({ where: { ...filtroDonantesHabilitados(), grupoSanguineo: 'O' } })
function filtroDonantesHabilitados() {
  const hoy = parsearFecha(obtenerFechaHoy());
  return {
    cuestionarios: { some: { completadoEn: { not: null } } },
    diferimientos: { none: { desde: { lte: hoy }, OR: [{ hasta: null }, { hasta: { gt: hoy } }] } },
  };
}

// donante.apto_desde guarda la fecha de reingreso para mostrarla rápido (perfil, carné).
// Es un resumen: la fuente de verdad son los diferimientos (queda en null si no hay fecha de fin).
async function actualizarAptoDesde(idDonante, db) {
  const habilitacion = await obtenerHabilitacion(idDonante, db);
  await db.donante.update({
    where: { idDonante },
    data: { aptoDesde: habilitacion.aptoDesde ? parsearFecha(habilitacion.aptoDesde) : null },
  });
  return habilitacion;
}

// ─── Cuestionario ────────────────────────────────────────────────────────────

// Las preguntas que le corresponden al donante, con lo que respondió la última vez.
// Criterio "solo se repregunta lo que puede cambiar": hayQueResponder es false cuando la
// pregunta ya tiene respuesta y su respuesta no cambia con el tiempo (pregunta.puede_cambiar = false).
async function armarCuestionario(donante, db = prisma) {
  const [preguntas, ultimo] = await Promise.all([
    db.pregunta.findMany({ where: { activa: true }, include: { regla: true }, orderBy: { codigo: 'asc' } }),
    db.cuestionarioAptitud.findFirst({
      where: { idDonante: donante.idDonante, completadoEn: { not: null } },
      orderBy: { completadoEn: 'desc' },
      include: { respuestas: true },
    }),
  ]);
  const anteriores = new Map((ultimo?.respuestas ?? []).map((r) => [r.idPregunta, r.valor]));

  return {
    ultimaRespuestaEn: ultimo?.completadoEn ?? null,
    preguntas: preguntas
      .filter((p) => aplicaAlSexo(p.regla, donante.sexo))
      .map((p) => {
        const respuestaAnterior = anteriores.get(p.idPregunta) ?? null;
        return { ...p, respuestaAnterior, hayQueResponder: respuestaAnterior === null || p.puedeCambiar };
      }),
  };
}

// Lo que ve el front (sin los datos internos de la regla)
async function obtenerCuestionario(donante) {
  const { ultimaRespuestaEn, preguntas } = await armarCuestionario(donante);
  return {
    ultimaRespuestaEn,
    preguntas: preguntas.map(({ idPregunta, codigo, texto, tipo, puedeCambiar, respuestaAnterior, hayQueResponder }) => (
      { idPregunta, codigo, texto, tipo, puedeCambiar, respuestaAnterior, hayQueResponder }
    )),
  };
}

// Guarda un cuestionario respondido. respuestas = [{ idPregunta, valor }].
// Devuelve { error } si falta o está mal alguna respuesta, o { habilitacion } si se guardó.
async function responderCuestionario(donante, respuestas) {
  if (!Array.isArray(respuestas)) return { error: 'respuestas debe ser una lista de { idPregunta, valor }' };

  const hoy = obtenerFechaHoy();
  const { preguntas } = await armarCuestionario(donante);
  const recibidas = new Map(respuestas.map((r) => [r?.idPregunta, r?.valor]));

  // Una fila por pregunta: las que no se repreguntan conservan su respuesta anterior
  const valores = [];
  for (const pregunta of preguntas) {
    if (!pregunta.hayQueResponder) {
      valores.push({ pregunta, valor: pregunta.respuestaAnterior, nueva: false });
      continue;
    }
    if (!recibidas.has(pregunta.idPregunta)) return { error: `Falta responder: ${pregunta.texto}` };
    const valor = recibidas.get(pregunta.idPregunta);
    const errorValor = validarValor(pregunta, valor, hoy);
    if (errorValor) return { error: `${pregunta.texto} — ${errorValor}` };
    valores.push({ pregunta, valor, nueva: true });
  }

  const nuevas = valores.filter((v) => v.nueva);
  const reglasRespondidas = nuevas.map((v) => v.pregunta.idReglaElegibilidad).filter(Boolean);
  const diferimientos = nuevas
    .map((v) => diferimientoPorRespuesta({ pregunta: v.pregunta, valor: v.valor, hoy }))
    .filter(Boolean);

  // Todo junto o nada: respuestas, diferimientos y fecha de reingreso quedan siempre coherentes
  const habilitacion = await prisma.$transaction(async (tx) => {
    // Los diferimientos de las preguntas respondidas ahora se reemplazan por los nuevos.
    // Los de preguntas que no se repreguntaron, las donaciones y los del hospital no se tocan.
    await tx.diferimiento.deleteMany({
      where: { idDonante: donante.idDonante, origen: 'cuestionario', idReglaElegibilidad: { in: reglasRespondidas } },
    });
    if (diferimientos.length > 0) {
      await tx.diferimiento.createMany({
        data: diferimientos.map((d) => ({
          idDonante: donante.idDonante,
          origen: 'cuestionario',
          idReglaElegibilidad: d.idReglaElegibilidad,
          motivo: d.motivo,
          desde: parsearFecha(d.desde),
          hasta: d.hasta ? parsearFecha(d.hasta) : null,
        })),
      });
    }

    const actualizada = await actualizarAptoDesde(donante.idDonante, tx);
    const noAptoPorRespuestas = actualizada.diferimientos.some((d) => d.origen === 'cuestionario');
    await tx.cuestionarioAptitud.create({
      data: {
        idDonante: donante.idDonante,
        versionFormulario: Math.max(1, ...preguntas.map((p) => p.versionFormulario)),
        origen: 'formulario',
        resultado: noAptoPorRespuestas ? 'no_apto' : 'apto',
        completadoEn: new Date(),
        respuestas: { create: valores.map((v) => ({ idPregunta: v.pregunta.idPregunta, valor: v.valor })) },
      },
    });
    // Se recalcula al final porque recién ahora el cuestionario cuenta como respondido
    return obtenerHabilitacion(donante.idDonante, tx);
  });

  return { habilitacion };
}

// ─── Donación registrada (56 días) y no apto por el hospital ─────────────────

// Criterio "56 días entre donaciones": la llama quien registra la donación (DV-11).
// El plazo sale de regla_elegibilidad, no está escrito en el código.
async function registrarDonacion(idDonante, { fecha, grupoSanguineo, factorRh }) {
  const regla = await prisma.reglaElegibilidad.findUnique({ where: { codigo: CODIGO_REGLA_INTERVALO } });
  if (!regla) throw new Error(`Falta la regla ${CODIGO_REGLA_INTERVALO}: corré npm run db:migrate`);

  return prisma.$transaction(async (tx) => {
    const desde = parsearFecha(fecha);
    // Si avisan dos veces la misma donación no se duplica el diferimiento
    const yaRegistrada = await tx.diferimiento.findFirst({ where: { idDonante, origen: 'donacion', desde } });
    if (!yaRegistrada) {
      await tx.diferimiento.create({
        data: {
          idDonante,
          origen: 'donacion',
          idReglaElegibilidad: regla.idReglaElegibilidad,
          motivo: `Donó sangre el ${fechaLegible(fecha)}. Deben pasar ${regla.diasDiferimiento} días entre donaciones de sangre entera.`,
          desde,
          hasta: parsearFecha(sumarDias(fecha, regla.diasDiferimiento)),
        },
      });
    }
    // TAREA-2, criterio 1: el grupo se completa en la primera donación si el donante no lo sabía
    if (grupoSanguineo && factorRh) {
      await tx.donante.updateMany({ where: { idDonante, grupoSanguineo: null }, data: { grupoSanguineo, factorRh } });
    }
    return actualizarAptoDesde(idDonante, tx);
  });
}

// Criterio "el hospital puede marcarlo no apto": un diferimiento sin regla, con el motivo que escribe el hospital
async function marcarNoApto(idDonante, { motivo, desde, hasta }) {
  return prisma.$transaction(async (tx) => {
    const diferimiento = await tx.diferimiento.create({
      data: {
        idDonante,
        origen: 'institucion',
        motivo: motivo.trim(),
        desde: parsearFecha(desde),
        hasta: hasta ? parsearFecha(hasta) : null,
      },
    });
    const habilitacion = await actualizarAptoDesde(idDonante, tx);
    return { idDiferimiento: diferimiento.idDiferimiento, ...habilitacion };
  });
}

module.exports = {
  // Para otros dominios (contrato "está habilitado")
  estaHabilitado,
  obtenerHabilitacion,
  filtroDonantesHabilitados,
  registrarDonacion,
  // Para las rutas de aptitud
  obtenerCuestionario,
  responderCuestionario,
  marcarNoApto,
  // Lógica pura, exportada para los tests
  sumarDias,
  resumirHabilitacion,
  validarValor,
  diferimientoPorRespuesta,
};
