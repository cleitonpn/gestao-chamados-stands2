// public/sw.js

// ——————————————————————————————————————————
// Ciclo de vida básico
// ——————————————————————————————————————————
self.addEventListener('install', (event) => {
  // atualiza imediatamente quando há nova versão
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // assume controle das páginas abertas
  event.waitUntil(clients.claim());
});

// Util: broadcast para todas as janelas do app
async function broadcast(msg) {
  const all = await clients.matchAll({ type: 'window', includeUncontrolled: true });
  for (const c of all) {
    try { c.postMessage(msg); } catch (_) {}
  }
}

// ——————————————————————————————————————————
// Push → exibir notificação + pedir badge às páginas
// Payload esperado (JSON):
// { title, body, url, tag, badgeCount, icon, badge, meta }
// ——————————————————————————————————————————
self.addEventListener('push', (event) => {
  event.waitUntil((async () => {
    let data = {};
    try {
      data = event.data ? event.data.json() : {};
    } catch (_) {}

    const {
      title = 'Notificação',
      body = '',
      url = '/',
      tag = 'default',
      badgeCount,
      icon,
      badge,
      meta = null
    } = data;

    const opts = {
      body,
      // se o payload não mandar, usa os padrões:
      icon:  icon  || '/icons/icon-192x192.png',
      badge: badge || '/icons/badge-72x72.png',
      vibrate: [100, 50, 100],
      tag,
      renotify: false,
      requireInteraction: false,
      data: { url, meta }
    };

    // Exibir a notificação nativa do sistema
    await self.registration.showNotification(title, opts);

    // Pede para as páginas definirem/limparem a "bolinha" (quando suportado)
    if (typeof badgeCount !== 'undefined') {
      await broadcast({ type: 'BADGE_SET', count: Number(badgeCount) || 0 });
    }
  })());
});

// ——————————————————————————————————————————
// Clique na notificação → focar/abrir URL alvo
// ——————————————————————————————————————————
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const target = event.notification?.data?.url || '/';
  const full = new URL(target, self.location.origin).href;

  event.waitUntil((async () => {
    const all = await clients.matchAll({ type: 'window', includeUncontrolled: true });

    // se já existe uma aba/janela nesse path, foca e navega
    for (const c of all) {
      if (c.url === full) {
        await c.focus();
        try { c.navigate(full); } catch (_) {}
        return;
      }
    }
    // senão, abre uma nova
    await clients.openWindow(full);
  })());
});

// ——————————————————————————————————————————
// Fechou a notificação (opcional)
// ——————————————————————————————————————————
self.addEventListener('notificationclose', (_event) => {
  // Se quiser, envie telemetria/analytics aqui.
});

// ——————————————————————————————————————————
// Mudança de assinatura (expiração/rota de push)
// → avisa as páginas para refazer a assinatura
// ——————————————————————————————————————————
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(broadcast({ type: 'PUSH_SUBSCRIPTION_CHANGED' }));
});

// ——————————————————————————————————————————
// Utilidade para testes: páginas podem pedir
// para o SW criar uma notificação local
// window.navigator.serviceWorker.controller.postMessage({type:'TEST_NOTIFY', title, body, url})
// ——————————————————————————————————————————
self.addEventListener('message', (event) => {
  const msg = event.data || {};
  if (msg.type === 'TEST_NOTIFY') {
    const title = msg.title || '🔔 Teste';
    const body = msg.body || 'Notificação criada pelo Service Worker.';
    const url = msg.url || '/';
    event.waitUntil(self.registration.showNotification(title, {
      body,
      icon: '/icons/icon-192x192.png',
      badge: '/icons/badge-72x72.png',
      data: { url }
    }));
  }
});
