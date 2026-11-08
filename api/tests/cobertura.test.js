process.env.JWT_SECRET = 'secreto_de_prueba_para_los_tests_de_cobertura';

const request = require('supertest');
const jwt = require('jsonwebtoken');

// Base simulada: cada test decide qué devuelve cada consulta
jest.mock('../src/lib/prisma', () => ({
  usuarioInstitucion: { findFirst: jest.fn() },
  necesidad: { findFirst: jest.fn(), updateMany: jest.fn() },
  unidadSangre: { findMany: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
  stockMinimo: { findMany: jest.fn() },
  transferenciaItem: { count: jest.fn() },
  transferencia: { create: jest.fn() },
  franjaHoraria: { count: jest.fn(), findMany: jest.fn() },
  donante: { findMany: jest.fn() },
}));

// La transferencia en sí (TAREA-12) se prueba en transferencias.test.js: acá solo se ve que se pida bien
jest.mock('../src/services/transferencias', () => ({
  ...jest.requireActual('../src/services/transferencias'),
  pedirTransferencia: jest.fn(),
}));

const prisma = require('../src/lib/prisma');
const { pedirTransferencia, ErrorTransferencia } = require('../src/services/transferencias');
const app = require('../src/app');
const { gruposCompatibles } = require('../src/services/compatibilidad');
const { obtenerFechaHoyArgentina } = require('../src/utils/validaciones');
const { parsearFecha, formatearFecha } = require('../src/utils/formateadores');

const ID_USUARIO = '11111111-1111-4111-8111-111111111111';
const ID_INSTITUCION = '44444444-4444-4444-8444-444444444444';
const ID_CERCA = '55555555-5555-4555-8555-555555555555';
const ID_LEJOS = '66666666-6666-4666-8666-666666666666';
const ID_NECESIDAD = '77777777-7777-4777-8777-777777777777';

const tokenDe = (rol) => jwt.sign({ sub: ID_USUARIO, rol }, process.env.JWT_SECRET, { expiresIn: '1h' });

// Falta cubrir 2 de las 3 unidades. El hospital que pide está en el Obelisco
const NECESIDAD = {
  idNecesidad: ID_NECESIDAD,
  idInstitucion: ID_INSTITUCION,
  grupoSanguineo: 'A',
  factorRh: 'positivo',
  componente: 'globulos_rojos',
  unidadesSolicitadas: 3,
  unidadesCubiertas: 1,
  urgencia: 'normal',
  fechaLimite: new Date('2099-12-31'),
  estado: 'abierta',
  institucion: { latitud: '-34.603722', longitud: '-58.381592' },
};

// Cerca = Plaza de Mayo (~1 km). Lejos = La Plata (~50 km)
const HOSPITAL_CERCA = { nombre: 'Hospital Cerca', latitud: '-34.608147', longitud: '-58.370226' };
const HOSPITAL_LEJOS = { nombre: 'Hospital Lejos', latitud: '-34.921450', longitud: '-57.954530' };

// Fecha que queda a X días de hoy
function enDias(dias) {
  const fecha = parsearFecha(obtenerFechaHoyArgentina());
  fecha.setUTCDate(fecha.getUTCDate() + dias);
  return fecha;
}

let proximoCodigo = 1;
const unidad = (idInstitucion, dias, datos = {}) => {
  const numero = proximoCodigo++;
  const codigo = `U-${numero}`;
  return {
    idUnidadSangre: `00000000-0000-4000-8000-${String(numero).padStart(12, '0')}`,
    codigo,
    idInstitucion,
    grupoSanguineo: 'A',
    factorRh: 'positivo',
    componente: 'globulos_rojos',
    fechaVencimiento: enDias(dias),
    estado: 'disponible',
    institucion: idInstitucion === ID_CERCA ? HOSPITAL_CERCA : HOSPITAL_LEJOS,
    ...datos,
  };
};

const minimo = (idInstitucion, unidadesMinimas, datos = {}) => ({
  idInstitucion, grupoSanguineo: 'A', factorRh: 'positivo', componente: 'globulos_rojos', unidadesMinimas, ...datos,
});

const buscar = (token = tokenDe('institucion'), id = ID_NECESIDAD) =>
  request(app).get(`/api/necesidades/${id}/cobertura`).set('Authorization', `Bearer ${token}`);

const aceptar = (body, token = tokenDe('institucion')) =>
  request(app).post(`/api/necesidades/${ID_NECESIDAD}/cobertura/aceptar`).set('Authorization', `Bearer ${token}`).send(body);

const proponer = () =>
  request(app)
    .post(`/api/necesidades/${ID_NECESIDAD}/convocatoria/propuesta`)
    .set('Authorization', `Bearer ${tokenDe('institucion')}`)
    .send({});

beforeEach(() => {
  jest.resetAllMocks();
  prisma.usuarioInstitucion.findFirst.mockResolvedValue({ idUsuario: ID_USUARIO, idInstitucion: ID_INSTITUCION });
  prisma.necesidad.findFirst.mockResolvedValue(NECESIDAD);
  prisma.necesidad.updateMany.mockResolvedValue({ count: 0 });
  prisma.unidadSangre.findMany.mockResolvedValue([]);
  prisma.stockMinimo.findMany.mockResolvedValue([]);
  prisma.transferenciaItem.count.mockResolvedValue(0);
  prisma.franjaHoraria.count.mockResolvedValue(0);
  prisma.franjaHoraria.findMany.mockResolvedValue([]);
  prisma.donante.findMany.mockResolvedValue([]);
  pedirTransferencia.mockImplementation(async (datos) => ({ idTransferencia: `T-${datos.idInstitucionProveedora}`, estado: 'pendiente' }));
});

describe('Quién puede buscar', () => {
  test('sin token responde 401', async () => {
    const res = await request(app).get(`/api/necesidades/${ID_NECESIDAD}/cobertura`);
    expect(res.status).toBe(401);
  });

  test('un donante no puede buscar', async () => {
    const res = await buscar(tokenDe('donante'));
    expect(res.status).toBe(403);
  });

  test('un id inválido o una necesidad de otra institución responde 404', async () => {
    expect((await buscar(undefined, 'abc')).status).toBe(404);
    prisma.necesidad.findFirst.mockResolvedValue(null);
    expect((await buscar()).status).toBe(404);
  });

  test('una necesidad que no está abierta responde 409', async () => {
    prisma.necesidad.findFirst.mockResolvedValue({ ...NECESIDAD, estado: 'cubierta' });
    const res = await buscar();
    expect(res.status).toBe(409);
    expect(res.body.error.codigo).toBe('CONFLICTO');
  });

  test('una necesidad con la fecha límite vencida responde 409', async () => {
    prisma.necesidad.findFirst.mockResolvedValue({ ...NECESIDAD, fechaLimite: new Date('2020-01-01') });
    expect((await buscar()).status).toBe(409);
  });
});

describe('Criterio: solo unidades disponibles, no vencidas y compatibles', () => {
  test('la consulta filtra por estado, fecha, componente, grupo e institución aprobada de la red', async () => {
    await buscar();
    const { where } = prisma.unidadSangre.findMany.mock.calls[0][0];
    expect(where).toEqual({
      estado: 'disponible',
      fechaVencimiento: { gte: parsearFecha(obtenerFechaHoyArgentina()) },
      componente: 'globulos_rojos',
      OR: gruposCompatibles(NECESIDAD),
      idInstitucion: { not: ID_INSTITUCION },
      institucion: { estado: 'aprobada' },
      itemsTransferencia: { none: { activo: true } }, // no las pedidas en otra transferencia en curso
    });
  });

  test('sin unidades en la red no hay opciones y se convoca por todo lo que falta', async () => {
    const res = await buscar();
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      idNecesidad: ID_NECESIDAD,
      unidadesFaltantes: 2,
      enCamino: 0,
      cubiertasEnRed: 0,
      faltanConvocar: 2,
      opciones: [],
    });
  });
});

