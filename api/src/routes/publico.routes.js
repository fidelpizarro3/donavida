// Datos públicos para la página de inicio (sin login): necesidades abiertas, mapa de la red y contadores.
// Solo números y datos de las instituciones: NUNCA datos de los donantes.
const { Router } = require('express');
const prisma = require('../lib/prisma');
const { cerrarVencidas } = require('./necesidades.routes');
const { formatearFecha } = require('../utils/formateadores');

const router = Router();

// Las alertas que efectivamente le llegaron a alguien (las pendientes o canceladas no cuentan)
const ALERTAS_ENVIADAS = { estado: { in: ['enviada', 'aceptada', 'rechazada'] } };

// Decimal de Prisma → número (o null)
const numero = (valor) => (valor == null ? null : Number(valor));

// GET /api/publico/necesidades: las necesidades abiertas de toda la red, primero las urgentes
router.get('/necesidades', async (req, res) => {
  await cerrarVencidas();
  const necesidades = await prisma.necesidad.findMany({
    where: { estado: 'abierta', institucion: { estado: 'aprobada' } },
    include: {
      institucion: { select: { idInstitucion: true, nombre: true, direccion: true, latitud: true, longitud: true } },
      // Por cada convocatoria, a cuántos donantes les llegó la alerta
      convocatorias: { select: { _count: { select: { alertas: { where: ALERTAS_ENVIADAS } } } } },
    },
    orderBy: { fechaLimite: 'asc' },
    take: 20,
  });

  const lista = necesidades.map((n) => ({
    idNecesidad: n.idNecesidad,
    grupoSanguineo: n.grupoSanguineo,
    factorRh: n.factorRh,
    componente: n.componente,
    urgencia: n.urgencia,
    fechaLimite: formatearFecha(n.fechaLimite),
    unidadesSolicitadas: n.unidadesSolicitadas,
    unidadesCubiertas: n.unidadesCubiertas,
    unidadesFaltantes: n.unidadesSolicitadas - n.unidadesCubiertas,
    donantesAvisados: n.convocatorias.reduce((total, c) => total + c._count.alertas, 0),
    institucion: { ...n.institucion, latitud: numero(n.institucion.latitud), longitud: numero(n.institucion.longitud) },
  }));
  // Urgentes primero; dentro de cada grupo, la que vence antes
  lista.sort((a, b) => (a.urgencia === 'urgente' ? 0 : 1) - (b.urgencia === 'urgente' ? 0 : 1));
  res.json(lista);
});

// GET /api/publico/instituciones: las instituciones aprobadas con su ubicación, para el mapa
router.get('/instituciones', async (req, res) => {
  const instituciones = await prisma.institucion.findMany({
    where: { estado: 'aprobada' },
    select: {
      idInstitucion: true,
      nombre: true,
      direccion: true,
      tipo: true,
      latitud: true,
      longitud: true,
      necesidades: { where: { estado: 'abierta' }, select: { urgencia: true } },
    },
  });

  res.json(instituciones.map(({ necesidades, ...i }) => ({
    ...i,
    latitud: numero(i.latitud),
    longitud: numero(i.longitud),
    necesidadesAbiertas: necesidades.length,
    hayUrgente: necesidades.some((n) => n.urgencia === 'urgente'),
  })));
});

// GET /api/publico/estadisticas: los contadores de la página de inicio
router.get('/estadisticas', async (req, res) => {
  const [donantes, donaciones, instituciones, necesidadesAbiertas] = await Promise.all([
    prisma.donante.count({ where: { usuario: { activo: true, emailVerificado: true } } }),
    prisma.donacion.count({ where: { resultado: 'realizada' } }),
    prisma.institucion.count({ where: { estado: 'aprobada' } }),
    prisma.necesidad.count({ where: { estado: 'abierta' } }),
  ]);
  // Una donación de sangre entera puede ayudar hasta a 3 personas (se separa en componentes)
  res.json({ donantes, donaciones, vidas: donaciones * 3, instituciones, necesidadesAbiertas });
});

module.exports = router;
