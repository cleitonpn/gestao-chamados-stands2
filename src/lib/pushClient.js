// Cliente de Push (Web Push + Firestore): assina, salva e dispara notificações.
import { db as exportedDb } from './firebaseClient';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';

// ---------- Helpers de ambiente ----------

function getDb() {
  // Usa o export… ou o fallback global, se por algum motivo o import ainda não vier.
  const d = exportedDb || globalThis.__FIREBASE_DB;
  if (!d) {
    throw new Error(
      "Não consegui obter o Firestore (db). Exporte `db` em src/lib/firebaseClient.js (ou src/firebase.js) ou deixe globalThis.__FIREBASE_DB = db."
    );
  }
  return d;
}

function getVapidPublicKey() {
  // Em projetos Vite, variáveis visíveis no cliente PRECISAM ter prefixo VITE_
  const fromVite =
    (import.meta.env && (import.meta.env.VITE_VAPID_PUBLIC_KEY || import.meta.env.VAPID_PUBLIC_KEY)) || null;

  const fromWindow =
    (typeof window !== 'undefined' && (window.__VAPID_PUBLIC_KEY ||
      document.querySelector('meta[name="vapid-key"]')?.content)) || null;

  const fromGlobal = typeof globalThis !== 'undefined' ? globalThis.__VAPID_PUBLIC_KEY : null;

  const key = fromVite || fromWindow || fromGlobal;

  if (!key) {
    throw new Error(
      'VAPID_PUBLIC_KEY não encontrado. Defina VITE_VAPID_PUBLIC_KEY no Vercel (Environment: Production) e redeploy.'
    );
  }
  return key;
}

// ---------- API pública usada pelo seu botão ----------

export async function ensurePermission() {
  if (!('Notification' in window)) throw new Error('Navegador sem suporte a Notification API.');
  const status = await Notification.requestPermission();
  if (status !== 'granted') throw new Error('Permissão negada para notificações.');
  return true;
}

export async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) throw new Error('ServiceWorker não suportado.');
  // O arquivo deve estar em /public
  const reg = await navigator.serviceWorker.register('/firebase-messaging-sw.js', { scope: '/' });
  await navigator.serviceWorker.ready;
  return reg;
}

export async function getOrCreateSubscription() {
  // Usa Push API pura (VAPID) – independente do FCM.
  const registration = await navigator.serviceWorker.ready;

  // Checa se já existe:
  let sub = await registration.pushManager.getSubscription();
  if (sub) return sub;

  const vapidKey = urlBase64ToUint8Array(getVapidPublicKey());
  sub = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: vapidKey,
  });
  return sub;
}

export async function saveSubscriptionInFirestore({ sub, area = null, userId = null, active = true, device = null }) {
  const d = getDb();
  const endpoint = sub?.endpoint || '';
  if (!endpoint) throw new Error('Subscription sem endpoint.');

  const id = btoa(endpoint).replace(/=+$/g, ''); // id estável
  const payload = {
    endpoint,
    createdAt: serverTimestamp(),
    active: !!active,
    area: area ?? null,
    userId: userId ?? null,
    device:
      device ||
      (typeof navigator !== 'undefined'
        ? `${navigator.userAgent}`
        : 'unknown'),
    subscription: JSON.parse(JSON.stringify(sub)),
  };

  await setDoc(doc(d, 'push_subscriptions', id), payload, { merge: true });
  return { id, ...payload };
}

export async function sendRealPush({ title = 'Teste (real)', body = 'Ping do sistema de push', data = {} } = {}) {
  // Endpoint: /api/push/send (já está no seu repo)
  const r = await fetch('/api/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, body, data }),
  });
  const json = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(json?.error || 'Falha ao enviar push real');
  return json;
}

export async function sendBroadcast({ title = 'Broadcast', body = 'Aviso geral', data = {} } = {}) {
  // Endpoint: /api/push/broadcast (já está no seu repo)
  const r = await fetch('/api/push/broadcast', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, body, data }),
  });
  const json = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(json?.error || 'Falha no broadcast');
  return json;
}

export function clearBadge() {
  try {
    if (navigator.setAppBadge) navigator.setAppBadge(0);
    if (navigator.clearAppBadge) navigator.clearAppBadge();
  } catch {}
}

// ---------- Utils ----------

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) output[i] = raw.charCodeAt(i);
  return output;
}
