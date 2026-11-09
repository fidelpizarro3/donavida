process.env.JWT_SECRET = 'secreto_de_prueba_para_los_tests_del_cierre';
// Con estas claves el push queda "configurado" (web-push está simulado, no se manda nada de verdad)
process.env.VAPID_PUBLIC_KEY = 'clave-publica-de-prueba';
process.env.VAPID_PRIVATE_KEY = 'clave-privada-de-prueba';

const request = require('supertest');
const jwt = require('jsonwebtoken');

// Base, correo y push simulados: cada test decide qué devuelven
jest.mock('../src/lib/prisma', () => ({
  usuarioInstitucion: { findFirst: jest.fn() },
  donante: { findUnique: jest.fn() },
  necesidad: { findUnique: jest.fn(), findFirst: jest.fn(), findMany: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
  convocatoria: { findFirst: jest.fn(), findUnique: jest.fn(), findMany: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
  alerta: {
    findMany: jest.fn(), findFirst: jest.fn(), findUnique: jest.fn(),
    update: jest.fn(), updateMany: jest.fn(), updateManyAndReturn: jest.fn(),
  },
  turno: { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
  franjaHoraria: { findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn(), fields: { cupoTotal: 'cupoTotal' } },
  donacion: { count: jest.fn() },
  transferencia: { count: jest.fn() },
  transferenciaItem: { findMany: jest.fn() },
  suscripcionPush: { findMany: jest.fn(), update: jest.fn() },
  $transaction: jest.fn(),
  $queryRaw: jest.fn(),
}));
jest.mock('../src/lib/correo', () => ({
  enviarCorreoAgradecimiento: jest.fn(),
  enviarCorreoReprogramar: jest.fn(),
}));
jest.mock('web-push', () => ({ setVapidDetails: jest.fn(), sendNotification: jest.fn() }));
// La habilitación para donar (TAREA-3) se prueba aparte: acá siempre puede
jest.mock('../src/services/habilitacion', () => ({
  ...jest.requireActual('../src/services/habilitacion'),
  obtenerHabilitacion: jest.fn(),
}));

const prisma = require('../src/lib/prisma');
const { enviarCorreoAgradecimiento, enviarCorreoReprogramar } = require('../src/lib/correo');
const webpush = require('web-push');
const { obtenerHabilitacion } = require('../src/services/habilitacion');
const app = require('../src/app');
const { cerrarSiCubierta, recibeDonantes, enviarAgradecimientos } = require('../src/services/cierreNecesidad');
const { obtenerFechaHoy } = require('../src/utils/validaciones');
const { parsearFecha } = require('../src/utils/formateadores');

const USUARIO = '11111111-1111-4111-8111-111111111111';
const DONANTE = '22222222-2222-4222-8222-222222222222';
const ALERTA = '33333333-3333-4333-8333-333333333333';
const OTRA_ALERTA = '33333333-3333-4333-8333-000000000002';
const INSTITUCION = '44444444-4444-4444-8444-444444444444';
const FRANJA = '55555555-5555-4555-8555-555555555555';
const OTRA_FRANJA = '55555555-5555-4555-8555-000000000002';
const NEC = '66666666-6666-4666-8666-666666666666';
const TURNO = '77777777-7777-4777-8777-777777777777';
const CONV = '88888888-8888-4888-8888-888888888888';

const tokenDe = (rol) => jwt.sign({ sub: USUARIO, rol }, process.env.JWT_SECRET, { expiresIn: '1h' });
const TOKEN_INSTITUCION = tokenDe('institucion');
const TOKEN_DONANTE = tokenDe('donante');

const HOY = parsearFecha(obtenerFechaHoy());
const enDias = (dias) => new Date(HOY.getTime() + dias * 86400000);

// Una necesidad que ya llegó a lo que pidió (3 de 3)
const necesidad = (datos = {}) => ({
  idNecesidad: NEC,
  idInstitucion: INSTITUCION,
  grupoSanguineo: 'O',
  factorRh: 'negativo',
  componente: 'globulos_rojos',
  urgencia: 'normal',
  unidadesSolicitadas: 3,
  unidadesCubiertas: 3,
  fechaLimite: enDias(10),
  estado: 'abierta',
  creadaEn: new Date('2026-11-01T12:00:00Z'),
  cerradaEn: null,
  cubiertaCon: null,
  ...datos,
});

// Una convocatoria como la devuelve la base, con su necesidad
const convocatoria = (datos = {}, datosNecesidad = {}) => ({
  idConvocatoria: CONV,
  idNecesidad: NEC,
  radioKm: '20.00',
  cupoDisponible: 3,
  estado: 'enviada',
  mantenerAbierta: false,
  decisionTurnos: null,
  creadaEn: new Date('2026-11-02T12:00:00Z'),
  necesidad: necesidad(datosNecesidad),
  ...datos,
});

// Una alerta que se canceló al cubrirse la necesidad, con lo que hace falta para avisarle
const alertaParaAgradecer = (datos = {}, donante = {}) => ({
  idAlerta: ALERTA,
  idConvocatoria: CONV,
  idDonante: DONANTE,
  canal: 'email',
  estado: 'cancelada',
  donante: { idDonante: DONANTE, idUsuario: USUARIO, avisoEmail: true, usuario: { email: 'ana@mail.com', nombre: 'Ana' }, ...donante },
  convocatoria: { necesidad: { institucion: { nombre: 'Hospital Central' } } },
  ...datos,
});

// Un turno reservado de esa convocatoria, como lo trae turnosVigentes()
const turnoReservado = (datos = {}) => ({
  idTurno: TURNO,
  estado: 'reservado',
  franjaHoraria: {
    fecha: enDias(2),
    horaInicio: new Date('1970-01-01T08:00:00Z'),
    horaFin: new Date('1970-01-01T11:00:00Z'),
    institucion: { nombre: 'Hospital Central' },
  },
  donante: { idUsuario: USUARIO, avisoEmail: true, usuario: { email: 'ana@mail.com', nombre: 'Ana' } },
  alerta: { canal: 'email' },
  ...datos,
});

const SUSCRIPCION = { idSuscripcionPush: 'sus-1', endpoint: 'https://push.example/1', p256dh: 'p', auth: 'a' };

const comoInstitucion = () => request(app);
const decidir = (ruta, body, metodo = 'post', token = TOKEN_INSTITUCION) =>
  comoInstitucion()[metodo](`/api/convocatorias/${CONV}${ruta}`).set('Authorization', `Bearer ${token}`).send(body);

beforeEach(() => {
  jest.resetAllMocks();
  prisma.$transaction.mockImplementation((operaciones) => operaciones(prisma));
  prisma.usuarioInstitucion.findFirst.mockResolvedValue({ idUsuario: USUARIO, idInstitucion: INSTITUCION });
  prisma.donacion.count.mockResolvedValue(0);
  prisma.transferencia.count.mockResolvedValue(0);
  prisma.necesidad.updateMany.mockResolvedValue({ count: 1 });
  prisma.convocatoria.updateMany.mockResolvedValue({ count: 1 });
  prisma.alerta.updateMany.mockResolvedValue({ count: 0 });
  prisma.alerta.updateManyAndReturn.mockResolvedValue([]);
  prisma.alerta.findMany.mockResolvedValue([]);
  prisma.suscripcionPush.findMany.mockResolvedValue([]);
  obtenerHabilitacion.mockResolvedValue({ habilitado: true });
});

// ─── Criterio 5 ──────────────────────────────────────────────────────────────

describe('Criterio 5: se dispara solo cuando lo cubierto llega a lo pedido', () => {
  test('con todo lo pedido, la necesidad pasa a cubierta y se cierra su convocatoria', async () => {
    prisma.necesidad.findUnique.mockResolvedValue(necesidad());
    prisma.donacion.count.mockResolvedValue(3);

    expect(await cerrarSiCubierta(NEC)).toBe(true);
    expect(prisma.necesidad.updateMany).toHaveBeenCalledWith({
      where: { idNecesidad: NEC, estado: 'abierta' },
      data: { estado: 'cubierta', cerradaEn: expect.any(Date), cubiertaCon: 'donantes' },
    });
    // Las que el hospital pidió mantener abiertas (criterio 3) no se tocan
    expect(prisma.convocatoria.updateMany).toHaveBeenCalledWith({
      where: { idNecesidad: NEC, estado: 'enviada', mantenerAbierta: false },
      data: { estado: 'cerrada' },
    });
  });

  test('si todavía falta, no cierra nada', async () => {
    prisma.necesidad.findUnique.mockResolvedValue(necesidad({ unidadesCubiertas: 2 }));
    expect(await cerrarSiCubierta(NEC)).toBe(false);
    expect(prisma.necesidad.updateMany).not.toHaveBeenCalled();
    expect(prisma.convocatoria.updateMany).not.toHaveBeenCalled();
  });

  test('no se cierra dos veces: si otro cierre ganó, no vuelve a cerrar la convocatoria', async () => {
    prisma.necesidad.findUnique.mockResolvedValue(necesidad());
    prisma.necesidad.updateMany.mockResolvedValue({ count: 0 }); // otra operación ya la pasó a cubierta
    expect(await cerrarSiCubierta(NEC)).toBe(false);
    expect(prisma.convocatoria.updateMany).not.toHaveBeenCalled();

    prisma.necesidad.findUnique.mockResolvedValue(necesidad({ estado: 'cubierta' }));
    expect(await cerrarSiCubierta(NEC)).toBe(false);
  });

  describe('al corregir la cantidad pedida (PATCH /api/necesidades/:id)', () => {
    const corregir = (unidadesSolicitadas) => request(app).patch(`/api/necesidades/${NEC}`)
      .set('Authorization', `Bearer ${TOKEN_INSTITUCION}`).send({ unidadesSolicitadas });

    beforeEach(() => {
      prisma.necesidad.findFirst.mockResolvedValue(necesidad({ unidadesSolicitadas: 5, unidadesCubiertas: 3 }));
      prisma.donacion.count.mockResolvedValue(3);
    });

    test('si queda igual a lo cubierto, se cierra como cuando llega la última unidad y se agradece', async () => {
      prisma.necesidad.findUnique
        .mockResolvedValueOnce(necesidad()) // cerrarSiCubierta: 3 de 3
        .mockResolvedValue(necesidad({ estado: 'cubierta', cubiertaCon: 'donantes' })); // cómo quedó
      const res = await corregir(3);

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ estado: 'cubierta', cubiertaCon: 'donantes' });
      expect(prisma.necesidad.update).toHaveBeenCalledWith({ where: { idNecesidad: NEC }, data: { unidadesSolicitadas: 3 } });
      expect(prisma.convocatoria.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { estado: 'cerrada' } }));
      expect(prisma.alerta.updateManyAndReturn).toHaveBeenCalled();
    });

    test('si todavía falta, sigue abierta y no se avisa a nadie', async () => {
      prisma.necesidad.findUnique.mockResolvedValue(necesidad({ unidadesSolicitadas: 4 }));
      const res = await corregir(4);
      expect(res.status).toBe(200);
      expect(res.body.estado).toBe('abierta');
      expect(prisma.convocatoria.updateMany).not.toHaveBeenCalled();
      expect(prisma.alerta.updateManyAndReturn).not.toHaveBeenCalled();
    });
  });
});

