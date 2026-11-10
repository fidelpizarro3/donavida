// Prepara la base de desarrollo de DonaVida para probar a mano las funcionalidades del 75%
// (12, 13, 14 y 15 del Excel). Se puede correr las veces que haga falta: primero borra lo que creó
// la corrida anterior (los usuarios @prueba.test y todo lo que cuelga de ellos y de sus instituciones)
// y después lo vuelve a crear. No toca nada más de la base.
//
// Uso, desde la raíz del repo: node api/scripts/preparar-prueba-75.js
// (opcional: pasarle otra carpeta api/ como argumento)
// Pasos completos en PRUEBA-ENTORNO-75.md, en la raíz de la rama prueba-entorno.
const path = require('path');
const fs = require('fs');
const { randomBytes } = require('crypto');

const API = path.resolve(process.argv[2] || path.join(__dirname, '..'));
if (!fs.existsSync(path.join(API, 'src/lib/prisma.js')) || !fs.existsSync(path.join(API, 'node_modules'))) {
  console.error(`"${API}" no parece la carpeta api/ de DonaVida con las dependencias instaladas (npm install).`);
  process.exit(1);
}
require(path.join(API, 'node_modules/dotenv')).config({ path: path.join(API, '.env'), quiet: true });

// Por seguridad, solo contra una base local
let url;
try {
  url = new URL(process.env.DATABASE_URL ?? '');
} catch {
  console.error('Falta DATABASE_URL en api/.env');
  process.exit(1);
}
if (!['localhost', '127.0.0.1'].includes(url.hostname)) {
  console.error(`Por seguridad solo corre contra una base local, y DATABASE_URL apunta a ${url.hostname}.`);
  process.exit(1);
}
console.log(`Base: ${url.hostname}:${url.port}${url.pathname}`);

const bcrypt = require(path.join(API, 'node_modules/bcrypt'));
const prisma = require(path.join(API, 'src/lib/prisma'));
const { registrarIngresoUnidad, marcarVencidas, generarCodigo, calcularVencimiento } = require(path.join(API, 'src/services/unidades'));
const { responderCuestionario } = require(path.join(API, 'src/services/habilitacion'));
const { distanciaKm } = require(path.join(API, 'src/services/distancia'));
const { buscarCoberturaEnRed } = require(path.join(API, 'src/services/cobertura'));
const { armarCuadro } = require(path.join(API, 'src/services/stockDemanda'));
const { obtenerFechaHoy } = require(path.join(API, 'src/utils/validaciones'));

const DOMINIO = '@prueba.test';
const CLAVE = 'Prueba2026';
const DIA = 86400000;
const HOY = obtenerFechaHoy();
const fecha = (t) => new Date(`${t}T00:00:00.000Z`);
const enDias = (d) => new Date(fecha(HOY).getTime() + d * DIA).toISOString().slice(0, 10);
const legible = (t) => t.split('-').reverse().join('/');
const hora = (h) => new Date(`1970-01-01T${h}:00.000Z`);
const grupo = (g, f) => `${g}${f === 'positivo' ? '+' : '−'}`;

