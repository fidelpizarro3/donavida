process.env.JWT_SECRET = 'secreto_de_prueba_para_los_tests_de_agenda';

const request = require('supertest');
const jwt = require('jsonwebtoken');

// Base simulada: cada test decide qué devuelve cada consulta
jest.mock('../src/lib/prisma', () => ({
  usuarioInstitucion: { findFirst: jest.fn() },
  institucion: { findUnique: jest.fn() },
  donante: { findUnique: jest.fn() },
  franjaHoraria: {
    create: jest.fn(), findMany: jest.fn(), findUnique: jest.fn(), findFirst: jest.fn(),
    update: jest.fn(), updateMany: jest.fn(), fields: { cupoTotal: 'cupoTotal' },
  },
  turno: { findFirst: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn() },
  alerta: { findUnique: jest.fn(), update: jest.fn() },
  donacion: { create: jest.fn(), findMany: jest.fn() },
  necesidad: { findUnique: jest.fn(), update: jest.fn() },
  $transaction: jest.fn(),
}));
// Las funciones de otras tareas se simulan: acá se prueba que se llamen bien
jest.mock('../src/services/habilitacion', () => ({
  ...jest.requireActual('../src/services/habilitacion'),
  obtenerHabilitacion: jest.fn(),
  registrarDonacion: jest.fn(),
}));
jest.mock('../src/services/unidades', () => ({
  ...jest.requireActual('../src/services/unidades'),
  registrarIngresoUnidad: jest.fn(),
}));
jest.mock('../src/lib/correo', () => ({ enviarCorreoRecordatorio: jest.fn() }));

const prisma = require('../src/lib/prisma');
const { obtenerHabilitacion, registrarDonacion } = require('../src/services/habilitacion');
const { registrarIngresoUnidad } = require('../src/services/unidades');
const { enviarCorreoRecordatorio } = require('../src/lib/correo');
const app = require('../src/app');
const { enviarRecordatorios, fechaConDia } = require('../src/services/recordatorios');
const { obtenerFechaHoy } = require('../src/utils/validaciones');
const { parsearFecha } = require('../src/utils/formateadores');

const ID_USUARIO = '11111111-1111-4111-8111-111111111111';
const ID_DONANTE = '22222222-2222-4222-8222-222222222222';
const ID_ALERTA = '33333333-3333-4333-8333-333333333333';
const ID_INSTITUCION = '44444444-4444-4444-8444-444444444444';
const ID_FRANJA = '55555555-5555-4555-8555-555555555555';
const ID_OTRA_FRANJA = '66666666-6666-4666-8666-666666666666';
const ID_TURNO = '77777777-7777-4777-8777-777777777777';
const ID_NECESIDAD = '88888888-8888-4888-8888-888888888888';

const tokenDe = (rol) => jwt.sign({ sub: ID_USUARIO, rol }, process.env.JWT_SECRET, { expiresIn: '1h' });
const TOKEN_DONANTE = tokenDe('donante');
const TOKEN_INSTITUCION = tokenDe('institucion');

const HOY = parsearFecha(obtenerFechaHoy());
const enDias = (dias) => new Date(HOY.getTime() + dias * 86400000);

const FRANJA = {
  idFranjaHoraria: ID_FRANJA,
  idInstitucion: ID_INSTITUCION,
  fecha: enDias(2),
  horaInicio: new Date('1970-01-01T08:00:00Z'),
  horaFin: new Date('1970-01-01T11:00:00Z'),
  cupoTotal: 10,
  cupoOcupado: 3,
  cerrada: false,
};
const NECESIDAD = { idNecesidad: ID_NECESIDAD, idInstitucion: ID_INSTITUCION, estado: 'abierta', fechaLimite: enDias(10), unidadesSolicitadas: 3, unidadesCubiertas: 1 };

const turno = (datos = {}) => ({
  idTurno: ID_TURNO,
  idFranjaHoraria: ID_FRANJA,
  idDonante: ID_DONANTE,
  idAlerta: ID_ALERTA,
  estado: 'reservado',
  codigoQr: 'qr',
  franjaHoraria: FRANJA,
  alerta: { convocatoria: { idNecesidad: ID_NECESIDAD, necesidad: NECESIDAD } },
  donante: { idDonante: ID_DONANTE, grupoSanguineo: 'O', factorRh: 'negativo', documento: '30111222', usuario: { nombre: 'Ana', apellido: 'Paz' } },
  ...datos,
});

