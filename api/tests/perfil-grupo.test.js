process.env.JWT_SECRET = 'secreto_de_prueba_para_los_tests_del_grupo_en_el_perfil';

const request = require('supertest');
const jwt = require('jsonwebtoken');

// Base simulada: cada test decide qué devuelve cada consulta
jest.mock('../src/lib/prisma', () => ({
  donante: { findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
  $transaction: jest.fn(),
}));

const prisma = require('../src/lib/prisma');
const app = require('../src/app');

const ID_USUARIO = '11111111-1111-4111-8111-111111111111';
const TOKEN = jwt.sign({ sub: ID_USUARIO, rol: 'donante' }, process.env.JWT_SECRET, { expiresIn: '1h' });
const patch = (body, token = TOKEN) =>
  request(app).patch('/api/donantes/perfil').set('Authorization', `Bearer ${token}`).send(body);

// Un donante como lo devuelve la base (con su usuario, para armar el perfil)
const donante = (grupoSanguineo = null, factorRh = null) => ({
  idDonante: '22222222-2222-4222-8222-222222222222',
  idUsuario: ID_USUARIO,
  documento: '30111222',
  fechaNacimiento: new Date('1995-04-10T00:00:00.000Z'),
  sexo: 'femenino',
  grupoSanguineo,
  factorRh,
  contactoHoraDesde: null,
  contactoHoraHasta: null,
  alertasPausadasHasta: null,
  avisoPush: true,
  avisoEmail: true,
  avisoWhatsapp: false,
  latitud: null,
  longitud: null,
  topeAlertasMes: 4,
  aptoDesde: null,
  usuario: { idUsuario: ID_USUARIO, email: 'ana@donavida.test', nombre: 'Ana', apellido: 'Paz', rol: 'donante', emailVerificado: true },
});

beforeEach(() => {
  jest.resetAllMocks();
  prisma.$transaction.mockImplementation((operaciones) => operaciones(prisma));
  prisma.donante.update.mockResolvedValue(donante('O', 'positivo'));
});

describe('El donante que no sabía su grupo lo puede declarar en el perfil', () => {
  test('sin grupo cargado: lo guarda y el perfil lo devuelve', async () => {
    prisma.donante.updateMany.mockResolvedValue({ count: 1 });
    const res = await patch({ grupoSanguineo: 'O', factorRh: 'positivo' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ grupoSanguineo: 'O', factorRh: 'positivo' });
  });

  test('solo se guarda si todavía no tenía grupo (chequeo y cambio en una sola operación)', async () => {
    prisma.donante.updateMany.mockResolvedValue({ count: 1 });
    await patch({ grupoSanguineo: 'AB', factorRh: 'negativo' });
    expect(prisma.donante.updateMany).toHaveBeenCalledWith({
      where: { idUsuario: ID_USUARIO, grupoSanguineo: null },
      data: { grupoSanguineo: 'AB', factorRh: 'negativo' },
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });
});

describe('Una vez cargado no se puede cambiar', () => {
  test('si ya tenía grupo (del registro, del perfil o de una donación) → 409 y no cambia nada', async () => {
    prisma.donante.updateMany.mockResolvedValue({ count: 0 });
    prisma.donante.findUnique.mockResolvedValue(donante('A', 'negativo'));
    const res = await patch({ grupoSanguineo: 'O', factorRh: 'positivo' });
    expect(res.status).toBe(409);
    expect(res.body.error).toEqual({ codigo: 'CONFLICTO', mensaje: 'Tu grupo sanguíneo ya está cargado y no se puede cambiar' });
    expect(prisma.donante.update).not.toHaveBeenCalled();
  });

  test('si en el mismo pedido viene otro dato, tampoco se guarda ese dato', async () => {
    prisma.donante.updateMany.mockResolvedValue({ count: 0 });
    prisma.donante.findUnique.mockResolvedValue(donante('A', 'negativo'));
    const res = await patch({ grupoSanguineo: 'O', factorRh: 'positivo', avisoEmail: false });
    expect(res.status).toBe(409);
    expect(prisma.donante.update).not.toHaveBeenCalled();
  });

  test('dos pedidos a la vez con grupos distintos: se guarda uno solo', async () => {
    prisma.donante.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    prisma.donante.findUnique.mockResolvedValue(donante('O', 'positivo'));
    const [a, b] = await Promise.all([
      patch({ grupoSanguineo: 'O', factorRh: 'positivo' }),
      patch({ grupoSanguineo: 'B', factorRh: 'negativo' }),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
  });

  test.each([
    ['borrarlo con null', { grupoSanguineo: null, factorRh: null }],
    ['solo el grupo', { grupoSanguineo: 'O' }],
    ['solo el factor', { factorRh: 'positivo' }],
    ['un grupo inválido', { grupoSanguineo: 'C', factorRh: 'positivo' }],
    ['un factor inválido', { grupoSanguineo: 'O', factorRh: '+' }],
  ])('%s → 400 sin tocar la base', async (_caso, body) => {
    const res = await patch(body);
    expect(res.status).toBe(400);
    expect(res.body.error.codigo).toBe('DATOS_INVALIDOS');
    expect(prisma.donante.updateMany).not.toHaveBeenCalled();
    expect(prisma.donante.update).not.toHaveBeenCalled();
  });
});

describe('El resto del perfil sigue igual', () => {
  test('cambiar otro dato no toca el grupo ni abre una transacción', async () => {
    prisma.donante.update.mockResolvedValue(donante());
    const res = await patch({ avisoEmail: false });
    expect(res.status).toBe(200);
    expect(prisma.donante.updateMany).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.donante.update.mock.calls[0][0].data).toEqual({ avisoEmail: false });
  });

  test('un donante que no existe → 404', async () => {
    prisma.donante.updateMany.mockResolvedValue({ count: 0 });
    prisma.donante.findUnique.mockResolvedValue(null);
    expect((await patch({ grupoSanguineo: 'O', factorRh: 'positivo' })).status).toBe(404);
  });

  test('una institución no puede usar este endpoint → 403', async () => {
    const tokenInstitucion = jwt.sign({ sub: ID_USUARIO, rol: 'institucion' }, process.env.JWT_SECRET);
    expect((await patch({ grupoSanguineo: 'O', factorRh: 'positivo' }, tokenInstitucion)).status).toBe(403);
  });
});
