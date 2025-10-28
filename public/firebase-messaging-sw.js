// public/firebase-messaging-sw.js
self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {};
  const title = data.title || 'Notificação';
  const body = data.body || '';
  const options = {
    body,
    data: data.data || {},
    icon: '/icons/icon-192.png',
    badge: '/icons/badge.png',
    tag: data.tag || 'default',
    renotify: !!data.renotify,
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(clients.openWindow(url));
});
