// src/lib/pushClient.js
// Cliente de Push unificado: lida com VAPID (WebPush) e FCM (firebase/messaging).
// Normaliza o "subscription" antes de salvar no Firestore para evitar
// "endpoint: undefined" (o problema que você viu). Também expõe util de debug.

import { db } from './firebaseClient';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { getMessaging, getToken, isSupported } from 'firebase/messaging';

// ---- Helpers ----
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

function hashId(s) {
  try {
    return btoa(unescape(encodeURIComponent(s))).replace(/=+$/g, '').replace(/\//g, '_').replace(/\+/g, '-');
  } catch {
    return 'sub_' + Math.random().toString(36).slice(2);
  }
}

function pickTokenFromEndpoint(endpoint) {
  if (!endpoint) return null;
  const i = endpoint.lastIndexOf('/');
  return i >= 0 ? endpoint.slice(i + 1) : endpoint;
}

// ---- Public API ----

export async function ensurePermission() {
  if (typeof window === 'undefined') return 'unsupported';
  if (!('Notification' in window)) throw new Error('Navegador não suporta Notification API.');
  if (Notification.permission === 'granted') return 'granted';
  const res = await Notification.requestPermission();
  if (res !== 'granted') throw new Error('Permissão negada para notificações.');
  return res;
}

export async function registerServiceWorker() {
  if (typeof window === 'undefined') throw new Error('SW indisponível em SSR.');
  if (!('serviceWorker' in navigator)) throw new Error('Navegador não suporta ServiceWorker.');
  const swUrl = '/firebase-messaging-sw.js';
  const reg = await navigator.serviceWorker.register(swUrl, { scope: '/' });
  await navigator.serviceWorker.ready;
  return reg;
}

// Pode retornar:
//  - { kind: 'webpush', endpoint, keys }
//  - { kind: 'fcm', token }
export async function getOrCreateSubscription(reg) {
  const hasVapid = !!import.meta.env.VITE_VAPID_PUBLIC_KEY;

  // 1) Tenta WebPush (Push API)
  let pushSub = await reg.pushManager.getSubscription();
  if (!pushSub && hasVapid) {
    try {
      const vapidKey = urlBase64ToUint8Array(import.meta.env.VITE_VAPID_PUBLIC_KEY);
      pushSub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: vapidKey });
    } catch (e) {
      // segue o fluxo: alguns navegadores/ambientes podem bloquear
      console.debug('[pushClient] subscribe webpush falhou:', e?.message || e);
    }
  }
  if (pushSub && pushSub.toJSON) {
    const json = pushSub.toJSON();
    if (json?.endpoint) return { kind: 'webpush', endpoint: json.endpoint, keys: json.keys || {} };
  }

  // 2) Tenta FCM Token (firebase/messaging)
  let token = null;
  try {
    const supported = await isSupported();
    if (supported) {
      const messaging = getMessaging();
      token = await getToken(messaging, {
        vapidKey: import.meta.env.VITE_VAPID_PUBLIC_KEY || undefined,
        serviceWorkerRegistration: reg,
      });
    }
  } catch (e) {
    console.debug('[pushClient] getToken falhou:', e?.message || e);
  }
  if (token) return { kind: 'fcm', token };

  return null;
}

