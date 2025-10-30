// src/lib/pushClient.js

// ---------- util ----------

function encodeKey(key) {
  if (!key) return null;
  const bytes = new Uint8Array(key);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary); // debug-friendly
}

async function getSWRegistration() {
  if (!('serviceWorker' in navigator)) return null;
  // tente pegar o SW do FCM se for o seu caminho; ajuste se necessário
  const reg =
    (await navigator.serviceWorker.getRegistration('/firebase-messaging-sw.js')) ||
    (await navigator.serviceWorker.ready).catch(() => null);
  return reg || null;
}

// ---------- API p/ UI (mantém as assinaturas esperadas pelos componentes) ----------

/** Exibe o status do push no navegador (debug) */
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
    } catch {
      // no-op
    }
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

/** Pede permissão de notificação (apenas para manter compatibilidade com a UI) */
export async function requestNotificationPermission() {
  if (!('Notification' in window)) return { granted: false, reason: 'unsupported' };
  if (Notification.permission === 'granted') return { granted: true };
  const res = await Notification.requestPermission();
  return { granted: res === 'granted' };
}

/** (Stub) Tenta assinar o usuário no Push via PushManager. Ajuste a VAPID se quiser usar de fato. */
export async function subscribeUser({ vapidPublicKey } = {}) {
  const info = await getDebugInfo();
  if (!info.supported) return { ok: false, reason: 'unsupported' };

  if (Notification.permission !== 'granted') {
    const p = await requestNotificationPermission();
    if (!p.granted) return { ok: false, reason: 'permission_denied' };
  }

  const registration = await getSWRegistration();
  if (!registration) return { ok: false, reason: 'no_service_worker' };

  // Em projetos reais, passe uma VAPID pública válida (ex.: import.meta.env.VITE_VAPID_PUBLIC)
  if (!vapidPublicKey) {
    // Mantém no-op para não quebrar nada
    return { ok: true, reason: 'noop_without_vapid' };
  }

  const urlBase64ToUint8Array = (base64String) => {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
    return outputArray;
  };

  try {
    const sub = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    });
    return { ok: true, subscription: sub };
  } catch (err) {
    return { ok: false, reason: 'subscribe_error', error: String(err) };
  }
}

/** Limpa a badgezinha do app (quando suportado) */
export function clearBadge() {
  if ('clearAppBadge' in navigator) {
    // @ts-ignore
    navigator.clearAppBadge().catch(() => {});
  }
}

/** (Stub) Dispara um push de teste. Conecte com seu endpoint quando quiser. */
export async function sendTestPush({ title = 'Teste', body = 'Push de teste' } = {}) {
  // Aqui apenas no-op para não quebrar a UI. Ligue com seu back depois.
  return { ok: true, simulated: true, title, body };
}

/** (Stub) Broadcast para todos. Conecte com Cloud Function/endpoint quando quiser. */
export async function sendBroadcast({ title, body, data } = {}) {
  return { ok: true, simulated: true, title, body, data };
}
