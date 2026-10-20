process.env.JWT_SECRET = 'secreto_de_prueba_para_los_tests_publicos';

const request = require('supertest');

// Base simulada: cada test decide qué devuelve cada consulta
jest.mock('../src/lib/prisma', () => ({
  necesidad: { findMany: jest.fn(), updateMany: jest.fn(), count: jest.fn() },
  institucion: { findMany: jest.fn(), count: jest.fn() },
  donante: { count: jest.fn() },
  donacion: { count: jest.fn() },
}));

const prisma = require('../src/lib/prisma');
const app = require('../src/app');

const INSTITUCION = { idInstitucion: 'i1', nombre: 'Hospital Central', direccion: 'Av. 1', latitud: '-38.95', longitud: '-68.05' };
const necesidad = (datos) => ({
  idNecesidad: 'n1',
  grupoSanguineo: 'O',
  factorRh: 'negativo',
  componente: 'globulos_rojos',
  urgencia: 'normal',
  fechaLimite: new Date('2099-01-10'),
  unidadesSolicitadas: 6,
  unidadesCubiertas: 4,
  institucion: INSTITUCION,
  convocatorias: [{ _count: { alertas: 7 } }, { _count: { alertas: 5 } }],
  ...datos,
});

beforeEach(() => {
  jest.resetAllMocks();
  prisma.necesidad.updateMany.mockResolvedValue({ count: 0 });
});

describe('Datos públicos de la página de inicio (sin login)', () => {
  test('necesidades abiertas: urgentes primero, con lo que falta y a cuántos se avisó', async () => {
    prisma.necesidad.findMany.mockResolvedValue([necesidad({ idNecesidad: 'normal' }), necesidad({ idNecesidad: 'urgente', urgencia: 'urgente' })]);
    const res = await request(app).get('/api/publico/necesidades');

    expect(res.status).toBe(200);
    expect(res.body.map((n) => n.idNecesidad)).toEqual(['urgente', 'normal']);
    expect(res.body[0]).toMatchObject({ unidadesFaltantes: 2, donantesAvisados: 12, institucion: { latitud: -38.95 } });
    expect(prisma.necesidad.findMany.mock.calls[0][0].where).toEqual({ estado: 'abierta', institucion: { estado: 'aprobada' } });
  });

  test('no devuelve ningún dato de los donantes', async () => {
    prisma.necesidad.findMany.mockResolvedValue([necesidad()]);
    const res = await request(app).get('/api/publico/necesidades');
    const texto = JSON.stringify(res.body);
    expect(texto).not.toMatch(/idDonante|email|documento|apellido/);
  });

  test('instituciones del mapa: aprobadas, con sus pedidos abiertos y si hay alguno urgente', async () => {
    prisma.institucion.findMany.mockResolvedValue([
      { ...INSTITUCION, tipo: 'hospital', necesidades: [{ urgencia: 'normal' }, { urgencia: 'urgente' }] },
    ]);
    const res = await request(app).get('/api/publico/instituciones');
    expect(res.body[0]).toMatchObject({ nombre: 'Hospital Central', necesidadesAbiertas: 2, hayUrgente: true, longitud: -68.05 });
    expect(prisma.institucion.findMany.mock.calls[0][0].where).toEqual({ estado: 'aprobada' });
  });

  test('estadísticas: cada donación cuenta como hasta 3 vidas', async () => {
    prisma.donante.count.mockResolvedValue(120);
    prisma.donacion.count.mockResolvedValue(30);
    prisma.institucion.count.mockResolvedValue(4);
    prisma.necesidad.count.mockResolvedValue(3);
    const res = await request(app).get('/api/publico/estadisticas');
    expect(res.body).toEqual({ donantes: 120, donaciones: 30, vidas: 90, instituciones: 4, necesidadesAbiertas: 3 });
  });
});