// ─── Criterio 1 ──────────────────────────────────────────────────────────────

describe('Criterio 1: el agradecimiento le llega por su canal a cada donante que no había ido', () => {
  test('toma las alertas sin responder y las aceptadas sin turno, de las convocatorias cerradas de una necesidad cubierta', async () => {
    await enviarAgradecimientos(NEC);
    const deEstaNecesidad = { idNecesidad: NEC, estado: 'cerrada', necesidad: { estado: 'cubierta' } };
    expect(prisma.alerta.updateManyAndReturn).toHaveBeenCalledWith({
      where: {
        OR: [{ estado: 'enviada' }, { estado: 'aceptada', turno: { is: null } }],
        convocatoria: deEstaNecesidad,
      },
      data: { estado: 'cancelada' },
    });
    // Las que nunca salieron se cancelan sin avisar nada
    expect(prisma.alerta.updateMany).toHaveBeenCalledWith({
      where: { estado: 'pendiente', convocatoria: deEstaNecesidad },
      data: { estado: 'cancelada' },
    });
  });

  test('canal correo: le llega el correo de agradecimiento', async () => {
    prisma.alerta.updateManyAndReturn.mockResolvedValue([{ idAlerta: ALERTA }]);
    prisma.alerta.findMany.mockResolvedValue([alertaParaAgradecer()]);

    expect(await enviarAgradecimientos(NEC)).toBe(1);
    expect(enviarCorreoAgradecimiento).toHaveBeenCalledWith({ email: 'ana@mail.com', nombre: 'Ana', institucion: 'Hospital Central' });
    expect(webpush.sendNotification).not.toHaveBeenCalled();
  });

  test('canal push: le llega al celular (y no además por correo)', async () => {
    prisma.alerta.updateManyAndReturn.mockResolvedValue([{ idAlerta: ALERTA }]);
    prisma.alerta.findMany.mockResolvedValue([alertaParaAgradecer({ canal: 'push' })]);
    prisma.suscripcionPush.findMany.mockResolvedValue([SUSCRIPCION]);

    expect(await enviarAgradecimientos(NEC)).toBe(1);
    const aviso = JSON.parse(webpush.sendNotification.mock.calls[0][1]);
    expect(aviso.titulo).toBe('¡Gracias! Ya no hace falta que vayas');
    expect(aviso.cuerpo).toContain('Hospital Central ya consiguió la sangre que necesitaba');
    expect(enviarCorreoAgradecimiento).not.toHaveBeenCalled();
  });

  test('push sin suscripción: el correo es el respaldo; sin correo activado no hay por dónde avisarle', async () => {
    prisma.alerta.updateManyAndReturn.mockResolvedValue([{ idAlerta: ALERTA }, { idAlerta: OTRA_ALERTA }]);
    prisma.alerta.findMany.mockResolvedValue([
      alertaParaAgradecer({ canal: 'push' }),
      alertaParaAgradecer({ idAlerta: OTRA_ALERTA, canal: 'push' }, { avisoEmail: false }),
    ]);

    expect(await enviarAgradecimientos(NEC)).toBe(1);
    expect(enviarCorreoAgradecimiento).toHaveBeenCalledTimes(1);
  });

  test('si el aviso a uno falla, sigue con los demás y nunca hace fallar el cierre', async () => {
    prisma.alerta.updateManyAndReturn.mockResolvedValue([{ idAlerta: ALERTA }, { idAlerta: OTRA_ALERTA }]);
    prisma.alerta.findMany.mockResolvedValue([alertaParaAgradecer(), alertaParaAgradecer({ idAlerta: OTRA_ALERTA })]);
    enviarCorreoAgradecimiento.mockRejectedValueOnce(new Error('SMTP caído'));
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});

    expect(await enviarAgradecimientos(NEC)).toBe(1);
    expect(enviarCorreoAgradecimiento).toHaveBeenCalledTimes(2);

    prisma.alerta.updateMany.mockRejectedValue(new Error('base caída'));
    expect(await enviarAgradecimientos(NEC)).toBe(0);
    error.mockRestore();
  });
});