// ─── Borrar lo de la corrida anterior ───────────────────────────────────────
async function borrarPruebaAnterior() {
  const usuarios = await prisma.usuario.findMany({ where: { email: { endsWith: DOMINIO } }, select: { idUsuario: true } });
  const U = usuarios.map((u) => u.idUsuario);
  if (U.length === 0) return 0;
  const I = (await prisma.usuarioInstitucion.findMany({ where: { idUsuario: { in: U } } })).map((v) => v.idInstitucion);
  const D = (await prisma.donante.findMany({ where: { idUsuario: { in: U } } })).map((d) => d.idDonante);
  const N = (await prisma.necesidad.findMany({ where: { idInstitucion: { in: I } } })).map((n) => n.idNecesidad);
  const UN = (await prisma.unidadSangre.findMany({ where: { idInstitucion: { in: I } } })).map((u) => u.idUnidadSangre);
  const T = (await prisma.transferencia.findMany({
    where: { OR: [{ idInstitucionSolicitante: { in: I } }, { idInstitucionProveedora: { in: I } }, { idNecesidad: { in: N } }] },
  })).map((t) => t.idTransferencia);
  const C = (await prisma.convocatoria.findMany({ where: { idNecesidad: { in: N } } })).map((c) => c.idConvocatoria);
  const A = (await prisma.alerta.findMany({ where: { OR: [{ idConvocatoria: { in: C } }, { idDonante: { in: D } }] } })).map((a) => a.idAlerta);
  const F = (await prisma.franjaHoraria.findMany({ where: { idInstitucion: { in: I } } })).map((f) => f.idFranjaHoraria);
  const TU = (await prisma.turno.findMany({ where: { OR: [{ idAlerta: { in: A } }, { idDonante: { in: D } }, { idFranjaHoraria: { in: F } }] } })).map((t) => t.idTurno);
  const DO = (await prisma.donacion.findMany({ where: { OR: [{ idTurno: { in: TU } }, { idDonante: { in: D } }, { idInstitucion: { in: I } }] } })).map((d) => d.idDonacion);
  const CU = (await prisma.cuestionarioAptitud.findMany({ where: { idDonante: { in: D } } })).map((c) => c.idCuestionarioAptitud);

  await prisma.$transaction([
    prisma.movimientoUnidad.deleteMany({ where: { OR: [{ idUnidadSangre: { in: UN } }, { idUsuario: { in: U } }] } }),
    prisma.transferenciaItem.deleteMany({ where: { OR: [{ idTransferencia: { in: T } }, { idUnidadSangre: { in: UN } }] } }),
    prisma.transferencia.deleteMany({ where: { idTransferencia: { in: T } } }),
    prisma.unidadSangre.deleteMany({ where: { OR: [{ idUnidadSangre: { in: UN } }, { idDonacion: { in: DO } }] } }),
    prisma.donacion.deleteMany({ where: { idDonacion: { in: DO } } }),
    prisma.turno.deleteMany({ where: { idTurno: { in: TU } } }),
    prisma.alerta.deleteMany({ where: { idAlerta: { in: A } } }),
    prisma.convocatoria.deleteMany({ where: { OR: [{ idConvocatoria: { in: C } }, { idUsuarioConfirmador: { in: U } }] } }),
    prisma.necesidad.deleteMany({ where: { idNecesidad: { in: N } } }),
    prisma.franjaHoraria.deleteMany({ where: { idFranjaHoraria: { in: F } } }),
    prisma.stockMinimo.deleteMany({ where: { idInstitucion: { in: I } } }),
    prisma.diferimiento.deleteMany({ where: { idDonante: { in: D } } }),
    prisma.respuestaCuestionario.deleteMany({ where: { idCuestionarioAptitud: { in: CU } } }),
    prisma.cuestionarioAptitud.deleteMany({ where: { idCuestionarioAptitud: { in: CU } } }),
    prisma.consultaAsistente.deleteMany({ where: { idUsuario: { in: U } } }),
    prisma.suscripcionPush.deleteMany({ where: { idUsuario: { in: U } } }),
    prisma.usuarioInstitucion.deleteMany({ where: { OR: [{ idUsuario: { in: U } }, { idInstitucion: { in: I } }] } }),
    // Si con el admin de prueba se aprobó alguna institución que no es de prueba, se le saca la referencia
    prisma.institucion.updateMany({ where: { idUsuarioAprobador: { in: U }, idInstitucion: { notIn: I } }, data: { idUsuarioAprobador: null } }),
    prisma.institucion.deleteMany({ where: { idInstitucion: { in: I } } }),
    prisma.donante.deleteMany({ where: { idDonante: { in: D } } }),
    prisma.usuario.deleteMany({ where: { idUsuario: { in: U } } }),
  ]);
  return U.length;
}

// ─── Crear ──────────────────────────────────────────────────────────────────
let hash;
async function usuario(email, nombre, apellido, rol) {
  return prisma.usuario.create({ data: { email, passwordHash: hash, nombre, apellido, rol, emailVerificado: true } });
}

