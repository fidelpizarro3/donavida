process.env.JWT_SECRET = 'secreto_de_prueba_para_los_tests_de_estadisticas';

const request = require('supertest');
const jwt = require('jsonwebtoken');

// Base simulada: cada test decide qué devuelve cada consulta
jest.mock('../src/lib/prisma', () => ({
  usuarioInstitucion: { findFirst: jest.fn() },
  necesidad: { findMany: jest.fn() },
  alerta: { findMany: jest.fn() },
  movimientoUnidad: { findMany: jest.fn() },
}));

const prisma = require('../src/lib/prisma');
const app = require('../src/app');
const { mesesEntre } = require('../src/services/estadisticas');

const ID_USUARIO = '11111111-1111-4111-8111-111111111111';
const ID_INSTITUCION = '44444444-4444-4444-8444-444444444444';
const OTRA_INSTITUCION = '55555555-5555-4555-8555-555555555555';

const tokenDe = (rol) => jwt.sign({ sub: ID_USUARIO, rol }, process.env.JWT_SECRET, { expiresIn: '1h' });
const pedir = (query = '', rol = 'institucion') =>
  request(app).get(`/api/estadisticas/convocatorias${query}`).set('Authorization', `Bearer ${tokenDe(rol)}`);

const PERIODO = '?desde=2026-10-01&hasta=2026-11-19';

// Fechas en hora de Argentina (UTC-3)
const momento = (texto) => new Date(`${texto}-03:00`);
const necesidad = (estado, creadaEn, datos = {}) => ({ estado, creadaEn: momento(creadaEn), cerradaEn: null, cubiertaCon: null, ...datos });
const cubierta = (creadaEn, cerradaEn, cubiertaCon) => necesidad('cubierta', creadaEn, { cerradaEn: momento(cerradaEn), cubiertaCon });

beforeEach(() => {
  jest.resetAllMocks();
  prisma.usuarioInstitucion.findFirst.mockResolvedValue({ idUsuario: ID_USUARIO, idInstitucion: ID_INSTITUCION });
  prisma.necesidad.findMany.mockResolvedValue([]);
  prisma.alerta.findMany.mockResolvedValue([]);
  prisma.movimientoUnidad.findMany.mockResolvedValue([]);
});

describe('Quién puede ver las estadísticas', () => {
  test('sin token responde 401 y un donante no puede verlas', async () => {
    expect((await request(app).get('/api/estadisticas/convocatorias')).status).toBe(401);
    expect((await pedir('', 'donante')).status).toBe(403);
  });

  test('una institución no aprobada responde 403', async () => {
    prisma.usuarioInstitucion.findFirst.mockResolvedValue(null);
    expect((await pedir()).status).toBe(403);
  });

  test('una institución ve solo las suyas, aunque mande otro idInstitucion', async () => {
    const res = await pedir(`${PERIODO}&idInstitucion=${OTRA_INSTITUCION}`);
    expect(res.body.alcance).toBe('institucion');
    expect(prisma.necesidad.findMany.mock.calls[0][0].where.idInstitucion).toBe(ID_INSTITUCION);
    expect(prisma.movimientoUnidad.findMany.mock.calls[0][0].where.idInstitucionOrigen).toBe(ID_INSTITUCION);
  });

  test('criterio: la administración ve toda la red', async () => {
    const res = await pedir(PERIODO, 'admin');
    expect(res.status).toBe(200);
    expect(res.body.alcance).toBe('red');
    expect(prisma.necesidad.findMany.mock.calls[0][0].where.idInstitucion).toBeUndefined();
  });

  test('el admin también puede ver una institución sola', async () => {
    const res = await pedir(`${PERIODO}&idInstitucion=${OTRA_INSTITUCION}`, 'admin');
    expect(res.body.alcance).toBe('institucion');
    expect(prisma.necesidad.findMany.mock.calls[0][0].where.idInstitucion).toBe(OTRA_INSTITUCION);
  });
});

describe('Criterio: se puede filtrar por período y por grupo sanguíneo', () => {
  test('el período va de las 0 hs del primer día a las 0 hs del día siguiente al último, en hora de Argentina', async () => {
    await pedir(PERIODO);
    const { creadaEn } = prisma.necesidad.findMany.mock.calls[0][0].where;
    expect(creadaEn.gte.toISOString()).toBe('2026-10-01T03:00:00.000Z');
    expect(creadaEn.lt.toISOString()).toBe('2026-11-20T03:00:00.000Z');
  });

  test('sin período toma los últimos 3 meses', async () => {
    const res = await pedir();
    const dias = (new Date(res.body.periodo.hasta) - new Date(res.body.periodo.desde)) / 86400000;
    expect(dias).toBe(89);
  });

  test('el grupo se aplica a las necesidades, a las alertas y a las vencidas', async () => {
    const res = await pedir(`${PERIODO}&grupoSanguineo=O&factorRh=negativo`);
    expect(res.body.filtros).toEqual({ grupoSanguineo: 'O', factorRh: 'negativo' });
    expect(prisma.necesidad.findMany.mock.calls[0][0].where).toMatchObject({ grupoSanguineo: 'O', factorRh: 'negativo' });
    expect(prisma.alerta.findMany.mock.calls[0][0].where.convocatoria.necesidad).toMatchObject({ grupoSanguineo: 'O' });
    expect(prisma.movimientoUnidad.findMany.mock.calls[0][0].where.unidad).toEqual({ grupoSanguineo: 'O', factorRh: 'negativo' });
  });

  test('filtros inválidos responden 400', async () => {
    expect((await pedir('?desde=ayer&hasta=2026-11-19')).status).toBe(400);
    expect((await pedir('?desde=2026-11-19&hasta=2026-10-01')).status).toBe(400);
    expect((await pedir(`${PERIODO}&grupoSanguineo=Z`)).status).toBe(400);
    expect((await pedir(`${PERIODO}&factorRh=neutro`)).status).toBe(400);
    expect((await pedir(`${PERIODO}&idInstitucion=abc`, 'admin')).status).toBe(400);
  });
});

