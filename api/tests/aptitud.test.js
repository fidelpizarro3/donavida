process.env.JWT_SECRET = 'secreto_de_prueba_para_los_tests_de_aptitud';

const request = require('supertest');
const jwt = require('jsonwebtoken');

// Base simulada: cada test decide qué devuelve cada consulta
jest.mock('../src/lib/prisma', () => ({
  donante: { findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
  usuarioInstitucion: { findFirst: jest.fn() },
  pregunta: { findMany: jest.fn() },
  cuestionarioAptitud: { findFirst: jest.fn(), create: jest.fn() },
  diferimiento: { findFirst: jest.fn(), create: jest.fn(), createMany: jest.fn(), deleteMany: jest.fn() },
  reglaElegibilidad: { findUnique: jest.fn() },
  $transaction: jest.fn(),
}));

const prisma = require('../src/lib/prisma');
const app = require('../src/app');
const { obtenerFechaHoy } = require('../src/utils/validaciones');
const {
  sumarDias,
  resumirHabilitacion,
  validarValor,
  diferimientoPorRespuesta,
  estaHabilitado,
  filtroDonantesHabilitados,
} = require('../src/services/habilitacion');

const HOY = obtenerFechaHoy();
const hace = (dias) => sumarDias(HOY, -dias);
const en = (dias) => sumarDias(HOY, dias);
const aFecha = (texto) => new Date(`${texto}T00:00:00.000Z`);

const DONANTE = {
  idDonante: '22222222-2222-4222-8222-222222222222',
  idUsuario: '11111111-1111-4111-8111-111111111111',
  sexo: 'masculino',
  grupoSanguineo: null,
};
const OTRO_DONANTE = '33333333-3333-4333-8333-333333333333';

const REGLA = {
  TATUAJE: { idReglaElegibilidad: 'regla-tatuaje', sexoAplica: 'todos', diasDiferimiento: 180 },
  MEDICACION: { idReglaElegibilidad: 'regla-medicacion', sexoAplica: 'todos', diasDiferimiento: 7 },
  EMBARAZO: { idReglaElegibilidad: 'regla-embarazo', sexoAplica: 'femenino', diasDiferimiento: 180 },
  ENFERMEDAD: { idReglaElegibilidad: 'regla-enfermedad', sexoAplica: 'todos', diasDiferimiento: null },
};
const pregunta = (codigo, tipo, puedeCambiar, regla) => ({
  idPregunta: `pregunta-${codigo.toLowerCase()}`,
  codigo,
  texto: `¿Pregunta de ${codigo.toLowerCase()}? Aclaración.`,
  tipo,
  puedeCambiar,
  versionFormulario: 1,
  idReglaElegibilidad: regla.idReglaElegibilidad,
  regla,
});
const PREGUNTAS = [
  pregunta('EMBARAZO', 'si_no', true, REGLA.EMBARAZO),
  pregunta('ENFERMEDAD', 'si_no', false, REGLA.ENFERMEDAD),
  pregunta('MEDICACION', 'si_no', true, REGLA.MEDICACION),
  pregunta('TATUAJE', 'fecha', true, REGLA.TATUAJE),
];

const token = (rol, idUsuario = DONANTE.idUsuario) => jwt.sign({ sub: idUsuario, rol }, process.env.JWT_SECRET);
const TOKEN_DONANTE = token('donante');
const TOKEN_HOSPITAL = token('institucion', '44444444-4444-4444-8444-444444444444');

// Lo que "hay en la base" del donante de prueba: los tests lo cambian y las consultas simuladas lo leen
let base;

beforeEach(() => {
  jest.resetAllMocks();
  base = { cuestionarios: [], diferimientos: [] };

  prisma.$transaction.mockImplementation((operaciones) => operaciones(prisma));
  prisma.donante.findUnique.mockImplementation(async ({ where }) => {
    const esElDonante = where.idUsuario === DONANTE.idUsuario || where.idDonante === DONANTE.idDonante;
    return esElDonante ? { ...DONANTE, ...base } : null;
  });
  prisma.usuarioInstitucion.findFirst.mockResolvedValue({ idInstitucion: 'institucion-aprobada' });
  prisma.pregunta.findMany.mockResolvedValue(PREGUNTAS);
  prisma.cuestionarioAptitud.findFirst.mockResolvedValue(null);
  prisma.cuestionarioAptitud.create.mockImplementation(async () => {
    base.cuestionarios.push({ idCuestionarioAptitud: 'cuestionario-nuevo' });
  });
  prisma.diferimiento.createMany.mockImplementation(async ({ data }) => {
    base.diferimientos.push(...data.map((d, i) => ({ idDiferimiento: `dif-${i}`, ...d })));
  });
  prisma.diferimiento.create.mockImplementation(async ({ data }) => {
    const creado = { idDiferimiento: 'dif-nuevo', ...data };
    base.diferimientos.push(creado);
    return creado;
  });
  prisma.diferimiento.findFirst.mockResolvedValue(null);
  prisma.reglaElegibilidad.findUnique.mockResolvedValue({ idReglaElegibilidad: 'regla-intervalo', diasDiferimiento: 56 });
});

describe('TAREA-3: cuestionario de aptitud y control de habilitación', () => {
  describe('Criterio 1: 56 días entre donaciones de sangre entera', () => {
    it('suma 56 días a la fecha de la donación', () => {
      expect(sumarDias('2026-10-01', 56)).toBe('2026-11-26');
      expect(sumarDias('2026-12-20', 56)).toBe('2027-02-14'); // cruza el año
    });

    it('no está habilitado hasta el día 55 y vuelve a estarlo el día 56', () => {
      const donacion = { motivo: 'Donó sangre', desde: '2026-10-01', hasta: '2026-11-26', origen: 'donacion' };
      const el = (hoy) => resumirHabilitacion({ hoy, cuestionarioCompleto: true, diferimientos: [donacion] });

      expect(el('2026-11-25')).toMatchObject({ habilitado: false, aptoDesde: '2026-11-26' });
      expect(el('2026-11-26')).toMatchObject({ habilitado: true, aptoDesde: null });
    });

    it('al registrarse una donación crea el diferimiento con el plazo que dice la regla', async () => {
      const res = await request(app)
        .post(`/api/donantes/${DONANTE.idDonante}/donacion-registrada`)
        .set('Authorization', `Bearer ${TOKEN_HOSPITAL}`)
        .send({ fecha: hace(10) });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ habilitado: false, aptoDesde: en(46) });
      expect(prisma.diferimiento.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          origen: 'donacion',
          idReglaElegibilidad: 'regla-intervalo',
          desde: aFecha(hace(10)),
          hasta: aFecha(en(46)),
        }),
      });
      // La fecha de reingreso también queda guardada en donante.apto_desde
      expect(prisma.donante.update).toHaveBeenCalledWith({
        where: { idDonante: DONANTE.idDonante },
        data: { aptoDesde: aFecha(en(46)) },
      });
    });

    it('si avisan dos veces la misma donación no duplica el diferimiento', async () => {
      prisma.diferimiento.findFirst.mockResolvedValue({ idDiferimiento: 'ya-estaba' });

      const res = await request(app)
        .post(`/api/donantes/${DONANTE.idDonante}/donacion-registrada`)
        .set('Authorization', `Bearer ${TOKEN_HOSPITAL}`)
        .send({ fecha: hace(10) });

      expect(res.status).toBe(200);
      expect(prisma.diferimiento.create).not.toHaveBeenCalled();
    });

    it('completa el grupo sanguíneo solo si el donante no lo tenía (TAREA-2, criterio 1)', async () => {
      await request(app)
        .post(`/api/donantes/${DONANTE.idDonante}/donacion-registrada`)
        .set('Authorization', `Bearer ${TOKEN_HOSPITAL}`)
        .send({ fecha: hace(1), grupoSanguineo: 'O', factorRh: 'negativo' });

      expect(prisma.donante.updateMany).toHaveBeenCalledWith({
        where: { idDonante: DONANTE.idDonante, grupoSanguineo: null },
        data: { grupoSanguineo: 'O', factorRh: 'negativo' },
      });
    });

    it.each([
      ['fecha futura', { fecha: en(1) }],
      ['sin fecha', {}],
      ['grupo sin factor', { fecha: hace(1), grupoSanguineo: 'O' }],
    ])('rechaza una donación con %s (400)', async (_, body) => {
      const res = await request(app)
        .post(`/api/donantes/${DONANTE.idDonante}/donacion-registrada`)
        .set('Authorization', `Bearer ${TOKEN_HOSPITAL}`)
        .send(body);

      expect(res.status).toBe(400);
      expect(prisma.diferimiento.create).not.toHaveBeenCalled();
    });
  });

  describe('Criterio 2: si no está habilitado, se muestran el motivo y la fecha de reingreso', () => {
    it('sin cuestionario respondido no está habilitado, y lo explica', () => {
      const resumen = resumirHabilitacion({ hoy: HOY, cuestionarioCompleto: false, diferimientos: [] });

      expect(resumen).toMatchObject({ habilitado: false, aptoDesde: null, cuestionarioCompleto: false });
      expect(resumen.motivo).toContain('cuestionario');
    });

    it('con varios diferimientos, manda el que termina último', () => {
      const resumen = resumirHabilitacion({
        hoy: HOY,
        cuestionarioCompleto: true,
        diferimientos: [
          { motivo: 'Medicación', desde: HOY, hasta: en(7), origen: 'cuestionario' },
          { motivo: 'Tatuaje', desde: hace(30), hasta: en(150), origen: 'cuestionario' },
          { motivo: 'Ya vencido', desde: hace(90), hasta: hace(1), origen: 'institucion' },
        ],
      });

      expect(resumen).toMatchObject({ habilitado: false, aptoDesde: en(150), motivo: 'Tatuaje' });
      expect(resumen.diferimientos.map((d) => d.motivo)).toEqual(['Tatuaje', 'Medicación']); // sin el vencido
    });

    it('uno sin fecha de fin le gana a todos: no hay fecha de reingreso', () => {
      const resumen = resumirHabilitacion({
        hoy: HOY,
        cuestionarioCompleto: true,
        diferimientos: [
          { motivo: 'Tatuaje', desde: hace(30), hasta: en(150), origen: 'cuestionario' },
          { motivo: 'Sin fecha', desde: HOY, hasta: null, origen: 'institucion' },
        ],
      });

      expect(resumen).toMatchObject({ habilitado: false, aptoDesde: null, motivo: 'Sin fecha' });
    });

    it('cada respuesta se traduce a un diferimiento según su regla', () => {
      const [, enfermedad, medicacion, tatuaje] = PREGUNTAS;
      const por = (p, valor) => diferimientoPorRespuesta({ pregunta: p, valor, hoy: HOY });

      // Pregunta de fecha: el plazo corre desde el hecho
      expect(por(tatuaje, hace(30))).toMatchObject({ desde: hace(30), hasta: en(150) });
      // El motivo se escribe para que lo lea una persona: fecha en dd/mm/aaaa
      const legible = hace(30).split('-').reverse().join('/');
      expect(por(tatuaje, hace(30)).motivo).toBe(`¿Pregunta de tatuaje? Sí, el ${legible}. Deben pasar 180 días.`);
      expect(por(enfermedad, 'si').motivo).toBe('¿Pregunta de enfermedad? Sí.');
      // El plazo ya se cumplió, o respondió que no: no hay diferimiento
      expect(por(tatuaje, hace(200))).toBeNull();
      expect(por(tatuaje, 'no')).toBeNull();
      // Pregunta de sí/no: el plazo corre desde hoy
      expect(por(medicacion, 'si')).toMatchObject({ desde: HOY, hasta: en(7) });
      // Regla sin días: no tiene fecha de reingreso
      expect(por(enfermedad, 'si')).toMatchObject({ desde: HOY, hasta: null });
    });

    it('el donante consulta su habilitación y ve el motivo y la fecha', async () => {
      base.cuestionarios = [{ idCuestionarioAptitud: 'c1' }];
      base.diferimientos = [{ idDiferimiento: 'd1', origen: 'cuestionario', motivo: 'Tatuaje reciente', desde: aFecha(hace(30)), hasta: aFecha(en(150)) }];

      const res = await request(app)
        .get(`/api/donantes/${DONANTE.idDonante}/habilitacion`)
        .set('Authorization', `Bearer ${TOKEN_DONANTE}`);

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ habilitado: false, aptoDesde: en(150), motivo: 'Tatuaje reciente' });
    });

    it('un donante no puede consultar la habilitación de otro (403)', async () => {
      const res = await request(app)
        .get(`/api/donantes/${DONANTE.idDonante}/habilitacion`)
        .set('Authorization', `Bearer ${token('donante', '99999999-9999-4999-8999-999999999999')}`);

      expect(res.status).toBe(403);
    });

    it('la institución ve si puede donar y desde cuándo, pero no qué respondió el donante', async () => {
      base.cuestionarios = [{ idCuestionarioAptitud: 'c1' }];
      base.diferimientos = [{ idDiferimiento: 'd1', origen: 'cuestionario', motivo: '¿Tenés o tuviste...? Sí.', desde: aFecha(HOY), hasta: null }];

      const res = await request(app)
        .get(`/api/donantes/${DONANTE.idDonante}/habilitacion`)
        .set('Authorization', `Bearer ${TOKEN_HOSPITAL}`);

      expect(res.status).toBe(200);
      expect(res.body.habilitado).toBe(false);
      expect(res.body.motivo).not.toContain('Tenés');
      expect(res.body.diferimientos).toBeUndefined();
    });

    it('responde 404 si el donante no existe o el id no es válido', async () => {
      const inexistente = await request(app).get(`/api/donantes/${OTRO_DONANTE}/habilitacion`).set('Authorization', `Bearer ${TOKEN_HOSPITAL}`);
      const invalido = await request(app).get('/api/donantes/no-es-un-uuid/habilitacion').set('Authorization', `Bearer ${TOKEN_HOSPITAL}`);

      expect(inexistente.status).toBe(404);
      expect(invalido.status).toBe(404);
    });
  });

  describe('Criterio 3: las respuestas se guardan; solo se repregunta lo que puede cambiar', () => {
    const responder = (respuestas) => request(app)
      .post('/api/donantes/cuestionario')
      .set('Authorization', `Bearer ${TOKEN_DONANTE}`)
      .send({ respuestas });

    it('la primera vez hay que responder todo (menos lo que no aplica a su sexo)', async () => {
      const res = await request(app).get('/api/donantes/cuestionario').set('Authorization', `Bearer ${TOKEN_DONANTE}`);

      expect(res.status).toBe(200);
      expect(res.body.preguntas.map((p) => p.codigo)).toEqual(['ENFERMEDAD', 'MEDICACION', 'TATUAJE']); // sin EMBARAZO
      expect(res.body.preguntas.every((p) => p.hayQueResponder && p.respuestaAnterior === null)).toBe(true);
    });

    it('la segunda vez solo repregunta las que pueden cambiar', async () => {
      prisma.cuestionarioAptitud.findFirst.mockResolvedValue({
        completadoEn: new Date(),
        respuestas: [
          { idPregunta: 'pregunta-enfermedad', valor: 'no' },
          { idPregunta: 'pregunta-medicacion', valor: 'no' },
          { idPregunta: 'pregunta-tatuaje', valor: 'no' },
        ],
      });

      const res = await request(app).get('/api/donantes/cuestionario').set('Authorization', `Bearer ${TOKEN_DONANTE}`);
      const porCodigo = Object.fromEntries(res.body.preguntas.map((p) => [p.codigo, p]));

      expect(porCodigo.ENFERMEDAD).toMatchObject({ puedeCambiar: false, hayQueResponder: false, respuestaAnterior: 'no' });
      expect(porCodigo.MEDICACION).toMatchObject({ puedeCambiar: true, hayQueResponder: true, respuestaAnterior: 'no' });
      expect(porCodigo.TATUAJE).toMatchObject({ puedeCambiar: true, hayQueResponder: true });
    });

    it('guarda las respuestas, crea los diferimientos y devuelve motivo y fecha', async () => {
      const res = await responder([
        { idPregunta: 'pregunta-enfermedad', valor: 'no' },
        { idPregunta: 'pregunta-medicacion', valor: 'si' },
        { idPregunta: 'pregunta-tatuaje', valor: hace(30) },
      ]);

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ habilitado: false, aptoDesde: en(150), cuestionarioCompleto: true });
      expect(res.body.diferimientos).toHaveLength(2);

      expect(prisma.cuestionarioAptitud.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          idDonante: DONANTE.idDonante,
          origen: 'formulario',
          resultado: 'no_apto',
          respuestas: { create: [
            { idPregunta: 'pregunta-enfermedad', valor: 'no' },
            { idPregunta: 'pregunta-medicacion', valor: 'si' },
            { idPregunta: 'pregunta-tatuaje', valor: hace(30) },
          ] },
        }),
      });
    });

    it('si todas las respuestas son "no", queda apto y habilitado', async () => {
      const res = await responder([
        { idPregunta: 'pregunta-enfermedad', valor: 'no' },
        { idPregunta: 'pregunta-medicacion', valor: 'no' },
        { idPregunta: 'pregunta-tatuaje', valor: 'no' },
      ]);

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ habilitado: true, aptoDesde: null, motivo: null });
      expect(prisma.cuestionarioAptitud.create).toHaveBeenCalledWith({ data: expect.objectContaining({ resultado: 'apto' }) });
      expect(prisma.diferimiento.createMany).not.toHaveBeenCalled();
    });

    it('al responder de nuevo conserva la respuesta que no cambia y reemplaza solo los diferimientos de lo repreguntado', async () => {
      prisma.cuestionarioAptitud.findFirst.mockResolvedValue({
        completadoEn: new Date(),
        respuestas: [{ idPregunta: 'pregunta-enfermedad', valor: 'no' }, { idPregunta: 'pregunta-medicacion', valor: 'si' }, { idPregunta: 'pregunta-tatuaje', valor: 'no' }],
      });

      // No manda ENFERMEDAD: no se repregunta
      const res = await responder([
        { idPregunta: 'pregunta-medicacion', valor: 'no' },
        { idPregunta: 'pregunta-tatuaje', valor: 'no' },
      ]);

      expect(res.status).toBe(201);
      expect(prisma.diferimiento.deleteMany).toHaveBeenCalledWith({
        where: { idDonante: DONANTE.idDonante, origen: 'cuestionario', idReglaElegibilidad: { in: ['regla-medicacion', 'regla-tatuaje'] } },
      });
      expect(prisma.cuestionarioAptitud.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          respuestas: { create: expect.arrayContaining([{ idPregunta: 'pregunta-enfermedad', valor: 'no' }]) },
        }),
      });
    });

    it.each([
      ['falta una respuesta', [{ idPregunta: 'pregunta-enfermedad', valor: 'no' }, { idPregunta: 'pregunta-medicacion', valor: 'no' }]],
      ['un sí/no con otro valor', [{ idPregunta: 'pregunta-enfermedad', valor: 'quizás' }, { idPregunta: 'pregunta-medicacion', valor: 'no' }, { idPregunta: 'pregunta-tatuaje', valor: 'no' }]],
      ['una fecha futura', [{ idPregunta: 'pregunta-enfermedad', valor: 'no' }, { idPregunta: 'pregunta-medicacion', valor: 'no' }, { idPregunta: 'pregunta-tatuaje', valor: en(5) }]],
      ['respuestas que no son una lista', 'hola'],
    ])('rechaza el cuestionario si %s (400) y no guarda nada', async (_, respuestas) => {
      const res = await responder(respuestas);

      expect(res.status).toBe(400);
      expect(res.body.error.codigo).toBe('DATOS_INVALIDOS');
      expect(prisma.cuestionarioAptitud.create).not.toHaveBeenCalled();
    });

    it('valida cada respuesta según el tipo de pregunta', () => {
      const siNo = { tipo: 'si_no' };
      const fecha = { tipo: 'fecha' };

      expect(validarValor(siNo, 'si', HOY)).toBeNull();
      expect(validarValor(siNo, true, HOY)).not.toBeNull();
      expect(validarValor(fecha, 'no', HOY)).toBeNull();
      expect(validarValor(fecha, HOY, HOY)).toBeNull();
      expect(validarValor(fecha, '2026-02-30', HOY)).not.toBeNull(); // fecha que no existe
      expect(validarValor(fecha, null, HOY)).not.toBeNull();
    });

    it('solo un donante puede responder el cuestionario (403)', async () => {
      const res = await request(app).get('/api/donantes/cuestionario').set('Authorization', `Bearer ${TOKEN_HOSPITAL}`);

      expect(res.status).toBe(403);
    });
  });

  describe('Criterio 4: el hospital puede marcarlo no apto por motivo médico', () => {
    const marcar = (body, tokenUsado = TOKEN_HOSPITAL) => request(app)
      .post(`/api/donantes/${DONANTE.idDonante}/diferimientos`)
      .set('Authorization', `Bearer ${tokenUsado}`)
      .send(body);

    it('crea un diferimiento con origen institucion, sin regla y con el motivo del hospital', async () => {
      const res = await marcar({ motivo: '  Hemoglobina baja en el control previo  ', hasta: en(30) });

      expect(res.status).toBe(201);
      expect(res.body).toEqual({ idDiferimiento: 'dif-nuevo', habilitado: false, aptoDesde: en(30) });
      expect(prisma.diferimiento.create).toHaveBeenCalledWith({
        data: {
          idDonante: DONANTE.idDonante,
          origen: 'institucion',
          motivo: 'Hemoglobina baja en el control previo',
          desde: aFecha(HOY),
          hasta: aFecha(en(30)),
        },
      });
    });

    it('sin fecha "hasta" queda no apto sin fecha de reingreso', async () => {
      const res = await marcar({ motivo: 'Motivo médico permanente' });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ habilitado: false, aptoDesde: null });
    });

    it.each([
      ['sin motivo', { hasta: en(30) }],
      ['"hasta" que ya pasó', { motivo: 'Motivo', hasta: hace(1) }],
      ['"desde" futuro', { motivo: 'Motivo', desde: en(1) }],
      ['una fecha mal escrita', { motivo: 'Motivo', hasta: '30/11/2026' }],
    ])('rechaza el pedido %s (400)', async (_, body) => {
      const res = await marcar(body);

      expect(res.status).toBe(400);
      expect(prisma.diferimiento.create).not.toHaveBeenCalled();
    });

    it('un donante no puede marcar a nadie como no apto (403)', async () => {
      const res = await marcar({ motivo: 'Motivo' }, TOKEN_DONANTE);

      expect(res.status).toBe(403);
    });

    it('una institución que todavía no está aprobada tampoco (403)', async () => {
      prisma.usuarioInstitucion.findFirst.mockResolvedValue(null);

      const res = await marcar({ motivo: 'Motivo' });

      expect(res.status).toBe(403);
      expect(prisma.diferimiento.create).not.toHaveBeenCalled();
    });
  });

  describe('Criterio 5: función "está habilitado" para DV-8', () => {
    it('estaHabilitado(idDonante) responde true o false', async () => {
      base.cuestionarios = [{ idCuestionarioAptitud: 'c1' }];
      expect(await estaHabilitado(DONANTE.idDonante)).toBe(true);

      base.diferimientos = [{ idDiferimiento: 'd1', origen: 'donacion', motivo: 'Donó', desde: aFecha(hace(10)), hasta: aFecha(en(46)) }];
      expect(await estaHabilitado(DONANTE.idDonante)).toBe(false);

      expect(await estaHabilitado(OTRO_DONANTE)).toBe(false); // un donante que no existe no está habilitado
    });

    it('filtroDonantesHabilitados() arma el filtro para buscar muchos donantes a la vez', () => {
      const hoy = aFecha(HOY);

      expect(filtroDonantesHabilitados()).toEqual({
        cuestionarios: { some: { completadoEn: { not: null } } },
        diferimientos: { none: { desde: { lte: hoy }, OR: [{ hasta: null }, { hasta: { gt: hoy } }] } },
      });
    });
  });
});