// ─── Criterio 6 ──────────────────────────────────────────────────────────────

describe('Criterio 6: un donante no recibe el agradecimiento dos veces', () => {
  test('solo se avisa a las alertas que esta llamada pasó a cancelada: la segunda vez no hay ninguna', async () => {
    prisma.alerta.updateManyAndReturn
      .mockResolvedValueOnce([{ idAlerta: ALERTA }])
      .mockResolvedValueOnce([]); // ya están canceladas: el filtro por estado no las toma
    prisma.alerta.findMany.mockResolvedValue([alertaParaAgradecer()]);

    expect(await enviarAgradecimientos(NEC)).toBe(1);
    expect(await enviarAgradecimientos(NEC)).toBe(0);
    expect(enviarCorreoAgradecimiento).toHaveBeenCalledTimes(1);
    // El donante solo se busca para las que se cancelaron en esta llamada
    expect(prisma.alerta.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.alerta.findMany.mock.calls[0][0].where).toEqual({ idAlerta: { in: [ALERTA] } });
  });

  test('si la necesidad sigue abierta o la convocatoria se mantuvo abierta, no se agradece a nadie', async () => {
    // El filtro pide convocatoria cerrada de una necesidad cubierta: la base no devuelve ninguna
    expect(await enviarAgradecimientos(NEC)).toBe(0);
    expect(prisma.alerta.findMany).not.toHaveBeenCalled();
  });
});

