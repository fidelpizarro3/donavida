process.env.JWT_SECRET = 'secreto_de_prueba_para_los_tests_de_convocatorias';

const request = require('supertest');
const jwt = require('jsonwebtoken');

// Base simulada: cada test decide qué devuelve cada consulta
jest.mock('../src/lib/prisma', () => ({
  usuarioInstitucion: { findFirst: jest.fn() },
  necesidad: { findFirst: jest.fn(), updateMany: jest.fn() },
  donante: { findMany: jest.fn() },
  franjaHoraria: { count: jest.fn(), findMany: jest.fn() },
  convocatoria: { create: jest.fn() },
  alerta: { createMany: jest.fn(), findMany: jest.fn() },
  $transaction: jest.fn(),
}));

const prisma = require('../src/lib/prisma');
const app = require('../src/app');
const { distanciaKm } = require('../src/services/distancia');
const { gruposCompatibles } = require('../src/services/compatibilidad');
const { elegirCanal } = require('../src/services/convocatoria');

const ID_USUARIO = '11111111-1111-4111-8111-111111111111';
const ID_INSTITUCION = '44444444-4444-4444-8444-444444444444';
const ID_NECESIDAD = '77777777-7777-4777-8777-777777777777';
const ID_CONVOCATORIA = '88888888-8888-4888-8888-888888888888';
const ID_CERCA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ID_LEJOS = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ID_COMPATIBLE = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

const tokenDe = (rol, sub = ID_USUARIO) => jwt.sign({ sub, rol }, process.env.JWT_SECRET, { expiresIn: '1h' });
const TOKEN_INSTITUCION = tokenDe('institucion');

// Hospital en el Obelisco
const INSTITUCION = { latitud: '-34.603722', longitud: '-58.381592' };

const NECESIDAD = {
  idNecesidad: ID_NECESIDAD,
  idInstitucion: ID_INSTITUCION,
  grupoSanguineo: 'A',
  factorRh: 'positivo',
  componente: 'globulos_rojos',
  unidadesSolicitadas: 3,
  unidadesCubiertas: 1,
  urgencia: 'normal',
  fechaLimite: new Date('2099-12-31'),
  estado: 'abierta',
  institucion: INSTITUCION,
};

const donante = (idDonante, datos) => ({
  idDonante,
  grupoSanguineo: 'A',
  factorRh: 'positivo',
  latitud: '-34.608147',
  longitud: '-58.370226',
  avisoPush: true,
  avisoEmail: true,
  avisoWhatsapp: false,
  _count: { alertas: 0 }, // alertas recibidas este mes
  topeAlertasMes: 4,
  usuario: { nombre: 'Ana', apellido: 'Paz' },
  ...datos,
});

// Cerca = Plaza de Mayo (~1 km). Lejos = La Plata (~50 km). Compatible = O+ en Plaza de Mayo
const DONANTE_CERCA = donante(ID_CERCA);
const DONANTE_LEJOS = donante(ID_LEJOS, { latitud: '-34.921450', longitud: '-57.954530' });
const DONANTE_COMPATIBLE = donante(ID_COMPATIBLE, { grupoSanguineo: 'O' });

const proponer = (body = {}, token = TOKEN_INSTITUCION, id = ID_NECESIDAD) =>
  request(app).post(`/api/necesidades/${id}/convocatoria/propuesta`).set('Authorization', `Bearer ${token}`).send(body);

const confirmar = (body, token = TOKEN_INSTITUCION, id = ID_NECESIDAD) =>
  request(app).post(`/api/necesidades/${id}/convocatoria`).set('Authorization', `Bearer ${token}`).send(body);

beforeEach(() => {
  jest.resetAllMocks();
  prisma.$transaction.mockImplementation((operaciones) => operaciones(prisma));
  prisma.usuarioInstitucion.findFirst.mockResolvedValue({ idUsuario: ID_USUARIO, idInstitucion: ID_INSTITUCION });
  prisma.necesidad.findFirst.mockResolvedValue(NECESIDAD);
  prisma.necesidad.updateMany.mockResolvedValue({ count: 0 });
  prisma.franjaHoraria.count.mockResolvedValue(0); // sin agenda cargada: cupo = unidades que faltan (2)
  prisma.donante.findMany.mockResolvedValue([DONANTE_LEJOS, DONANTE_COMPATIBLE, DONANTE_CERCA]);
  prisma.convocatoria.create.mockImplementation(async ({ data }) => ({
    idConvocatoria: ID_CONVOCATORIA,
    creadaEn: new Date(),
    ...data,
  }));
  prisma.alerta.createMany.mockResolvedValue({ count: 0 });
  prisma.alerta.findMany.mockResolvedValue([]); // el envío (TAREA-11) se prueba en alertas.test.js
});

