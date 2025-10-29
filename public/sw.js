// public/sw.js

// ==============================
// Ciclo de vida básico
// ==============================
self.addEventListener('install', (event) => {
  // atualiza imediatamente quando há nova versão
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // assume controle das páginas abertas
  event.waitUntil(clients.claim());
});

// Canal opcional: permitir que a página mande o SW ativar na hora
// window.navigator.serviceWorker.controller?.postMessage({ type: 'SKIP_WAITING' })
self.addEventListener('message', (evt) => {
  const msg = evt.data || {};
  if (msg.type === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }
});

// ==============================
// Utils
// ==============================
async function broadcast(msg) {
  const all = await clients.matchAll({ type: 'window', includeUncontrolled: true });
  for (const c of all) {
    try { c.postMessage(msg); } catch (_) {}
  }
}

function toAbsUrl(target) {
  try {
    // aceita absoluta ou relativa
    return new URL(target, self.location.origin).href;
  } catch {
    return self.location.origin + '/';
  }
}

// tenta várias possibilidades de ícone/badge
function pickIconIconBadge({ icon, badge }) {
  const picked = {
    icon: icon || '/icons/icon-192x192.png',
    badge: badge || '/icons/badge-72x72.png',
  };
  // fallback leve
  if (!picked.icon) picked.icon = '/favicon.ico';
  if (!picked.badge) picked.badge = '/favicon.ico';
  return picked;
}

// ==============================
// Push → exibir notificação + pedir badge às páginas
// Payload esperado (JSON):
// { title, body, url, tag, badgeCount, icon, badge, meta }
// ==============================
self.addEventListener('push', (event) => {
  event.waitUntil((async () => {
    let data = {};
    try {
      data = event.data ? event.data.json() : {};
    } catch (_) {
      // se vier texto cru, tenta parsear
      try { data = JSON.parse(event.data.text() || '{}'); } catch {}
    }

    const {
      title = 'Notificação',
      body = '',
      url = '/',
      tag = 'default',
      badgeCount,
      icon,
      badge,
      meta = null
    } = data || {};

    const { icon: useIcon, badge: useBadge } = pickIconIconBadge({ icon, badge });

    const opts = {
      body,
      icon: useIcon,
      badge: useBadge,
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

// ==============================
// Clique na notificação → focar/abrir URL alvo
// ==============================
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const target = event.notification?.data?.url || '/';
  const full = toAbsUrl(target);

  event.waitUntil((async () => {
    const all = await clients.matchAll({ type: 'window', includeUncontrolled: true });

    // tenta focar uma guia que já esteja no mesmo origin
    // e preferencialmente na mesma rota
    for (const c of all) {
      // mesma URL exata?
      if (c.url === full) {
        await c.focus();
        try { await c.navigate(full); } catch (_) {}
        return;
      }
    }

    // se não tiver a exata, foca a primeira guia do app e navega
    if (all.length) {
      try {
        await all[0].focus();
        await all[0].navigate(full);
        return;
      } catch (_) {}
    }

    // senão, abre uma nova
    await clients.openWindow(full);
  })());
});

// ==============================
// Fechou a notificação (opcional)
// ==============================
self.addEventListener('notificationclose', (_event) => {
  // Se quiser, envie telemetria/analytics aqui.
});

// ==============================
// Mudança de assinatura (expiração/rota de push)
// → avisa as páginas para refazer a assinatura
// ==============================
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(broadcast({ type: 'PUSH_SUBSCRIPTION_CHANGED' }));
});

// ==============================
// Mensagens utilitárias vindas da página
// window.navigator.serviceWorker.controller.postMessage({type:'TEST_NOTIFY', title, body, url})
// window.navigator.serviceWorker.controller.postMessage({type:'LOCAL_NOTIFY', title, body, url, icon, badge})
// ==============================
self.addEventListener('message', (event) => {
  const msg = event.data || {};
  if (msg.type === 'TEST_NOTIFY' || msg.type === 'LOCAL_NOTIFY') {
    const title = msg.title || '🔔 Teste';
    const body = msg.body || 'Notificação criada pelo Service Worker.';
    const url = msg.url || '/';

    const { icon: useIcon, badge: useBadge } = pickIconIconBadge({
      icon: msg.icon,
      badge: msg.badge
    });

    event.waitUntil(self.registration.showNotification(title, {
      body,
      icon: useIcon,
      badge: useBadge,
      data: { url, meta: msg.meta ?? null },
      tag: msg.tag || 'local-test'
    }));
  }
});
