process.env.JWT_SECRET = 'secreto_de_prueba_para_los_tests_de_unidades';

const request = require('supertest');
const jwt = require('jsonwebtoken');

// Base simulada: cada test decide qué devuelve cada consulta
jest.mock('../src/lib/prisma', () => ({
  usuarioInstitucion: { findFirst: jest.fn() },
  unidadSangre: { create: jest.fn() },
  movimientoUnidad: { create: jest.fn() },
  $transaction: jest.fn(),
}));

const prisma = require('../src/lib/prisma');
const app = require('../src/app');
const { obtenerFechaHoy } = require('../src/utils/validaciones');
const { formatearFecha, parsearFecha } = require('../src/utils/formateadores');
const {
  DIAS_DE_VIDA,
  generarCodigo,
  calcularVencimiento,
  validarIngreso,
  registrarIngresoUnidad,
} = require('../src/services/unidades');

const HOY = obtenerFechaHoy();
const sumar = (fecha, dias) => formatearFecha(new Date(parsearFecha(fecha).getTime() + dias * 86400000));
const hace = (dias) => sumar(HOY, -dias);

const ID_USUARIO = '11111111-1111-4111-8111-111111111111';
const ID_INSTITUCION = '44444444-4444-4444-8444-444444444444';
const ID_UNIDAD = '55555555-5555-4555-8555-555555555555';
const ID_DONACION = '66666666-6666-4666-8666-666666666666';
const FORMATO_CODIGO = /^U-[A-HJ-NP-Z2-9]{10}$/;

const tokenDe = (rol, sub = ID_USUARIO) => jwt.sign({ sub, rol }, process.env.JWT_SECRET, { expiresIn: '1h' });
const TOKEN_INSTITUCION = tokenDe('institucion');

const UNIDAD_VALIDA = {
  grupoSanguineo: 'O',
  factorRh: 'negativo',
  componente: 'globulos_rojos',
  fechaExtraccion: hace(3),
};

const cargar = (body, token = TOKEN_INSTITUCION) =>
  request(app).post('/api/unidades').set('Authorization', `Bearer ${token}`).send(body);

// Lo que se le pasó a la base en la última llamada
const unidadCreada = () => prisma.unidadSangre.create.mock.calls.at(-1)[0].data;
const movimientoCreado = () => prisma.movimientoUnidad.create.mock.calls.at(-1)[0].data;

beforeEach(() => {
  jest.resetAllMocks();
  prisma.$transaction.mockImplementation((operaciones) => operaciones(prisma));
  prisma.usuarioInstitucion.findFirst.mockResolvedValue({ idUsuario: ID_USUARIO, idInstitucion: ID_INSTITUCION });
  // La base devuelve lo que se le pidió crear, con su id
  prisma.unidadSangre.create.mockImplementation(async ({ data }) => ({ idUnidadSangre: ID_UNIDAD, ...data }));
  prisma.movimientoUnidad.create.mockResolvedValue({});
});

describe('Criterio 1: cada unidad se carga una por una, con un código único', () => {
  test('una carga crea exactamente una unidad', async () => {
    const res = await cargar(UNIDAD_VALIDA);
    expect(res.status).toBe(201);
    expect(prisma.unidadSangre.create).toHaveBeenCalledTimes(1);
    expect(res.body.idUnidadSangre).toBe(ID_UNIDAD);
  });

  test('una lista de unidades se rechaza', async () => {
    const res = await cargar([UNIDAD_VALIDA, UNIDAD_VALIDA]);
    expect(res.status).toBe(400);
    expect(res.body.error.codigo).toBe('DATOS_INVALIDOS');
    expect(prisma.unidadSangre.create).not.toHaveBeenCalled();
  });

  test('sin cuerpo se rechaza', async () => {
    const res = await request(app).post('/api/unidades').set('Authorization', `Bearer ${TOKEN_INSTITUCION}`);
    expect(res.status).toBe(400);
    expect(prisma.unidadSangre.create).not.toHaveBeenCalled();
  });

  test('el sistema le asigna el código y lo devuelve', async () => {
    const res = await cargar(UNIDAD_VALIDA);
    expect(res.body.codigo).toMatch(FORMATO_CODIGO);
    expect(unidadCreada().codigo).toBe(res.body.codigo);
  });

  test('el código no se puede elegir desde el body', async () => {
    const res = await cargar({ ...UNIDAD_VALIDA, codigo: 'MI-CODIGO' });
    expect(res.status).toBe(201);
    expect(unidadCreada().codigo).toMatch(FORMATO_CODIGO);
  });

  test('los códigos generados no se repiten y se pueden leer sin confundir caracteres', () => {
    const codigos = Array.from({ length: 2000 }, generarCodigo);
    expect(new Set(codigos).size).toBe(codigos.length);
    for (const codigo of codigos) expect(codigo).toMatch(FORMATO_CODIGO);
  });
});

