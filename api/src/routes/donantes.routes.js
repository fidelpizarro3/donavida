const { Router } = require('express');
const prisma = require('../lib/prisma');
const { autenticar, autorizar } = require('../middlewares/auth');
const {
  GRUPOS_VALIDOS,
  FACTORES_VALIDOS,
  validarHorarioContacto,
  validarUbicacion,
  esFechaValida,
  esFechaFuturaOPresente,
  datosInvalidos,
} = require('../utils/validaciones');
const {
  formatearHora,
  parsearHora,
  formatearFecha,
  parsearFecha,
} = require('../utils/formateadores');

const router = Router();

// Lo que se responde en el perfil del donante
function mapearPerfilDonante(donante) {
  return {
    idDonante: donante.idDonante,
    idUsuario: donante.idUsuario,
    nombre: donante.usuario.nombre,
    apellido: donante.usuario.apellido,
    email: donante.usuario.email,
    documento: donante.documento,
    fechaNacimiento: formatearFecha(donante.fechaNacimiento),
    sexo: donante.sexo,
    grupoSanguineo: donante.grupoSanguineo, // null si no lo conoce (Criterio 1)
    factorRh: donante.factorRh,
    contactoHoraDesde: formatearHora(donante.contactoHoraDesde), // "HH:MM" (Criterio 2)
    contactoHoraHasta: formatearHora(donante.contactoHoraHasta), // "HH:MM" (Criterio 2)
    alertasPausadasHasta: formatearFecha(donante.alertasPausadasHasta), // "YYYY-MM-DD" o null (Criterio 3)
    avisoPush: donante.avisoPush,
    avisoEmail: donante.avisoEmail,
    avisoWhatsapp: donante.avisoWhatsapp,
    // Ubicación para calcular la distancia en las convocatorias (Prisma devuelve Decimal: se pasa a número)
    latitud: donante.latitud == null ? null : Number(donante.latitud),
    longitud: donante.longitud == null ? null : Number(donante.longitud),
    topeAlertasMes: donante.topeAlertasMes,
    aptoDesde: formatearFecha(donante.aptoDesde),
  };
}

// GET /api/donantes/perfil: obtiene el perfil del donante autenticado
router.get('/perfil', autenticar, autorizar('donante'), async (req, res) => {
  const donante = await prisma.donante.findUnique({
    where: { idUsuario: req.usuario.id },
    include: {
      usuario: {
        select: {
          idUsuario: true,
          email: true,
          nombre: true,
          apellido: true,
          rol: true,
          emailVerificado: true,
        },
      },
    },
  });

  if (!donante) {
    return res.status(404).json({ error: { codigo: 'NO_ENCONTRADO', mensaje: 'Perfil de donante no encontrado' } });
  }

  res.json(mapearPerfilDonante(donante));
});

const CANALES_AVISO = ['avisoPush', 'avisoEmail', 'avisoWhatsapp'];