beforeEach(() => {
  jest.resetAllMocks();
  prisma.$transaction.mockImplementation((operaciones) => operaciones(prisma));
  prisma.usuarioInstitucion.findFirst.mockResolvedValue({ idInstitucion: ID_INSTITUCION });
  prisma.donante.findUnique.mockResolvedValue({ idDonante: ID_DONANTE });
  prisma.franjaHoraria.updateMany.mockResolvedValue({ count: 1 });
  prisma.turno.update.mockImplementation(async ({ data }) => ({ ...turno(), ...data, franjaHoraria: FRANJA }));
  prisma.donacion.create.mockImplementation(async ({ data }) => ({ idDonacion: 'don-1', ...data }));
  prisma.necesidad.findUnique.mockResolvedValue(NECESIDAD);
});

describe('Franjas: la institución carga su agenda', () => {
  const abrir = (body) => request(app).post('/api/franjas').set('Authorization', `Bearer ${TOKEN_INSTITUCION}`).send(body);

  test('abre una franja con fecha, horario y cupo', async () => {
    prisma.franjaHoraria.create.mockImplementation(async ({ data }) => ({ idFranjaHoraria: ID_FRANJA, cupoOcupado: 0, cerrada: false, ...data }));
    const res = await abrir({ fecha: '2099-01-10', horaInicio: '08:00', horaFin: '11:00', cupoTotal: 12 });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ horaInicio: '08:00', horaFin: '11:00', cupoTotal: 12, cupoLibre: 12 });
  });

  test.each([
    [{ fecha: '2000-01-10', horaInicio: '08:00', horaFin: '11:00', cupoTotal: 12 }],
    [{ fecha: '2099-01-10', horaInicio: '11:00', horaFin: '08:00', cupoTotal: 12 }],
    [{ fecha: '2099-01-10', horaInicio: '08:00', horaFin: '11:00', cupoTotal: 0 }],
  ])('rechaza datos inválidos: %j', async (body) => {
    expect((await abrir(body)).status).toBe(400);
    expect(prisma.franjaHoraria.create).not.toHaveBeenCalled();
  });

  test('a los donantes solo se les ofrecen franjas abiertas y con lugar', async () => {
    prisma.institucion.findUnique.mockResolvedValue({ estado: 'aprobada' });
    prisma.franjaHoraria.findMany.mockResolvedValue([]);
    const res = await request(app).get(`/api/franjas/disponibles?idInstitucion=${ID_INSTITUCION}`).set('Authorization', `Bearer ${TOKEN_DONANTE}`);
    expect(res.status).toBe(200);
    const { where } = prisma.franjaHoraria.findMany.mock.calls[0][0];
    expect(where).toMatchObject({ cerrada: false, cupoOcupado: { lt: 'cupoTotal' } });
  });
});

describe('Turnos: reservar', () => {
  const reservar = () => request(app).post('/api/turnos').set('Authorization', `Bearer ${TOKEN_DONANTE}`)
    .send({ idAlerta: ID_ALERTA, idFranjaHoraria: ID_FRANJA });

  beforeEach(() => {
    prisma.alerta.findUnique.mockResolvedValue({ idDonante: ID_DONANTE, estado: 'aceptada', convocatoria: { necesidad: NECESIDAD } });
    prisma.franjaHoraria.findUnique.mockResolvedValue(FRANJA);
    obtenerHabilitacion.mockResolvedValue({ habilitado: true });
    prisma.turno.create.mockImplementation(async ({ data }) => ({ idTurno: ID_TURNO, ...data, franjaHoraria: FRANJA }));
  });

  test('con la alerta aceptada reserva y ocupa un lugar', async () => {
    const res = await reservar();
    expect(res.status).toBe(201);
    expect(prisma.franjaHoraria.updateMany.mock.calls[0][0].data).toEqual({ cupoOcupado: { increment: 1 } });
    expect(res.body.idAlerta).toBe(ID_ALERTA);
  });

  test('si la franja se llenó, no reserva', async () => {
    prisma.franjaHoraria.updateMany.mockResolvedValue({ count: 0 });
    const res = await reservar();
    expect(res.status).toBe(409);
    expect(prisma.turno.create).not.toHaveBeenCalled();
  });

  test('sin aceptar la alerta no puede reservar', async () => {
    prisma.alerta.findUnique.mockResolvedValue({ idDonante: ID_DONANTE, estado: 'enviada', convocatoria: { necesidad: NECESIDAD } });
    expect((await reservar()).status).toBe(409);
  });
});

