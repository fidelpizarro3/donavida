process.env.JWT_SECRET = 'test_jwt_secret_super_seguro_para_pruebas_unitarias_12345678';

const request = require('supertest');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');

const mockDonanteCreateSpy = jest.fn();
const mockUsuarioCreateSpy = jest.fn();

// Mockear prisma antes de importar app
jest.mock('../src/lib/prisma', () => {
  const mockUsuario = {
    idUsuario: '11111111-1111-1111-1111-111111111111',
    email: 'carlos.donante@example.com',
    passwordHash: '$2b$10$epG/2W7W38/5uWp5lJq9kO5q3r8t6y4u2i0o8p6a4s2d0f8g6h4j2', // bcrypt hash de 'Password123'
    nombre: 'Carlos',
    apellido: 'Gómez',
    rol: 'donante',
    emailVerificado: false,
    activo: true,
  };

  const mockDonante = {
    idDonante: '22222222-2222-2222-2222-222222222222',
    idUsuario: '11111111-1111-1111-1111-111111111111',
    documento: '35123456',
    fechaNacimiento: new Date('1990-06-15T00:00:00.000Z'),
    sexo: 'masculino',
    grupoSanguineo: null,
    factorRh: null,
    contactoHoraDesde: new Date('1970-01-01T09:00:00.000Z'),
    contactoHoraHasta: new Date('1970-01-01T17:00:00.000Z'),
    alertasPausadasHasta: null,
    avisoPush: true,
    avisoEmail: true,
    avisoWhatsapp: false,
    topeAlertasMes: 4,
    aptoDesde: null,
    usuario: mockUsuario,
  };

  return {
    usuario: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    donante: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn(async (callback) => {
      return callback({
        usuario: {
          create: mockUsuarioCreateSpy.mockResolvedValue(mockUsuario),
        },
        donante: {
          create: mockDonanteCreateSpy.mockResolvedValue(mockDonante),
        },
      });
    }),
  };
});

// Sin servidor de correo en los tests: se simula el envío y se revisa con qué datos se pidió
jest.mock('../src/lib/correo', () => ({ enviarCorreoVerificacion: jest.fn() }));

const prisma = require('../src/lib/prisma');
const { enviarCorreoVerificacion } = require('../src/lib/correo');
const app = require('../src/app');

const DONANTE_VALIDO = {
  email: 'carlos.donante@example.com',
  password: 'Password123',
  nombre: 'Carlos',
  apellido: 'Gómez',
  rol: 'donante',
  documento: '35123456',
  fechaNacimiento: '1990-06-15',
  sexo: 'masculino',
};

// Registra al donante de prueba y devuelve el token que viajó en el correo de activación
async function registrarYObtenerTokenDelCorreo() {
  await request(app).post('/api/auth/registro').send(DONANTE_VALIDO);
  return enviarCorreoVerificacion.mock.calls.at(-1)[0].token;
}