describe('Funciones de ayuda', () => {
  test('distancia: Obelisco a Plaza de Mayo da alrededor de 1 km', () => {
    const km = distanciaKm(-34.603722, -58.381592, -34.608147, -58.370226);
    expect(km).toBeGreaterThan(0.9);
    expect(km).toBeLessThan(1.5);
  });

  test('distancia: el mismo punto da 0', () => {
    expect(distanciaKm(-34.6, -58.4, -34.6, -58.4)).toBe(0);
  });

  test('glóbulos rojos para A+: sirven A y O, positivos y negativos', () => {
    const grupos = gruposCompatibles({ grupoSanguineo: 'A', factorRh: 'positivo', componente: 'globulos_rojos' });
    expect(grupos).toHaveLength(4);
    expect(grupos[0]).toEqual({ grupoSanguineo: 'A', factorRh: 'positivo' }); // el exacto va primero
    expect(grupos).toContainEqual({ grupoSanguineo: 'O', factorRh: 'negativo' });
  });

  test('un paciente negativo solo recibe negativo', () => {
    const grupos = gruposCompatibles({ grupoSanguineo: 'O', factorRh: 'negativo', componente: 'globulos_rojos' });
    expect(grupos).toEqual([{ grupoSanguineo: 'O', factorRh: 'negativo' }]);
  });

  test('plaquetas y sangre entera piden el mismo grupo ABO', () => {
    const grupos = gruposCompatibles({ grupoSanguineo: 'AB', factorRh: 'positivo', componente: 'plaquetas' });
    expect(grupos.every((g) => g.grupoSanguineo === 'AB')).toBe(true);
  });

  test('canal: urgente va al celular, normal por correo, y respeta lo que el donante apagó', () => {
    expect(elegirCanal(DONANTE_CERCA, 'urgente')).toBe('push');
    expect(elegirCanal(DONANTE_CERCA, 'normal')).toBe('email');
    expect(elegirCanal({ ...DONANTE_CERCA, avisoEmail: false }, 'normal')).toBe('push');
    expect(elegirCanal({ avisoPush: false, avisoEmail: false, avisoWhatsapp: false }, 'normal')).toBeNull();
  });
});

describe('Criterio 1: parte de una necesidad abierta', () => {
  test('una necesidad cubierta no se puede convocar', async () => {
    prisma.necesidad.findFirst.mockResolvedValue({ ...NECESIDAD, estado: 'cubierta' });
    const res = await proponer();
    expect(res.status).toBe(409);
    expect(prisma.donante.findMany).not.toHaveBeenCalled();
  });

  test('una necesidad de otra institución da 404', async () => {
    prisma.necesidad.findFirst.mockResolvedValue(null);
    const res = await proponer();
    expect(res.status).toBe(404);
  });

  test('un id que no es uuid da 404 sin consultar la base', async () => {
    const res = await proponer({}, TOKEN_INSTITUCION, 'cualquier-cosa');
    expect(res.status).toBe(404);
    expect(prisma.necesidad.findFirst).not.toHaveBeenCalled();
  });

  test('un donante no puede pedir propuestas', async () => {
    const res = await proponer({}, tokenDe('donante'));
    expect(res.status).toBe(403);
  });

  test('sin token da 401', async () => {
    const res = await request(app).post(`/api/necesidades/${ID_NECESIDAD}/convocatoria/propuesta`);
    expect(res.status).toBe(401);
  });
});

describe('Criterio 2: filtra por compatibilidad, habilitación y alertas no pausadas', () => {
  test('la consulta pide grupo compatible, habilitación, sin pausa y con ubicación', async () => {
    await proponer();
    const { where } = prisma.donante.findMany.mock.calls[0][0];
    expect(where.cuestionarios).toBeDefined(); // filtroDonantesHabilitados (TAREA-3)
    expect(where.diferimientos).toBeDefined();
    expect(where.AND[0].OR).toContainEqual({ grupoSanguineo: 'O', factorRh: 'negativo' });
    expect(where.AND[1].OR).toContainEqual({ alertasPausadasHasta: null });
    expect(where.latitud).toEqual({ not: null });
  });

  test('quien llegó a su tope de alertas del mes no entra', async () => {
    prisma.donante.findMany.mockResolvedValue([donante(ID_CERCA, { _count: { alertas: 4 } })]);
    const res = await proponer();
    expect(res.body.sugeridos).toHaveLength(0);
  });

  test('quien apagó todos los avisos no entra', async () => {
    prisma.donante.findMany.mockResolvedValue([donante(ID_CERCA, { avisoPush: false, avisoEmail: false })]);
    const res = await proponer();
    expect(res.body.sugeridos).toHaveLength(0);
  });

  test('quien está fuera del radio no entra', async () => {
    const res = await proponer({ radioKm: 10 });
    const ids = [...res.body.sugeridos, ...res.body.otrosCandidatos].map((c) => c.idDonante);
    expect(ids).not.toContain(ID_LEJOS);
  });

  test('un radio inválido da 400', async () => {
    const res = await proponer({ radioKm: -5 });
    expect(res.status).toBe(400);
  });
});