describe('Criterio: la institución sigue cumpliendo su stock mínimo después de prestar', () => {
  test('presta solo lo que le sobra del mínimo', async () => {
    prisma.unidadSangre.findMany.mockResolvedValue([unidad(ID_CERCA, 10), unidad(ID_CERCA, 20), unidad(ID_CERCA, 30)]);
    prisma.stockMinimo.findMany.mockResolvedValue([minimo(ID_CERCA, 2)]);
    const res = await buscar();
    expect(res.body.opciones).toHaveLength(1);
    expect(res.body.opciones[0].unidades).toHaveLength(1);
  });

  test('presta primero las que vencen antes y se queda con las de más días', async () => {
    prisma.unidadSangre.findMany.mockResolvedValue([unidad(ID_CERCA, 30), unidad(ID_CERCA, 5)]);
    prisma.stockMinimo.findMany.mockResolvedValue([minimo(ID_CERCA, 1)]);
    const res = await buscar();
    expect(res.body.opciones[0].unidades.map((u) => u.diasRestantes)).toEqual([5]);
  });

  test('si está justo en el mínimo o por debajo, no aparece', async () => {
    prisma.unidadSangre.findMany.mockResolvedValue([unidad(ID_CERCA, 10), unidad(ID_LEJOS, 10)]);
    prisma.stockMinimo.findMany.mockResolvedValue([minimo(ID_CERCA, 1), minimo(ID_LEJOS, 5)]);
    const res = await buscar();
    expect(res.body.opciones).toEqual([]);
    expect(res.body.faltanConvocar).toBe(2);
  });

  test('sin mínimo cargado puede prestar todo', async () => {
    prisma.unidadSangre.findMany.mockResolvedValue([unidad(ID_CERCA, 10), unidad(ID_CERCA, 20)]);
    const res = await buscar();
    expect(res.body.opciones[0].unidades).toHaveLength(2);
  });

  test('el mínimo de un grupo no afecta a otro grupo compatible', async () => {
    prisma.unidadSangre.findMany.mockResolvedValue([unidad(ID_CERCA, 10), unidad(ID_CERCA, 20, { grupoSanguineo: 'O' })]);
    prisma.stockMinimo.findMany.mockResolvedValue([minimo(ID_CERCA, 1)]); // solo para A+
    const res = await buscar();
    expect(res.body.opciones[0].unidades.map((u) => u.grupoSanguineo)).toEqual(['O']);
  });
});