describe('Turnos: reprogramar y cancelar (el lugar vuelve a quedar disponible)', () => {
  beforeEach(() => {
    prisma.turno.findFirst.mockResolvedValue(turno());
  });

  test('reprogramar ocupa la franja nueva y libera la vieja', async () => {
    prisma.franjaHoraria.findUnique.mockResolvedValue({ ...FRANJA, idFranjaHoraria: ID_OTRA_FRANJA, fecha: enDias(3) });
    const res = await request(app).patch(`/api/turnos/${ID_TURNO}`).set('Authorization', `Bearer ${TOKEN_DONANTE}`)
      .send({ idFranjaHoraria: ID_OTRA_FRANJA });

    expect(res.status).toBe(200);
    expect(prisma.franjaHoraria.updateMany.mock.calls[0][0].where.idFranjaHoraria).toBe(ID_OTRA_FRANJA);
    expect(prisma.franjaHoraria.update).toHaveBeenCalledWith({ where: { idFranjaHoraria: ID_FRANJA }, data: { cupoOcupado: { decrement: 1 } } });
    // Cambió el día: el recordatorio se vuelve a mandar
    expect(prisma.turno.update.mock.calls[0][0].data).toEqual({ idFranjaHoraria: ID_OTRA_FRANJA, recordatorioEnviadoEn: null });
  });

  test('no se puede reprogramar a otro hospital ni después de la fecha límite', async () => {
    const patch = () => request(app).patch(`/api/turnos/${ID_TURNO}`).set('Authorization', `Bearer ${TOKEN_DONANTE}`).send({ idFranjaHoraria: ID_OTRA_FRANJA });
    prisma.franjaHoraria.findUnique.mockResolvedValue({ ...FRANJA, idInstitucion: 'otra' });
    expect((await patch()).status).toBe(400);
    prisma.franjaHoraria.findUnique.mockResolvedValue({ ...FRANJA, fecha: enDias(30) });
    expect((await patch()).status).toBe(400);
    expect(prisma.franjaHoraria.updateMany).not.toHaveBeenCalled();
  });

  test('cancelar libera el lugar y marca la alerta como rechazada', async () => {
    const res = await request(app).post(`/api/turnos/${ID_TURNO}/cancelar`).set('Authorization', `Bearer ${TOKEN_DONANTE}`);
    expect(res.status).toBe(200);
    expect(res.body.estado).toBe('cancelado');
    expect(prisma.franjaHoraria.update).toHaveBeenCalledWith({ where: { idFranjaHoraria: ID_FRANJA }, data: { cupoOcupado: { decrement: 1 } } });
    expect(prisma.alerta.update.mock.calls[0][0].data.estado).toBe('rechazada');
  });

  test('un turno que ya pasó o no está reservado no se puede cambiar', async () => {
    prisma.turno.findFirst.mockResolvedValue(turno({ franjaHoraria: { ...FRANJA, fecha: enDias(-1) } }));
    expect((await request(app).post(`/api/turnos/${ID_TURNO}/cancelar`).set('Authorization', `Bearer ${TOKEN_DONANTE}`)).status).toBe(409);
    prisma.turno.findFirst.mockResolvedValue(turno({ estado: 'cancelado' }));
    expect((await request(app).post(`/api/turnos/${ID_TURNO}/cancelar`).set('Authorization', `Bearer ${TOKEN_DONANTE}`)).status).toBe(409);
  });

  test('solo busca turnos del propio donante', async () => {
    prisma.turno.findFirst.mockResolvedValue(null);
    const res = await request(app).post(`/api/turnos/${ID_TURNO}/cancelar`).set('Authorization', `Bearer ${TOKEN_DONANTE}`);
    expect(res.status).toBe(404);
    expect(prisma.turno.findFirst.mock.calls[0][0].where).toEqual({ idTurno: ID_TURNO, donante: { idUsuario: ID_USUARIO } });
  });
});