async function institucion({ email, nombre, direccion, lat, lon, persona, cargo }, idAdmin) {
  const u = await usuario(email, persona[0], persona[1], 'institucion');
  const inst = await prisma.institucion.create({ data: {
    nombre, direccion, tipo: nombre.startsWith('Banco') ? 'banco_de_sangre' : 'hospital', estado: 'aprobada',
    latitud: lat, longitud: lon, idUsuarioAprobador: idAdmin,
  } });
  await prisma.usuarioInstitucion.create({ data: { idUsuario: u.idUsuario, idInstitucion: inst.idInstitucion, cargo } });
  return { ...inst, usuario: u };
}

let documento = 90000000;
async function donante({ email, nombre, apellido, sexo, grupoSanguineo, factorRh, lat, lon }) {
  const u = await usuario(email, nombre, apellido, 'donante');
  const d = await prisma.donante.create({ data: {
    idUsuario: u.idUsuario, documento: String(++documento), fechaNacimiento: fecha('1994-06-15'), sexo,
    grupoSanguineo, factorRh, latitud: lat, longitud: lon, avisoEmail: true, avisoPush: true,
    contactoHoraDesde: hora('08:00'), contactoHoraHasta: hora('21:00'),
  } });
  // El cuestionario de aptitud se responde con la misma función que usa la app (todo "no" → habilitado)
  const preguntas = await prisma.pregunta.findMany({ where: { activa: true } });
  const { error } = await responderCuestionario(d, preguntas.map((p) => ({ idPregunta: p.idPregunta, valor: 'no' })));
  if (error) throw new Error(`Cuestionario de ${nombre}: ${error}`);
  return { ...d, usuario: u };
}

// La unidad se carga con la función de la TAREA-5 (código, vencimiento y movimiento de ingreso)
async function unidad(inst, grupoSanguineo, factorRh, componente, haceDias) {
  const { unidad: u, error } = await registrarIngresoUnidad({
    idInstitucion: inst.idInstitucion, idUsuario: inst.usuario.idUsuario, grupoSanguineo, factorRh, componente, fechaExtraccion: enDias(-haceDias),
  });
  if (error) throw new Error(error);
  return u;
}

// TAREA-15: una unidad que la institución usó hace "diasUso" días (como si hubiera tocado "Usar").
// Así el cuadro de stock contra demanda tiene consumo de los últimos 30 días para calcular la cobertura
async function usadaHace(inst, grupoSanguineo, factorRh, componente, diasUso) {
  const extraida = enDias(-(diasUso + 3));
  const u = await prisma.unidadSangre.create({ data: {
    codigo: generarCodigo(), idInstitucion: inst.idInstitucion, grupoSanguineo, factorRh, componente, estado: 'usada',
    fechaExtraccion: fecha(extraida), fechaVencimiento: fecha(calcularVencimiento(componente, extraida)),
  } });
  await prisma.movimientoUnidad.createMany({ data: [
    { idUnidadSangre: u.idUnidadSangre, tipo: 'ingreso', estadoNuevo: 'disponible', idInstitucionDestino: inst.idInstitucion,
      idUsuario: inst.usuario.idUsuario, ocurridoEn: new Date(Date.now() - (diasUso + 3) * DIA) },
    { idUnidadSangre: u.idUnidadSangre, tipo: 'uso', estadoAnterior: 'disponible', estadoNuevo: 'usada', idInstitucionOrigen: inst.idInstitucion,
      idUsuario: inst.usuario.idUsuario, ocurridoEn: new Date(Date.now() - diasUso * DIA) },
  ] });
}

async function franja(inst, dias, desde, hasta, cupoTotal = 10) {
  return prisma.franjaHoraria.create({ data: { idInstitucion: inst.idInstitucion, fecha: fecha(enDias(dias)), horaInicio: hora(desde), horaFin: hora(hasta), cupoTotal } });
}