describe('Criterio 3: ordena por compatibilidad y distancia, con el motivo', () => {
  test('primero grupo exacto por cercanía, después compatible', async () => {
    prisma.franjaHoraria.count.mockResolvedValue(0);
    prisma.necesidad.findFirst.mockResolvedValue({ ...NECESIDAD, unidadesSolicitadas: 10 });
    const res = await proponer({ radioKm: 100 });
    expect(res.status).toBe(200);
    expect(res.body.sugeridos.map((c) => c.idDonante)).toEqual([ID_CERCA, ID_LEJOS, ID_COMPATIBLE]);
  });

  test('cada persona trae el motivo por el que entró', async () => {
    const res = await proponer();
    const [primero] = res.body.sugeridos;
    expect(primero.motivo).toMatch(/Mismo grupo \(A\+\)/);
    expect(primero.motivo).toMatch(/km/);
    expect(primero.canal).toBe('email');
  });
});

describe('Criterio 4: la cantidad se ajusta al cupo libre', () => {
  test('sin agenda cargada, el cupo son las unidades que faltan', async () => {
    const res = await proponer({ radioKm: 100 });
    expect(res.body.cupo).toEqual({ disponible: 2, segun: 'unidades_faltantes' });
    expect(res.body.sugeridos).toHaveLength(2);
    expect(res.body.otrosCandidatos).toHaveLength(1);
  });

  test('con agenda, el cupo es lo libre de las franjas', async () => {
    prisma.franjaHoraria.count.mockResolvedValue(2);
    prisma.franjaHoraria.findMany.mockResolvedValue([
      { cupoTotal: 5, cupoOcupado: 4 },
      { cupoTotal: 3, cupoOcupado: 3 },
    ]);
    const res = await proponer({ radioKm: 100 });
    expect(res.body.cupo).toEqual({ disponible: 1, segun: 'agenda' });
    expect(res.body.sugeridos).toHaveLength(1);
  });

  test('la propuesta no guarda nada', async () => {
    await proponer();
    expect(prisma.convocatoria.create).not.toHaveBeenCalled();
    expect(prisma.alerta.createMany).not.toHaveBeenCalled();
  });
});

describe('Criterios 5 y 6: el hospital ajusta la lista y confirma', () => {
  test('puede sacar al sugerido y agregar a otro candidato', async () => {
    const res = await confirmar({ radioKm: 100, idsDonantes: [ID_COMPATIBLE] });
    expect(res.status).toBe(201);
    expect(res.body.alertas.map((a) => a.idDonante)).toEqual([ID_COMPATIBLE]);
  });

  test('guarda la convocatoria con sus criterios y quién la confirmó', async () => {
    const res = await confirmar({ radioKm: 15, idsDonantes: [ID_CERCA] });
    expect(res.status).toBe(201);
    const data = prisma.convocatoria.create.mock.calls[0][0].data;
    expect(data).toEqual({
      idNecesidad: ID_NECESIDAD,
      radioKm: 15,
      cupoDisponible: 2,
      estado: 'enviada',
      idUsuarioConfirmador: ID_USUARIO,
    });
    const alertas = prisma.alerta.createMany.mock.calls[0][0].data;
    expect(alertas).toHaveLength(1);
    expect(alertas[0]).toMatchObject({ idConvocatoria: ID_CONVOCATORIA, idDonante: ID_CERCA, canal: 'email' });
    expect(alertas[0].motivo).toMatch(/Mismo grupo/);
  });

  test('no se puede elegir más personas que el cupo', async () => {
    const res = await confirmar({ radioKm: 100, idsDonantes: [ID_CERCA, ID_LEJOS, ID_COMPATIBLE] });
    expect(res.status).toBe(409);
    expect(prisma.convocatoria.create).not.toHaveBeenCalled();
  });

  test('una persona que ya no es candidata se rechaza', async () => {
    const otro = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
    const res = await confirmar({ radioKm: 100, idsDonantes: [otro] });
    expect(res.status).toBe(409);
    expect(prisma.convocatoria.create).not.toHaveBeenCalled();
  });

  test('lista vacía, ids inválidos o repetidos dan 400', async () => {
    expect((await confirmar({ idsDonantes: [] })).status).toBe(400);
    expect((await confirmar({ idsDonantes: ['x'] })).status).toBe(400);
    expect((await confirmar({ idsDonantes: [ID_CERCA, ID_CERCA] })).status).toBe(400);
    expect(prisma.convocatoria.create).not.toHaveBeenCalled();
  });
});