describe('Criterio: ordena por distancia y por los días que le quedan a cada unidad', () => {
  test('primero la institución más cercana, aunque la otra tenga unidades que vencen antes', async () => {
    prisma.unidadSangre.findMany.mockResolvedValue([unidad(ID_LEJOS, 1), unidad(ID_CERCA, 30)]);
    const res = await buscar();
    expect(res.body.opciones.map((o) => o.nombre)).toEqual(['Hospital Cerca', 'Hospital Lejos']);
    expect(res.body.opciones[0].distanciaKm).toBeLessThan(res.body.opciones[1].distanciaKm);
  });

  test('a igual distancia, primero la que tiene la unidad con menos días', async () => {
    prisma.unidadSangre.findMany.mockResolvedValue([
      unidad(ID_CERCA, 30),
      unidad(ID_LEJOS, 3, { institucion: HOSPITAL_CERCA, idInstitucion: ID_LEJOS }),
    ]);
    const res = await buscar();
    expect(res.body.opciones[0].unidades[0].diasRestantes).toBe(3);
  });

  test('dentro de cada institución, primero las unidades con menos días', async () => {
    prisma.unidadSangre.findMany.mockResolvedValue([unidad(ID_CERCA, 30), unidad(ID_CERCA, 5), unidad(ID_CERCA, 12)]);
    const res = await buscar();
    expect(res.body.opciones[0].unidades.map((u) => u.diasRestantes)).toEqual([5, 12, 30]);
  });

  test('devuelve la fecha de vencimiento y los días de cada unidad', async () => {
    prisma.unidadSangre.findMany.mockResolvedValue([unidad(ID_CERCA, 0)]);
    const res = await buscar();
    expect(res.body.opciones[0].unidades[0]).toMatchObject({
      fechaVencimiento: formatearFecha(enDias(0)),
      diasRestantes: 0, // la que vence hoy todavía sirve
    });
  });
});

