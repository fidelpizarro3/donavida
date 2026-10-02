const { Router } = require('express');
const prisma = require('../lib/prisma');
const { autenticar, autorizar } = require('../middlewares/auth');
const {
  validarHorarioContacto,
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

// PATCH /api/donantes/perfil: permite actualizar horarios de contacto y pausar alertas
router.patch('/perfil', autenticar, autorizar('donante'), async (req, res) => {
  const { contactoHoraDesde, contactoHoraHasta, alertasPausadasHasta } = req.body ?? {};

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

  const dataUpdate = {};
  if (contactoHoraDesde !== undefined) {
    dataUpdate.contactoHoraDesde = contactoHoraDesde ? parsearHora(contactoHoraDesde) : null;
  }
  if (contactoHoraHasta !== undefined) {
    dataUpdate.contactoHoraHasta = contactoHoraHasta ? parsearHora(contactoHoraHasta) : null;
  }
  if (alertasPausadasHasta !== undefined) {
    dataUpdate.alertasPausadasHasta = alertasPausadasHasta ? parsearFecha(alertasPausadasHasta) : null;
  }

  try {
    const donanteActualizado = await prisma.donante.update({
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

    res.json(mapearPerfilDonante(donanteActualizado));
  } catch (err) {
    if (err.code === 'P2025') {
      return res.status(404).json({ error: { codigo: 'NO_ENCONTRADO', mensaje: 'Perfil de donante no encontrado' } });
    }
    throw err;
  }
});

module.exports = router;
