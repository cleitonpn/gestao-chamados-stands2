// src/lib/pushClient.js
// Cliente de Push unificado (SEM overlay).
// - Registra o Service Worker
// - Garante permission
// - Cria ou recupera a subscription
// - Converte VAPID

const VAPID_FROM_ENV =
  (import.meta.env && import.meta.env.VITE_VAPID_PUBLIC_KEY) || undefined;

async function fetchVapidFromMeta() {
  try {
    const res = await fetch('/api/push/meta');
    if (!res.ok) return undefined;
    const { vapidPublicKey } = await res.json();
    return vapidPublicKey || undefined;
  } catch {
    return undefined;
  }
}

export async function getVapidPublicKey() {
  // 1) tenta env
  if (VAPID_FROM_ENV) return VAPID_FROM_ENV;
  // 2) tenta meta tag
  const tag = document.querySelector('meta[name="vapid-public-key"]');
  if (tag?.content) return tag.content.trim();
  // 3) tenta endpoint
  return await fetchVapidFromMeta();
}

export async function ensurePermission() {
  if (!('Notification' in window)) {
    throw new Error('Browser não suporta Notification API.');
  }
  let perm = Notification.permission;
  if (perm === 'default') {
    perm = await Notification.requestPermission();
  }
  if (perm !== 'granted') {
    throw new Error('Permissão de notificação negada.');
  }
  return true;
}

export async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) {
    throw new Error('Service Worker não suportado.');
  }
  // Use o SW do seu PWA (ajuste se o seu arquivo tiver outro nome)
  const reg = await navigator.serviceWorker.register('/sw.js');
  await navigator.serviceWorker.ready;
  return reg;
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export async function getOrCreateSubscription(reg) {
  const existing = await reg.pushManager.getSubscription();
  if (existing) return existing;

  const vapid = await getVapidPublicKey();
  if (!vapid) throw new Error('VAPID public key indisponível.');

  return await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapid),
  });
}

/**
 * Salva/atualiza a subscription no Firestore
 * (ajuste o import do seu SDK de firebase se necessário)
 */
export async function saveSubscriptionInFirestore(subscription, extra = {}) {
  // lazy-import para não pesar o bundle
  const { initializeApp } = await import('firebase/app');
  const { getFirestore, doc, setDoc, serverTimestamp } = await import('firebase/firestore');
  const { getAuth } = await import('firebase/auth');
  // seus arquivos de config
  const { default: firebaseConfig } = await import('../config/firebase.js'); // ajuste este caminho se o seu config estiver em outro arquivo

  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app);
  const auth = getAuth(app);

  const uid = auth?.currentUser?.uid || 'anon';
  const key = btoa(subscription.endpoint).replace(/=+$/g, '').slice(-120);

  await setDoc(
    doc(db, 'push_subscriptions', key),
    {
      userId: uid,
      createdAt: serverTimestamp(),
      active: true,
      device: navigator.userAgent,
      endpoint: subscription.endpoint,
      subscription: subscription.toJSON(),
      ...extra,
    },
    { merge: true }
  );

  return key;
}

/** Envia push “real” (para ESTA subscription) via /api/push/send */
export async function sendRealPush(subscription, payload = {}) {
  const res = await fetch('/api/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subscription, payload }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.ok === false) {
    throw new Error(data?.error || `HTTP ${res.status}`);
  }
  return data;
}

/** Broadcast (envia para todas no Firestore) via /api/push/broadcast */
export async function sendBroadcast(payload = {}) {
  const res = await fetch('/api/push/broadcast', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.ok === false) {
    throw new Error(data?.error || `HTTP ${res.status}`);
  }
  return data;
}