describe('Criterio 2: el vencimiento se calcula según el componente', () => {
  test('glóbulos rojos duran 42 días y plaquetas 5', () => {
    expect(DIAS_DE_VIDA).toEqual({ globulos_rojos: 42, plaquetas: 5 });
    expect(calcularVencimiento('globulos_rojos', '2026-09-25')).toBe('2026-11-06');
    expect(calcularVencimiento('plaquetas', '2026-10-18')).toBe('2026-10-23');
  });

  test('el cálculo cruza meses y años', () => {
    expect(calcularVencimiento('plaquetas', '2026-12-29')).toBe('2027-01-03');
    expect(calcularVencimiento('globulos_rojos', '2028-02-01')).toBe('2028-03-14'); // 2028 es bisiesto
  });

  test('la unidad se guarda con el vencimiento calculado, no con uno enviado', async () => {
    const res = await cargar({ ...UNIDAD_VALIDA, fechaExtraccion: hace(2), fechaVencimiento: '2099-01-01' });
    expect(res.status).toBe(201);
    expect(res.body.fechaVencimiento).toBe(sumar(hace(2), 42));
    expect(formatearFecha(unidadCreada().fechaVencimiento)).toBe(sumar(hace(2), 42));
  });

  test('plaquetas extraídas hace 5 días vencen hoy: todavía se pueden cargar', async () => {
    const res = await cargar({ ...UNIDAD_VALIDA, componente: 'plaquetas', fechaExtraccion: hace(5) });
    expect(res.status).toBe(201);
    expect(res.body.fechaVencimiento).toBe(HOY);
  });

  test('plaquetas extraídas hace 6 días ya vencieron: no se cargan', async () => {
    const res = await cargar({ ...UNIDAD_VALIDA, componente: 'plaquetas', fechaExtraccion: hace(6) });
    expect(res.status).toBe(400);
    expect(res.body.error.mensaje).toContain('ya venció');
    expect(prisma.unidadSangre.create).not.toHaveBeenCalled();
  });

  test('sangre entera no se acepta: el issue no dice cuánto dura', async () => {
    const res = await cargar({ ...UNIDAD_VALIDA, componente: 'sangre_entera' });
    expect(res.status).toBe(400);
    expect(res.body.error.mensaje).toBe('componente debe ser globulos_rojos o plaquetas');
  });

  test.each([
    ['falta el grupo', { grupoSanguineo: undefined }, 'grupoSanguineo'],
    ['grupo inválido', { grupoSanguineo: 'C' }, 'grupoSanguineo'],
    ['factor inválido', { factorRh: '+' }, 'factorRh'],
    ['componente inválido', { componente: 'plasma' }, 'componente'],
    ['falta la fecha de extracción', { fechaExtraccion: undefined }, 'fechaExtraccion'],
    ['fecha con otro formato', { fechaExtraccion: '15/10/2026' }, 'fechaExtraccion'],
    ['fecha que no existe', { fechaExtraccion: '2026-02-30' }, 'fechaExtraccion'],
    ['fecha futura', { fechaExtraccion: sumar(HOY, 1) }, 'futura'],
  ])('%s → 400', async (_caso, cambio, texto) => {
    const res = await cargar({ ...UNIDAD_VALIDA, ...cambio });
    expect(res.status).toBe(400);
    expect(res.body.error.codigo).toBe('DATOS_INVALIDOS');
    expect(res.body.error.mensaje).toContain(texto);
    expect(prisma.unidadSangre.create).not.toHaveBeenCalled();
  });
});

