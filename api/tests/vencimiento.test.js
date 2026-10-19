process.env.JWT_SECRET = 'secreto_de_prueba_para_los_tests_de_vencimiento';

const request = require('supertest');
const jwt = require('jsonwebtoken');

// Base simulada: cada test decide qué devuelve cada consulta.
// delete/deleteMany están solo para comprobar que nunca se borra nada (criterio 4).
jest.mock('../src/lib/prisma', () => ({
  usuarioInstitucion: { findFirst: jest.fn() },
  unidadSangre: {
    updateManyAndReturn: jest.fn(),
    updateMany: jest.fn(),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
  },
  movimientoUnidad: { create: jest.fn(), createMany: jest.fn(), delete: jest.fn(), deleteMany: jest.fn() },
  $transaction: jest.fn(),
}));

const prisma = require('../src/lib/prisma');
const app = require('../src/app');
const { obtenerFechaHoy, obtenerFechaHoyArgentina } = require('../src/utils/validaciones');
const { formatearFecha, parsearFecha } = require('../src/utils/formateadores');
const { marcarVencidas, programarVencimientoUnidades } = require('../src/services/unidades');

const HOY = obtenerFechaHoy();
const en = (dias) => formatearFecha(new Date(parsearFecha(HOY).getTime() + dias * 86400000));
const UNA_HORA = 60 * 60 * 1000;

const ID_USUARIO = '11111111-1111-4111-8111-111111111111';
const ID_INSTITUCION = '44444444-4444-4444-8444-444444444444';
const ID_UNIDAD = '55555555-5555-4555-8555-555555555555';
const OTRA_UNIDAD = '66666666-6666-4666-8666-666666666666';

const TOKEN = jwt.sign({ sub: ID_USUARIO, rol: 'institucion' }, process.env.JWT_SECRET, { expiresIn: '1h' });
const descartar = (id = ID_UNIDAD, token = TOKEN) =>
  request(app).post(`/api/unidades/${id}/descartar`).set('Authorization', `Bearer ${token}`);
const usar = (id = ID_UNIDAD) =>
  request(app).patch(`/api/unidades/${id}/usar`).set('Authorization', `Bearer ${TOKEN}`);

// Una unidad como la devuelve la base
const unidad = (estado, vence = -1) => ({
  idUnidadSangre: ID_UNIDAD,
  codigo: 'U-PRUEBA0001',
  idInstitucion: ID_INSTITUCION,
  idDonacion: null,
  grupoSanguineo: 'O',
  factorRh: 'negativo',
  componente: 'globulos_rojos',
  fechaExtraccion: parsearFecha(en(vence - 42)),
  fechaVencimiento: parsearFecha(en(vence)),
  estado,
});

const nadaSeBorro = () => {
  for (const tabla of [prisma.unidadSangre, prisma.movimientoUnidad]) {
    expect(tabla.delete).not.toHaveBeenCalled();
    expect(tabla.deleteMany).not.toHaveBeenCalled();
  }
};

beforeEach(() => {
  jest.resetAllMocks();
  prisma.$transaction.mockImplementation((operaciones) => operaciones(prisma));
  prisma.usuarioInstitucion.findFirst.mockResolvedValue({ idUsuario: ID_USUARIO, idInstitucion: ID_INSTITUCION });
  prisma.unidadSangre.updateManyAndReturn.mockResolvedValue([]);
  prisma.movimientoUnidad.create.mockResolvedValue({});
  prisma.movimientoUnidad.createMany.mockResolvedValue({ count: 0 });
});

afterEach(() => {
  jest.useRealTimers();
});