describe('Cuántas necesidades cubrió, en cuánto tiempo y cómo', () => {
  beforeEach(() => {
    prisma.necesidad.findMany.mockResolvedValue([
      cubierta('2026-10-05T10:00', '2026-10-05T16:00', 'donantes'), // 6 horas
      cubierta('2026-10-20T08:00', '2026-10-22T08:00', 'transferencia'), // 48 horas
      cubierta('2026-11-02T09:00', '2026-11-02T21:00', 'ambas'), // 12 horas
      necesidad('vencida', '2026-11-03T09:00'),
      necesidad('cerrada_manual', '2026-11-04T09:00'),
      necesidad('abierta', '2026-11-18T09:00'),
    ]);
  });

  test('cuenta las publicadas, las cubiertas y el porcentaje', async () => {
    const { body } = await pedir(PERIODO);
    expect(body.necesidades).toEqual({
      publicadas: 6, cubiertas: 3, porcentajeCubiertas: 50, vencidasSinCubrir: 1, cerradasAMano: 1, abiertas: 1,
    });
  });

  test('calcula el tiempo hasta cubrir: promedio, el más rápido y el más lento', async () => {
    const { body } = await pedir(PERIODO);
    expect(body.tiempoHastaCubrir).toEqual({ horasPromedio: 22, horasMinimo: 6, horasMaximo: 48 });
  });

  test('criterio: cuántas se cubrieron con donantes y cuántas con transferencia', async () => {
    const { body } = await pedir(PERIODO);
    expect(body.cubiertasCon).toEqual({ donantes: 1, transferencia: 1, ambas: 1, sinRegistrar: 0 });
  });

  test('una cubierta antes de que se guardara cómo (TAREA-13) cuenta como "sin registrar"', async () => {
    prisma.necesidad.findMany.mockResolvedValue([cubierta('2026-10-05T10:00', '2026-10-05T16:00', null)]);
    const { body } = await pedir(PERIODO);
    expect(body.cubiertasCon).toEqual({ donantes: 0, transferencia: 0, ambas: 0, sinRegistrar: 1 });
  });

  test('arma un resumen por mes, con los meses sin datos en cero', async () => {
    prisma.movimientoUnidad.findMany.mockResolvedValue([
      { ocurridoEn: momento('2026-11-10T03:00'), unidad: { grupoSanguineo: 'A', factorRh: 'positivo' } },
    ]);
    const { body } = await pedir('?desde=2026-09-15&hasta=2026-11-19');
    expect(body.porMes).toEqual([
      { mes: '2026-09', publicadas: 0, cubiertas: 0, vencidas: 0 },
      { mes: '2026-10', publicadas: 2, cubiertas: 2, vencidas: 0 },
      { mes: '2026-11', publicadas: 4, cubiertas: 1, vencidas: 1 },
    ]);
  });
});

describe('Cuántos donantes respondieron y cuántas unidades se vencieron', () => {
  test('cuenta convocados, respuestas y asistencia', async () => {
    prisma.alerta.findMany.mockResolvedValue([
      { estado: 'aceptada', turno: { estado: 'asistio' } },
      { estado: 'aceptada', turno: { estado: 'ausente' } },
      { estado: 'aceptada', turno: null },
      { estado: 'rechazada', turno: null },
      { estado: 'enviada', turno: null },
    ]);
    const { body } = await pedir(PERIODO);
    expect(body.donantes).toEqual({
      convocados: 5, respondieron: 4, porcentajeRespondieron: 80, aceptaron: 3, fueronAlTurno: 1, faltaronAlTurno: 1,
    });
    // Solo las alertas que le llegaron al donante
    expect(prisma.alerta.findMany.mock.calls[0][0].where.enviadaEn).toEqual({ not: null });
  });

  test('criterio: cuenta las unidades vencidas en el período, por grupo', async () => {
    const vencida = (grupoSanguineo, factorRh) => ({ ocurridoEn: momento('2026-11-01T03:00'), unidad: { grupoSanguineo, factorRh } });
    prisma.movimientoUnidad.findMany.mockResolvedValue([vencida('O', 'positivo'), vencida('A', 'negativo'), vencida('O', 'positivo')]);

    const { body } = await pedir(PERIODO);

    expect(body.unidadesVencidas).toEqual({
      total: 3,
      porGrupo: [{ grupoSanguineo: 'O', factorRh: 'positivo', cantidad: 2 }, { grupoSanguineo: 'A', factorRh: 'negativo', cantidad: 1 }],
    });
    expect(prisma.movimientoUnidad.findMany.mock.calls[0][0].where.tipo).toBe('vencimiento');
  });

  test('sin datos no rompe: los porcentajes y el tiempo quedan en null', async () => {
    const { body } = await pedir(PERIODO);
    expect(body.necesidades.porcentajeCubiertas).toBeNull();
    expect(body.donantes.porcentajeRespondieron).toBeNull();
    expect(body.tiempoHastaCubrir).toBeNull();
    expect(body.unidadesVencidas).toEqual({ total: 0, porGrupo: [] });
  });
});

describe('Meses del período', () => {
  test('incluye el primero y el último, y pasa de año', () => {
    expect(mesesEntre('2026-11-20', '2027-02-01')).toEqual(['2026-11', '2026-12', '2027-01', '2027-02']);
    expect(mesesEntre('2026-11-01', '2026-11-30')).toEqual(['2026-11']);
  });
});
