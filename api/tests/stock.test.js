process.env.JWT_SECRET = 'secreto_de_prueba_para_los_tests_de_stock';

const request = require('supertest');
const jwt = require('jsonwebtoken');

// Base simulada: cada test decide qué devuelve cada consulta
jest.mock('../src/lib/prisma', () => ({
  usuarioInstitucion: { findFirst: jest.fn() },
  unidadSangre: { findMany: jest.fn(), findFirst: jest.fn(), findUnique: jest.fn(), updateMany: jest.fn() },
  movimientoUnidad: { create: jest.fn() },
  stockMinimo: { findMany: jest.fn(), upsert: jest.fn() },
  $transaction: jest.fn(),
}));

const prisma = require('../src/lib/prisma');
const app = require('../src/app');
const { obtenerFechaHoy } = require('../src/utils/validaciones');
const { formatearFecha, parsearFecha } = require('../src/utils/formateadores');
const { calcularDiasRestantes, estaPorVencer, DIAS_AVISO_VENCIMIENTO } = require('../src/services/unidades');

const HOY = obtenerFechaHoy();
const sumar = (fecha, dias) => formatearFecha(new Date(parsearFecha(fecha).getTime() + dias * 86400000));
const en = (dias) => sumar(HOY, dias);

const ID_USUARIO = '11111111-1111-4111-8111-111111111111';
const ID_INSTITUCION = '44444444-4444-4444-8444-444444444444';
const OTRA_INSTITUCION = '77777777-7777-4777-8777-777777777777';
const ID_UNIDAD = '55555555-5555-4555-8555-555555555555';

const TOKEN = jwt.sign({ sub: ID_USUARIO, rol: 'institucion' }, process.env.JWT_SECRET, { expiresIn: '1h' });
const pedir = (metodo, ruta, body) => {
  const pedido = request(app)[metodo](`/api/unidades${ruta}`).set('Authorization', `Bearer ${TOKEN}`);
  return body === undefined ? pedido : pedido.send(body);
};

// Una unidad como la devuelve la base. "vence" son los días que le faltan (negativo = ya venció)
let siguiente = 0;
function unidad({ grupo = 'O', factor = 'negativo', componente = 'globulos_rojos', estado = 'disponible', vence = 30 } = {}) {
  siguiente += 1;
  return {
    idUnidadSangre: `55555555-5555-4555-8555-${String(siguiente).padStart(12, '0')}`,
    codigo: `U-PRUEBA${String(siguiente).padStart(4, '0')}`,
    idInstitucion: ID_INSTITUCION,
    idDonacion: null,
    grupoSanguineo: grupo,
    factorRh: factor,
    componente,
    fechaExtraccion: parsearFecha(en(vence - 42)),
    fechaVencimiento: parsearFecha(en(vence)),
    estado,
  };
}

beforeEach(() => {
  jest.resetAllMocks();
  prisma.$transaction.mockImplementation((operaciones) => operaciones(prisma));
  prisma.usuarioInstitucion.findFirst.mockResolvedValue({ idUsuario: ID_USUARIO, idInstitucion: ID_INSTITUCION });
  prisma.unidadSangre.findMany.mockResolvedValue([]);
  prisma.stockMinimo.findMany.mockResolvedValue([]);
});

describe('Criterio 1: totales por grupo + factor y por componente', () => {
  const filaDe = (resumen, grupo, factor, componente) =>
    resumen.find((f) => f.grupoSanguineo === grupo && f.factorRh === factor && f.componente === componente);

  test('cuenta disponibles, por vencer, usadas y vencidas de cada combinación', async () => {
    prisma.unidadSangre.findMany.mockResolvedValue([
      unidad({ vence: 30 }),
      unidad({ vence: 3 }), // por vencer
      unidad({ estado: 'usada' }),
      unidad({ estado: 'vencida', vence: -2 }),
      unidad({ grupo: 'A', factor: 'positivo', componente: 'plaquetas', vence: 4 }),
    ]);
    const res = await pedir('get', '/resumen');
    expect(res.status).toBe(200);
    expect(filaDe(res.body, 'O', 'negativo', 'globulos_rojos')).toMatchObject({
      disponibles: 2, porVencer: 1, usadas: 1, vencidas: 1, reservadas: 0, descartadas: 0,
    });
    expect(filaDe(res.body, 'A', 'positivo', 'plaquetas')).toMatchObject({ disponibles: 1, porVencer: 0 });
  });

  test('O+ y O− van en filas separadas', async () => {
    prisma.unidadSangre.findMany.mockResolvedValue([unidad({ factor: 'positivo' }), unidad({ factor: 'negativo' })]);
    const res = await pedir('get', '/resumen');
    expect(res.body).toHaveLength(2);
  });

  test('una "disponible" que ya venció (antes de la TAREA-7) se cuenta como vencida', async () => {
    prisma.unidadSangre.findMany.mockResolvedValue([unidad({ vence: -1 })]);
    const res = await pedir('get', '/resumen');
    expect(res.body[0]).toMatchObject({ disponibles: 0, vencidas: 1 });
  });

  test('solo cuenta las unidades de mi institución', async () => {
    await pedir('get', '/resumen');
    expect(prisma.unidadSangre.findMany).toHaveBeenCalledWith({ where: { idInstitucion: ID_INSTITUCION } });
  });

  test('sin institución aprobada → 403', async () => {
    prisma.usuarioInstitucion.findFirst.mockResolvedValue(null);
    const res = await pedir('get', '/resumen');
    expect(res.status).toBe(403);
    expect(prisma.unidadSangre.findMany).not.toHaveBeenCalled();
  });
});

