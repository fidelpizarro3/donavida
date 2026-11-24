process.env.JWT_SECRET = 'secreto_de_prueba_para_los_tests_del_carne';

const request = require('supertest');
const jwt = require('jsonwebtoken');

// Base simulada: cada test decide qué devuelve cada consulta
jest.mock('../src/lib/prisma', () => ({
  usuarioInstitucion: { findFirst: jest.fn() },
  donante: { findUnique: jest.fn() },
  alerta: { findUnique: jest.fn() },
  franjaHoraria: { findUnique: jest.fn(), updateMany: jest.fn(), fields: { cupoTotal: 'cupoTotal' } },
  turno: { findFirst: jest.fn(), findUnique: jest.fn(), create: jest.fn() },
  donacion: { count: jest.fn(), findFirst: jest.fn() },
  $transaction: jest.fn(),
}));
// La habilitación es de la TAREA-3: acá se prueba que el carné la muestre
jest.mock('../src/services/habilitacion', () => ({
  ...jest.requireActual('../src/services/habilitacion'),
  obtenerHabilitacion: jest.fn(),
}));

const prisma = require('../src/lib/prisma');
const { obtenerHabilitacion } = require('../src/services/habilitacion');
const { lineasDelComprobante } = require('../src/services/comprobante');
const app = require('../src/app');
const { obtenerFechaHoy } = require('../src/utils/validaciones');
const { parsearFecha } = require('../src/utils/formateadores');

const ID_USUARIO = '11111111-1111-4111-8111-111111111111';
const ID_DONANTE = '22222222-2222-4222-8222-222222222222';
const ID_ALERTA = '33333333-3333-4333-8333-333333333333';
const ID_INSTITUCION = '44444444-4444-4444-8444-444444444444';
const ID_OTRA_INSTITUCION = '45454545-4545-4545-8545-454545454545';
const ID_FRANJA = '55555555-5555-4555-8555-555555555555';
const ID_TURNO = '77777777-7777-4777-8777-777777777777';
const ID_DONACION = '99999999-9999-4999-8999-999999999999';
const CODIGO = '0123456789abcdef0123456789abcdef';

const tokenDe = (rol) => jwt.sign({ sub: ID_USUARIO, rol }, process.env.JWT_SECRET, { expiresIn: '1h' });
const TOKEN_DONANTE = tokenDe('donante');
const TOKEN_INSTITUCION = tokenDe('institucion');

const HOY = parsearFecha(obtenerFechaHoy());
const enDias = (dias) => new Date(HOY.getTime() + dias * 86400000);
const textoFecha = (fecha) => fecha.toISOString().slice(0, 10);

const DONANTE = {
  idDonante: ID_DONANTE,
  idUsuario: ID_USUARIO,
  documento: '30111222',
  grupoSanguineo: 'O',
  factorRh: 'negativo',
  usuario: { nombre: 'Ana', apellido: 'Paz' },
};

const franja = (datos = {}) => ({
  idFranjaHoraria: ID_FRANJA,
  idInstitucion: ID_INSTITUCION,
  fecha: HOY,
  horaInicio: new Date('1970-01-01T08:00:00Z'),
  horaFin: new Date('1970-01-01T12:00:00Z'),
  ...datos,
});

// Un turno escaneado, como lo trae prisma.turno.findUnique en GET /api/turnos/qr/:codigo
const turnoEscaneado = (datos = {}) => ({
  idTurno: ID_TURNO,
  idDonante: ID_DONANTE,
  idAlerta: ID_ALERTA,
  estado: 'reservado',
  codigoQr: CODIGO,
  franjaHoraria: franja(),
  donacion: null,
  donante: DONANTE,
  ...datos,
});

beforeEach(() => {
  jest.resetAllMocks();
  prisma.$transaction.mockImplementation((operaciones) => operaciones(prisma));
  prisma.usuarioInstitucion.findFirst.mockResolvedValue({ idInstitucion: ID_INSTITUCION });
});

