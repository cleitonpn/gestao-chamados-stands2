// src/lib/pushClient.js
// Cliente de Push unificado

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
  if (VAPID_FROM_ENV) return VAPID_FROM_ENV;
  const tag = document.querySelector('meta[name="vapid-public-key"]');
  if (tag?.content) return tag.content.trim();
  return await fetchVapidFromMeta();
}

export async function ensurePermission() {
  if (!('Notification' in window)) {
    throw new Error('Browser não suporta Notification API.');
  }
  let perm = Notification.permission;
  if (perm === 'default') perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('Permissão de notificação negada.');
  return true;
}

export async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) {
    throw new Error('Service Worker não suportado.');
  }
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

export async function saveSubscriptionInFirestore(subscription, extra = {}) {
  const { initializeApp } = await import('firebase/app');
  const { getFirestore, doc, setDoc, serverTimestamp } = await import('firebase/firestore');
  const { getAuth } = await import('firebase/auth');
  const { default: firebaseConfig } = await import('../config/firebase.js'); // ajuste se seu caminho for outro

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

/* ------------------------------------------------------------------ */
/* Backwards compatibility: exporta nomes antigos usados no projeto    */
/* ------------------------------------------------------------------ */
export async function ensureVapidKeyAndSubscribe() {
  await ensurePermission();
  const reg = await registerServiceWorker();
  const sub = await getOrCreateSubscription(reg);
  await saveSubscriptionInFirestore(sub);
  return sub;
}

export async function testRealPush(sub) {
  let subscription = sub;
  if (!subscription) {
    const reg = await registerServiceWorker();
    subscription = await getOrCreateSubscription(reg);
  }
  return sendRealPush(subscription, { title: 'Teste (real)', body: 'Ping do sistema de push' });
}

export function clearBadge() {
  if ('clearAppBadge' in navigator) {
    try { navigator.clearAppBadge(); } catch {}
  }
}