describe('Turnos del día para el hospital', () => {
  test('lista los turnos de una fecha de mi institución, sin los cancelados', async () => {
    prisma.turno.findMany.mockResolvedValue([turno({ donacion: null })]);
    const res = await request(app).get('/api/turnos?fecha=2099-01-10').set('Authorization', `Bearer ${TOKEN_INSTITUCION}`);
    expect(res.status).toBe(200);
    expect(res.body[0]).toMatchObject({ donante: { nombre: 'Ana', documento: '30111222' }, resultadoDonacion: null });
    const { where } = prisma.turno.findMany.mock.calls[0][0];
    expect(where).toEqual({ estado: { not: 'cancelado' }, franjaHoraria: { idInstitucion: ID_INSTITUCION, fecha: parsearFecha('2099-01-10') } });
  });
});

describe('DV-11: registro de la donación', () => {
  const registrar = (body) => request(app).post('/api/donaciones').set('Authorization', `Bearer ${TOKEN_INSTITUCION}`)
    .send({ idTurno: ID_TURNO, ...body });

  beforeEach(() => {
    // Turno de hoy
    prisma.turno.findFirst.mockResolvedValue(turno({ franjaHoraria: { ...FRANJA, fecha: HOY } }));
    registrarIngresoUnidad.mockResolvedValue({ unidad: { codigo: 'U-ABC', componente: 'globulos_rojos', fechaVencimiento: enDias(42) } });
    registrarDonacion.mockResolvedValue({ aptoDesde: '2099-03-01' });
  });

  test('si donó: crea la donación, la unidad (DV-5), suma a la necesidad y arranca la espera (DV-3)', async () => {
    const res = await registrar({ resultado: 'realizada' });

    expect(res.status).toBe(201);
    expect(prisma.donacion.create.mock.calls[0][0].data).toMatchObject({ resultado: 'realizada', idDonante: ID_DONANTE, idInstitucion: ID_INSTITUCION });
    expect(prisma.turno.update.mock.calls[0][0].data).toEqual({ estado: 'asistio' });
    expect(registrarIngresoUnidad).toHaveBeenCalledWith(
      expect.objectContaining({ idDonacion: 'don-1', grupoSanguineo: 'O', factorRh: 'negativo', componente: 'globulos_rojos' }),
      prisma
    );
    expect(prisma.necesidad.update.mock.calls[0][0].data).toEqual({ unidadesCubiertas: 2 });
    expect(registrarDonacion).toHaveBeenCalledWith(ID_DONANTE, expect.objectContaining({ grupoSanguineo: 'O', factorRh: 'negativo' }));
    expect(res.body).toMatchObject({ unidad: { codigo: 'U-ABC' }, aptoDesde: '2099-03-01' });
  });

  test('con la última unidad que faltaba, la necesidad queda cubierta', async () => {
    prisma.necesidad.findUnique.mockResolvedValue({ ...NECESIDAD, unidadesCubiertas: 2 });
    await registrar({ resultado: 'realizada' });
    expect(prisma.necesidad.update.mock.calls[0][0].data).toMatchObject({ unidadesCubiertas: 3, estado: 'cubierta' });
  });

  test('si no sabía su grupo, hay que confirmarlo y se completa', async () => {
    prisma.turno.findFirst.mockResolvedValue(turno({ franjaHoraria: { ...FRANJA, fecha: HOY }, donante: { grupoSanguineo: null, factorRh: null } }));
    expect((await registrar({ resultado: 'realizada' })).status).toBe(400);

    const res = await registrar({ resultado: 'realizada', grupoSanguineo: 'A', factorRh: 'positivo' });
    expect(res.status).toBe(201);
    expect(prisma.donacion.create.mock.calls.at(-1)[0].data).toMatchObject({ grupoConfirmado: 'A', factorRhConfirmado: 'positivo' });
    expect(registrarDonacion).toHaveBeenCalledWith(ID_DONANTE, expect.objectContaining({ grupoSanguineo: 'A', factorRh: 'positivo' }));
  });

  test('si lo rechaza el control médico: queda registrado pero no genera unidad ni espera', async () => {
    const res = await registrar({ resultado: 'rechazada' });
    expect(res.status).toBe(201);
    expect(prisma.donacion.create.mock.calls[0][0].data.resultado).toBe('rechazada');
    expect(registrarIngresoUnidad).not.toHaveBeenCalled();
    expect(registrarDonacion).not.toHaveBeenCalled();
  });

  test('si no se presentó: turno ausente, sin donación ni penalización', async () => {
    const res = await registrar({ resultado: 'ausente' });
    expect(res.status).toBe(201);
    expect(res.body.estadoTurno).toBe('ausente');
    expect(prisma.donacion.create).not.toHaveBeenCalled();
    expect(registrarDonacion).not.toHaveBeenCalled();
  });

  test('no se registra dos veces ni un turno de otro día futuro', async () => {
    prisma.turno.findFirst.mockResolvedValue(turno({ estado: 'asistio' }));
    expect((await registrar({ resultado: 'realizada' })).status).toBe(409);
    prisma.turno.findFirst.mockResolvedValue(turno()); // franja en 2 días
    expect((await registrar({ resultado: 'realizada' })).status).toBe(409);
    expect(prisma.donacion.create).not.toHaveBeenCalled();
  });

  test('un resultado inválido da 400', async () => {
    expect((await registrar({ resultado: 'quizas' })).status).toBe(400);
  });
});