describe('Criterio 1: la tarea automática pasa a "vencida" lo que venció antes de hoy (hora Argentina)', () => {
  test('la fecha de hoy es la de Argentina, aunque en UTC ya sea el día siguiente', () => {
    // 23:30 del 19/10 en Argentina = 02:30 del 20/10 en UTC
    expect(obtenerFechaHoyArgentina(new Date('2026-10-20T02:30:00Z'))).toBe('2026-10-19');
    // Medianoche en Argentina = 03:00 UTC: ahí sí cambia el día
    expect(obtenerFechaHoyArgentina(new Date('2026-10-20T03:00:00Z'))).toBe('2026-10-20');
  });

  test('marca las disponibles con vencimiento ANTERIOR a hoy: la que vence hoy todavía sirve', async () => {
    await marcarVencidas();
    expect(prisma.unidadSangre.updateManyAndReturn).toHaveBeenCalledWith({
      where: { estado: 'disponible', fechaVencimiento: { lt: parsearFecha(obtenerFechaHoyArgentina()) } },
      data: { estado: 'vencida' },
      select: { idUnidadSangre: true, idInstitucion: true },
    });
  });

  test('a las 23:30 de Argentina usa la fecha argentina, no la de UTC', async () => {
    jest.useFakeTimers({ now: new Date('2026-10-20T02:30:00Z'), doNotFake: ['nextTick', 'setImmediate'] });
    await marcarVencidas();
    const { where } = prisma.unidadSangre.updateManyAndReturn.mock.calls[0][0];
    expect(where.fechaVencimiento.lt).toEqual(new Date('2026-10-19T00:00:00.000Z'));
  });

  test('solo toca las disponibles (no las reservadas, usadas ni descartadas)', async () => {
    await marcarVencidas();
    expect(prisma.unidadSangre.updateManyAndReturn.mock.calls[0][0].where.estado).toBe('disponible');
  });

  test('devuelve cuántas marcó', async () => {
    prisma.unidadSangre.updateManyAndReturn.mockResolvedValue([
      { idUnidadSangre: ID_UNIDAD, idInstitucion: ID_INSTITUCION },
      { idUnidadSangre: OTRA_UNIDAD, idInstitucion: ID_INSTITUCION },
    ]);
    expect(await marcarVencidas()).toBe(2);
  });
});

describe('Criterio 2: una unidad vencida no puede asignarse ni transferirse', () => {
  // Asignar y transferir todavía no existen (funcionalidades 12 y 13): van a exigir unidades "disponible",
  // y una vencida ya no lo está. Hoy la única operación que saca una unidad del stock es "usar".
  test('usar una unidad vencida → 409 y no se mueve', async () => {
    prisma.unidadSangre.updateMany.mockResolvedValue({ count: 0 });
    prisma.unidadSangre.findFirst.mockResolvedValue(unidad('vencida'));
    const res = await usar();
    expect(res.status).toBe(409);
    expect(res.body.error.mensaje).toContain('está vencida');
    expect(prisma.movimientoUnidad.create).not.toHaveBeenCalled();
  });

  test('una vez marcada deja de estar "disponible", que es lo único que se puede usar', async () => {
    prisma.unidadSangre.updateMany.mockResolvedValue({ count: 1 });
    prisma.unidadSangre.findUnique.mockResolvedValue(unidad('usada', 10));
    await usar();
    expect(prisma.unidadSangre.updateMany.mock.calls[0][0].where.estado).toBe('disponible');
  });
});

describe('Criterio 3: la institución confirma el descarte → "descartada"', () => {
  test('una vencida pasa a descartada', async () => {
    prisma.unidadSangre.updateMany.mockResolvedValue({ count: 1 });
    prisma.unidadSangre.findUnique.mockResolvedValue(unidad('descartada'));
    const res = await descartar();
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ idUnidadSangre: ID_UNIDAD, estado: 'descartada' });
    expect(prisma.unidadSangre.updateMany).toHaveBeenCalledWith({
      where: { idUnidadSangre: ID_UNIDAD, idInstitucion: ID_INSTITUCION, estado: 'vencida' },
      data: { estado: 'descartada' },
    });
  });

  test('antes de descartar corre el vencimiento, para no esperar a la próxima hora', async () => {
    prisma.unidadSangre.updateMany.mockResolvedValue({ count: 1 });
    prisma.unidadSangre.findUnique.mockResolvedValue(unidad('descartada'));
    await descartar();
    const marco = prisma.unidadSangre.updateManyAndReturn.mock.invocationCallOrder[0];
    const descarto = prisma.unidadSangre.updateMany.mock.invocationCallOrder[0];
    expect(marco).toBeLessThan(descarto);
  });

  test.each([
    ['disponible y vigente', 'disponible', 'esta está disponible'],
    ['ya descartada', 'descartada', 'esta está descartada'],
    ['usada', 'usada', 'esta está usada'],
  ])('una unidad %s → 409', async (_caso, estado, texto) => {
    prisma.unidadSangre.updateMany.mockResolvedValue({ count: 0 });
    prisma.unidadSangre.findFirst.mockResolvedValue(unidad(estado, 10));
    const res = await descartar();
    expect(res.status).toBe(409);
    expect(res.body.error.mensaje).toContain(texto);
    expect(prisma.movimientoUnidad.create).not.toHaveBeenCalled();
  });

  test('dos confirmaciones a la vez: una descarta y la otra choca', async () => {
    prisma.unidadSangre.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    prisma.unidadSangre.findUnique.mockResolvedValue(unidad('descartada'));
    prisma.unidadSangre.findFirst.mockResolvedValue(unidad('descartada'));
    const [a, b] = await Promise.all([descartar(), descartar()]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect(prisma.movimientoUnidad.create).toHaveBeenCalledTimes(1);
  });

  test('una unidad que no es de mi institución → 404', async () => {
    prisma.unidadSangre.updateMany.mockResolvedValue({ count: 0 });
    prisma.unidadSangre.findFirst.mockResolvedValue(null);
    expect((await descartar()).status).toBe(404);
  });

  test('un id mal formado → 400', async () => {
    expect((await descartar('abc')).status).toBe(400);
    expect(prisma.unidadSangre.updateMany).not.toHaveBeenCalled();
  });

  test('sin institución aprobada → 403', async () => {
    prisma.usuarioInstitucion.findFirst.mockResolvedValue(null);
    expect((await descartar()).status).toBe(403);
    expect(prisma.unidadSangre.updateMany).not.toHaveBeenCalled();
  });

  test('un donante → 403', async () => {
    const tokenDonante = jwt.sign({ sub: ID_USUARIO, rol: 'donante' }, process.env.JWT_SECRET);
    expect((await descartar(ID_UNIDAD, tokenDonante)).status).toBe(403);
  });
});

