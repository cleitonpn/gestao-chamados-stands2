// src/lib/pushClient.js
// Cliente de Push: assina, salva no Firestore e dispara push (real/broadcast)

import { db } from './lib/firebaseClient'; // mantém esse caminho
import {
  doc,
  setDoc,
  serverTimestamp,
} from 'firebase/firestore';

// -----------------------------
// Helpers
// -----------------------------
const API = {
  send: '/api/push/send',
  broadcast: '/api/push/broadcast',
};

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = globalThis.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

function endpointToId(endpoint) {
  // id curto, estável e seguro pra docId
  return btoa(unescape(encodeURIComponent(endpoint)))
    .replace(/=+$/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

// -----------------------------
// VAPID
// -----------------------------
export function getVapidPublicKey() {
  // 1) Vite
  const fromVite = import.meta?.env?.VITE_VAPID_PUBLIC_KEY;
  if (fromVite) return fromVite;

  // 2) window (caso você injete via <script> ou meta)
  if (typeof window !== 'undefined' && window.__VAPID_PUBLIC_KEY__) {
    return window.__VAPID_PUBLIC_KEY__;
  }

  // 3) deu ruim
  throw new Error('VAPID_PUBLIC_KEY não encontrado. Defina VITE_VAPID_PUBLIC_KEY no Vercel.');
}

// -----------------------------
// Permissão & Service Worker
// -----------------------------
export async function ensurePermission() {
  if (!('Notification' in globalThis)) {
    throw new Error('Este navegador não suporta Notification API.');
  }
  const current = Notification.permission;
  if (current === 'granted') return true;
  if (current === 'denied') throw new Error('Permissão de notificação negada.');
  const res = await Notification.requestPermission();
  if (res !== 'granted') throw new Error('Permissão de notificação não concedida.');
  return true;
}

export async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) {
    throw new Error('Service Worker não suportado.');
  }

  // Tenta primeiro o SW de messaging do Firebase; se não existir, usa um genérico.
  const candidates = [
    '/firebase-messaging-sw.js',
    '/sw.js',
  ];

  let registration = null;
  let lastErr = null;

  for (const url of candidates) {
    try {
      registration = await navigator.serviceWorker.register(url);
      if (registration) break;
    } catch (e) {
      lastErr = e;
    }
  }

  if (!registration) {
    throw lastErr || new Error('Falha ao registrar Service Worker.');
  }
  return registration;
}

// -----------------------------
// Subscription
// -----------------------------
export async function getOrCreateSubscription(registration, vapidPublicKey) {
  if (!registration?.pushManager) {
    throw new Error('PushManager indisponível no Service Worker.');
  }

  let sub = await registration.pushManager.getSubscription();
  if (sub) return sub;

  const applicationServerKey = urlBase64ToUint8Array(vapidPublicKey);
  sub = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey,
  });
  return sub;
}

export async function saveSubscriptionInFirestore(subscription, extra = {}) {
  if (!subscription || !subscription.endpoint) {
    throw new Error('Subscription inválida.');
  }

  const id = endpointToId(subscription.endpoint);
  const ref = doc(db, 'push_subscriptions', id);

  const payload = {
    active: true,
    createdAt: serverTimestamp(),
    device: globalThis?.navigator?.userAgent || 'unknown',
    endpoint: subscription.endpoint,
    subscription, // armazena o objeto completo
    // Campos opcionais / contexto
    area: extra.area ?? null,
    projetoId: extra.projetoId ?? null,
    userId: extra.userId ?? null,
  };

  await setDoc(ref, payload, { merge: true });
  return { id, ref };
}

// -----------------------------
// Envio de mensagens
// -----------------------------
export async function sendRealPush({ title = 'Teste (real)', body = 'Ping do sistema de push', data = {} } = {}) {
  // Garante uma subscription atual e envia só para este cliente
  const registration = await registerServiceWorker();
  const vapid = getVapidPublicKey();
  const subscription = await getOrCreateSubscription(registration, vapid);

  const res = await fetch(API.send, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      subscription, // o route /api/push/send usa essa subscription
      payload: { title, body, data },
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Falha no push real: ${res.status} ${text}`);
  }
  return res.json().catch(() => ({}));
}

export async function sendBroadcast({ title = 'Broadcast', body = 'Mensagem do sistema', data = {} } = {}) {
  // O route /api/push/broadcast envia para todas as subscriptions ativas no Firestore
  const res = await fetch(API.broadcast, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ payload: { title, body, data } }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Falha no broadcast: ${res.status} ${text}`);
  }
  return res.json().catch(() => ({}));
}

// -----------------------------
// UX
// -----------------------------
export async function clearBadge() {
  try {
    // Edge/Chrome com App Badging API
    if ('clearAppBadge' in navigator) {
      await navigator.clearAppBadge();
    }
  } catch {
    /* silencioso */
  }
}

// -----------------------------
// Fluxo completo (one-liner)
// -----------------------------
export async function ensureVapidKeyAndSubscribe(extra = {}) {
  await ensurePermission();
  const registration = await registerServiceWorker();
  const vapid = getVapidPublicKey();
  const subscription = await getOrCreateSubscription(registration, vapid);
  await saveSubscriptionInFirestore(subscription, extra);
  return subscription;
}