describe('TAREA-2: Registro del donante y su perfil', () => {
  let tokenDonanteValido;

  beforeAll(async () => {
    const hash = await bcrypt.hash('Password123', 10);
    prisma.usuario.findUnique.mockImplementation(({ where }) => {
      if (where.email === 'carlos.donante@example.com' || where.idUsuario === '11111111-1111-1111-1111-111111111111') {
        return Promise.resolve({
          idUsuario: '11111111-1111-1111-1111-111111111111',
          email: 'carlos.donante@example.com',
          passwordHash: hash,
          nombre: 'Carlos',
          apellido: 'Gómez',
          rol: 'donante',
          emailVerificado: false,
          activo: true,
        });
      }
      return Promise.resolve(null);
    });

    tokenDonanteValido = jwt.sign(
      { sub: '11111111-1111-1111-1111-111111111111', rol: 'donante' },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );
  });

  beforeEach(() => {
    mockDonanteCreateSpy.mockClear();
    mockUsuarioCreateSpy.mockClear();
    enviarCorreoVerificacion.mockReset().mockResolvedValue();
  });

  describe('Criterio 1: Puede registrarse sin saber su grupo sanguíneo', () => {
    it('permite registrar un donante omitiendo grupo y factor (se persisten como null estrictamente)', async () => {
      const res = await request(app)
        .post('/api/auth/registro')
        .send({
          email: 'carlos.donante@example.com',
          password: 'Password123',
          nombre: 'Carlos',
          apellido: 'Gómez',
          rol: 'donante',
          documento: '35.123.456', // Se envía con puntos para probar normalización
          fechaNacimiento: '1990-06-15',
          sexo: 'masculino',
          // grupoSanguineo y factorRh se omiten deliberadamente
        });

      expect(res.status).toBe(201);
      expect(res.body.email).toBe('carlos.donante@example.com');
      expect(res.body.emailVerificado).toBe(false);
      // Criterio 4: el token solo viaja por correo, nunca en la respuesta
      expect(res.body.tokenVerificacion).toBeUndefined();
      expect(enviarCorreoVerificacion).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'carlos.donante@example.com', token: expect.any(String) })
      );

      // Comprobación estricta de argumentos pasados a Prisma
      expect(mockDonanteCreateSpy).toHaveBeenCalledWith({
        data: expect.objectContaining({
          documento: '35123456', // Comprueba normalización de documento
          grupoSanguineo: null,
          factorRh: null,
        }),
      });
    });

    it('rechaza el registro si se envía grupo sanguíneo sin factor Rh (400 DATOS_INVALIDOS)', async () => {
      const res = await request(app)
        .post('/api/auth/registro')
        .send({
          email: 'invalido@example.com',
          password: 'Password123',
          nombre: 'Ana',
          apellido: 'Test',
          rol: 'donante',
          documento: '40123456',
          fechaNacimiento: '1995-05-10',
          sexo: 'femenino',
          grupoSanguineo: 'O',
          // falta factorRh
        });

      expect(res.status).toBe(400);
      expect(res.body.error.codigo).toBe('DATOS_INVALIDOS');
      expect(res.body.error.mensaje).toContain('factor Rh');
    });
  });

  describe('Criterio 4: El correo se valida antes de activar la cuenta (email_verificado)', () => {
    it('bloquea el login con 403 EMAIL_NO_VERIFICADO si el usuario aún no validó su correo', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'carlos.donante@example.com',
          password: 'Password123',
        });

      expect(res.status).toBe(403);
      expect(res.body.error.codigo).toBe('EMAIL_NO_VERIFICADO');
    });

    it('el enlace que llega por correo activa la cuenta', async () => {
      const tokenVerif = await registrarYObtenerTokenDelCorreo();

      prisma.usuario.update.mockResolvedValue({
        idUsuario: '11111111-1111-1111-1111-111111111111',
        email: 'carlos.donante@example.com',
        nombre: 'Carlos',
        apellido: 'Gómez',
        rol: 'donante',
        emailVerificado: true,
      });

      const res = await request(app)
        .post('/api/auth/verificar-email')
        .send({ token: tokenVerif });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.usuario.emailVerificado).toBe(true);
    });

    it('rechaza verificación con token inválido o expirado', async () => {
      const res = await request(app)
        .post('/api/auth/verificar-email')
        .send({ token: 'token-falso-invalido' });

      expect(res.status).toBe(400);
      expect(res.body.error.codigo).toBe('TOKEN_INVALIDO');
    });

    it('SEGURIDAD: El middleware autenticar rechaza el token de verificación si se intenta usar como sesión', async () => {
      const tokenVerif = await registrarYObtenerTokenDelCorreo();

      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${tokenVerif}`);

      expect(res.status).toBe(401);
      expect(res.body.error.codigo).toBe('TOKEN_INVALIDO');
    });

    it('si el correo no se puede enviar, el registro se completa y avisa que pida otro enlace', async () => {
      enviarCorreoVerificacion.mockRejectedValueOnce(new Error('SMTP caído'));
      const consola = jest.spyOn(console, 'error').mockImplementation(() => {});

      const res = await request(app).post('/api/auth/registro').send(DONANTE_VALIDO);

      consola.mockRestore();
      expect(res.status).toBe(201);
      expect(res.body.mensaje).toContain('no pudimos enviar');
    });

    it('reenvía el enlace a una cuenta sin verificar', async () => {
      const res = await request(app)
        .post('/api/auth/reenviar-verificacion')
        .send({ email: 'Carlos.Donante@example.com' });

      expect(res.status).toBe(200);
      expect(enviarCorreoVerificacion).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'carlos.donante@example.com', token: expect.any(String) })
      );
    });

    it('reenviar a un email no registrado responde igual, sin enviar nada', async () => {
      const res = await request(app)
        .post('/api/auth/reenviar-verificacion')
        .send({ email: 'nadie@example.com' });

      expect(res.status).toBe(200);
      expect(enviarCorreoVerificacion).not.toHaveBeenCalled();
    });
  });

  describe('Criterio 2 y 3: Perfil, horarios de contacto y pausa de alertas', () => {
    it('GET /api/donantes/perfil retorna datos formateados correctamente (HH:MM y YYYY-MM-DD)', async () => {
      prisma.donante.findUnique.mockResolvedValue({
        idDonante: '22222222-2222-2222-2222-222222222222',
        idUsuario: '11111111-1111-1111-1111-111111111111',
        documento: '35123456',
        fechaNacimiento: new Date('1990-06-15T00:00:00.000Z'),
        sexo: 'masculino',
        grupoSanguineo: null,
        factorRh: null,
        contactoHoraDesde: new Date('1970-01-01T09:00:00.000Z'),
        contactoHoraHasta: new Date('1970-01-01T17:00:00.000Z'),
        alertasPausadasHasta: null,
        avisoPush: true,
        avisoEmail: true,
        avisoWhatsapp: false,
        topeAlertasMes: 4,
        aptoDesde: null,
        usuario: {
          idUsuario: '11111111-1111-1111-1111-111111111111',
          email: 'carlos.donante@example.com',
          nombre: 'Carlos',
          apellido: 'Gómez',
          rol: 'donante',
          emailVerificado: true,
        },
      });

      const res = await request(app)
        .get('/api/donantes/perfil')
        .set('Authorization', `Bearer ${tokenDonanteValido}`);

      expect(res.status).toBe(200);
      expect(res.body.documento).toBe('35123456');
      expect(res.body.grupoSanguineo).toBeNull();
      expect(res.body.contactoHoraDesde).toBe('09:00');
      expect(res.body.contactoHoraHasta).toBe('17:00');
      expect(res.body.alertasPausadasHasta).toBeNull();
    });

    it('PATCH /api/donantes/perfil rechaza si contactoHoraDesde >= contactoHoraHasta (400 DATOS_INVALIDOS)', async () => {
      const res = await request(app)
        .patch('/api/donantes/perfil')
        .set('Authorization', `Bearer ${tokenDonanteValido}`)
        .send({
          contactoHoraDesde: '18:00',
          contactoHoraHasta: '09:00',
        });

      expect(res.status).toBe(400);
      expect(res.body.error.codigo).toBe('DATOS_INVALIDOS');
      expect(res.body.error.mensaje).toContain('anterior');
    });

    it.each([
      [{ contactoHoraDesde: null, contactoHoraHasta: '10:00' }],
      [{ contactoHoraDesde: '10:00', contactoHoraHasta: null }],
      [{ contactoHoraDesde: '10:00' }],
      [{ contactoHoraHasta: null }],
    ])('PATCH /api/donantes/perfil no deja un horario a medias: %j (400 DATOS_INVALIDOS)', async (body) => {
      prisma.donante.update.mockClear();

      const res = await request(app)
        .patch('/api/donantes/perfil')
        .set('Authorization', `Bearer ${tokenDonanteValido}`)
        .send(body);

      expect(res.status).toBe(400);
      expect(res.body.error.codigo).toBe('DATOS_INVALIDOS');
      expect(prisma.donante.update).not.toHaveBeenCalled();
    });

    it('PATCH /api/donantes/perfil rechaza pausar alertas con una fecha pasada (400 DATOS_INVALIDOS)', async () => {
      const res = await request(app)
        .patch('/api/donantes/perfil')
        .set('Authorization', `Bearer ${tokenDonanteValido}`)
        .send({
          alertasPausadasHasta: '2020-01-01',
        });

      expect(res.status).toBe(400);
      expect(res.body.error.codigo).toBe('DATOS_INVALIDOS');
      expect(res.body.error.mensaje).toContain('pasada');
    });

    it('PATCH /api/donantes/perfil pausa alertas hasta una fecha futura y permite reanudar con null', async () => {
      prisma.donante.update.mockResolvedValue({
        idDonante: '22222222-2222-2222-2222-222222222222',
        idUsuario: '11111111-1111-1111-1111-111111111111',
        documento: '35123456',
        fechaNacimiento: new Date('1990-06-15T00:00:00.000Z'),
        sexo: 'masculino',
        grupoSanguineo: null,
        factorRh: null,
        contactoHoraDesde: null,
        contactoHoraHasta: null,
        alertasPausadasHasta: new Date('2028-11-30T00:00:00.000Z'),
        avisoPush: true,
        avisoEmail: true,
        avisoWhatsapp: false,
        topeAlertasMes: 4,
        aptoDesde: null,
        usuario: {
          idUsuario: '11111111-1111-1111-1111-111111111111',
          email: 'carlos.donante@example.com',
          nombre: 'Carlos',
          apellido: 'Gómez',
          rol: 'donante',
          emailVerificado: true,
        },
      });

      const resPausa = await request(app)
        .patch('/api/donantes/perfil')
        .set('Authorization', `Bearer ${tokenDonanteValido}`)
        .send({
          alertasPausadasHasta: '2028-11-30',
        });

      expect(resPausa.status).toBe(200);
      expect(resPausa.body.alertasPausadasHasta).toBe('2028-11-30');

      // Ahora reanudar con null
      prisma.donante.update.mockResolvedValueOnce({
        idDonante: '22222222-2222-2222-2222-222222222222',
        idUsuario: '11111111-1111-1111-1111-111111111111',
        documento: '35123456',
        fechaNacimiento: new Date('1990-06-15T00:00:00.000Z'),
        sexo: 'masculino',
        grupoSanguineo: null,
        factorRh: null,
        contactoHoraDesde: null,
        contactoHoraHasta: null,
        alertasPausadasHasta: null,
        avisoPush: true,
        avisoEmail: true,
        avisoWhatsapp: false,
        topeAlertasMes: 4,
        aptoDesde: null,
        usuario: {
          idUsuario: '11111111-1111-1111-1111-111111111111',
          email: 'carlos.donante@example.com',
          nombre: 'Carlos',
          apellido: 'Gómez',
          rol: 'donante',
          emailVerificado: true,
        },
      });

      const resReanudar = await request(app)
        .patch('/api/donantes/perfil')
        .set('Authorization', `Bearer ${tokenDonanteValido}`)
        .send({
          alertasPausadasHasta: null,
        });

      expect(resReanudar.status).toBe(200);
      expect(resReanudar.body.alertasPausadasHasta).toBeNull();
    });
  });

  describe('Validaciones demográficas adicionales', () => {
    it('rechaza fecha de nacimiento en el futuro (400 DATOS_INVALIDOS)', async () => {
      const res = await request(app)
        .post('/api/auth/registro')
        .send({
          email: 'futuro@example.com',
          password: 'Password123',
          nombre: 'Viajero',
          apellido: 'Tiempo',
          rol: 'donante',
          documento: '45123456',
          fechaNacimiento: '2030-01-01',
          sexo: 'masculino',
        });

      expect(res.status).toBe(400);
      expect(res.body.error.codigo).toBe('DATOS_INVALIDOS');
      expect(res.body.error.mensaje).toContain('fecha de nacimiento');
    });

    it('rechaza documento con formato inválido (400 DATOS_INVALIDOS)', async () => {
      const res = await request(app)
        .post('/api/auth/registro')
        .send({
          email: 'dni@example.com',
          password: 'Password123',
          nombre: 'Dni',
          apellido: 'Corto',
          rol: 'donante',
          documento: '12', // Demasiado corto
          fechaNacimiento: '1995-01-01',
          sexo: 'masculino',
        });

      expect(res.status).toBe(400);
      expect(res.body.error.codigo).toBe('DATOS_INVALIDOS');
    });
  });
});