describe('Criterio 4: el vencimiento y el descarte quedan como movimientos, sin borrar nada', () => {
  test('un movimiento de vencimiento por cada unidad marcada, hecho por el sistema', async () => {
    prisma.unidadSangre.updateManyAndReturn.mockResolvedValue([
      { idUnidadSangre: ID_UNIDAD, idInstitucion: ID_INSTITUCION },
      { idUnidadSangre: OTRA_UNIDAD, idInstitucion: ID_INSTITUCION },
    ]);
    await marcarVencidas();
    const base = { tipo: 'vencimiento', estadoAnterior: 'disponible', estadoNuevo: 'vencida', idInstitucionOrigen: ID_INSTITUCION, idUsuario: null };
    expect(prisma.movimientoUnidad.createMany).toHaveBeenCalledWith({
      data: [{ idUnidadSangre: ID_UNIDAD, ...base }, { idUnidadSangre: OTRA_UNIDAD, ...base }],
    });
    nadaSeBorro();
  });

  test('si no venció nada, no registra movimientos', async () => {
    await marcarVencidas();
    expect(prisma.movimientoUnidad.createMany).not.toHaveBeenCalled();
  });

  test('el estado y sus movimientos cambian en la misma transacción', async () => {
    await marcarVencidas();
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  test('el descarte deja su movimiento, hecho por el usuario', async () => {
    prisma.unidadSangre.updateMany.mockResolvedValue({ count: 1 });
    prisma.unidadSangre.findUnique.mockResolvedValue(unidad('descartada'));
    await descartar();
    expect(prisma.movimientoUnidad.create).toHaveBeenCalledWith({
      data: {
        idUnidadSangre: ID_UNIDAD,
        tipo: 'descarte',
        estadoAnterior: 'vencida',
        estadoNuevo: 'descartada',
        idInstitucionOrigen: ID_INSTITUCION,
        idUsuario: ID_USUARIO,
      },
    });
    nadaSeBorro();
  });
});

describe('Criterio 5: la tarea automática no corre en los tests (NODE_ENV=test)', () => {
  test('Jest corre con NODE_ENV=test', () => {
    expect(process.env.NODE_ENV).toBe('test');
  });

  test('con NODE_ENV=test no se programa ni toca la base', () => {
    jest.useFakeTimers();
    expect(programarVencimientoUnidades()).toBeNull();
    jest.advanceTimersByTime(3 * UNA_HORA);
    expect(prisma.unidadSangre.updateManyAndReturn).not.toHaveBeenCalled();
  });

  test('fuera de los tests corre al arrancar y después una vez por hora', () => {
    jest.useFakeTimers();
    const anterior = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    try {
      const intervalo = programarVencimientoUnidades();
      expect(intervalo).not.toBeNull();
      expect(prisma.unidadSangre.updateManyAndReturn).toHaveBeenCalledTimes(1); // al arrancar
      jest.advanceTimersByTime(UNA_HORA - 1);
      expect(prisma.unidadSangre.updateManyAndReturn).toHaveBeenCalledTimes(1);
      jest.advanceTimersByTime(1);
      expect(prisma.unidadSangre.updateManyAndReturn).toHaveBeenCalledTimes(2); // a la hora
      clearInterval(intervalo);
    } finally {
      process.env.NODE_ENV = anterior;
    }
  });
});