// ─── Criterio 3 ──────────────────────────────────────────────────────────────

describe('Criterio 3: el hospital puede dejar la convocatoria abierta aunque la necesidad esté cubierta', () => {
  describe('POST /api/convocatorias/:id/mantener-abierta', () => {
    beforeEach(() => {
      prisma.convocatoria.findFirst.mockResolvedValue(convocatoria());
      prisma.convocatoria.findUnique.mockResolvedValue(convocatoria());
      prisma.necesidad.findUnique.mockResolvedValue(necesidad({ unidadesCubiertas: 1 }));
      prisma.convocatoria.update.mockImplementation(async ({ data }) => ({ ...convocatoria(), ...data }));
    });

    test('mientras la necesidad está abierta, se marca para que no se cierre al cubrirse', async () => {
      const res = await decidir('/mantener-abierta', { mantener: true });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ idConvocatoria: CONV, estado: 'enviada', mantenerAbierta: true, agradecidos: 0 });
      expect(prisma.convocatoria.update).toHaveBeenCalledWith({ where: { idConvocatoria: CONV }, data: { mantenerAbierta: true } });
      // Bloquea la necesidad mientras decide: si justo se está cubriendo, espera a que termine
      expect(prisma.$queryRaw.mock.calls[0][0].join('?')).toContain('FOR UPDATE');
      expect(prisma.alerta.updateManyAndReturn).not.toHaveBeenCalled();
    });

    test('si ya está cubierta y el hospital deja de mantenerla, se cierra en ese momento y se agradece', async () => {
      prisma.necesidad.findUnique.mockResolvedValue(necesidad({ estado: 'cubierta' }));
      prisma.alerta.updateManyAndReturn.mockResolvedValue([{ idAlerta: ALERTA }]);
      prisma.alerta.findMany.mockResolvedValue([alertaParaAgradecer()]);

      const res = await decidir('/mantener-abierta', { mantener: false });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ estado: 'cerrada', mantenerAbierta: false, agradecidos: 1 });
      expect(prisma.convocatoria.update).toHaveBeenCalledWith({
        where: { idConvocatoria: CONV },
        data: { mantenerAbierta: false, estado: 'cerrada' },
      });
      expect(enviarCorreoAgradecimiento).toHaveBeenCalledTimes(1);
    });

    test('mantener tiene que ser true o false', async () => {
      for (const body of [{}, { mantener: 'si' }, { mantener: 1 }]) {
        expect((await decidir('/mantener-abierta', body)).status).toBe(400);
      }
    });

    test('una convocatoria de otra institución o con un id inválido responde 404', async () => {
      prisma.convocatoria.findFirst.mockResolvedValue(null);
      expect((await decidir('/mantener-abierta', { mantener: true })).status).toBe(404);
      const res = await request(app).post('/api/convocatorias/no-es-un-id/mantener-abierta')
        .set('Authorization', `Bearer ${TOKEN_INSTITUCION}`).send({ mantener: true });
      expect(res.status).toBe(404);
      expect(prisma.convocatoria.findFirst.mock.calls[0][0].where).toEqual({ idConvocatoria: CONV, necesidad: { idInstitucion: INSTITUCION } });
    });

    test('ya cerrada, o con la necesidad cerrada a mano o vencida, responde 409', async () => {
      prisma.convocatoria.findUnique.mockResolvedValue(convocatoria({ estado: 'cerrada' }));
      let res = await decidir('/mantener-abierta', { mantener: true });
      expect(res.status).toBe(409);
      expect(res.body.error.mensaje).toBe('La convocatoria ya está cerrada');

      prisma.necesidad.findUnique.mockResolvedValue(necesidad({ estado: 'cerrada_manual' }));
      res = await decidir('/mantener-abierta', { mantener: true });
      expect(res.status).toBe(409);
      expect(res.body.error.mensaje).toBe('La necesidad está cerrada a mano: la convocatoria ya no se puede cambiar');
      expect(prisma.convocatoria.update).not.toHaveBeenCalled();
    });
  });

  describe('mientras sigue abierta, los donantes pueden responder y reservar', () => {
    const MANTENIDA = convocatoria({ mantenerAbierta: true }, { estado: 'cubierta' });

    test('recibeDonantes: abierta siempre; cubierta solo si se mantuvo abierta y no pasó la fecha límite', () => {
      expect(recibeDonantes(convocatoria(), necesidad())).toBe(true);
      expect(recibeDonantes(MANTENIDA, MANTENIDA.necesidad)).toBe(true);
      expect(recibeDonantes(convocatoria({ estado: 'cerrada' }), necesidad({ estado: 'cubierta' }))).toBe(false);
      expect(recibeDonantes(MANTENIDA, necesidad({ estado: 'cubierta', fechaLimite: enDias(-1) }))).toBe(false);
      expect(recibeDonantes(MANTENIDA, necesidad({ estado: 'cerrada_manual' }))).toBe(false);
    });

    const alertaDeDonante = (estado, conv) => ({
      idAlerta: ALERTA,
      estado,
      canal: 'email',
      motivo: 'Mismo grupo (O−).',
      distanciaKm: '2.50',
      enviadaEn: new Date('2026-11-02T12:00:00Z'),
      respondidaEn: null,
      convocatoria: { ...conv, necesidad: { ...conv.necesidad, institucion: { idInstitucion: INSTITUCION, nombre: 'Hospital Central', direccion: 'Av. Argentina 1400', latitud: '-38.95', longitud: '-68.06' } } },
    });

    test('la alerta sin responder se puede aceptar', async () => {
      prisma.alerta.findFirst.mockResolvedValue(alertaDeDonante('enviada', MANTENIDA));
      prisma.alerta.update.mockResolvedValue(alertaDeDonante('aceptada', MANTENIDA));
      const res = await request(app).post(`/api/alertas/${ALERTA}/aceptar`).set('Authorization', `Bearer ${TOKEN_DONANTE}`);
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ estado: 'aceptada', convocatoriaAbierta: true });
    });

    test('si la convocatoria se cerró, la alerta ya no se puede aceptar', async () => {
      prisma.alerta.findFirst.mockResolvedValue(alertaDeDonante('enviada', convocatoria({ estado: 'cerrada' }, { estado: 'cubierta' })));
      const res = await request(app).post(`/api/alertas/${ALERTA}/aceptar`).set('Authorization', `Bearer ${TOKEN_DONANTE}`);
      expect(res.status).toBe(409);
      expect(res.body.error.mensaje).toBe('La institución ya no necesita esta donación. ¡Gracias igual!');
      expect(prisma.alerta.update).not.toHaveBeenCalled();
    });

    describe('reservar turno (POST /api/turnos)', () => {
      const reservar = () => request(app).post('/api/turnos').set('Authorization', `Bearer ${TOKEN_DONANTE}`)
        .send({ idAlerta: ALERTA, idFranjaHoraria: FRANJA });

      beforeEach(() => {
        prisma.donante.findUnique.mockResolvedValue({ idDonante: DONANTE });
        prisma.franjaHoraria.findUnique.mockResolvedValue({ idFranjaHoraria: FRANJA, idInstitucion: INSTITUCION, fecha: enDias(2) });
        prisma.franjaHoraria.updateMany.mockResolvedValue({ count: 1 });
        prisma.turno.create.mockImplementation(async ({ data }) => ({
          idTurno: TURNO, ...data,
          franjaHoraria: { idInstitucion: INSTITUCION, fecha: enDias(2), horaInicio: new Date('1970-01-01T08:00:00Z'), horaFin: new Date('1970-01-01T11:00:00Z') },
        }));
      });

      test('con la convocatoria mantenida abierta, reserva aunque la necesidad ya esté cubierta', async () => {
        prisma.alerta.findUnique.mockResolvedValue({ idDonante: DONANTE, estado: 'aceptada', convocatoria: MANTENIDA });
        expect((await reservar()).status).toBe(201);
      });

      test('con la convocatoria cerrada, no hace falta que vaya', async () => {
        prisma.alerta.findUnique.mockResolvedValue({ idDonante: DONANTE, estado: 'aceptada', convocatoria: convocatoria({ estado: 'cerrada' }, { estado: 'cubierta' }) });
        const res = await reservar();
        expect(res.status).toBe(409);
        expect(res.body.error.mensaje).toBe('Esa necesidad ya se cubrió o se cerró: no hace falta que vayas');
        expect(prisma.turno.create).not.toHaveBeenCalled();
      });
    });
  });
});