// Convocatoria ya confirmada y enviada (TAREA-8 y 9), como la deja la app
async function convocatoria(nec, inst, alertas) {
  const conv = await prisma.convocatoria.create({ data: {
    idNecesidad: nec.idNecesidad, radioKm: 20, cupoDisponible: alertas.length, estado: 'enviada', idUsuarioConfirmador: inst.usuario.idUsuario,
  } });
  for (const { donante: d, estado, turno } of alertas) {
    const km = Math.round(distanciaKm(Number(inst.latitud), Number(inst.longitud), Number(d.latitud), Number(d.longitud)) * 10) / 10;
    const exacto = d.grupoSanguineo === nec.grupoSanguineo && d.factorRh === nec.factorRh;
    const alerta = await prisma.alerta.create({ data: {
      idConvocatoria: conv.idConvocatoria, idDonante: d.idDonante, canal: 'email', estado,
      motivo: `${exacto ? 'Mismo grupo' : 'Grupo compatible'} (${grupo(d.grupoSanguineo, d.factorRh)}). Habilitado para donar. A ${km} km de la institución.`,
      distanciaKm: km, enviadaEn: new Date(Date.now() - 3 * 3600000), respondidaEn: estado === 'enviada' ? null : new Date(Date.now() - 2 * 3600000),
    } });
    await prisma.donante.update({ where: { idDonante: d.idDonante }, data: { alertasMesActual: 1 } });
    if (turno) {
      await prisma.franjaHoraria.update({ where: { idFranjaHoraria: turno.idFranjaHoraria }, data: { cupoOcupado: { increment: 1 } } });
      await prisma.turno.create({ data: { idFranjaHoraria: turno.idFranjaHoraria, idDonante: d.idDonante, idAlerta: alerta.idAlerta, estado: 'reservado', codigoQr: randomBytes(16).toString('hex') } });
    }
  }
  return conv;
}

// ─── Comprobación final: lo mismo que va a ver la persona en la pantalla ───
const fallas = [];
function comprobar(que, obtenido, esperado) {
  const ok = JSON.stringify(obtenido) === JSON.stringify(esperado);
  if (!ok) fallas.push(que);
  console.log(`${ok ? 'OK   ' : 'FALLA'} ${que}${ok ? '' : ` → dio ${JSON.stringify(obtenido)}, se esperaba ${JSON.stringify(esperado)}`}`);
}

async function comprobarTodo({ H, n1, n2 }) {
  console.log('\nComprobación:');
  const opcionesDe = (c) => c.opciones.map((o) => ({ nombre: o.nombre, tiene: o.unidades.length, sugeridas: o.sugeridas }));
  const c1 = await buscarCoberturaEnRed({ ...n1, institucion: H });
  comprobar('Func. 12 · N1 (O− GR, 3): la red ofrece Banco 2 y Clínica 1', opcionesDe(c1), [
    { nombre: 'Banco de Sangre Regional', tiene: 2, sugeridas: 2 }, { nombre: 'Clínica Los Álamos', tiene: 1, sugeridas: 1 },
  ]);
  const c2 = await buscarCoberturaEnRed({ ...n2, institucion: H });
  comprobar('Func. 12 · N2 (A+ plaquetas, 2): la red ofrece Banco 2', opcionesDe(c2), [{ nombre: 'Banco de Sangre Regional', tiene: 2, sugeridas: 2 }]);

  const fila = (cuadro, g, f, campos) => {
    const x = cuadro.grupos.find((y) => y.grupoSanguineo === g && y.factorRh === f);
    return Object.fromEntries(campos.map((c) => [c, x[c]]));
  };
  const gr = await armarCuadro(H.idInstitucion, 'globulos_rojos');
  comprobar('Func. 15 · O− GR: crítico por la necesidad (faltan 2, citar 4)', fila(gr, 'O', 'negativo', ['disponible', 'necesitando', 'balance', 'semaforo', 'donantesACitar']),
    { disponible: 1, necesitando: 3, balance: -2, semaforo: 'rojo', donantesACitar: 4 });
  comprobar('Func. 15 · A+ GR: atención por consumo (0,5 por día, 4 días)', fila(gr, 'A', 'positivo', ['disponible', 'consumoDiario', 'diasCobertura', 'semaforo']),
    { disponible: 2, consumoDiario: 0.5, diasCobertura: 4, semaforo: 'amarillo' });
  comprobar('Func. 15 · B+ GR: cubierto, 2 por vencer y 1 que se vencería sin usar', fila(gr, 'B', 'positivo', ['disponible', 'porVencer', 'seVencenSinUsar', 'diasCobertura', 'semaforo']),
    { disponible: 4, porVencer: 2, seVencenSinUsar: 1, diasCobertura: 30, semaforo: 'verde' });
  comprobar('Func. 15 · tasa de presentación supuesta (poco historial)', gr.tasaPresentacion.segun, 'supuesto');
  const pl = await armarCuadro(H.idInstitucion, 'plaquetas');
  comprobar('Func. 15 · A+ plaquetas: crítico por la necesidad 2', fila(pl, 'A', 'positivo', ['disponible', 'necesitando', 'semaforo']),
    { disponible: 0, necesitando: 2, semaforo: 'rojo' });

  const vieja = await prisma.transferencia.count({ where: { idInstitucionSolicitante: H.idInstitucion, estado: 'pendiente', plazoRespuesta: { lt: new Date() } } });
  comprobar('Func. 13 · hay 1 pedido viejo vencido (pasa a expirado al listar o al arrancar la API)', vieja, 1);
}