// PATCH /api/donantes/perfil: permite actualizar horarios de contacto, pausar alertas,
// elegir por dónde recibir los avisos, cargar la ubicación y declarar el grupo sanguíneo (una sola vez)
router.patch('/perfil', autenticar, autorizar('donante'), async (req, res) => {
  const { contactoHoraDesde, contactoHoraHasta, alertasPausadasHasta, latitud, longitud, grupoSanguineo, factorRh } = req.body ?? {};

  // Criterio 2: los horarios se envían juntos (también para borrarlos, ambos en null),
  // así nunca queda un horario a medias
  const cambiaDesde = contactoHoraDesde !== undefined;
  const cambiaHasta = contactoHoraHasta !== undefined;
  if (cambiaDesde || cambiaHasta) {
    const errorHorario = cambiaDesde !== cambiaHasta
      ? 'Debes enviar contactoHoraDesde y contactoHoraHasta juntos (o ambos en null para borrarlos)'
      : validarHorarioContacto(contactoHoraDesde, contactoHoraHasta);
    if (errorHorario) {
      return datosInvalidos(res, errorHorario);
    }
  }

  // Criterio 3: Pausar alertas (solo fechas presentes o futuras, o null para reanudar)
  if (alertasPausadasHasta !== undefined && alertasPausadasHasta !== null) {
    if (!esFechaValida(alertasPausadasHasta)) {
      return datosInvalidos(res, 'El formato de alertasPausadasHasta debe ser YYYY-MM-DD o null');
    }
    if (!esFechaFuturaOPresente(alertasPausadasHasta)) {
      return datosInvalidos(res, 'La fecha de pausa de alertas no puede ser una fecha pasada');
    }
  }

  // Ubicación: latitud y longitud van juntas (ambas en null para borrarla)
  const cambiaUbicacion = latitud !== undefined || longitud !== undefined;
  if (cambiaUbicacion) {
    const errorUbicacion = latitud === undefined || longitud === undefined
      ? 'Debes enviar latitud y longitud juntas (o ambas en null para borrarlas)'
      : validarUbicacion(latitud, longitud);
    if (errorUbicacion) {
      return datosInvalidos(res, errorUbicacion);
    }
  }

  // Canales de aviso: el donante elige por dónde le llegan las alertas (TAREA-11 los respeta)
  for (const canal of CANALES_AVISO) {
    if (req.body?.[canal] !== undefined && typeof req.body[canal] !== 'boolean') {
      return datosInvalidos(res, `${canal} debe ser true o false`);
    }
  }

  // Grupo sanguíneo: el que no lo sabía al registrarse lo puede declarar después, grupo y factor juntos.
  // Una sola vez: si ya estaba cargado (en el registro, acá o por una donación), no se puede cambiar
  const declaraGrupo = grupoSanguineo !== undefined || factorRh !== undefined;
  if (declaraGrupo && (!GRUPOS_VALIDOS.includes(grupoSanguineo) || !FACTORES_VALIDOS.includes(factorRh))) {
    return datosInvalidos(res, 'Indicá grupoSanguineo (A, B, AB u O) y factorRh (positivo o negativo) juntos');
  }

  const dataUpdate = {};
  if (cambiaUbicacion) {
    dataUpdate.latitud = latitud;
    dataUpdate.longitud = longitud;
  }
  for (const canal of CANALES_AVISO) {
    if (req.body?.[canal] !== undefined) dataUpdate[canal] = req.body[canal];
  }
  if (contactoHoraDesde !== undefined) {
    dataUpdate.contactoHoraDesde = contactoHoraDesde ? parsearHora(contactoHoraDesde) : null;
  }
  if (contactoHoraHasta !== undefined) {
    dataUpdate.contactoHoraHasta = contactoHoraHasta ? parsearHora(contactoHoraHasta) : null;
  }
  if (alertasPausadasHasta !== undefined) {
    dataUpdate.alertasPausadasHasta = alertasPausadasHasta ? parsearFecha(alertasPausadasHasta) : null;
  }

  const actualizar = (db) => db.donante.update({
    where: { idUsuario: req.usuario.id },
    data: dataUpdate,
    include: {
      usuario: {
        select: {
          idUsuario: true,
          email: true,
          nombre: true,
          apellido: true,
          rol: true,
          emailVerificado: true,
        },
      },
    },
  });

  try {
    let donanteActualizado;
    if (declaraGrupo) {
      donanteActualizado = await prisma.$transaction(async (tx) => {
        // Se guarda solo si todavía no tenía grupo, chequeando y cambiando en UNA operación:
        // dos pedidos a la vez no pueden cargar dos grupos distintos
        const { count } = await tx.donante.updateMany({
          where: { idUsuario: req.usuario.id, grupoSanguineo: null },
          data: { grupoSanguineo, factorRh },
        });
        return count === 0 ? null : actualizar(tx);
      });
      if (!donanteActualizado) {
        const existe = await prisma.donante.findUnique({ where: { idUsuario: req.usuario.id } });
        if (!existe) {
          return res.status(404).json({ error: { codigo: 'NO_ENCONTRADO', mensaje: 'Perfil de donante no encontrado' } });
        }
        return res.status(409).json({
          error: { codigo: 'CONFLICTO', mensaje: 'Tu grupo sanguíneo ya está cargado y no se puede cambiar' },
        });
      }
    } else {
      donanteActualizado = await actualizar(prisma);
    }

    res.json(mapearPerfilDonante(donanteActualizado));
  } catch (err) {
    if (err.code === 'P2025') {
      return res.status(404).json({ error: { codigo: 'NO_ENCONTRADO', mensaje: 'Perfil de donante no encontrado' } });
    }
    throw err;
  }
});

module.exports = router;