describe('DV-11: historial del donante', () => {
  test('muestra dónde donó, cuándo y desde qué fecha puede volver', async () => {
    prisma.donacion.findMany.mockResolvedValue([
      { idDonacion: 'd1', fecha: new Date('2026-09-01'), resultado: 'realizada', institucion: { nombre: 'Hospital Central', direccion: 'Av. 1' } },
      { idDonacion: 'd2', fecha: new Date('2026-05-01'), resultado: 'rechazada', institucion: { nombre: 'Hospital Central', direccion: 'Av. 1' } },
    ]);
    obtenerHabilitacion.mockResolvedValue({ habilitado: false, aptoDesde: '2026-10-27', motivo: 'Donó sangre' });

    const res = await request(app).get('/api/donaciones/mias').set('Authorization', `Bearer ${TOKEN_DONANTE}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ habilitado: false, aptoDesde: '2026-10-27', totalDonaciones: 1 });
    expect(res.body.donaciones[0]).toMatchObject({ fecha: '2026-09-01', institucion: { nombre: 'Hospital Central' } });
  });
});

describe('Recordatorio el día anterior', () => {
  test('manda el correo con la dirección y cómo llegar, y no lo repite', async () => {
    prisma.turno.findMany.mockResolvedValue([{
      idTurno: ID_TURNO,
      franjaHoraria: { ...FRANJA, institucion: { nombre: 'Hospital Central', direccion: 'Av. Argentina 1400', latitud: '-38.95', longitud: '-68.05' } },
      donante: { idUsuario: ID_USUARIO, avisoPush: false, usuario: { email: 'ana@mail.com', nombre: 'Ana' } },
    }]);

    expect(await enviarRecordatorios()).toBe(1);
    expect(enviarCorreoRecordatorio).toHaveBeenCalledWith(expect.objectContaining({
      direccion: 'Av. Argentina 1400',
      horaInicio: '08:00',
      enlaceMapa: 'https://www.google.com/maps/search/?api=1&query=-38.95,-68.05',
    }));
    // Solo turnos de mañana que todavía no lo recibieron
    expect(prisma.turno.findMany.mock.calls[0][0].where).toMatchObject({ estado: 'reservado', recordatorioEnviadoEn: null });
    expect(prisma.turno.update.mock.calls[0][0].data.recordatorioEnviadoEn).toBeInstanceOf(Date);
  });

  test('la fecha se escribe con el día de la semana', () => {
    expect(fechaConDia('2026-10-21')).toBe('miércoles 21/10');
  });
});
