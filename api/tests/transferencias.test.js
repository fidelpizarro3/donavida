process.env.JWT_SECRET = 'secreto_de_prueba_para_los_tests_de_transferencias';

const request = require('supertest');
const jwt = require('jsonwebtoken');

// Base simulada: cada test decide qué devuelve cada consulta
jest.mock('../src/lib/prisma', () => ({
  usuarioInstitucion: { findFirst: jest.fn() },
  institucion: { findUnique: jest.fn() },
  unidadSangre: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    updateMany: jest.fn(),
    updateManyAndReturn: jest.fn(),
  },
  necesidad: { findUnique: jest.fn(), updateMany: jest.fn(), update: jest.fn() },
  transferencia: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    updateMany: jest.fn(),
    updateManyAndReturn: jest.fn(),
    count: jest.fn(),
  },
  transferenciaItem: { findMany: jest.fn(), createMany: jest.fn(), updateMany: jest.fn(), count: jest.fn() },
  movimientoUnidad: { create: jest.fn(), createMany: jest.fn() },
  // TAREA-13: al cubrirse la necesidad se cierra su convocatoria y se agradece a los donantes
  donacion: { count: jest.fn() },
  convocatoria: { updateMany: jest.fn() },
  alerta: { updateMany: jest.fn(), updateManyAndReturn: jest.fn(), findMany: jest.fn() },
  $transaction: jest.fn(),
}));

const prisma = require('../src/lib/prisma');
const app = require('../src/app');
const { obtenerFechaHoyArgentina } = require('../src/utils/validaciones');
const { formatearFecha, parsearFecha } = require('../src/utils/formateadores');
const {
  vencerTransferencias,
  programarVencimientoTransferencias,
  PLAZO_RESPUESTA_HORAS,
} = require('../src/services/transferencias');
const { cerrarSiCubierta } = require('../src/services/cierreNecesidad');

const HOY = obtenerFechaHoyArgentina();
const en = (dias) => formatearFecha(new Date(parsearFecha(HOY).getTime() + dias * 86400000));
const UNA_HORA = 60 * 60 * 1000;

const USUARIO = '11111111-1111-4111-8111-111111111111';
const A = '44444444-4444-4444-8444-444444444444'; // la que pide (solicitante)
const B = '77777777-7777-4777-8777-777777777777'; // la que presta (proveedora)
const OTRA = '88888888-8888-4888-8888-888888888888'; // una que no participa
const T = '99999999-9999-4999-8999-999999999999';
const U1 = '55555555-5555-4555-8555-000000000001';
const U2 = '55555555-5555-4555-8555-000000000002';
const NEC = '66666666-6666-4666-8666-666666666666';

const INSTITUCIONES = {
  [A]: { idInstitucion: A, nombre: 'Hospital Central', estado: 'aprobada', latitud: -38.95, longitud: -68.06 },
  [B]: { idInstitucion: B, nombre: 'Banco Regional', estado: 'aprobada', latitud: -38.94, longitud: -68.12 },
  [OTRA]: { idInstitucion: OTRA, nombre: 'Clínica Pendiente', estado: 'pendiente', latitud: -38.9, longitud: -68.0 },
};

const tokenDe = (rol) => jwt.sign({ sub: USUARIO, rol }, process.env.JWT_SECRET, { expiresIn: '1h' });
const TOKEN = tokenDe('institucion');
// El usuario logueado trabaja en esta institución (aprobada)
const comoInstitucion = (idInstitucion) =>
  prisma.usuarioInstitucion.findFirst.mockResolvedValue({ idUsuario: USUARIO, idInstitucion });

const enviar = (metodo, ruta, body, token = TOKEN) => {
  const pedido = request(app)[metodo](`/api/transferencias${ruta}`).set('Authorization', `Bearer ${token}`);
  return body === undefined ? pedido : pedido.send(body);
};

// Una unidad de la proveedora, como la devuelve la base
const unidad = (idUnidadSangre, datos = {}) => ({
  idUnidadSangre,
  codigo: idUnidadSangre === U1 ? 'U-PRIMERA01' : 'U-SEGUNDA02',
  idInstitucion: B,
  grupoSanguineo: 'O',
  factorRh: 'negativo',
  componente: 'globulos_rojos',
  fechaVencimiento: parsearFecha(en(20)),
  estado: 'disponible',
  ...datos,
});

// Una transferencia con todo lo que se incluye para mostrarla
const transferencia = (datos = {}) => ({
  idTransferencia: T,
  idInstitucionSolicitante: A,
  idInstitucionProveedora: B,
  idNecesidad: null,
  estado: 'pendiente',
  motivoRechazo: null,
  plazoRespuesta: new Date(Date.now() + 10 * UNA_HORA),
  creadaEn: new Date('2026-11-08T12:00:00Z'),
  recibidaEn: null,
  institucionSolicitante: { idInstitucion: A, nombre: 'Hospital Central' },
  institucionProveedora: { idInstitucion: B, nombre: 'Banco Regional' },
  necesidad: null,
  items: [U2, U1].map((id) => {
    const { idInstitucion: _i, ...datosUnidad } = unidad(id, id === U2 ? { fechaVencimiento: parsearFecha(en(30)) } : {});
    return { idTransferenciaItem: `item-${id}`, idTransferencia: T, idUnidadSangre: id, activo: true, unidad: datosUnidad };
  }),
  ...datos,
});

