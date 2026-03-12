self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = { title: 'Yeni olay', body: 'Yeni bildirim geldi.', url: '/' };
  try {
    data = JSON.parse(event.data.text());
  } catch {}
  event.waitUntil(
    self.registration.showNotification(data.title || 'Yeni olay', {
      body: data.body || '',
      icon: '/public/icon-192.png',
      badge: '/public/icon-192.png',
      tag: data.tag || 'crypto-event-terminal',
      data: { url: data.url || '/' }
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(clients.openWindow(url));
});
