// TAREA-11: service worker de DonaVida.
// El navegador lo deja corriendo aparte de la página: por eso las alertas push llegan con la app cerrada.
// TAREA-10 / DV-11: además guarda una copia de la app para que abra sin conexión
// (el próximo turno y el historial los guarda el propio front en el navegador).
const CACHE = 'donavida-v1'

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

// Primero la red (siempre lo más nuevo) y, si no hay conexión, la última copia guardada.
// Solo se guardan los archivos de la propia app: la API (otro puerto) no pasa por acá
self.addEventListener('fetch', (event) => {
  const { request } = event
  const mismaApp = new URL(request.url).origin === self.location.origin
  if (request.method !== 'GET' || !mismaApp) return

  event.respondWith(
    fetch(request)
      .then((respuesta) => {
        if (respuesta.ok) {
          const copia = respuesta.clone()
          caches.open(CACHE).then((cache) => cache.put(request, copia))
        }
        return respuesta
      })
      .catch(() => caches.match(request).then((guardada) => guardada || caches.match('/')))
  )
})

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