describe('Criterio 3: cada ingreso genera un movimiento de tipo "ingreso"', () => {
  test('se registra el movimiento de la unidad creada', async () => {
    await cargar(UNIDAD_VALIDA);
    expect(prisma.movimientoUnidad.create).toHaveBeenCalledTimes(1);
    expect(movimientoCreado()).toEqual({
      idUnidadSangre: ID_UNIDAD,
      tipo: 'ingreso',
      estadoAnterior: null,
      estadoNuevo: 'disponible',
      idInstitucionDestino: ID_INSTITUCION,
      idUsuario: ID_USUARIO,
    });
  });

  test('la unidad y el movimiento se crean en la misma transacción', async () => {
    await cargar(UNIDAD_VALIDA);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  test('si falla el movimiento, la carga falla (y la transacción deshace la unidad)', async () => {
    prisma.movimientoUnidad.create.mockRejectedValue(new Error('falla de la base'));
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const res = await cargar(UNIDAD_VALIDA);
    expect(res.status).toBe(500);
    console.error.mockRestore();
  });
});

describe('Criterio 4: la unidad nace en estado "disponible"', () => {
  test('se crea y se devuelve como disponible', async () => {
    const res = await cargar(UNIDAD_VALIDA);
    expect(unidadCreada().estado).toBe('disponible');
    expect(res.body).toEqual({
      idUnidadSangre: ID_UNIDAD,
      codigo: expect.stringMatching(FORMATO_CODIGO),
      idInstitucion: ID_INSTITUCION,
      idDonacion: null,
      grupoSanguineo: 'O',
      factorRh: 'negativo',
      componente: 'globulos_rojos',
      fechaExtraccion: UNIDAD_VALIDA.fechaExtraccion,
      fechaVencimiento: sumar(UNIDAD_VALIDA.fechaExtraccion, 42),
      estado: 'disponible',
    });
  });

  test('el estado no se puede elegir desde el body', async () => {
    await cargar({ ...UNIDAD_VALIDA, estado: 'reservada' });
    expect(unidadCreada().estado).toBe('disponible');
  });
});

describe('Criterio 5: función interna para que DV-11 cree unidades desde una donación', () => {
  const desdeDonacion = {
    idInstitucion: ID_INSTITUCION,
    idDonacion: ID_DONACION,
    idUsuario: ID_USUARIO,
    grupoSanguineo: 'A',
    factorRh: 'positivo',
    componente: 'plaquetas',
    fechaExtraccion: HOY,
  };

  test('crea la unidad vinculada a la donación, con su movimiento de ingreso', async () => {
    const { unidad, error } = await registrarIngresoUnidad(desdeDonacion);
    expect(error).toBeUndefined();
    expect(unidad.idDonacion).toBe(ID_DONACION);
    expect(unidadCreada()).toMatchObject({ idDonacion: ID_DONACION, componente: 'plaquetas', estado: 'disponible' });
    expect(movimientoCreado()).toMatchObject({ tipo: 'ingreso', idUnidadSangre: ID_UNIDAD });
  });

  test('funciona dentro de la transacción de quien la llama, sin abrir otra', async () => {
    const tx = {
      unidadSangre: { create: jest.fn(async ({ data }) => ({ idUnidadSangre: ID_UNIDAD, ...data })) },
      movimientoUnidad: { create: jest.fn().mockResolvedValue({}) },
    };
    const { unidad } = await registrarIngresoUnidad(desdeDonacion, tx);
    expect(unidad.idUnidadSangre).toBe(ID_UNIDAD);
    expect(tx.unidadSangre.create).toHaveBeenCalledTimes(1);
    expect(tx.movimientoUnidad.create).toHaveBeenCalledTimes(1);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  test('con datos inválidos devuelve el error y no crea nada', async () => {
    const { error, unidad } = await registrarIngresoUnidad({ ...desdeDonacion, componente: 'plasma' });
    expect(error).toBe('componente debe ser globulos_rojos o plaquetas');
    expect(unidad).toBeUndefined();
    expect(prisma.unidadSangre.create).not.toHaveBeenCalled();
  });

  test('sin usuario (lo hace el sistema) el movimiento queda sin usuario', async () => {
    await registrarIngresoUnidad({ ...desdeDonacion, idUsuario: undefined });
    expect(movimientoCreado().idUsuario).toBeNull();
  });

  test('desde el endpoint no se puede vincular una donación ni elegir la institución', async () => {
    const OTRA = '77777777-7777-4777-8777-777777777777';
    await cargar({ ...UNIDAD_VALIDA, idDonacion: ID_DONACION, idInstitucion: OTRA });
    expect(unidadCreada()).toMatchObject({ idDonacion: null, idInstitucion: ID_INSTITUCION });
  });

  test('validarIngreso es la misma regla para la ruta y para DV-11', () => {
    expect(validarIngreso(UNIDAD_VALIDA, HOY)).toBeNull();
    expect(validarIngreso({ ...UNIDAD_VALIDA, fechaExtraccion: sumar(HOY, 1) }, HOY)).toContain('futura');
  });
});

describe('Criterio 6: solo instituciones aprobadas pueden cargar unidades', () => {
  test('sin token → 401', async () => {
    const res = await request(app).post('/api/unidades').send(UNIDAD_VALIDA);
    expect(res.status).toBe(401);
  });

  test('un donante → 403', async () => {
    const res = await cargar(UNIDAD_VALIDA, tokenDe('donante'));
    expect(res.status).toBe(403);
    expect(prisma.unidadSangre.create).not.toHaveBeenCalled();
  });

  test('un admin → 403', async () => {
    const res = await cargar(UNIDAD_VALIDA, tokenDe('admin'));
    expect(res.status).toBe(403);
  });

  test('una institución sin aprobar (pendiente, rechazada o dada de baja) → 403', async () => {
    prisma.usuarioInstitucion.findFirst.mockResolvedValue(null);
    const res = await cargar(UNIDAD_VALIDA);
    expect(res.status).toBe(403);
    expect(res.body.error.codigo).toBe('SIN_PERMISO');
    expect(prisma.unidadSangre.create).not.toHaveBeenCalled();
  });

  test('solo cuenta un vínculo con una institución aprobada', async () => {
    await cargar(UNIDAD_VALIDA);
    expect(prisma.usuarioInstitucion.findFirst).toHaveBeenCalledWith({
      where: { idUsuario: ID_USUARIO, institucion: { estado: 'aprobada' } },
    });
  });

  test('la unidad entra a la institución del usuario', async () => {
    const res = await cargar(UNIDAD_VALIDA);
    expect(unidadCreada().idInstitucion).toBe(ID_INSTITUCION);
    expect(res.body.idInstitucion).toBe(ID_INSTITUCION);
  });
});
