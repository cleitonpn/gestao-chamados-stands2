// src/lib/pushClient.js

// ---------------- utils ----------------
function encodeKey(key) {
  if (!key) return null;
  const bytes = new Uint8Array(key);
  let bin = '';
  for (let i = 0; i < bytes.byteLength; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

async function getSWRegistration() {
  if (!('serviceWorker' in navigator)) return null;
  const reg =
    (await navigator.serviceWorker.getRegistration('/firebase-messaging-sw.js')) ||
    (await navigator.serviceWorker.ready).catch(() => null);
  return reg || null;
}

const urlBase64ToUint8Array = (base64String) => {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
};

// ---------------- API p/ UI ----------------

/** Garante permissão de notificação */
export async function ensurePermission() {
  if (!('Notification' in window)) return { granted: false, reason: 'unsupported' };
  if (Notification.permission === 'granted') return { granted: true };
  const res = await Notification.requestPermission();
  return { granted: res === 'granted' };
}

/** Registra o Service Worker (padrão: FCM sw) */
export async function registerServiceWorker(swPath = '/firebase-messaging-sw.js') {
  if (!('serviceWorker' in navigator)) return { ok: false, reason: 'unsupported' };
  try {
    const reg = await navigator.serviceWorker.register(swPath);
    return { ok: true, registration: reg };
  } catch (err) {
    return { ok: false, reason: 'register_error', error: String(err) };
  }
}

/** Cria (ou retorna) a subscription do PushManager */
export async function getOrCreateSubscription(vapidPublicKey) {
  const perm = await ensurePermission();
  if (!perm.granted) return { ok: false, reason: 'permission_denied' };

  const reg = await getSWRegistration();
  if (!reg) return { ok: false, reason: 'no_service_worker' };

  try {
    const existing = await reg.pushManager.getSubscription();
    if (existing) return { ok: true, subscription: existing, existed: true };

    if (!vapidPublicKey) {
      // sem VAPID a assinatura real não acontece — mantemos no-op seguro
      return { ok: true, subscription: null, existed: false, reason: 'noop_without_vapid' };
    }

    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    });
    return { ok: true, subscription: sub, existed: false };
  } catch (err) {
    return { ok: false, reason: 'subscribe_error', error: String(err) };
  }
}

/**
 * SALVAR subscription (stub seguro)
 * Troque pelo seu write real (Firestore SDK no cliente OU endpoint/Function HTTP).
 */
export async function saveSubscriptionInFirestore({ userId, subscription, extra = {} } = {}) {
  // no-op para não quebrar o build; retorne os dados para debug na UI
  return {
    ok: true,
    simulated: true,
    userId: userId ?? null,
    endpoint: subscription?.endpoint ?? null,
    keys: subscription
      ? {
          p256dh: encodeKey(subscription.getKey('p256dh')),
          auth: encodeKey(subscription.getKey('auth')),
        }
      : null,
    extra,
  };
}

/**
 * ENVIAR push real (stub seguro)
 * Conecte ao seu endpoint de envio (ex: Function HTTP /notify) quando quiser enviar de verdade.
 */
export async function sendRealPush({ title, body, data, toUserId } = {}) {
  // Exemplo futuro:
  // await fetch('/api/notify', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ title, body, data, toUserId }) })
  return { ok: true, simulated: true, title, body, data, toUserId };
}

/** Broadcast (stub) */
export async function sendBroadcast({ title, body, data } = {}) {
  return { ok: true, simulated: true, title, body, data };
}

/** Debug do estado de push no navegador */
export async function getDebugInfo() {
  const supported = 'Notification' in window && 'serviceWorker' in navigator;
  const permission = supported ? Notification.permission : 'unsupported';

  const registration = await getSWRegistration();
  const swActive = Boolean(registration?.active);

  let subscription = null;
  let endpoint = null;
  let keys = null;

  if (registration?.pushManager) {
    try {
      subscription = await registration.pushManager.getSubscription();
      endpoint = subscription?.endpoint ?? null;
      if (subscription) {
        keys = {
          p256dh: encodeKey(subscription.getKey('p256dh')),
          auth: encodeKey(subscription.getKey('auth')),
        };
      }
    } catch {}
  }

  return {
    supported,
    permission,
    swRegistered: Boolean(registration),
    swActive,
    hasSubscription: Boolean(subscription),
    endpoint,
    keys,
    userAgent: navigator.userAgent,
  };
}

/** Limpa o app badge (quando suportado) */
export function clearBadge() {
  if ('clearAppBadge' in navigator) {
    // @ts-ignore
    navigator.clearAppBadge().catch(() => {});
  }
}
