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
    (await navigator.serviceWorker.getRegistration('/firebase-messaging-sw.js')) // SW do FCM (ajuste se o seu path for outro)
    || (await navigator.serviceWorker.ready).catch(() => null);
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

/** Mantém compat com o botão: garante permissão de notificação */
export async function ensurePermission() {
  if (!('Notification' in window)) return { granted: false, reason: 'unsupported' };
  if (Notification.permission === 'granted') return { granted: true };
  const res = await Notification.requestPermission();
  return { granted: res === 'granted' };
}

/** Mantém compat com o botão: registra o SW (default: firebase-messaging-sw.js) */
export async function registerServiceWorker(swPath = '/firebase-messaging-sw.js') {
  if (!('serviceWorker' in navigator)) return { ok: false, reason: 'unsupported' };
  try {
    const reg = await navigator.serviceWorker.register(swPath);
    return { ok: true, registration: reg };
  } catch (err) {
    return { ok: false, reason: 'register_error', error: String(err) };
  }
}

/**
 * Mantém compat com o botão:
 * cria (ou retorna) a subscription no PushManager. Passe sua VAPID pública se quiser de fato assinar.
 */
export async function getOrCreateSubscription(vapidPublicKey) {
  const perm = await ensurePermission();
  if (!perm.granted) return { ok: false, reason: 'permission_denied' };

  const reg = await getSWRegistration();
  if (!reg) return { ok: false, reason: 'no_service_worker' };

  try {
    const existing = await reg.pushManager.getSubscription();
    if (existing) return { ok: true, subscription: existing, existed: true };

    if (!vapidPublicKey) {
      // no-op seguro: permite a UI funcionar sem travar o build
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

/** Debug: status do push no navegador */
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

/** Limpa badge (quando suportado) */
export function clearBadge() {
  if ('clearAppBadge' in navigator) {
    // @ts-ignore
    navigator.clearAppBadge().catch(() => {});
  }
}

/** Stubs seguros — conecte ao seu endpoint/Function quando quiser de fato enviar */
export async function sendTestPush({ title = 'Teste', body = 'Push de teste' } = {}) {
  return { ok: true, simulated: true, title, body };
}

export async function sendBroadcast({ title, body, data } = {}) {
  return { ok: true, simulated: true, title, body, data };
}
