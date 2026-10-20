// TAREA-11 (DV-9): suscripción a las notificaciones push del navegador.
// El celular (o la compu) le da al front una "suscripción": una dirección única a la que el servidor
// le puede mandar avisos aunque la app esté cerrada. Acá se guarda para usarla al enviar alertas.
const { Router } = require('express');
const prisma = require('../lib/prisma');
const { autenticar } = require('../middlewares/auth');
const { datosInvalidos } = require('../utils/validaciones');

const router = Router();

const esTextoCorto = (valor, maximo) => typeof valor === 'string' && valor.length > 0 && valor.length <= maximo;

// 1) GET /api/push/clave-publica: el front la necesita para pedir la suscripción al navegador (público)
router.get('/clave-publica', (req, res) => {
    if (!process.env.VAPID_PUBLIC_KEY) {
        return res.status(503).json({ error: { codigo: 'NO_CONFIGURADO', mensaje: 'Las notificaciones push no están configuradas en el servidor' } });
    }
    res.json({ clavePublica: process.env.VAPID_PUBLIC_KEY });
});

// 2) POST /api/push/suscripcion: guarda la suscripción del navegador del usuario logueado
//    Body: lo que devuelve suscripcion.toJSON() en el navegador → { endpoint, keys: { p256dh, auth } }
router.post('/suscripcion', autenticar, async (req, res) => {
    const { endpoint, keys } = req.body ?? {};
    if (!esTextoCorto(endpoint, 500) || !endpoint.startsWith('https://')) {
        return datosInvalidos(res, 'endpoint debe ser una dirección https');
    }
    if (!esTextoCorto(keys?.p256dh, 255) || !esTextoCorto(keys?.auth, 255)) {
        return datosInvalidos(res, 'keys debe tener p256dh y auth');
    }

    // Si ese navegador ya estaba suscripto, se reactiva en vez de duplicarlo
    const existente = await prisma.suscripcionPush.findFirst({ where: { idUsuario: req.usuario.id, endpoint } });
    const datos = { p256dh: keys.p256dh, auth: keys.auth, activo: true };
    if (existente) {
        await prisma.suscripcionPush.update({ where: { idSuscripcionPush: existente.idSuscripcionPush }, data: datos });
    } else {
        await prisma.suscripcionPush.create({ data: { idUsuario: req.usuario.id, endpoint, ...datos } });
    }
    res.status(201).json({ suscripto: true });
});

module.exports = router;