// ─── Criterio 2 ──────────────────────────────────────────────────────────────

describe('Criterio 2: con los que tenían turno, el hospital elige mantenerlos o pedirles que reprogramen', () => {
  describe('PATCH /api/convocatorias/:id/turnos', () => {
    beforeEach(() => {
      prisma.convocatoria.findFirst.mockResolvedValue(convocatoria({ estado: 'cerrada' }, { estado: 'cubierta' }));
      prisma.turno.findMany.mockResolvedValue([turnoReservado()]);
    });

    test('mantener: queda guardado y no se le manda nada a nadie', async () => {
      const res = await decidir('/turnos', { accion: 'mantener' }, 'patch');

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ decisionTurnos: 'mantener', turnosReservados: 1, avisados: 0 });
      // Una sola vez: el cambio solo se hace si todavía no se había decidido
      expect(prisma.convocatoria.updateMany).toHaveBeenCalledWith({
        where: { idConvocatoria: CONV, decisionTurnos: null },
        data: { decisionTurnos: 'mantener' },
      });
      expect(enviarCorreoReprogramar).not.toHaveBeenCalled();
    });

    test('reprogramar: se les avisa por su canal, con el turno que tienen', async () => {
      const res = await decidir('/turnos', { accion: 'reprogramar' }, 'patch');

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ decisionTurnos: 'reprogramar', turnosReservados: 1, avisados: 1 });
      expect(enviarCorreoReprogramar).toHaveBeenCalledWith(expect.objectContaining({
        email: 'ana@mail.com', institucion: 'Hospital Central', horaInicio: '08:00', horaFin: '11:00',
      }));
      // Solo los turnos reservados de hoy en adelante de esta convocatoria
      expect(prisma.turno.findMany.mock.calls[0][0].where).toEqual({
        estado: 'reservado', franjaHoraria: { fecha: { gte: HOY } }, alerta: { idConvocatoria: CONV },
      });
    });

    test('reprogramar por push: al celular', async () => {
      prisma.turno.findMany.mockResolvedValue([turnoReservado({ alerta: { canal: 'push' } })]);
      prisma.suscripcionPush.findMany.mockResolvedValue([SUSCRIPCION]);
      await decidir('/turnos', { accion: 'reprogramar' }, 'patch');
      const aviso = JSON.parse(webpush.sendNotification.mock.calls[0][1]);
      expect(aviso.titulo).toBe('Hospital Central te pide cambiar el día de tu turno');
      expect(enviarCorreoReprogramar).not.toHaveBeenCalled();
    });

    test('se decide una sola vez', async () => {
      prisma.convocatoria.findFirst.mockResolvedValue(convocatoria({ estado: 'cerrada', decisionTurnos: 'mantener' }, { estado: 'cubierta' }));
      let res = await decidir('/turnos', { accion: 'reprogramar' }, 'patch');
      expect(res.status).toBe(409);
      expect(res.body.error.mensaje).toBe('Ya decidiste qué pasa con los turnos: se mantienen');

      // Dos personas del hospital a la vez: vale la primera
      prisma.convocatoria.findFirst.mockResolvedValue(convocatoria({ estado: 'cerrada' }, { estado: 'cubierta' }));
      prisma.convocatoria.updateMany.mockResolvedValue({ count: 0 });
      res = await decidir('/turnos', { accion: 'reprogramar' }, 'patch');
      expect(res.status).toBe(409);
      expect(enviarCorreoReprogramar).not.toHaveBeenCalled();
    });

    test('solo con la necesidad cubierta, la convocatoria cerrada y alguien con turno', async () => {
      prisma.convocatoria.findFirst.mockResolvedValue(convocatoria());
      let res = await decidir('/turnos', { accion: 'mantener' }, 'patch');
      expect(res.status).toBe(409);
      expect(res.body.error.mensaje).toBe('La necesidad todavía no está cubierta: los turnos siguen como están');

      prisma.convocatoria.findFirst.mockResolvedValue(convocatoria({ mantenerAbierta: true }, { estado: 'cubierta' }));
      res = await decidir('/turnos', { accion: 'reprogramar' }, 'patch');
      expect(res.status).toBe(409);
      expect(res.body.error.mensaje).toContain('La convocatoria sigue abierta para reponer stock');

      prisma.convocatoria.findFirst.mockResolvedValue(convocatoria({ estado: 'cerrada' }, { estado: 'cubierta' }));
      prisma.turno.findMany.mockResolvedValue([]);
      res = await decidir('/turnos', { accion: 'mantener' }, 'patch');
      expect(res.status).toBe(409);
      expect(res.body.error.mensaje).toBe('En esta convocatoria no queda nadie con turno reservado');
      expect(prisma.convocatoria.updateMany).not.toHaveBeenCalled();
    });

    test('accion tiene que ser mantener o reprogramar', async () => {
      expect((await decidir('/turnos', { accion: 'cancelar' }, 'patch')).status).toBe(400);
      expect((await decidir('/turnos', {}, 'patch')).status).toBe(400);
    });
  });

  describe('el donante reprograma (PATCH /api/turnos/:id)', () => {
    const reprogramar = () => request(app).patch(`/api/turnos/${TURNO}`).set('Authorization', `Bearer ${TOKEN_DONANTE}`)
      .send({ idFranjaHoraria: OTRA_FRANJA });
    const suTurno = (decisionTurnos) => ({
      idTurno: TURNO,
      idFranjaHoraria: FRANJA,
      idAlerta: ALERTA,
      estado: 'reservado',
      franjaHoraria: { idFranjaHoraria: FRANJA, idInstitucion: INSTITUCION, fecha: enDias(2) },
      alerta: { convocatoria: convocatoria({ estado: 'cerrada', decisionTurnos }, { estado: 'cubierta' }) },
    });

    beforeEach(() => {
      // Una franja 30 días después: pasa la fecha límite de la necesidad (10 días)
      prisma.franjaHoraria.findUnique.mockResolvedValue({ idFranjaHoraria: OTRA_FRANJA, idInstitucion: INSTITUCION, fecha: enDias(30) });
      prisma.franjaHoraria.updateMany.mockResolvedValue({ count: 1 });
      prisma.turno.update.mockImplementation(async ({ data }) => ({
        idTurno: TURNO, idAlerta: ALERTA, estado: 'reservado', codigoQr: 'qr', ...data,
        franjaHoraria: { idInstitucion: INSTITUCION, fecha: enDias(30), horaInicio: new Date('1970-01-01T08:00:00Z'), horaFin: new Date('1970-01-01T11:00:00Z') },
      }));
    });

    test('si el hospital pidió reprogramar, puede elegir un día después de la fecha límite', async () => {
      prisma.turno.findFirst.mockResolvedValue(suTurno('reprogramar'));
      const res = await reprogramar();
      expect(res.status).toBe(200);
      expect(prisma.turno.update.mock.calls[0][0].data.idFranjaHoraria).toBe(OTRA_FRANJA);
    });

    test('si no, sigue el límite de la necesidad', async () => {
      prisma.turno.findFirst.mockResolvedValue(suTurno('mantener'));
      expect((await reprogramar()).status).toBe(400);
      prisma.turno.findFirst.mockResolvedValue(suTurno(null));
      expect((await reprogramar()).status).toBe(400);
      expect(prisma.turno.update).not.toHaveBeenCalled();
    });
  });
});