async function main() {
  const borrados = await borrarPruebaAnterior();
  if (borrados) console.log(`Se borraron ${borrados} usuarios de una preparación anterior (y todo lo suyo).`);
  hash = await bcrypt.hash(CLAVE, 10);

  // Admin de prueba: aprueba las instituciones y sirve para ver el cuadro de toda la red (func. 15)
  const admin = await usuario(`admin${DOMINIO}`, 'Admin', 'Prueba', 'admin');

  // Instituciones aprobadas (Neuquén): el Hospital pide, el Banco está cerca y la Clínica más lejos
  const H = await institucion({ email: `hospital${DOMINIO}`, nombre: 'Hospital del Valle', direccion: 'Av. Argentina 1400, Neuquén', lat: -38.9516, lon: -68.0591, persona: ['Laura', 'Gómez'], cargo: 'Hemoterapia' }, admin.idUsuario);
  const B = await institucion({ email: `banco${DOMINIO}`, nombre: 'Banco de Sangre Regional', direccion: 'Belgrano 2500, Neuquén', lat: -38.9389, lon: -68.1003, persona: ['Martín', 'Ruiz'], cargo: 'Jefe de banco' }, admin.idUsuario);
  const C = await institucion({ email: `clinica${DOMINIO}`, nombre: 'Clínica Los Álamos', direccion: 'Ruta 22 km 1230, Plottier', lat: -38.902, lon: -68.231, persona: ['Sofía', 'Herrera'], cargo: 'Banco de sangre' }, admin.idUsuario);

  // ── Stock del Hospital
  await unidad(H, 'O', 'negativo', 'globulos_rojos', 10); // propia: nunca aparece en sus búsquedas
  // Func. 15: A+ con consumo de 15 en 30 días (0,5 por día) y 2 en stock → 4 días de cobertura (amarillo)
  await unidad(H, 'A', 'positivo', 'globulos_rojos', 5);
  await unidad(H, 'A', 'positivo', 'globulos_rojos', 10);
  for (let d = 1; d <= 29; d += 2) await usadaHace(H, 'A', 'positivo', 'globulos_rojos', d);
  // Func. 15: B+ con poco consumo (3 en 30 días) y 2 a punto de vencer: una se vencería antes de usarse
  await unidad(H, 'B', 'positivo', 'globulos_rojos', 40); // vence en 2 días
  await unidad(H, 'B', 'positivo', 'globulos_rojos', 39); // vence en 3 días
  await unidad(H, 'B', 'positivo', 'globulos_rojos', 7);
  await unidad(H, 'B', 'positivo', 'globulos_rojos', 2);
  for (const d of [5, 15, 25]) await usadaHace(H, 'B', 'positivo', 'globulos_rojos', d);

  // ── Stock del Banco
  const bOneg = [await unidad(B, 'O', 'negativo', 'globulos_rojos', 30), await unidad(B, 'O', 'negativo', 'globulos_rojos', 20), await unidad(B, 'O', 'negativo', 'globulos_rojos', 10)];
  await prisma.stockMinimo.create({ data: { idInstitucion: B.idInstitucion, grupoSanguineo: 'O', factorRh: 'negativo', componente: 'globulos_rojos', unidadesMinimas: 1 } });
  // Una que se cargó hace 50 días y ya venció (hace 8): la tarea de vencimiento la marca y no se puede transferir.
  // La función de ingreso no deja cargar una vencida, así que se crea como si se hubiera cargado en su momento
  const bVencida = await prisma.unidadSangre.create({ data: {
    codigo: generarCodigo(), idInstitucion: B.idInstitucion, grupoSanguineo: 'O', factorRh: 'negativo',
    componente: 'globulos_rojos', fechaExtraccion: fecha(enDias(-50)), fechaVencimiento: fecha(enDias(-8)),
  } });
  await prisma.movimientoUnidad.create({ data: {
    idUnidadSangre: bVencida.idUnidadSangre, tipo: 'ingreso', estadoNuevo: 'disponible', idInstitucionDestino: B.idInstitucion,
    idUsuario: B.usuario.idUsuario, ocurridoEn: new Date(Date.now() - 50 * DIA),
  } });
  await unidad(B, 'A', 'positivo', 'plaquetas', 1);
  await unidad(B, 'A', 'positivo', 'plaquetas', 0);
  const bPlaqBpos = await unidad(B, 'B', 'positivo', 'plaquetas', 1);
  // Func. 15: A+ glóbulos rojos para que el Hospital las pida desde el cuadro
  const bApos = [await unidad(B, 'A', 'positivo', 'globulos_rojos', 3), await unidad(B, 'A', 'positivo', 'globulos_rojos', 6), await unidad(B, 'A', 'positivo', 'globulos_rojos', 9)];

  // ── Stock de la Clínica
  const cOneg = await unidad(C, 'O', 'negativo', 'globulos_rojos', 25);
  const cAneg = await unidad(C, 'A', 'negativo', 'globulos_rojos', 8);
  const cABpos = await unidad(C, 'AB', 'positivo', 'globulos_rojos', 12);
  const vencidas = await marcarVencidas();

  // ── Agenda del Hospital
  const fHoy = await franja(H, 0, '08:00', '20:00');
  const fMas2 = await franja(H, 2, '08:00', '12:00');
  await franja(H, 3, '14:00', '18:00');
  await franja(H, 12, '08:00', '12:00'); // después de la fecha límite de las dos necesidades

  // ── Donantes habilitados, cerca del Hospital, con aviso por correo
  const ana = await donante({ email: `ana${DOMINIO}`, nombre: 'Ana', apellido: 'Paz', sexo: 'femenino', grupoSanguineo: 'O', factorRh: 'negativo', lat: -38.953, lon: -68.062 });
  const bruno = await donante({ email: `bruno${DOMINIO}`, nombre: 'Bruno', apellido: 'Díaz', sexo: 'masculino', grupoSanguineo: 'O', factorRh: 'negativo', lat: -38.948, lon: -68.065 });
  const carla = await donante({ email: `carla${DOMINIO}`, nombre: 'Carla', apellido: 'Ríos', sexo: 'femenino', grupoSanguineo: 'O', factorRh: 'negativo', lat: -38.96, lon: -68.05 });
  const diego = await donante({ email: `diego${DOMINIO}`, nombre: 'Diego', apellido: 'Luna', sexo: 'masculino', grupoSanguineo: 'A', factorRh: 'positivo', lat: -38.945, lon: -68.07 });
  const elena = await donante({ email: `elena${DOMINIO}`, nombre: 'Elena', apellido: 'Sosa', sexo: 'femenino', grupoSanguineo: 'A', factorRh: 'positivo', lat: -38.956, lon: -68.045 });

  // Necesidad 1 (escenario 1): O− glóbulos rojos, 3 unidades. Convocados Ana (turno hoy), Bruno (turno en 2 días) y Carla (sin responder)
  const n1 = await prisma.necesidad.create({ data: { idInstitucion: H.idInstitucion, grupoSanguineo: 'O', factorRh: 'negativo', componente: 'globulos_rojos', unidadesSolicitadas: 3, urgencia: 'urgente', fechaLimite: fecha(enDias(5)) } });
  await convocatoria(n1, H, [
    { donante: ana, estado: 'aceptada', turno: fHoy },
    { donante: bruno, estado: 'aceptada', turno: fMas2 },
    { donante: carla, estado: 'enviada' },
  ]);

  // Necesidad 2 (escenario 2): A+ plaquetas, 2 unidades. Convocados Diego y Elena, ninguno respondió todavía
  const n2 = await prisma.necesidad.create({ data: { idInstitucion: H.idInstitucion, grupoSanguineo: 'A', factorRh: 'positivo', componente: 'plaquetas', unidadesSolicitadas: 2, urgencia: 'normal', fechaLimite: fecha(enDias(4)) } });
  await convocatoria(n2, H, [{ donante: diego, estado: 'enviada' }, { donante: elena, estado: 'enviada' }]);

  // Escenario 3: un pedido viejo del Hospital a la Clínica que nadie contestó (expira solo)
  const vieja = await prisma.transferencia.create({ data: {
    idInstitucionSolicitante: H.idInstitucion, idInstitucionProveedora: C.idInstitucion, estado: 'pendiente',
    plazoRespuesta: new Date(Date.now() - 3600000), creadaEn: new Date(Date.now() - 25 * 3600000),
  } });
  await prisma.transferenciaItem.create({ data: { idTransferencia: vieja.idTransferencia, idUnidadSangre: cABpos.idUnidadSangre } });

  console.log(`\nListo. Hoy es ${legible(HOY)}. Clave de todos los usuarios: ${CLAVE}\n`);
  console.table([
    { usuario: `hospital${DOMINIO}`, quién: 'Laura Gómez', qué: 'Hospital del Valle (pide)' },
    { usuario: `banco${DOMINIO}`, quién: 'Martín Ruiz', qué: 'Banco de Sangre Regional (presta, ~4 km)' },
    { usuario: `clinica${DOMINIO}`, quién: 'Sofía Herrera', qué: 'Clínica Los Álamos (presta, ~16 km)' },
    { usuario: `admin${DOMINIO}`, quién: 'Admin Prueba', qué: 'Admin: cuadro de stock y demanda de la red' },
    { usuario: `ana${DOMINIO}`, quién: 'Ana Paz · O−', qué: 'N1: aceptó, turno HOY' },
    { usuario: `bruno${DOMINIO}`, quién: 'Bruno Díaz · O−', qué: `N1: aceptó, turno ${legible(enDias(2))}` },
    { usuario: `carla${DOMINIO}`, quién: 'Carla Ríos · O−', qué: 'N1: no respondió' },
    { usuario: `diego${DOMINIO}`, quién: 'Diego Luna · A+', qué: 'N2: no respondió' },
    { usuario: `elena${DOMINIO}`, quién: 'Elena Sosa · A+', qué: 'N2: no respondió' },
  ]);
  console.log('Fechas: N1 vence', legible(enDias(5)), '· N2 vence', legible(enDias(4)), '· franjas del Hospital: hoy,', legible(enDias(2)), ',', legible(enDias(3)), 'y', legible(enDias(12)), '(después de las dos fechas límite)');
  console.log('Banco: O− GR', bOneg.map((u) => u.codigo).join(', '), '(mínimo 1) · vencida', bVencida.codigo, '· B+ plaquetas', bPlaqBpos.codigo, '· A+ GR', bApos.map((u) => u.codigo).join(', '));
  console.log('Clínica: O−', cOneg.codigo, '· A−', cAneg.codigo, '· AB+ (pedido expirado)', cABpos.codigo);
  console.log(`Unidades marcadas vencidas ahora: ${vencidas}`);

  await comprobarTodo({ H, n1, n2 });
  if (fallas.length) {
    console.log(`\n${fallas.length} comprobación(es) fallaron: revisar antes de probar.`);
    process.exitCode = 1;
  } else {
    console.log('\nTodo en orden para empezar a probar.');
  }
}

main()
  .catch((err) => { console.error('FALLÓ:', err); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