describe('Criterio 2: filtros por grupo, componente y estado', () => {
  test('sin filtros trae todas las de mi institución, la que vence primero arriba', async () => {
    await pedir('get', '');
    const consulta = prisma.unidadSangre.findMany.mock.calls[0][0];
    expect(consulta.where).toMatchObject({ idInstitucion: ID_INSTITUCION });
    expect(consulta.where.estado).toBeUndefined();
    expect(consulta.orderBy).toEqual({ fechaVencimiento: 'asc' });
  });

  test('los filtros se aplican en la consulta', async () => {
    await pedir('get', '?grupoSanguineo=O&factorRh=negativo&componente=plaquetas&estado=disponible');
    expect(prisma.unidadSangre.findMany.mock.calls[0][0].where).toEqual({
      idInstitucion: ID_INSTITUCION, grupoSanguineo: 'O', factorRh: 'negativo', componente: 'plaquetas', estado: 'disponible',
    });
  });

  test.each([
    ['estado', '?estado=perdida'],
    ['grupoSanguineo', '?grupoSanguineo=C'],
    ['factorRh', '?factorRh=%2B'],
    ['componente', '?componente=plasma'],
  ])('un %s inventado → 400 sin consultar', async (campo, consulta) => {
    const res = await pedir('get', consulta);
    expect(res.status).toBe(400);
    expect(res.body.error.mensaje).toContain(campo);
    expect(prisma.unidadSangre.findMany).not.toHaveBeenCalled();
  });

  test('sin institución aprobada → 403', async () => {
    prisma.usuarioInstitucion.findFirst.mockResolvedValue(null);
    expect((await pedir('get', '')).status).toBe(403);
  });
});

describe('Criterio 3: aviso anticipado de las unidades próximas a vencer', () => {
  test('días restantes: 0 si vence hoy, negativo si ya venció', () => {
    expect(calcularDiasRestantes(HOY, HOY)).toBe(0);
    expect(calcularDiasRestantes(en(1), HOY)).toBe(1);
    expect(calcularDiasRestantes(en(-1), HOY)).toBe(-1);
  });

  test('glóbulos rojos avisan desde 7 días antes y plaquetas desde 2', () => {
    expect(DIAS_AVISO_VENCIMIENTO).toEqual({ globulos_rojos: 7, plaquetas: 2 });
    expect(estaPorVencer('globulos_rojos', 7)).toBe(true);
    expect(estaPorVencer('globulos_rojos', 8)).toBe(false);
    expect(estaPorVencer('plaquetas', 2)).toBe(true);
    expect(estaPorVencer('plaquetas', 3)).toBe(false);
    expect(estaPorVencer('plaquetas', 0)).toBe(true); // vence hoy: todavía se puede usar
    expect(estaPorVencer('plaquetas', -1)).toBe(false); // ya venció: no es "por vencer"
  });

  test('el listado marca las disponibles por vencer y trae los días restantes', async () => {
    const pronto = unidad({ vence: 2 });
    const lejos = unidad({ vence: 20 });
    const usadaPronto = unidad({ estado: 'usada', vence: 2 });
    prisma.unidadSangre.findMany.mockResolvedValue([pronto, usadaPronto, lejos]);
    const res = await pedir('get', '');
    const porId = Object.fromEntries(res.body.map((u) => [u.idUnidadSangre, u]));
    expect(porId[pronto.idUnidadSangre]).toMatchObject({ diasRestantes: 2, porVencer: true });
    expect(porId[lejos.idUnidadSangre]).toMatchObject({ diasRestantes: 20, porVencer: false });
    // Una usada ya no hay que apurarse a usarla
    expect(porId[usadaPronto.idUnidadSangre].porVencer).toBe(false);
  });
});