// ─── Criterio 4 ──────────────────────────────────────────────────────────────

describe('Criterio 4: la necesidad cerrada queda en el historial indicando cómo se cubrió', () => {
  test.each([
    [3, 0, 'donantes'],
    [0, 1, 'transferencia'],
    [2, 1, 'ambas'],
  ])('%i donaciones y %i transferencias recibidas → %s', async (donaciones, transferencias, cubiertaCon) => {
    prisma.necesidad.findUnique.mockResolvedValue(necesidad());
    prisma.donacion.count.mockResolvedValue(donaciones);
    prisma.transferencia.count.mockResolvedValue(transferencias);

    await cerrarSiCubierta(NEC);
    expect(prisma.necesidad.updateMany.mock.calls[0][0].data.cubiertaCon).toBe(cubiertaCon);
    // Se cuenta lo que vino para ESTA necesidad: donaciones de sus convocatorias y transferencias recibidas
    expect(prisma.donacion.count).toHaveBeenCalledWith({
      where: { resultado: 'realizada', turno: { alerta: { convocatoria: { idNecesidad: NEC } } } },
    });
    expect(prisma.transferencia.count).toHaveBeenCalledWith({ where: { idNecesidad: NEC, estado: 'recibida' } });
  });

  test('GET /api/necesidades devuelve con qué se cubrió y sus convocatorias (turnos reservados y agradecidos)', async () => {
    prisma.necesidad.findMany.mockResolvedValue([necesidad({ estado: 'cubierta', cubiertaCon: 'ambas', cerradaEn: new Date() })]);
    prisma.transferenciaItem.findMany.mockResolvedValue([]);
    prisma.convocatoria.findMany.mockResolvedValue([convocatoria({ estado: 'cerrada' })]);
    prisma.turno.findMany.mockResolvedValue([{ alerta: { idConvocatoria: CONV } }, { alerta: { idConvocatoria: CONV } }]);
    prisma.alerta.findMany.mockResolvedValue([{ idConvocatoria: CONV }]);

    const res = await request(app).get('/api/necesidades').set('Authorization', `Bearer ${TOKEN_INSTITUCION}`);

    expect(res.status).toBe(200);
    expect(res.body[0]).toMatchObject({
      estado: 'cubierta',
      cubiertaCon: 'ambas',
      convocatorias: [{ idConvocatoria: CONV, estado: 'cerrada', mantenerAbierta: false, decisionTurnos: null, turnosReservados: 2, agradecidos: 1 }],
    });
    // Agradecidos = alertas canceladas que habían salido (las del tope del mes nunca salen)
    expect(prisma.alerta.findMany.mock.calls[0][0].where).toEqual({
      estado: 'cancelada', enviadaEn: { not: null }, convocatoria: { idNecesidad: { in: [NEC] } },
    });
  });
});

