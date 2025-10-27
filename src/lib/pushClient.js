// src/lib/pushClient.js
// Cliente de Push: assina, salva no Firestore e dispara push (real/broadcast)

// 🔧 Loader dinâmico para resolver o Firestore (db) mesmo que o projeto não exporte 'db' diretamente
let __dbCache = null;
async function getDb() {
  if (__dbCache) return __dbCache;

  // 0) Se alguém deixou global (debug/dev)
  if (globalThis.__FIREBASE_DB) return (__dbCache = globalThis.__FIREBASE_DB);

  // helpers
  const tryPaths = async (paths) => {
    for (const p of paths) {
      try {
        const m = await import(/* @vite-ignore */ p);
        if (m?.db) return (__dbCache = m.db);
        if (m?.firestore) return (__dbCache = m.firestore);
        if (m?.default?.db) return (__dbCache = m.default.db);
        // Se exporta só o app, cria o db
        const app = m?.app || m?.firebaseApp || m?.default?.app;
        if (app) {
          const { getFirestore } = await import('firebase/firestore');
          return (__dbCache = getFirestore(app));
        }
      } catch {
        // tenta o próximo caminho
      }
    }
    return null;
  };

  // 1) Tenta caminhos mais prováveis do seu projeto
  const fromKnown = await tryPaths([
    './firebaseClient.js',
    '../firebaseClient.js',
    './firebase.js',
    '../firebase.js',
  ]);
  if (fromKnown) return fromKnown;

  throw new Error(
    'Não consegui obter o Firestore (db). Exporte "db" em src/lib/firebaseClient.js (ou src/firebase.js) ou deixe globalThis.__FIREBASE_DB = db.'
  );
}

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
  return btoa(unescape(encodeURIComponent(endpoint)))
    .replace(/=+$/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

// -----------------------------
// VAPID
// -----------------------------
export function getVapidPublicKey() {
  const fromVite = import.meta?.env?.VITE_VAPID_PUBLIC_KEY;
  if (fromVite) return fromVite;
  if (typeof window !== 'undefined' && window.__VAPID_PUBLIC_KEY__) {
    return window.__VAPID_PUBLIC_KEY__;
  }
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
  if (current === 'granted') return 'granted';
  if (current === 'denied') throw new Error('Permissão de notificação negada.');
  const res = await Notification.requestPermission();
  if (res !== 'granted') throw new Error('Permissão de notificação não concedida.');
  return 'granted';
}

export async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) {
    throw new Error('Service Worker não suportado.');
  }
  const candidates = ['/firebase-messaging-sw.js', '/sw.js'];
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
  const applicationServerKey = urlBase64ToUint8Array(
    vapidPublicKey || getVapidPublicKey()
  );
  sub = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey,
  });
  return sub;
}

export async function saveSubscriptionInFirestore(subscription, extra = {}) {
  if (!subscription?.endpoint) throw new Error('Subscription inválida.');
  const id = endpointToId(subscription.endpoint);

  // Importa Firestore on-demand (tree-shaking melhor)
  const { doc, setDoc, serverTimestamp } = await import('firebase/firestore');
  const db = await getDb();

  const ref = doc(db, 'push_subscriptions', id);
  const payload = {
    active: true,
    createdAt: serverTimestamp(),
    device: globalThis?.navigator?.userAgent || 'unknown',
    endpoint: subscription.endpoint,
    subscription,
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
  const registration = await registerServiceWorker();
  const subscription = await getOrCreateSubscription(registration, getVapidPublicKey());
  const res = await fetch(API.send, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subscription, payload: { title, body, data } }),
  });
  if (!res.ok) throw new Error(`Falha no push real: ${res.status} ${await res.text().catch(()=> '')}`);
  return res.json().catch(() => ({}));
}

export async function sendBroadcast({ title = 'Broadcast', body = 'Mensagem do sistema', data = {} } = {}) {
  const res = await fetch(API.broadcast, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ payload: { title, body, data } }),
  });
  if (!res.ok) throw new Error(`Falha no broadcast: ${res.status} ${await res.text().catch(()=> '')}`);
  return res.json().catch(() => ({}));
}

// -----------------------------
// UX helpers
// -----------------------------
export async function clearBadge() {
  try {
    if ('clearAppBadge' in navigator) await navigator.clearAppBadge();
  } catch {}
}

// -----------------------------
// Debug
// -----------------------------
export function getDebugInfo() {
  return {
    permission: typeof Notification !== 'undefined' ? Notification.permission : 'n/a',
    swRegistered: 'serviceWorker' in navigator ? !!navigator.serviceWorker.controller : false,
    vapidMode: import.meta?.env?.VITE_VAPID_PUBLIC_KEY
      ? 'env'
      : (typeof window !== 'undefined' && window.__VAPID_PUBLIC_KEY__ ? 'window' : 'missing'),
    ts: new Date().toISOString(),
  };
}

// -----------------------------
// One-liner
// -----------------------------
export async function ensureVapidKeyAndSubscribe(extra = {}) {
  await ensurePermission();
  const registration = await registerServiceWorker();
  const subscription = await getOrCreateSubscription(registration, getVapidPublicKey());
  await saveSubscriptionInFirestore(subscription, extra);
  return subscription;
}