const PEDIDO = { idInstitucionProveedora: B, idsUnidadSangre: [U1, U2] };

beforeEach(() => {
  jest.resetAllMocks();
  prisma.$transaction.mockImplementation((operaciones) => operaciones(prisma));
  comoInstitucion(A);
  prisma.institucion.findUnique.mockImplementation(async ({ where }) => INSTITUCIONES[where.idInstitucion] ?? null);
  prisma.unidadSangre.findMany.mockResolvedValue([unidad(U1), unidad(U2)]);
  prisma.unidadSangre.updateManyAndReturn.mockResolvedValue([]); // marcarVencidas (DV-7)
  prisma.transferencia.updateManyAndReturn.mockResolvedValue([]); // vencerTransferencias
  prisma.transferencia.create.mockResolvedValue({ idTransferencia: T });
  prisma.transferencia.findUnique.mockResolvedValue(transferencia());
  prisma.transferencia.findMany.mockResolvedValue([transferencia()]);
  prisma.transferenciaItem.findMany.mockResolvedValue([]);
  prisma.transferenciaItem.count.mockResolvedValue(0);
  prisma.transferenciaItem.createMany.mockResolvedValue({ count: 2 });
  prisma.transferenciaItem.updateMany.mockResolvedValue({ count: 2 });
  prisma.movimientoUnidad.createMany.mockResolvedValue({ count: 2 });
  prisma.donacion.count.mockResolvedValue(0);
  prisma.transferencia.count.mockResolvedValue(1);
  prisma.convocatoria.updateMany.mockResolvedValue({ count: 0 });
  prisma.alerta.updateMany.mockResolvedValue({ count: 0 });
  prisma.alerta.updateManyAndReturn.mockResolvedValue([]);
});

afterEach(() => {
  jest.useRealTimers();
});