// Salva no Firestore com shape consistente:
//   webpush: {kind:'webpush', endpoint, keys}
//   fcm:     {kind:'fcm', token}
export async function saveSubscriptionInFirestore(subscription, extra = {}) {
  if (!subscription) throw new Error('Subscription vazio.');
  const vapidPrefix = (import.meta.env.VITE_VAPID_PUBLIC_KEY || '').slice(0, 8) || null;

  let data;
  if (subscription.kind === 'fcm' || typeof subscription === 'string') {
    const token = typeof subscription === 'string' ? subscription : subscription.token;
    if (!token) throw new Error('Token FCM ausente.');
    data = { kind: 'fcm', token, vapidPrefix };
  } else if (subscription.kind === 'webpush') {
    const endpoint = subscription.endpoint;
    if (!endpoint) throw new Error('Endpoint WebPush ausente.');
    data = { kind: 'webpush', endpoint, keys: subscription.keys || {}, vapidPrefix };
  } else if (subscription?.endpoint) {
    data = { kind: 'webpush', endpoint: subscription.endpoint, keys: subscription.keys || {}, vapidPrefix };
  } else {
    throw new Error('Subscription inválida (sem token/endpoint).');
  }

  const idSource = data.kind === 'fcm' ? data.token : data.endpoint;
  const docId = hashId(idSource);

  const payload = {
    ...data,
    scope: extra.scope || (typeof registration !== 'undefined' ? registration.scope : null),
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
    updatedAt: serverTimestamp(),
  };

  await setDoc(doc(db, 'push_subscriptions', docId), payload, { merge: true });
  return { id: docId, ...payload };
}

// ==================================================================
// FUNÇÃO ATUALIZADA
// Agora recebe 'subscription' para extrair o token e chama a nova API
// ==================================================================
export async function sendRealPush(subscription, { title = 'Teste (real)', body = 'Ping do sistema de push', url, icon } = {}) {
  if (!subscription) throw new Error('Subscription (para sendRealPush) não pode ser nulo.');

  // Extrai o token FCM, não importa o formato da subscription
  let token = null;
  if (subscription.kind === 'fcm' && subscription.token) {
    token = subscription.token;
  } else if (subscription.endpoint && typeof subscription.endpoint === 'string' && subscription.endpoint.includes('/fcm/send/')) {
    // Se for um endpoint 'webpush' que na verdade é do FCM
    token = subscription.endpoint.split('/').pop();
  }

  if (!token) {
    throw new Error('Não foi possível extrair um token FCM válido da subscription.');
  }

  const res = await fetch('/api/push/send-fcm', { // <--- CHAMANDO A NOVA API
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    // Enviando o token e o resto do payload
    body: JSON.stringify({ token, title, body, url, icon }),
  });
  
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Falha no push real: ${res.status} ${JSON.stringify(json)}`);
  return { ok: true, result: json };
}

export async function sendBroadcast({ title = 'Broadcast (teste)', body = 'Ping do broadcast', url, icon } = {}) {
  const res = await fetch('/api/push/notify', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title, body, url, icon }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Falha no broadcast: ${res.status} ${JSON.stringify(json)}`);
  return { ok: true, result: json };
}

export async function clearBadge() {
  try {
    if ('clearAppBadge' in navigator) await navigator.clearAppBadge();
    if ('setAppBadge' in navigator) await navigator.setAppBadge(0);
  } catch {}
}

// Informações úteis para o botão de debug
export async function getDebugInfo() {
  const hasPlainVapid = !!import.meta.env.VAPID_PUBLIC_KEY;
  const hasViteVapid = !!import.meta.env.VITE_VAPID_PUBLIC_KEY;
  const isHttps = typeof location !== 'undefined' ? location.protocol === 'https:' : false;

  let swRegistered = false;
  let swScope = null;
  let permission = typeof Notification !== 'undefined' ? Notification.permission : 'n/a';
  let endpoint = null;

  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.ready;
      if (reg) {
        swRegistered = !!reg;
        swScope = reg?.scope || null;
        const sub = await reg.pushManager.getSubscription();
        endpoint = sub?.endpoint || null;
      }
    }
  } catch {}

  const vapidPrefix = (import.meta.env.VITE_VAPID_PUBLIC_KEY || '').slice(0, 8) || null;
  return {
    endpoint,
    envHasPlainVapid: hasPlainVapid,
    envHasViteVapid: hasViteVapid,
    hasSubscription: !!endpoint,
    hasVapid: !!vapidPrefix,
    isHttps,
    permission,
    swRegistered,
    swScope,
    vapidPrefix,
  };
}