describe('Mi carné (GET /api/donantes/carne)', () => {
  const pedirCarne = (token = TOKEN_DONANTE) => request(app).get('/api/donantes/carne').set('Authorization', `Bearer ${token}`);

  beforeEach(() => {
    prisma.donante.findUnique.mockResolvedValue(DONANTE);
    prisma.donacion.count.mockResolvedValue(3);
    obtenerHabilitacion.mockResolvedValue({ habilitado: false, aptoDesde: '2027-01-05', motivo: 'Donó hace menos de 56 días' });
    prisma.turno.findFirst.mockResolvedValue(null);
  });

  test('sin sesión responde 401, y una institución no puede pedirlo', async () => {
    expect((await request(app).get('/api/donantes/carne')).status).toBe(401);
    expect((await pedirCarne(TOKEN_INSTITUCION)).status).toBe(403);
  });

  test('si el usuario no tiene perfil de donante, 404', async () => {
    prisma.donante.findUnique.mockResolvedValue(null);
    expect((await pedirCarne()).status).toBe(404);
  });

  test('criterio: muestra nombre, grupo, cantidad de donaciones y desde cuándo vuelve a estar habilitado', async () => {
    const res = await pedirCarne();
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      idUsuario: ID_USUARIO,
      nombre: 'Ana',
      apellido: 'Paz',
      grupoSanguineo: 'O',
      factorRh: 'negativo',
      totalDonaciones: 3,
      habilitado: false,
      aptoDesde: '2027-01-05',
    });
    // Cuentan solo las donaciones realizadas (si lo rechazó el control médico, no donó)
    expect(prisma.donacion.count).toHaveBeenCalledWith({ where: { idDonante: ID_DONANTE, resultado: 'realizada' } });
    expect(obtenerHabilitacion).toHaveBeenCalledWith(ID_DONANTE);
  });

  test('criterio: el QR es el código del próximo turno reservado, con su fecha, horario y hospital', async () => {
    prisma.turno.findFirst.mockResolvedValue({
      idTurno: ID_TURNO,
      codigoQr: CODIGO,
      franjaHoraria: franja({ fecha: enDias(2), institucion: { nombre: 'Hospital del Valle', direccion: 'Av. Argentina 1400' } }),
    });

    const res = await pedirCarne();
    expect(res.body.proximoTurno).toEqual({
      idTurno: ID_TURNO,
      codigoQr: CODIGO,
      fecha: textoFecha(enDias(2)),
      horaInicio: '08:00',
      horaFin: '12:00',
      institucion: { nombre: 'Hospital del Valle', direccion: 'Av. Argentina 1400' },
    });
    // Solo turnos reservados, de hoy en adelante, del propio donante
    const { where, include } = prisma.turno.findFirst.mock.calls[0][0];
    expect(where).toMatchObject({ idDonante: ID_DONANTE, estado: 'reservado', franjaHoraria: { fecha: { gte: HOY } } });
    expect(include.franjaHoraria.include.institucion.select).toEqual({ nombre: true, direccion: true });
  });

  test('sin turno reservado no hay QR, y si todavía no sabe su grupo va en null', async () => {
    prisma.donante.findUnique.mockResolvedValue({ ...DONANTE, grupoSanguineo: null, factorRh: null });
    const res = await pedirCarne();
    expect(res.body.proximoTurno).toBeNull();
    expect(res.body.grupoSanguineo).toBeNull();
  });
});