// ─── Lo que ve el donante ────────────────────────────────────────────────────

describe('El donante ve el agradecimiento en sus alertas', () => {
  const cancelada = {
    idAlerta: ALERTA,
    estado: 'cancelada',
    canal: 'email',
    motivo: 'Mismo grupo (O−).',
    distanciaKm: '2.50',
    enviadaEn: new Date('2026-11-02T12:00:00Z'),
    respondidaEn: null,
    convocatoria: {
      ...convocatoria({ estado: 'cerrada' }, { estado: 'cubierta' }),
      necesidad: { ...necesidad({ estado: 'cubierta' }), institucion: { idInstitucion: INSTITUCION, nombre: 'Hospital Central', direccion: 'Av. Argentina 1400', latitud: null, longitud: null } },
    },
  };

  test('la alerta cancelada al cubrirse sigue en su lista, sin poder responderla', async () => {
    prisma.alerta.findMany.mockResolvedValue([cancelada]);
    const res = await request(app).get('/api/alertas/mias').set('Authorization', `Bearer ${TOKEN_DONANTE}`);
    expect(res.status).toBe(200);
    expect(res.body[0]).toMatchObject({ estado: 'cancelada', puedeResponder: false, convocatoriaAbierta: false });
  });

  test('si igual intenta aceptarla: 409 con el agradecimiento (y la ruta no sigue de largo)', async () => {
    prisma.alerta.findFirst.mockResolvedValue(cancelada);
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});
    const res = await request(app).post(`/api/alertas/${ALERTA}/aceptar`).set('Authorization', `Bearer ${TOKEN_DONANTE}`);
    await new Promise((r) => setImmediate(r));
    expect(res.status).toBe(409);
    expect(res.body.error.mensaje).toBe('La institución ya no necesita esta donación. ¡Gracias igual!');
    // Antes, después de responder el 409 la ruta intentaba armar la respuesta igual y fallaba en el servidor
    expect(error).not.toHaveBeenCalled();
    error.mockRestore();
  });

  test('una cancelada que nunca le llegó (tope del mes) no existe para él', async () => {
    prisma.alerta.findFirst.mockResolvedValue({ ...cancelada, enviadaEn: null });
    expect((await request(app).post(`/api/alertas/${ALERTA}/aceptar`).set('Authorization', `Bearer ${TOKEN_DONANTE}`)).status).toBe(404);
  });
});

describe('Permisos', () => {
  test('sin token → 401', async () => {
    expect((await request(app).post(`/api/convocatorias/${CONV}/mantener-abierta`).send({ mantener: true })).status).toBe(401);
  });

  test('un donante → 403', async () => {
    expect((await decidir('/mantener-abierta', { mantener: true }, 'post', TOKEN_DONANTE)).status).toBe(403);
    expect((await decidir('/turnos', { accion: 'mantener' }, 'patch', TOKEN_DONANTE)).status).toBe(403);
  });

  test('una institución no aprobada no encuentra la convocatoria → 404', async () => {
    prisma.usuarioInstitucion.findFirst.mockResolvedValue(null);
    expect((await decidir('/turnos', { accion: 'mantener' }, 'patch')).status).toBe(404);
    expect(prisma.convocatoria.findFirst).not.toHaveBeenCalled();
  });
});