describe('Criterio 4: detalle de la unidad con su recorrido', () => {
  const MOVIMIENTOS = [
    {
      idMovimientoUnidad: 'm1', tipo: 'ingreso', estadoAnterior: null, estadoNuevo: 'disponible',
      institucionOrigen: null, institucionDestino: { idInstitucion: ID_INSTITUCION, nombre: 'Hospital Central' },
      usuario: { nombre: 'Juan', apellido: 'Pérez' }, ocurridoEn: new Date('2026-10-15T13:32:00Z'),
    },
    {
      idMovimientoUnidad: 'm2', tipo: 'vencimiento', estadoAnterior: 'disponible', estadoNuevo: 'vencida',
      institucionOrigen: null, institucionDestino: null, usuario: null, ocurridoEn: new Date('2026-11-27T03:00:00Z'),
    },
  ];

  test('devuelve la unidad, cuánto le queda y sus movimientos', async () => {
    const u = unidad({ vence: 5 });
    prisma.unidadSangre.findFirst.mockResolvedValue({ ...u, movimientos: MOVIMIENTOS });
    const res = await pedir('get', `/${u.idUnidadSangre}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ idUnidadSangre: u.idUnidadSangre, codigo: u.codigo, diasRestantes: 5, porVencer: true, idDonacion: null });
    expect(res.body.movimientos).toEqual([
      {
        idMovimientoUnidad: 'm1', tipo: 'ingreso', estadoAnterior: null, estadoNuevo: 'disponible',
        institucionOrigen: null, institucionDestino: { idInstitucion: ID_INSTITUCION, nombre: 'Hospital Central' },
        usuario: { nombre: 'Juan', apellido: 'Pérez' }, ocurridoEn: '2026-10-15T13:32:00.000Z',
      },
      {
        idMovimientoUnidad: 'm2', tipo: 'vencimiento', estadoAnterior: 'disponible', estadoNuevo: 'vencida',
        institucionOrigen: null, institucionDestino: null, usuario: null, ocurridoEn: '2026-11-27T03:00:00.000Z',
      },
    ]);
  });

  test('busca solo en mi institución, con los movimientos del primero al último y sin datos privados del usuario', async () => {
    prisma.unidadSangre.findFirst.mockResolvedValue(null);
    await pedir('get', `/${ID_UNIDAD}`);
    const consulta = prisma.unidadSangre.findFirst.mock.calls[0][0];
    expect(consulta.where).toEqual({ idUnidadSangre: ID_UNIDAD, idInstitucion: ID_INSTITUCION });
    expect(consulta.include.movimientos.orderBy).toEqual({ ocurridoEn: 'asc' });
    expect(consulta.include.movimientos.include.usuario).toEqual({ select: { nombre: true, apellido: true } });
  });

  test('una unidad que no existe o es de otra institución → 404', async () => {
    prisma.unidadSangre.findFirst.mockResolvedValue(null);
    const res = await pedir('get', `/${ID_UNIDAD}`);
    expect(res.status).toBe(404);
    expect(res.body.error.codigo).toBe('NO_ENCONTRADO');
  });

  test('un id mal formado → 400 sin consultar', async () => {
    const res = await pedir('get', '/no-es-un-uuid');
    expect(res.status).toBe(400);
    expect(prisma.unidadSangre.findFirst).not.toHaveBeenCalled();
  });

  test('/resumen no se confunde con el id de una unidad', async () => {
    const res = await pedir('get', '/resumen');
    expect(res.status).toBe(200);
    expect(prisma.unidadSangre.findFirst).not.toHaveBeenCalled();
  });

  test('sin institución aprobada → 403', async () => {
    prisma.usuarioInstitucion.findFirst.mockResolvedValue(null);
    expect((await pedir('get', `/${ID_UNIDAD}`)).status).toBe(403);
  });

  test('un donante → 403', async () => {
    const tokenDonante = jwt.sign({ sub: ID_USUARIO, rol: 'donante' }, process.env.JWT_SECRET);
    const res = await request(app).get(`/api/unidades/${ID_UNIDAD}`).set('Authorization', `Bearer ${tokenDonante}`);
    expect(res.status).toBe(403);
  });
});

describe('Criterio 5: una unidad no se puede asignar dos veces (usar)', () => {
  test('el chequeo y el cambio van en una sola operación, y queda el movimiento de uso', async () => {
    const u = unidad();
    prisma.unidadSangre.updateMany.mockResolvedValue({ count: 1 });
    prisma.unidadSangre.findUnique.mockResolvedValue({ ...u, estado: 'usada' });
    const res = await pedir('patch', `/${u.idUnidadSangre}/usar`);
    expect(res.status).toBe(200);
    expect(res.body.estado).toBe('usada');
    expect(prisma.unidadSangre.updateMany).toHaveBeenCalledWith({
      where: { idUnidadSangre: u.idUnidadSangre, idInstitucion: ID_INSTITUCION, estado: 'disponible', fechaVencimiento: { gte: parsearFecha(HOY) } },
      data: { estado: 'usada' },
    });
    expect(prisma.movimientoUnidad.create.mock.calls[0][0].data).toMatchObject({
      idUnidadSangre: u.idUnidadSangre, tipo: 'uso', estadoAnterior: 'disponible', estadoNuevo: 'usada', idUsuario: ID_USUARIO,
    });
  });

  test('dos pedidos a la vez: el primero la usa y el segundo choca', async () => {
    const u = unidad();
    prisma.unidadSangre.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    prisma.unidadSangre.findUnique.mockResolvedValue({ ...u, estado: 'usada' });
    prisma.unidadSangre.findFirst.mockResolvedValue({ ...u, estado: 'usada' });
    const [a, b] = await Promise.all([pedir('patch', `/${u.idUnidadSangre}/usar`), pedir('patch', `/${u.idUnidadSangre}/usar`)]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect(prisma.movimientoUnidad.create).toHaveBeenCalledTimes(1);
  });

  test.each([
    ['reservada', { estado: 'reservada' }, 'está reservada'],
    ['vencida aunque figure disponible', { vence: -1 }, 'está vencida'],
  ])('una unidad %s → 409 y no se mueve', async (_caso, datos, texto) => {
    prisma.unidadSangre.updateMany.mockResolvedValue({ count: 0 });
    prisma.unidadSangre.findFirst.mockResolvedValue(unidad(datos));
    const res = await pedir('patch', `/${ID_UNIDAD}/usar`);
    expect(res.status).toBe(409);
    expect(res.body.error.mensaje).toContain(texto);
    expect(prisma.movimientoUnidad.create).not.toHaveBeenCalled();
  });

  test('una unidad que no es de mi institución → 404', async () => {
    prisma.unidadSangre.updateMany.mockResolvedValue({ count: 0 });
    prisma.unidadSangre.findFirst.mockResolvedValue(null);
    expect((await pedir('patch', `/${ID_UNIDAD}/usar`)).status).toBe(404);
  });
});

describe('Criterio 6: la institución define su stock mínimo por grupo y componente', () => {
  const MINIMO = { grupoSanguineo: 'O', factorRh: 'negativo', componente: 'plaquetas', unidadesMinimas: 4 };

  test('crea o reemplaza el mínimo de esa combinación', async () => {
    prisma.stockMinimo.upsert.mockResolvedValue({ idInstitucion: ID_INSTITUCION, ...MINIMO });
    const res = await pedir('put', '/stock-minimo', MINIMO);
    expect(res.status).toBe(200);
    expect(res.body).toEqual(MINIMO);
    const clave = { idInstitucion: ID_INSTITUCION, grupoSanguineo: 'O', factorRh: 'negativo', componente: 'plaquetas' };
    expect(prisma.stockMinimo.upsert).toHaveBeenCalledWith({
      where: { idInstitucion_grupoSanguineo_factorRh_componente: clave },
      create: { ...clave, unidadesMinimas: 4 },
      update: { unidadesMinimas: 4 },
    });
  });

  test('el resumen muestra el mínimo aunque no haya unidades, y avisa si está por debajo', async () => {
    prisma.unidadSangre.findMany.mockResolvedValue([unidad({ grupo: 'A', factor: 'positivo' })]);
    prisma.stockMinimo.findMany.mockResolvedValue([
      { grupoSanguineo: 'O', factorRh: 'negativo', componente: 'plaquetas', unidadesMinimas: 3 },
      { grupoSanguineo: 'A', factorRh: 'positivo', componente: 'globulos_rojos', unidadesMinimas: 1 },
    ]);
    const res = await pedir('get', '/resumen');
    const sinUnidades = res.body.find((f) => f.grupoSanguineo === 'O');
    const alcanza = res.body.find((f) => f.grupoSanguineo === 'A');
    expect(sinUnidades).toMatchObject({ disponibles: 0, minimo: 3, bajoMinimo: true });
    expect(alcanza).toMatchObject({ disponibles: 1, minimo: 1, bajoMinimo: false });
  });

  test.each([
    ['negativo', -1],
    ['con decimales', 1.5],
    ['como texto', '4'],
    ['demasiado grande', 1001],
  ])('unidadesMinimas %s → 400', async (_caso, valor) => {
    const res = await pedir('put', '/stock-minimo', { ...MINIMO, unidadesMinimas: valor });
    expect(res.status).toBe(400);
    expect(prisma.stockMinimo.upsert).not.toHaveBeenCalled();
  });

  test('un grupo inválido → 400', async () => {
    expect((await pedir('put', '/stock-minimo', { ...MINIMO, grupoSanguineo: 'C' })).status).toBe(400);
  });

  test('sin institución aprobada → 403', async () => {
    prisma.usuarioInstitucion.findFirst.mockResolvedValue(null);
    expect((await pedir('put', '/stock-minimo', MINIMO)).status).toBe(403);
  });
});
