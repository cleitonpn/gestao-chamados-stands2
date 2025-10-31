// src/lib/pushClient.js

// ⬇️ IMPORTAÇÕES DO FIRESTORE (SDK CLIENTE)
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../config/firebase'; // ⚠️ Confirme se este é o caminho correto para seu 'db'

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
 * SALVAR subscription (VERSÃO REAL)
 * Salva o token na subcoleção 'tokens' do usuário,
 * que é onde sua Cloud Function 'getUserTokens' procura.
 */
export async function saveSubscriptionInFirestore({ userId, subscription, extra = {} } = {}) {
  if (!userId || !subscription) {
    console.warn("saveSubscriptionInFirestore: userId ou subscription ausente.");
    return { ok: false, reason: 'missing_userid_or_subscription' };
  }

  // Extrai os dados da subscription
  const endpoint = subscription.endpoint;
  const token = endpoint.split('/send/')[1] || ""; // Token FCM puro
  
  if (!token) {
    console.warn("saveSubscriptionInFirestore: token FCM inválido no endpoint.");
    return { ok: false, reason: 'invalid_fcm_token' };
  }
  
  // O endpoint completo é único por dispositivo. Usamos ele como ID (em base64)
  // para evitar salvar o mesmo dispositivo várias vezes.
  const docId = btoa(endpoint).replace(/=/g, ''); // Cria um ID único
  const subJson = subscription.toJSON();

  try {
    // Referência: /usuarios/{userId}/tokens/{docId}
    const tokenRef = doc(db, "usuarios", userId, "tokens", docId);
    
    await setDoc(tokenRef, {
      userId: userId,
      token: token, // O token FCM puro que a Cloud Function usará
      endpoint: endpoint, // O endpoint completo
      keys: {
        p256dh: subJson.keys.p256dh,
        auth: subJson.keys.auth,
      },
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      userAgent: navigator.userAgent,
      ...extra,
    });

    console.log(`Token salvo com sucesso para ${userId}: ${docId}`);
    return { ok: true, simulated: false, userId, token };
    
  } catch (error) {
    console.error("Erro ao salvar token no Firestore:", error);
    return { ok: false, reason: 'firestore_error', error: String(error) };
  }
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
