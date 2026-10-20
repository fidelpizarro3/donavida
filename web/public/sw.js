// TAREA-11: service worker de DonaVida.
// El navegador lo deja corriendo aparte de la página: por eso las alertas push llegan con la app cerrada.

// Llega un push del servidor (api/src/services/alertas.js): se muestra la notificación
self.addEventListener('push', (event) => {
  const datos = event.data ? event.data.json() : {}
  event.waitUntil(
    self.registration.showNotification(datos.titulo || 'DonaVida', {
      body: datos.cuerpo || 'Tenés una nueva alerta',
      icon: '/icono-192.png',
      badge: '/icono-192.png',
      data: { url: datos.url || '/' },
    })
  )
})

// Tocar la notificación abre DonaVida (o la trae al frente si ya estaba abierta)
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((ventanas) => {
      const abierta = ventanas.find((v) => 'focus' in v)
      return abierta ? abierta.focus() : self.clients.openWindow(event.notification.data.url)
    })
  )
})
