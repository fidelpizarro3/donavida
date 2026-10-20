process.env.JWT_SECRET = 'secreto_de_prueba_para_los_tests_de_alertas';
// Con estas claves el push queda "configurado" (web-push está simulado, no se manda nada de verdad)
process.env.VAPID_PUBLIC_KEY = 'clave-publica-de-prueba';
process.env.VAPID_PRIVATE_KEY = 'clave-privada-de-prueba';

const request = require('supertest');
const jwt = require('jsonwebtoken');

// Base, correo y push simulados: cada test decide qué devuelven
jest.mock('../src/lib/prisma', () => ({
  alerta: { findMany: jest.fn(), findFirst: jest.fn(), update: jest.fn(), count: jest.fn() },
  donante: { update: jest.fn() },
  suscripcionPush: { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
}));
jest.mock('../src/lib/correo', () => ({ enviarCorreoAlerta: jest.fn() }));
jest.mock('web-push', () => ({ setVapidDetails: jest.fn(), sendNotification: jest.fn() }));

const prisma = require('../src/lib/prisma');
const { enviarCorreoAlerta } = require('../src/lib/correo');
const webpush = require('web-push');
const app = require('../src/app');
const { enviarAlertasDeConvocatoria, inicioDelMes } = require('../src/services/alertas');

const ID_USUARIO = '11111111-1111-4111-8111-111111111111';
const ID_DONANTE = '22222222-2222-4222-8222-222222222222';
const ID_ALERTA = '33333333-3333-4333-8333-333333333333';
const ID_CONVOCATORIA = '88888888-8888-4888-8888-888888888888';

const tokenDe = (rol, sub = ID_USUARIO) => jwt.sign({ sub, rol }, process.env.JWT_SECRET, { expiresIn: '1h' });
const TOKEN_DONANTE = tokenDe('donante');

const NECESIDAD = {
  grupoSanguineo: 'O',
  factorRh: 'negativo',
  componente: 'globulos_rojos',
  urgencia: 'normal',
  fechaLimite: new Date('2099-12-31'),
  estado: 'abierta',
  institucion: { idInstitucion: '44444444-4444-4444-8444-444444444444', nombre: 'Hospital Central', direccion: 'Av. Argentina 1400' },
};

// Una alerta como la devuelve la base, con todo lo que se incluye
const alerta = (datos = {}, donante = {}, necesidad = {}) => ({
  idAlerta: ID_ALERTA,
  idConvocatoria: ID_CONVOCATORIA,
  idDonante: ID_DONANTE,
  canal: 'email',
  estado: 'pendiente',
  motivo: 'Mismo grupo (O−). Habilitado para donar. A 2.5 km de la institución.',
  distanciaKm: '2.50', // Prisma devuelve los Decimal como texto
  enviadaEn: null,
  respondidaEn: null,
  donante: {
    idDonante: ID_DONANTE,
    idUsuario: ID_USUARIO,
    avisoEmail: true,
    topeAlertasMes: 4,
    alertasPausadasHasta: null,
    usuario: { email: 'ana@mail.com', nombre: 'Ana' },
    ...donante,
  },
  convocatoria: { necesidad: { ...NECESIDAD, ...necesidad } },
  ...datos,
});

const SUSCRIPCION = { idSuscripcionPush: 'sus-1', endpoint: 'https://push.ejemplo/abc', p256dh: 'p', auth: 'a' };

beforeEach(() => {
  jest.resetAllMocks();
  prisma.alerta.count.mockResolvedValue(0);
  prisma.alerta.update.mockImplementation(async ({ data }) => ({ ...alerta(), ...data }));
  prisma.donante.update.mockResolvedValue({});
  prisma.suscripcionPush.findMany.mockResolvedValue([]);
  webpush.sendNotification.mockResolvedValue({});
  enviarCorreoAlerta.mockResolvedValue();
});

// Lo que se guardó en la alerta en la última actualización
const alertaGuardada = () => prisma.alerta.update.mock.calls.at(-1)[0].data;

describe('Envío: urgente → push; normal → correo', () => {
  test('una alerta normal se manda por correo con el motivo, el hospital y la distancia', async () => {
    prisma.alerta.findMany.mockResolvedValue([alerta()]);
    const resultado = await enviarAlertasDeConvocatoria(ID_CONVOCATORIA);

    expect(resultado).toEqual([{ idDonante: ID_DONANTE, estado: 'enviada', canal: 'email' }]);
    expect(enviarCorreoAlerta).toHaveBeenCalledWith(expect.objectContaining({
      email: 'ana@mail.com',
      institucion: 'Hospital Central',
      direccion: 'Av. Argentina 1400',
      distanciaKm: 2.5,
      motivo: expect.stringContaining('Mismo grupo'),
    }));
    expect(alertaGuardada()).toMatchObject({ estado: 'enviada', canal: 'email' });
    expect(alertaGuardada().enviadaEn).toBeInstanceOf(Date);
  });

  test('una alerta urgente se manda por push a cada suscripción y no por correo', async () => {
    prisma.alerta.findMany.mockResolvedValue([alerta({ canal: 'push' }, {}, { urgencia: 'urgente' })]);
    prisma.suscripcionPush.findMany.mockResolvedValue([SUSCRIPCION, { ...SUSCRIPCION, idSuscripcionPush: 'sus-2' }]);
    const [resultado] = await enviarAlertasDeConvocatoria(ID_CONVOCATORIA);

    expect(resultado.canal).toBe('push');
    expect(webpush.sendNotification).toHaveBeenCalledTimes(2);
    const aviso = JSON.parse(webpush.sendNotification.mock.calls[0][1]);
    expect(aviso.titulo).toMatch(/Urgente: Hospital Central/);
    expect(aviso.cuerpo).toMatch(/A 2.5 km/);
    expect(enviarCorreoAlerta).not.toHaveBeenCalled();
  });

  test('si no tiene el celular suscripto, el correo es el respaldo', async () => {
    prisma.alerta.findMany.mockResolvedValue([alerta({ canal: 'push' })]);
    const [resultado] = await enviarAlertasDeConvocatoria(ID_CONVOCATORIA);
    expect(resultado.canal).toBe('email');
    expect(enviarCorreoAlerta).toHaveBeenCalled();
  });

  test('una suscripción que el navegador dio de baja (410) se desactiva', async () => {
    prisma.alerta.findMany.mockResolvedValue([alerta({ canal: 'push' })]);
    prisma.suscripcionPush.findMany.mockResolvedValue([SUSCRIPCION]);
    webpush.sendNotification.mockRejectedValue({ statusCode: 410 });
    await enviarAlertasDeConvocatoria(ID_CONVOCATORIA);
    expect(prisma.suscripcionPush.update).toHaveBeenCalledWith({ where: { idSuscripcionPush: 'sus-1' }, data: { activo: false } });
  });

  test('si apagó el correo y no hay push, la alerta queda pendiente', async () => {
    prisma.alerta.findMany.mockResolvedValue([alerta({ canal: 'push' }, { avisoEmail: false })]);
    const [resultado] = await enviarAlertasDeConvocatoria(ID_CONVOCATORIA);
    expect(resultado.estado).toBe('pendiente');
    expect(enviarCorreoAlerta).not.toHaveBeenCalled();
  });

  test('si falla el correo de una, sigue con las demás', async () => {
    prisma.alerta.findMany.mockResolvedValue([alerta(), alerta({ idAlerta: 'otra', idDonante: 'otro' })]);
    enviarCorreoAlerta.mockRejectedValueOnce(new Error('SMTP caído'));
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const resultado = await enviarAlertasDeConvocatoria(ID_CONVOCATORIA);
    expect(resultado.map((r) => r.estado)).toEqual(['pendiente', 'enviada']);
    console.error.mockRestore();
  });
});

describe('Tope de alertas por mes y alertas pausadas', () => {
  test('se cuentan las alertas enviadas desde el inicio del mes', async () => {
    prisma.alerta.findMany.mockResolvedValue([alerta()]);
    await enviarAlertasDeConvocatoria(ID_CONVOCATORIA);
    expect(prisma.alerta.count).toHaveBeenCalledWith({ where: { idDonante: ID_DONANTE, enviadaEn: { gte: inicioDelMes() } } });
    // Día 1 a las 00:00 de Argentina = día 1 a las 03:00 UTC
    expect(inicioDelMes().getUTCDate()).toBe(1);
    expect(inicioDelMes().getUTCHours()).toBe(3);
  });

  test('al enviar, se actualiza el resumen del mes en el donante', async () => {
    prisma.alerta.count.mockResolvedValue(2);
    prisma.alerta.findMany.mockResolvedValue([alerta()]);
    await enviarAlertasDeConvocatoria(ID_CONVOCATORIA);
    expect(prisma.donante.update).toHaveBeenCalledWith({ where: { idDonante: ID_DONANTE }, data: { alertasMesActual: 3 } });
  });

  test('si ya llegó a su tope del mes, la alerta se cancela y no se manda', async () => {
    prisma.alerta.count.mockResolvedValue(4);
    prisma.alerta.findMany.mockResolvedValue([alerta()]);
    const [resultado] = await enviarAlertasDeConvocatoria(ID_CONVOCATORIA);
    expect(resultado.estado).toBe('cancelada');
    expect(enviarCorreoAlerta).not.toHaveBeenCalled();
  });

  test('si pausó las alertas, se cancela y no se manda', async () => {
    prisma.alerta.findMany.mockResolvedValue([alerta({}, { alertasPausadasHasta: new Date('2099-01-01') })]);
    const [resultado] = await enviarAlertasDeConvocatoria(ID_CONVOCATORIA);
    expect(resultado.estado).toBe('cancelada');
    expect(enviarCorreoAlerta).not.toHaveBeenCalled();
  });
});

describe('GET /api/alertas/mias', () => {
  test('devuelve las alertas del donante con motivo, hospital y distancia', async () => {
    prisma.alerta.findMany.mockResolvedValue([alerta({ estado: 'enviada', enviadaEn: new Date() })]);
    const res = await request(app).get('/api/alertas/mias').set('Authorization', `Bearer ${TOKEN_DONANTE}`);

    expect(res.status).toBe(200);
    expect(res.body[0]).toMatchObject({
      idAlerta: ID_ALERTA,
      motivo: expect.stringContaining('Mismo grupo'),
      distanciaKm: 2.5,
      puedeResponder: true,
      institucion: { nombre: 'Hospital Central' },
    });
    // Solo las suyas y solo las que ya le llegaron
    const { where } = prisma.alerta.findMany.mock.calls[0][0];
    expect(where.donante).toEqual({ idUsuario: ID_USUARIO });
    expect(where.estado.in).not.toContain('pendiente');
  });

  test('una institución no puede verlas', async () => {
    const res = await request(app).get('/api/alertas/mias').set('Authorization', `Bearer ${tokenDe('institucion')}`);
    expect(res.status).toBe(403);
  });
});

describe('Aceptar o rechazar', () => {
  const responder = (accion, id = ID_ALERTA) =>
    request(app).post(`/api/alertas/${id}/${accion}`).set('Authorization', `Bearer ${TOKEN_DONANTE}`);

  test('aceptar la marca como aceptada y le dice que reserve turno', async () => {
    prisma.alerta.findFirst.mockResolvedValue(alerta({ estado: 'enviada' }));
    const res = await responder('aceptar');
    expect(res.status).toBe(200);
    expect(alertaGuardada()).toMatchObject({ estado: 'aceptada' });
    expect(alertaGuardada().respondidaEn).toBeInstanceOf(Date);
    expect(res.body.siguientePaso).toMatch(/Reservá un turno en Hospital Central/);
  });

  test('rechazar la marca como rechazada', async () => {
    prisma.alerta.findFirst.mockResolvedValue(alerta({ estado: 'enviada' }));
    const res = await responder('rechazar');
    expect(res.status).toBe(200);
    expect(alertaGuardada()).toMatchObject({ estado: 'rechazada' });
  });

  test('solo busca alertas del propio donante', async () => {
    prisma.alerta.findFirst.mockResolvedValue(null);
    const res = await responder('aceptar');
    expect(res.status).toBe(404);
    expect(prisma.alerta.findFirst.mock.calls[0][0].where).toEqual({ idAlerta: ID_ALERTA, donante: { idUsuario: ID_USUARIO } });
  });

  test('no se puede responder dos veces', async () => {
    prisma.alerta.findFirst.mockResolvedValue(alerta({ estado: 'rechazada' }));
    const res = await responder('aceptar');
    expect(res.status).toBe(409);
    expect(prisma.alerta.update).not.toHaveBeenCalled();
  });

  test('si la necesidad ya se cubrió, no se puede aceptar', async () => {
    prisma.alerta.findFirst.mockResolvedValue(alerta({ estado: 'enviada' }, {}, { estado: 'cubierta' }));
    const res = await responder('aceptar');
    expect(res.status).toBe(409);
  });

  test('una alerta que todavía no se mandó no existe para el donante', async () => {
    prisma.alerta.findFirst.mockResolvedValue(alerta({ estado: 'pendiente' }));
    expect((await responder('aceptar')).status).toBe(404);
  });

  test('un id que no es uuid da 404 sin consultar la base', async () => {
    expect((await responder('aceptar', 'cualquier-cosa')).status).toBe(404);
    expect(prisma.alerta.findFirst).not.toHaveBeenCalled();
  });
});

describe('Suscripción push', () => {
  const suscribir = (body, token = TOKEN_DONANTE) =>
    request(app).post('/api/push/suscripcion').set('Authorization', `Bearer ${token}`).send(body);
  const BODY = { endpoint: 'https://push.ejemplo/abc', keys: { p256dh: 'p', auth: 'a' } };

  test('la clave pública es pública', async () => {
    const res = await request(app).get('/api/push/clave-publica');
    expect(res.body).toEqual({ clavePublica: 'clave-publica-de-prueba' });
  });

  test('guarda una suscripción nueva', async () => {
    prisma.suscripcionPush.findFirst.mockResolvedValue(null);
    const res = await suscribir(BODY);
    expect(res.status).toBe(201);
    expect(prisma.suscripcionPush.create).toHaveBeenCalledWith({
      data: { idUsuario: ID_USUARIO, endpoint: BODY.endpoint, p256dh: 'p', auth: 'a', activo: true },
    });
  });

  test('si el navegador ya estaba suscripto, la reactiva sin duplicar', async () => {
    prisma.suscripcionPush.findFirst.mockResolvedValue(SUSCRIPCION);
    await suscribir(BODY);
    expect(prisma.suscripcionPush.create).not.toHaveBeenCalled();
    expect(prisma.suscripcionPush.update).toHaveBeenCalled();
  });

  test('datos inválidos dan 400', async () => {
    expect((await suscribir({ endpoint: 'http://inseguro', keys: BODY.keys })).status).toBe(400);
    expect((await suscribir({ endpoint: BODY.endpoint })).status).toBe(400);
  });

  test('sin token da 401', async () => {
    const res = await request(app).post('/api/push/suscripcion').send(BODY);
    expect(res.status).toBe(401);
  });
});