describe('Criterio 1: mientras está en curso, las unidades no pueden asignarse a otra necesidad', () => {
  beforeEach(() => {
    comoInstitucion(B); // acepta la que presta
    prisma.transferencia.updateMany.mockResolvedValue({ count: 1 });
    prisma.unidadSangre.updateMany.mockResolvedValue({ count: 2 });
  });

  test('al aceptar, todas las unidades pasan a "reservada" en una sola operación', async () => {
    const res = await enviar('post', `/${T}/aceptar`);
    expect(res.status).toBe(200);
    expect(prisma.unidadSangre.updateMany).toHaveBeenCalledWith({
      where: { idUnidadSangre: { in: [U2, U1] }, idInstitucion: B, estado: 'disponible', fechaVencimiento: { gte: parsearFecha(HOY) } },
      data: { estado: 'reservada' },
    });
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  test('solo se acepta si sigue pendiente, es para mí y está en plazo', async () => {
    await enviar('post', `/${T}/aceptar`);
    const { where, data } = prisma.transferencia.updateMany.mock.calls[0][0];
    expect(where).toEqual({ idTransferencia: T, idInstitucionProveedora: B, estado: 'pendiente', plazoRespuesta: { gte: expect.any(Date) } });
    expect(data).toEqual({ estado: 'aceptada' });
  });

  test('queda un movimiento de reserva por unidad, de la que presta hacia la que pide', async () => {
    await enviar('post', `/${T}/aceptar`);
    const { data } = prisma.movimientoUnidad.createMany.mock.calls[0][0];
    expect(data).toHaveLength(2);
    for (const movimiento of data) {
      expect(movimiento).toMatchObject({
        tipo: 'reserva', estadoAnterior: 'disponible', estadoNuevo: 'reservada',
        idInstitucionOrigen: B, idInstitucionDestino: A, idUsuario: USUARIO,
      });
    }
  });

  test('si alguna unidad ya no está disponible (se usó o venció), no se reserva ninguna → 409', async () => {
    prisma.unidadSangre.updateMany.mockResolvedValue({ count: 1 });
    const res = await enviar('post', `/${T}/aceptar`);
    expect(res.status).toBe(409);
    expect(res.body.error.mensaje).toContain('ya no está disponible');
    expect(prisma.movimientoUnidad.createMany).not.toHaveBeenCalled();
  });

  test('dos aceptaciones a la vez: una reserva y la otra choca', async () => {
    prisma.transferencia.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    prisma.transferencia.findUnique.mockResolvedValue(transferencia({ estado: 'aceptada' }));
    const [a, b] = await Promise.all([enviar('post', `/${T}/aceptar`), enviar('post', `/${T}/aceptar`)]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect(prisma.movimientoUnidad.createMany).toHaveBeenCalledTimes(1);
  });

  test('una unidad que ya está en otra transferencia en curso no se puede pedir', async () => {
    comoInstitucion(A);
    prisma.transferenciaItem.findMany.mockResolvedValue([{ unidad: { codigo: 'U-PRIMERA01' } }]);
    const res = await enviar('post', '', PEDIDO);
    expect(res.status).toBe(409);
    expect(res.body.error.mensaje).toBe('La unidad U-PRIMERA01 ya está pedida en otra transferencia en curso');
    expect(prisma.transferencia.create).not.toHaveBeenCalled();
  });

  test('si dos pedidos de la misma unidad llegan a la vez, la base deja pasar uno solo (índice único) → 409', async () => {
    comoInstitucion(A);
    prisma.transferenciaItem.createMany.mockRejectedValue(Object.assign(new Error('unique'), { code: 'P2002' }));
    const res = await enviar('post', '', PEDIDO);
    expect(res.status).toBe(409);
    expect(res.body.error.mensaje).toContain('ya está pedida en otra transferencia en curso');
  });

  test('una unidad reservada tampoco se puede usar en el stock de la que presta', async () => {
    prisma.unidadSangre.updateMany.mockResolvedValue({ count: 0 });
    prisma.unidadSangre.findFirst.mockResolvedValue(unidad(U1, { estado: 'reservada' }));
    const res = await request(app).patch(`/api/unidades/${U1}/usar`).set('Authorization', `Bearer ${TOKEN}`);
    expect(res.status).toBe(409);
    expect(res.body.error.mensaje).toContain('está reservada');
  });
});

describe('Criterio 2: si la que presta no contesta dentro del plazo, la propuesta cae', () => {
  test(`al pedir, la que presta tiene ${PLAZO_RESPUESTA_HORAS} horas para contestar`, async () => {
    const antes = Date.now();
    await enviar('post', '', PEDIDO);
    const { data } = prisma.transferencia.create.mock.calls[0][0];
    expect(data.estado).toBe('pendiente');
    expect(data.plazoRespuesta.getTime()).toBeGreaterThanOrEqual(antes + PLAZO_RESPUESTA_HORAS * UNA_HORA);
    expect(data.plazoRespuesta.getTime()).toBeLessThanOrEqual(Date.now() + PLAZO_RESPUESTA_HORAS * UNA_HORA);
  });

  test('la tarea pasa a "expirada" las pendientes con el plazo vencido, en una sola operación', async () => {
    const ahora = new Date('2026-11-08T15:00:00Z');
    prisma.transferencia.updateManyAndReturn.mockResolvedValue([{ idTransferencia: T }]);
    expect(await vencerTransferencias(ahora)).toBe(1);
    expect(prisma.transferencia.updateManyAndReturn).toHaveBeenCalledWith({
      where: { estado: 'pendiente', plazoRespuesta: { lt: ahora } },
      data: { estado: 'expirada' },
      select: { idTransferencia: true },
    });
  });

  test('sus unidades dejan de estar en curso: vuelven a faltar y se convocan donantes por ellas', async () => {
    prisma.transferencia.updateManyAndReturn.mockResolvedValue([{ idTransferencia: T }]);
    await vencerTransferencias();
    expect(prisma.transferenciaItem.updateMany).toHaveBeenCalledWith({
      where: { idTransferencia: { in: [T] } },
      data: { activo: false },
    });
    // Las unidades no se tocan: mientras está pendiente nunca se reservaron
    expect(prisma.unidadSangre.updateMany).not.toHaveBeenCalled();
  });

  test('si no venció ninguna, no cambia nada más', async () => {
    expect(await vencerTransferencias()).toBe(0);
    expect(prisma.transferenciaItem.updateMany).not.toHaveBeenCalled();
  });

  test('aceptar después del plazo → 409 y no se reserva nada', async () => {
    comoInstitucion(B);
    prisma.transferencia.updateMany.mockResolvedValue({ count: 0 });
    prisma.transferencia.findUnique.mockResolvedValue(transferencia({ plazoRespuesta: new Date(Date.now() - UNA_HORA) }));
    const res = await enviar('post', `/${T}/aceptar`);
    expect(res.status).toBe(409);
    expect(res.body.error.mensaje).toBe('Venció el plazo para responder: la transferencia expiró');
    expect(prisma.unidadSangre.updateMany).not.toHaveBeenCalled();
  });

  test('antes de aceptar, rechazar o listar se vencen las que pasaron el plazo', async () => {
    await enviar('get', '');
    const vencer = prisma.transferencia.updateManyAndReturn.mock.invocationCallOrder[0];
    const listar = prisma.transferencia.findMany.mock.invocationCallOrder[0];
    expect(vencer).toBeLessThan(listar);
  });

  test('la tarea automática no corre en los tests (NODE_ENV=test)', () => {
    jest.useFakeTimers();
    expect(programarVencimientoTransferencias()).toBeNull();
    jest.advanceTimersByTime(3 * UNA_HORA);
    expect(prisma.transferencia.updateManyAndReturn).not.toHaveBeenCalled();
  });

  test('fuera de los tests corre al arrancar y después una vez por hora', () => {
    jest.useFakeTimers();
    const anterior = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    try {
      const intervalo = programarVencimientoTransferencias();
      expect(prisma.transferencia.updateManyAndReturn).toHaveBeenCalledTimes(1);
      jest.advanceTimersByTime(UNA_HORA);
      expect(prisma.transferencia.updateManyAndReturn).toHaveBeenCalledTimes(2);
      clearInterval(intervalo);
    } finally {
      process.env.NODE_ENV = anterior;
    }
  });
});

describe('Criterio 3: rechazar exige un motivo', () => {
  beforeEach(() => {
    comoInstitucion(B);
    prisma.transferencia.updateMany.mockResolvedValue({ count: 1 });
  });

  test.each([
    ['sin motivo', {}],
    ['con el motivo vacío', { motivoRechazo: '   ' }],
    ['con un motivo que no es texto', { motivoRechazo: 5 }],
    ['con un motivo de más de 500 caracteres', { motivoRechazo: 'x'.repeat(501) }],
  ])('%s → 400 y no cambia nada', async (_caso, body) => {
    const res = await enviar('post', `/${T}/rechazar`, body);
    expect(res.status).toBe(400);
    expect(res.body.error.mensaje).toContain('motivo');
    expect(prisma.transferencia.updateMany).not.toHaveBeenCalled();
  });

  test('con motivo: queda rechazada con el motivo, y sus unidades dejan de estar en curso', async () => {
    prisma.transferencia.findUnique.mockResolvedValue(transferencia({ estado: 'rechazada', motivoRechazo: 'Quedamos bajo el mínimo' }));
    const res = await enviar('post', `/${T}/rechazar`, { motivoRechazo: '  Quedamos bajo el mínimo  ' });
    expect(res.status).toBe(200);
    expect(prisma.transferencia.updateMany.mock.calls[0][0]).toEqual({
      where: { idTransferencia: T, idInstitucionProveedora: B, estado: 'pendiente', plazoRespuesta: { gte: expect.any(Date) } },
      data: { estado: 'rechazada', motivoRechazo: 'Quedamos bajo el mínimo' },
    });
    expect(prisma.transferenciaItem.updateMany).toHaveBeenCalledWith({ where: { idTransferencia: T }, data: { activo: false } });
    expect(res.body).toMatchObject({ estado: 'rechazada', motivoRechazo: 'Quedamos bajo el mínimo' });
    // Las unidades nunca se reservaron: no se tocan
    expect(prisma.unidadSangre.updateMany).not.toHaveBeenCalled();
  });

  test('la que pidió no puede rechazar su propio pedido → 403', async () => {
    comoInstitucion(A);
    prisma.transferencia.updateMany.mockResolvedValue({ count: 0 });
    const res = await enviar('post', `/${T}/rechazar`, { motivoRechazo: 'No' });
    expect(res.status).toBe(403);
    expect(res.body.error.mensaje).toBe('Solo la institución que presta puede rechazar la transferencia');
  });

  test('una ya aceptada no se puede rechazar → 409', async () => {
    prisma.transferencia.updateMany.mockResolvedValue({ count: 0 });
    prisma.transferencia.findUnique.mockResolvedValue(transferencia({ estado: 'aceptada' }));
    const res = await enviar('post', `/${T}/rechazar`, { motivoRechazo: 'Me arrepentí' });
    expect(res.status).toBe(409);
    expect(res.body.error.mensaje).toBe('No se puede rechazar la transferencia: está aceptada');
  });
});

describe('Criterio 4: al confirmar la recepción, las unidades pasan a la otra institución', () => {
  beforeEach(() => {
    prisma.transferencia.updateMany.mockResolvedValue({ count: 1 });
    prisma.unidadSangre.updateMany.mockResolvedValue({ count: 2 });
    prisma.transferencia.findUnique.mockResolvedValue(transferencia({ estado: 'aceptada' }));
  });

  test('las reservadas pasan a la institución que pidió y vuelven a estar disponibles, en una sola operación', async () => {
    const res = await enviar('post', `/${T}/recibir`);
    expect(res.status).toBe(200);
    expect(prisma.unidadSangre.updateMany).toHaveBeenCalledWith({
      where: { idUnidadSangre: { in: [U2, U1] }, idInstitucion: B, estado: 'reservada' },
      data: { idInstitucion: A, estado: 'disponible' },
    });
  });

  test('queda un movimiento de transferencia por unidad, con origen y destino', async () => {
    await enviar('post', `/${T}/recibir`);
    const { data } = prisma.movimientoUnidad.createMany.mock.calls[0][0];
    expect(data.map((m) => m.idUnidadSangre)).toEqual([U2, U1]);
    for (const movimiento of data) {
      expect(movimiento).toEqual({
        idUnidadSangre: movimiento.idUnidadSangre,
        tipo: 'transferencia',
        estadoAnterior: 'reservada',
        estadoNuevo: 'disponible',
        idInstitucionOrigen: B,
        idInstitucionDestino: A,
        idUsuario: USUARIO,
      });
    }
  });

  test('la transferencia queda recibida, con la fecha, y sus unidades dejan de estar en curso', async () => {
    await enviar('post', `/${T}/recibir`);
    expect(prisma.transferencia.updateMany.mock.calls[0][0]).toEqual({
      where: { idTransferencia: T, idInstitucionSolicitante: A, estado: 'aceptada' },
      data: { estado: 'recibida', recibidaEn: expect.any(Date) },
    });
    expect(prisma.transferenciaItem.updateMany).toHaveBeenCalledWith({ where: { idTransferencia: T }, data: { activo: false } });
  });

  test('una unidad que venció en el camino llega igual y la tarea de vencimiento la marca en su destino', async () => {
    await enviar('post', `/${T}/recibir`);
    const recibir = prisma.unidadSangre.updateMany.mock.invocationCallOrder[0];
    const vencer = prisma.unidadSangre.updateManyAndReturn.mock.invocationCallOrder[0];
    expect(vencer).toBeGreaterThan(recibir);
  });

  test('la que presta no puede confirmar la recepción → 403', async () => {
    comoInstitucion(B);
    prisma.transferencia.updateMany.mockResolvedValue({ count: 0 });
    const res = await enviar('post', `/${T}/recibir`);
    expect(res.status).toBe(403);
    expect(res.body.error.mensaje).toBe('Solo la institución que pidió puede confirmar la recepción de la transferencia');
  });

  test('una todavía pendiente no se puede recibir → 409', async () => {
    prisma.transferencia.updateMany.mockResolvedValue({ count: 0 });
    prisma.transferencia.findUnique.mockResolvedValue(transferencia({ estado: 'pendiente' }));
    const res = await enviar('post', `/${T}/recibir`);
    expect(res.status).toBe(409);
    expect(res.body.error.mensaje).toBe('No se puede confirmar la recepción de la transferencia: está pendiente');
    expect(prisma.unidadSangre.updateMany).not.toHaveBeenCalled();
  });

  test('si alguna unidad ya no está reservada, no se mueve ninguna → 409', async () => {
    prisma.unidadSangre.updateMany.mockResolvedValue({ count: 1 });
    const res = await enviar('post', `/${T}/recibir`);
    expect(res.status).toBe(409);
    expect(prisma.movimientoUnidad.createMany).not.toHaveBeenCalled();
  });
});

describe('Criterio 5: queda historial de qué se prestó, a quién y cuándo', () => {
  test('la que pidió ve sus transferencias como "enviada", con las unidades y las fechas', async () => {
    const res = await enviar('get', '');
    expect(res.status).toBe(200);
    expect(prisma.transferencia.findMany.mock.calls[0][0].where).toEqual({
      OR: [{ idInstitucionSolicitante: A }, { idInstitucionProveedora: A }],
    });
    expect(res.body[0]).toEqual({
      idTransferencia: T,
      estado: 'pendiente',
      direccion: 'enviada',
      institucionSolicitante: { idInstitucion: A, nombre: 'Hospital Central' },
      institucionProveedora: { idInstitucion: B, nombre: 'Banco Regional' },
      necesidad: null,
      // De la que vence antes a la última
      unidades: [
        { idUnidadSangre: U1, codigo: 'U-PRIMERA01', grupoSanguineo: 'O', factorRh: 'negativo', componente: 'globulos_rojos', fechaVencimiento: en(20), estado: 'disponible' },
        { idUnidadSangre: U2, codigo: 'U-SEGUNDA02', grupoSanguineo: 'O', factorRh: 'negativo', componente: 'globulos_rojos', fechaVencimiento: en(30), estado: 'disponible' },
      ],
      motivoRechazo: null,
      plazoRespuesta: expect.any(String),
      creadaEn: '2026-11-08T12:00:00.000Z',
      recibidaEn: null,
    });
  });

  test('la que presta ve la misma transferencia como "recibida"', async () => {
    comoInstitucion(B);
    const res = await enviar('get', '');
    expect(res.body[0].direccion).toBe('recibida');
  });

  test.each([
    ['enviadas', { idInstitucionSolicitante: A }],
    ['recibidas', { idInstitucionProveedora: A }],
  ])('se pueden ver solo las %s', async (direccion, where) => {
    await enviar('get', `?direccion=${direccion}`);
    expect(prisma.transferencia.findMany.mock.calls[0][0].where).toEqual(where);
  });

  test('una dirección inventada → 400', async () => {
    expect((await enviar('get', '?direccion=todas')).status).toBe(400);
  });
});

describe('Criterio 6: se puede iniciar a mano, sin necesidad publicada', () => {
  test('pedir sin necesidad crea la transferencia pendiente con idNecesidad vacío', async () => {
    const res = await enviar('post', '', PEDIDO);
    expect(res.status).toBe(201);
    expect(prisma.transferencia.create.mock.calls[0][0].data).toMatchObject({
      idInstitucionSolicitante: A, idInstitucionProveedora: B, idNecesidad: null, estado: 'pendiente',
    });
    expect(prisma.transferenciaItem.createMany).toHaveBeenCalledWith({
      data: [{ idTransferencia: T, idUnidadSangre: U1 }, { idTransferencia: T, idUnidadSangre: U2 }],
    });
    expect(prisma.necesidad.findUnique).not.toHaveBeenCalled();
  });

  test('para elegir, busca las unidades de otras instituciones aprobadas, sin las mías ni las que ya están en curso', async () => {
    prisma.unidadSangre.findMany.mockResolvedValue([]);
    await enviar('get', '/unidades-disponibles?grupoSanguineo=O&factorRh=negativo&componente=globulos_rojos');
    expect(prisma.unidadSangre.findMany.mock.calls[0][0].where).toEqual({
      estado: 'disponible',
      fechaVencimiento: { gte: parsearFecha(HOY) },
      grupoSanguineo: 'O',
      factorRh: 'negativo',
      componente: 'globulos_rojos',
      idInstitucion: { not: A },
      institucion: { estado: 'aprobada' },
      itemsTransferencia: { none: { activo: true } },
    });
  });

  test('las agrupa por institución, la más cercana primero, con lo que vence antes arriba', async () => {
    const lejana = { idInstitucion: OTRA, nombre: 'Lejana', direccion: 'Ruta 22', latitud: -39.5, longitud: -68.5 };
    const cercana = { idInstitucion: B, nombre: 'Banco Regional', direccion: 'Belgrano 450', latitud: -38.94, longitud: -68.12 };
    prisma.unidadSangre.findMany.mockResolvedValue([
      { ...unidad(U1, { idInstitucion: OTRA }), institucion: lejana },
      { ...unidad(U2, { fechaVencimiento: parsearFecha(en(3)) }), institucion: cercana },
    ]);
    const res = await enviar('get', '/unidades-disponibles?grupoSanguineo=O&factorRh=negativo&componente=globulos_rojos');
    expect(res.status).toBe(200);
    expect(res.body.map((i) => i.nombre)).toEqual(['Banco Regional', 'Lejana']);
    expect(res.body[0]).toMatchObject({ idInstitucion: B, direccion: 'Belgrano 450', distanciaKm: expect.any(Number) });
    expect(res.body[0].unidades[0]).toMatchObject({ codigo: 'U-SEGUNDA02', fechaVencimiento: en(3), diasRestantes: 3 });
  });

  test.each([
    ['sin grupo', '?factorRh=negativo&componente=plaquetas'],
    ['con un factor inventado', '?grupoSanguineo=O&factorRh=%2B&componente=plaquetas'],
    ['con un componente inventado', '?grupoSanguineo=O&factorRh=negativo&componente=plasma'],
  ])('buscar %s → 400', async (_caso, consulta) => {
    expect((await enviar('get', `/unidades-disponibles${consulta}`)).status).toBe(400);
    expect(prisma.unidadSangre.findMany).not.toHaveBeenCalled();
  });

  test('no se le puede pedir a la propia institución → 400', async () => {
    const res = await enviar('post', '', { ...PEDIDO, idInstitucionProveedora: A });
    expect(res.status).toBe(400);
  });

  test('a una institución sin aprobar → 404', async () => {
    expect((await enviar('post', '', { ...PEDIDO, idInstitucionProveedora: OTRA })).status).toBe(404);
  });

  test('una unidad que no es de esa institución → 404', async () => {
    prisma.unidadSangre.findMany.mockResolvedValue([unidad(U1), unidad(U2, { idInstitucion: OTRA })]);
    expect((await enviar('post', '', PEDIDO)).status).toBe(404);
  });

  test('una unidad que no existe → 404', async () => {
    prisma.unidadSangre.findMany.mockResolvedValue([unidad(U1)]);
    expect((await enviar('post', '', PEDIDO)).status).toBe(404);
  });

  test.each([
    ['sin institución', { idsUnidadSangre: [U1] }],
    ['con una institución mal formada', { idInstitucionProveedora: 'abc', idsUnidadSangre: [U1] }],
    ['sin unidades', { idInstitucionProveedora: B, idsUnidadSangre: [] }],
    ['con las unidades que no son una lista', { idInstitucionProveedora: B, idsUnidadSangre: U1 }],
    ['con más de 50 unidades', { idInstitucionProveedora: B, idsUnidadSangre: Array.from({ length: 51 }, () => U1) }],
    ['con una unidad mal formada', { idInstitucionProveedora: B, idsUnidadSangre: [U1, 'abc'] }],
    ['con unidades repetidas', { idInstitucionProveedora: B, idsUnidadSangre: [U1, U1] }],
    ['con una necesidad mal formada', { ...PEDIDO, idNecesidad: 'abc' }],
  ])('pedir %s → 400', async (_caso, body) => {
    const res = await enviar('post', '', body);
    expect(res.status).toBe(400);
    expect(res.body.error.codigo).toBe('DATOS_INVALIDOS');
    expect(prisma.transferencia.create).not.toHaveBeenCalled();
  });
});

describe('Criterio 7: una unidad vencida no se puede transferir (DV-7)', () => {
  test('pedir una que pasó su fecha (aunque la tarea todavía no la marcó) → 409', async () => {
    prisma.unidadSangre.findMany.mockResolvedValue([unidad(U1, { fechaVencimiento: parsearFecha(en(-1)) }), unidad(U2)]);
    const res = await enviar('post', '', PEDIDO);
    expect(res.status).toBe(409);
    expect(res.body.error.mensaje).toBe('La unidad U-PRIMERA01 está vencida: no se puede transferir');
    expect(prisma.transferencia.create).not.toHaveBeenCalled();
  });

  test('pedir una marcada como vencida → 409', async () => {
    prisma.unidadSangre.findMany.mockResolvedValue([unidad(U1, { estado: 'vencida' }), unidad(U2)]);
    expect((await enviar('post', '', PEDIDO)).status).toBe(409);
  });

  test('la que vence hoy todavía se puede pedir', async () => {
    prisma.unidadSangre.findMany.mockResolvedValue([unidad(U1, { fechaVencimiento: parsearFecha(HOY) }), unidad(U2)]);
    expect((await enviar('post', '', PEDIDO)).status).toBe(201);
  });

  test('pedir una que no está disponible (usada, reservada...) → 409', async () => {
    prisma.unidadSangre.findMany.mockResolvedValue([unidad(U1, { estado: 'usada' }), unidad(U2)]);
    const res = await enviar('post', '', PEDIDO);
    expect(res.status).toBe(409);
    expect(res.body.error.mensaje).toBe('La unidad U-PRIMERA01 no está disponible (está usada)');
  });
});

describe('Criterio 8: ligada a una necesidad, al recibir suma lo cubierto y la cierra si se completó', () => {
  const necesidad = (datos = {}) => ({
    idNecesidad: NEC,
    idInstitucion: A,
    grupoSanguineo: 'O',
    factorRh: 'negativo',
    componente: 'globulos_rojos',
    unidadesSolicitadas: 3,
    unidadesCubiertas: 1,
    estado: 'abierta',
    fechaLimite: parsearFecha(en(5)),
    ...datos,
  });

  describe('al pedir', () => {
    test('con una necesidad abierta y unidades que le sirven, se crea ligada a la necesidad', async () => {
      prisma.necesidad.findUnique.mockResolvedValue(necesidad());
      const res = await enviar('post', '', { ...PEDIDO, idNecesidad: NEC });
      expect(res.status).toBe(201);
      expect(prisma.transferencia.create.mock.calls[0][0].data.idNecesidad).toBe(NEC);
    });

    test('una necesidad de otra institución → 404', async () => {
      prisma.necesidad.findUnique.mockResolvedValue(necesidad({ idInstitucion: B }));
      expect((await enviar('post', '', { ...PEDIDO, idNecesidad: NEC })).status).toBe(404);
    });

    test('una necesidad que ya no está abierta → 409', async () => {
      prisma.necesidad.findUnique.mockResolvedValue(necesidad({ estado: 'cubierta' }));
      expect((await enviar('post', '', { ...PEDIDO, idNecesidad: NEC })).status).toBe(409);
    });

    test('unidades que no le sirven (otro grupo) → 400', async () => {
      prisma.necesidad.findUnique.mockResolvedValue(necesidad());
      prisma.unidadSangre.findMany.mockResolvedValue([unidad(U1, { grupoSanguineo: 'A', factorRh: 'positivo' }), unidad(U2)]);
      const res = await enviar('post', '', { ...PEDIDO, idNecesidad: NEC });
      expect(res.status).toBe(400);
      expect(res.body.error.mensaje).toBe('La unidad U-PRIMERA01 no sirve para esta necesidad');
    });

    test('más unidades de las que faltan (contando las que ya vienen en camino) → 409', async () => {
      prisma.necesidad.findUnique.mockResolvedValue(necesidad()); // faltan 2...
      prisma.transferenciaItem.count.mockResolvedValue(1); // ...pero 1 ya viene en otra transferencia
      const res = await enviar('post', '', { ...PEDIDO, idNecesidad: NEC });
      expect(res.status).toBe(409);
      expect(res.body.error.mensaje).toBe('A esta necesidad le falta 1 unidad: no se pueden pedir 2');
      expect(prisma.transferenciaItem.count).toHaveBeenCalledWith({ where: { activo: true, transferencia: { idNecesidad: NEC } } });
    });
  });

  describe('al recibir', () => {
    beforeEach(() => {
      prisma.transferencia.updateMany.mockResolvedValue({ count: 1 });
      prisma.unidadSangre.updateMany.mockResolvedValue({ count: 2 });
      prisma.transferencia.findUnique.mockResolvedValue(transferencia({ estado: 'aceptada', idNecesidad: NEC }));
      prisma.necesidad.updateMany.mockResolvedValue({ count: 1 });
    });

    test('suma las unidades a lo cubierto y, si se completó, la necesidad queda cubierta', async () => {
      prisma.necesidad.findUnique.mockResolvedValue(necesidad({ unidadesCubiertas: 3 }));
      const res = await enviar('post', `/${T}/recibir`);
      expect(res.status).toBe(200);
      expect(prisma.necesidad.updateMany).toHaveBeenNthCalledWith(1, {
        where: { idNecesidad: NEC, estado: 'abierta' },
        data: { unidadesCubiertas: { increment: 2 } },
      });
      expect(prisma.necesidad.updateMany).toHaveBeenNthCalledWith(2, {
        where: { idNecesidad: NEC, estado: 'abierta' },
        // TAREA-13: queda guardado con qué se cubrió (acá, solo con la transferencia)
        data: { estado: 'cubierta', cerradaEn: expect.any(Date), cubiertaCon: 'transferencia' },
      });
    });

    test('si todavía falta, suma y sigue abierta', async () => {
      prisma.necesidad.findUnique.mockResolvedValue(necesidad({ unidadesSolicitadas: 5, unidadesCubiertas: 3 }));
      await enviar('post', `/${T}/recibir`);
      expect(prisma.necesidad.updateMany).toHaveBeenCalledTimes(1);
    });

    test('lo cubierto no pasa de lo pedido (si en el medio llegaron donaciones)', async () => {
      prisma.necesidad.findUnique.mockResolvedValue(necesidad({ unidadesSolicitadas: 3, unidadesCubiertas: 4 }));
      await enviar('post', `/${T}/recibir`);
      expect(prisma.necesidad.update).toHaveBeenCalledWith({ where: { idNecesidad: NEC }, data: { unidadesCubiertas: 3 } });
    });

    test('si la necesidad ya no estaba abierta, no suma nada (las unidades igual entran al stock)', async () => {
      prisma.necesidad.updateMany.mockResolvedValue({ count: 0 });
      const res = await enviar('post', `/${T}/recibir`);
      expect(res.status).toBe(200);
      expect(prisma.necesidad.updateMany).toHaveBeenCalledTimes(1);
      expect(prisma.unidadSangre.updateMany).toHaveBeenCalled();
    });

    test('sin necesidad ligada (pedido a mano), no toca ninguna necesidad', async () => {
      prisma.transferencia.findUnique.mockResolvedValue(transferencia({ estado: 'aceptada' }));
      await enviar('post', `/${T}/recibir`);
      expect(prisma.necesidad.updateMany).not.toHaveBeenCalled();
    });
  });

  test('cerrarSiCubierta no cierra dos veces ni cierra una que no está completa', async () => {
    prisma.necesidad.findUnique.mockResolvedValueOnce(necesidad({ estado: 'cubierta', unidadesCubiertas: 3 }));
    expect(await cerrarSiCubierta(NEC)).toBe(false);
    prisma.necesidad.findUnique.mockResolvedValueOnce(necesidad({ unidadesCubiertas: 2 }));
    expect(await cerrarSiCubierta(NEC)).toBe(false);
    expect(prisma.necesidad.updateMany).not.toHaveBeenCalled();
  });
});

describe('Permisos', () => {
  test('sin token → 401', async () => {
    expect((await request(app).get('/api/transferencias')).status).toBe(401);
  });

  test('un donante → 403', async () => {
    expect((await enviar('get', '', undefined, tokenDe('donante'))).status).toBe(403);
  });

  test('una institución sin aprobar → 403', async () => {
    prisma.usuarioInstitucion.findFirst.mockResolvedValue(null);
    const res = await enviar('post', '', PEDIDO);
    expect(res.status).toBe(403);
    expect(res.body.error.mensaje).toBe('Tu institución no está aprobada para hacer transferencias');
  });

  test('una transferencia en la que no participo → 404, sin decir que existe', async () => {
    comoInstitucion(OTRA);
    prisma.transferencia.updateMany.mockResolvedValue({ count: 0 });
    expect((await enviar('post', `/${T}/aceptar`)).status).toBe(404);
  });

  test.each(['aceptar', 'rechazar', 'recibir'])('%s con un id mal formado → 400', async (accion) => {
    expect((await enviar('post', `/abc/${accion}`, { motivoRechazo: 'x' })).status).toBe(400);
  });
});