describe('Escanear el carné (GET /api/turnos/qr/:codigo)', () => {
  const escanear = (codigo = CODIGO, token = TOKEN_INSTITUCION) =>
    request(app).get(`/api/turnos/qr/${encodeURIComponent(codigo)}`).set('Authorization', `Bearer ${token}`);

  beforeEach(() => {
    prisma.turno.findUnique.mockResolvedValue(turnoEscaneado());
    prisma.donacion.count.mockResolvedValue(4);
  });

  test('criterio: el hospital ve la ficha del donante y su turno de hoy, listo para registrar la donación', async () => {
    const res = await escanear();
    expect(res.status).toBe(200);
    // Misma forma que cada turno de GET /api/turnos, así el front lo registra igual (DV-11)
    expect(res.body).toMatchObject({
      idTurno: ID_TURNO,
      estado: 'reservado',
      fecha: obtenerFechaHoy(),
      horaInicio: '08:00',
      horaFin: '12:00',
      resultadoDonacion: null,
      donante: { idDonante: ID_DONANTE, nombre: 'Ana', apellido: 'Paz', documento: '30111222', grupoSanguineo: 'O', factorRh: 'negativo', totalDonaciones: 4 },
    });
    expect(prisma.turno.findUnique.mock.calls[0][0].where).toEqual({ codigoQr: CODIGO });
  });

  test('acepta el código como lo escribe un lector USB o se pega: con mayúsculas o espacios', async () => {
    const res = await escanear('0123 4567 89AB CDEF 0123 4567 89AB CDEF');
    expect(res.status).toBe(200);
    expect(prisma.turno.findUnique.mock.calls[0][0].where).toEqual({ codigoQr: CODIGO });
  });

  test('un texto que no es un código de DonaVida: 400 sin consultar la base', async () => {
    const res = await escanear('https://otro-sitio.com');
    expect(res.status).toBe(400);
    expect(res.body.error.mensaje).toBe('Este QR no es de un carné de DonaVida');
    expect(prisma.turno.findUnique).not.toHaveBeenCalled();
  });

  test('solo lo usa una institución aprobada', async () => {
    prisma.usuarioInstitucion.findFirst.mockResolvedValue(null);
    expect((await escanear()).status).toBe(403);
    expect((await escanear(CODIGO, TOKEN_DONANTE)).status).toBe(403);
  });

  test('un código que no corresponde a ningún turno: 404', async () => {
    prisma.turno.findUnique.mockResolvedValue(null);
    const res = await escanear();
    expect(res.status).toBe(404);
    expect(res.body.error.mensaje).toBe('Este QR no corresponde a ningún turno');
  });

  test('criterio: un QR de otra institución muestra un error claro', async () => {
    prisma.turno.findUnique.mockResolvedValue(turnoEscaneado({ franjaHoraria: franja({ idInstitucion: ID_OTRA_INSTITUCION }) }));
    const res = await escanear();
    expect(res.status).toBe(403);
    expect(res.body.error.mensaje).toBe('Este turno es en otra institución');
  });

  test.each([
    ['ya registrado (vino)', { estado: 'asistio' }, 'Este QR ya se usó'],
    ['ya registrado (no vino)', { estado: 'ausente' }, 'Este QR ya se usó'],
    ['cancelado por el donante', { estado: 'cancelado' }, 'El donante canceló este turno'],
    ['de un día que ya pasó (una captura vieja)', { franjaHoraria: franja({ fecha: enDias(-1) }) }, 'QR vencido: el turno era el'],
    ['de un día que todavía no llegó', { franjaHoraria: franja({ fecha: enDias(3) }) }, 'se registra ese día'],
  ])('criterio: un QR vencido o que no sirve hoy muestra el motivo: %s', async (_caso, datos, mensaje) => {
    prisma.turno.findUnique.mockResolvedValue(turnoEscaneado(datos));
    const res = await escanear();
    expect(res.status).toBe(409);
    expect(res.body.error.mensaje).toContain(mensaje);
    expect(prisma.donacion.count).not.toHaveBeenCalled();
  });
});

describe('Criterio: el QR se renueva en cada turno', () => {
  test('cada turno que se reserva tiene su propio código, largo y al azar', async () => {
    const NECESIDAD = { idInstitucion: ID_INSTITUCION, estado: 'abierta', fechaLimite: enDias(10) };
    prisma.donante.findUnique.mockResolvedValue(DONANTE);
    prisma.alerta.findUnique.mockResolvedValue({ idDonante: ID_DONANTE, estado: 'aceptada', convocatoria: { necesidad: NECESIDAD } });
    prisma.franjaHoraria.findUnique.mockResolvedValue(franja({ fecha: enDias(2) }));
    prisma.franjaHoraria.updateMany.mockResolvedValue({ count: 1 });
    obtenerHabilitacion.mockResolvedValue({ habilitado: true });
    prisma.turno.create.mockImplementation(async ({ data }) => ({ idTurno: ID_TURNO, ...data, franjaHoraria: franja({ fecha: enDias(2) }) }));

    const reservar = () => request(app).post('/api/turnos').set('Authorization', `Bearer ${TOKEN_DONANTE}`)
      .send({ idAlerta: ID_ALERTA, idFranjaHoraria: ID_FRANJA });
    expect((await reservar()).status).toBe(201);
    expect((await reservar()).status).toBe(201);

    const [primero, segundo] = prisma.turno.create.mock.calls.map(([{ data }]) => data.codigoQr);
    expect(primero).toMatch(/^[0-9a-f]{32}$/);
    expect(segundo).toMatch(/^[0-9a-f]{32}$/);
    expect(primero).not.toBe(segundo);
  });
});