describe('Criterio: si se cubre una parte, se convoca solo por lo que falta', () => {
  test('sugiere unidades hasta cubrir lo que falta, empezando por la opción más cercana', async () => {
    prisma.unidadSangre.findMany.mockResolvedValue([unidad(ID_CERCA, 10), unidad(ID_LEJOS, 10), unidad(ID_LEJOS, 20)]);
    const res = await buscar();
    expect(res.body.opciones.map((o) => o.sugeridas)).toEqual([1, 1]);
    expect(res.body).toMatchObject({ cubiertasEnRed: 2, faltanConvocar: 0 });
  });

  test('una cobertura parcial deja por convocar solo el resto', async () => {
    prisma.unidadSangre.findMany.mockResolvedValue([unidad(ID_CERCA, 10)]);
    const res = await buscar();
    expect(res.body).toMatchObject({ unidadesFaltantes: 2, cubiertasEnRed: 1, faltanConvocar: 1 });
  });

  test('las unidades que ya vienen en camino no se vuelven a buscar', async () => {
    prisma.transferenciaItem.count.mockResolvedValue(2);
    const res = await buscar();
    expect(res.body).toMatchObject({ unidadesFaltantes: 0, enCamino: 2, cubiertasEnRed: 0, faltanConvocar: 0, opciones: [] });
    expect(prisma.unidadSangre.findMany).not.toHaveBeenCalled();
  });

  test('la convocatoria descuenta las unidades en camino', async () => {
    prisma.transferenciaItem.count.mockResolvedValue(1);
    const res = await proponer();
    expect(res.body.cupo).toEqual({ disponible: 1, segun: 'unidades_faltantes' });
  });

  test('con agenda de sobra, el cupo no pasa de lo que falta', async () => {
    prisma.franjaHoraria.count.mockResolvedValue(1);
    prisma.franjaHoraria.findMany.mockResolvedValue([{ cupoTotal: 10, cupoOcupado: 0 }]);
    const res = await proponer();
    expect(res.body.cupo).toEqual({ disponible: 2, segun: 'agenda' });
  });

  test('si todo viene en camino, el cupo queda en 0 aunque haya agenda', async () => {
    prisma.transferenciaItem.count.mockResolvedValue(2);
    prisma.franjaHoraria.count.mockResolvedValue(1);
    prisma.franjaHoraria.findMany.mockResolvedValue([{ cupoTotal: 10, cupoOcupado: 0 }]);
    const res = await proponer();
    expect(res.body.cupo.disponible).toBe(0);
  });
});

describe('Criterio: el hospital puede rechazar la propuesta y convocar igual', () => {
  test('tener opciones en la red no cambia el cupo de la convocatoria', async () => {
    prisma.unidadSangre.findMany.mockResolvedValue([unidad(ID_CERCA, 10), unidad(ID_CERCA, 20)]);
    expect((await buscar()).body.cubiertasEnRed).toBe(2);
    const res = await proponer();
    expect(res.status).toBe(200);
    expect(res.body.cupo.disponible).toBe(2);
  });
});

describe('Criterio: la búsqueda no modifica nada', () => {
  test('no escribe en la base, ni siquiera para cerrar vencidas', async () => {
    prisma.unidadSangre.findMany.mockResolvedValue([unidad(ID_CERCA, 10)]);
    const res = await buscar();
    expect(res.status).toBe(200);
    expect(prisma.unidadSangre.update).not.toHaveBeenCalled();
    expect(prisma.unidadSangre.updateMany).not.toHaveBeenCalled();
    expect(prisma.necesidad.updateMany).not.toHaveBeenCalled();
    expect(prisma.transferencia.create).not.toHaveBeenCalled();
  });
});