describe('Comprobante de la donación (GET /api/donaciones/:idDonacion/comprobante)', () => {
  const DONACION = {
    idDonacion: ID_DONACION,
    fecha: parsearFecha('2026-11-24'),
    resultado: 'realizada',
    grupoConfirmado: 'O',
    factorRhConfirmado: 'negativo',
    donante: DONANTE,
    institucion: { nombre: 'Hospital del Valle', direccion: 'Av. Argentina 1400, Neuquén' },
  };
  // supertest no junta el cuerpo de un PDF: se lee como bytes
  const comoBytes = (res, listo) => {
    const partes = [];
    res.on('data', (parte) => partes.push(parte));
    res.on('end', () => listo(null, Buffer.concat(partes)));
  };
  const pedirComprobante = (id = ID_DONACION, token = TOKEN_DONANTE) =>
    request(app).get(`/api/donaciones/${id}/comprobante`).set('Authorization', `Bearer ${token}`).buffer(true).parse(comoBytes);

  beforeEach(() => {
    prisma.donacion.findFirst.mockResolvedValue(DONACION);
  });

  test('criterio: después de donar se descarga el comprobante en PDF', async () => {
    const res = await pedirComprobante();
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(res.headers['content-disposition']).toBe('attachment; filename="comprobante-donacion-2026-11-24.pdf"');
    expect(res.body.subarray(0, 5).toString()).toBe('%PDF-');
  });

  test('solo busca entre las donaciones del propio donante: una ajena o que no existe da 404', async () => {
    prisma.donacion.findFirst.mockResolvedValue(null);
    const res = await pedirComprobante();
    expect(res.status).toBe(404);
    expect(prisma.donacion.findFirst.mock.calls[0][0].where).toEqual({ idDonacion: ID_DONACION, donante: { idUsuario: ID_USUARIO } });
  });

  test('si el control médico la rechazó no hubo donación: no hay comprobante (409)', async () => {
    prisma.donacion.findFirst.mockResolvedValue({ ...DONACION, resultado: 'rechazada' });
    expect((await pedirComprobante()).status).toBe(409);
  });

  test('un id inválido da 400, y una institución no puede pedirlo', async () => {
    expect((await pedirComprobante('no-es-un-id')).status).toBe(400);
    expect((await pedirComprobante(ID_DONACION, TOKEN_INSTITUCION)).status).toBe(403);
  });

  test('el comprobante dice quién donó, cuándo, dónde, el grupo confirmado y el código', () => {
    const contenido = lineasDelComprobante(DONACION, new Date('2026-11-24T18:30:00Z'));
    expect(contenido.titulo).toBe('Comprobante de donación de sangre');
    expect(contenido.datos).toEqual([
      ['Donante', 'Ana Paz'],
      ['DNI', '30111222'],
      ['Fecha de la donación', '24/11/2026'],
      ['Lugar', 'Hospital del Valle, Av. Argentina 1400, Neuquén'],
      ['Grupo sanguíneo', 'O negativo'],
      ['Código del comprobante', ID_DONACION],
    ]);
    // La hora de emisión va en hora de Argentina (UTC-3)
    expect(contenido.pie).toContain('24/11/2026, 15:30');
  });

  test('si la donación no tiene el grupo confirmado, no lo inventa', () => {
    const contenido = lineasDelComprobante({ ...DONACION, grupoConfirmado: null, factorRhConfirmado: null });
    expect(contenido.datos.map(([etiqueta]) => etiqueta)).not.toContain('Grupo sanguíneo');
  });
});