describe('Criterio: si el hospital acepta, se crea la transferencia (TAREA-12)', () => {
  const idsDe = (res) => res.body.opciones.flatMap((o) => o.unidades.slice(0, o.sugeridas).map((u) => u.idUnidadSangre));

  test('pide una transferencia por cada hospital, ligada a la necesidad, empezando por el más cercano', async () => {
    prisma.unidadSangre.findMany.mockResolvedValue([unidad(ID_LEJOS, 10), unidad(ID_CERCA, 20)]);
    const ids = idsDe(await buscar());
    const res = await aceptar({ idsUnidadSangre: ids });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ idNecesidad: ID_NECESIDAD, unidadesPedidas: 2 });
    expect(res.body.transferencias).toHaveLength(2);
    expect(pedirTransferencia.mock.calls.map(([d]) => d)).toEqual([
      { idInstitucionSolicitante: ID_INSTITUCION, idInstitucionProveedora: ID_CERCA, idsUnidadSangre: [ids[0]], idNecesidad: ID_NECESIDAD },
      { idInstitucionSolicitante: ID_INSTITUCION, idInstitucionProveedora: ID_LEJOS, idsUnidadSangre: [ids[1]], idNecesidad: ID_NECESIDAD },
    ]);
  });

  test('puede aceptar solo una parte de la propuesta', async () => {
    prisma.unidadSangre.findMany.mockResolvedValue([unidad(ID_CERCA, 10), unidad(ID_CERCA, 20)]);
    const [primera] = idsDe(await buscar());
    const res = await aceptar({ idsUnidadSangre: [primera] });
    expect(res.status).toBe(201);
    expect(pedirTransferencia).toHaveBeenCalledTimes(1);
  });

  test('no deja pedir una unidad que dejaría al hospital por debajo de su mínimo', async () => {
    const guardada = unidad(ID_CERCA, 30);
    prisma.unidadSangre.findMany.mockResolvedValue([unidad(ID_CERCA, 10), guardada]);
    prisma.stockMinimo.findMany.mockResolvedValue([minimo(ID_CERCA, 1)]);
    const res = await aceptar({ idsUnidadSangre: [guardada.idUnidadSangre] });
    expect(res.status).toBe(409);
    expect(res.body.error.mensaje).toMatch(/Volvé a buscar/);
    expect(pedirTransferencia).not.toHaveBeenCalled();
  });

  test('no deja pedir una unidad que ya no está en la red (se usó, venció o la pidió otro)', async () => {
    const res = await aceptar({ idsUnidadSangre: ['00000000-0000-4000-8000-999999999999'] });
    expect(res.status).toBe(409);
    expect(pedirTransferencia).not.toHaveBeenCalled();
  });

  test('no deja pedir más de lo que falta', async () => {
    prisma.unidadSangre.findMany.mockResolvedValue([unidad(ID_CERCA, 10), unidad(ID_CERCA, 20), unidad(ID_CERCA, 30)]);
    const res = await buscar();
    const todas = res.body.opciones[0].unidades.map((u) => u.idUnidadSangre);
    const pedido = await aceptar({ idsUnidadSangre: todas });
    expect(pedido.status).toBe(409);
    expect(pedido.body.error.mensaje).toMatch(/faltan 2/);
  });

  test('revisa la lista de unidades', async () => {
    expect((await aceptar({})).status).toBe(400);
    expect((await aceptar({ idsUnidadSangre: [] })).status).toBe(400);
    expect((await aceptar({ idsUnidadSangre: ['abc'] })).status).toBe(400);
    const id = '00000000-0000-4000-8000-000000000001';
    expect((await aceptar({ idsUnidadSangre: [id, id] })).status).toBe(400);
  });

  test('un donante no puede aceptar y una necesidad cerrada responde 409', async () => {
    const body = { idsUnidadSangre: ['00000000-0000-4000-8000-000000000001'] };
    expect((await aceptar(body, tokenDe('donante'))).status).toBe(403);
    prisma.necesidad.findFirst.mockResolvedValue({ ...NECESIDAD, estado: 'cerrada_manual' });
    expect((await aceptar(body)).status).toBe(409);
  });

  test('si la transferencia con un hospital falla, avisa qué se pidió y con quién falló', async () => {
    prisma.unidadSangre.findMany.mockResolvedValue([unidad(ID_CERCA, 10), unidad(ID_LEJOS, 20)]);
    const ids = idsDe(await buscar());
    pedirTransferencia
      .mockResolvedValueOnce({ idTransferencia: 'T-1', estado: 'pendiente' })
      .mockRejectedValueOnce(new ErrorTransferencia(409, 'CONFLICTO', 'La unidad U-9 ya está pedida en otra transferencia en curso'));
    const res = await aceptar({ idsUnidadSangre: ids });
    expect(res.status).toBe(409);
    expect(res.body.error.mensaje).toBe('Se pidió 1 transferencia, pero otra no: La unidad U-9 ya está pedida en otra transferencia en curso');
    expect(res.body.transferencias).toEqual([{ idTransferencia: 'T-1', estado: 'pendiente' }]);
  });
});
