// src/lib/pushClient.js
// Cliente de push: assina, salva no Firestore e dispara push real/broadcast.

import { db as dbFromImport } from './firebaseClient';
import {
  doc,
  setDoc,
  serverTimestamp,
} from 'firebase/firestore';

// ---------- DB: usa import, com fallback para global ----------
const db = dbFromImport || globalThis.__FIREBASE_DB;
if (!db) {
  throw new Error(
    'pushClient: Firestore (db) não disponível. Garanta que src/lib/firebaseClient.js exporte { db } ' +
    'ou que globalThis.__FIREBASE_DB tenha sido definido.'
  );
}

// ---------- Helpers ----------
const isHttps = () => location.protocol === 'https:' || location.hostname === 'localhost';

const urlBase64ToUint8Array = (base64String) => {
  // Polyfill comum para VAPID key
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const output = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) output[i] = rawData.charCodeAt(i);
  return output;
};

// Lê VAPID de env (Vite expõe apenas VITE_*) — aceita dois nomes
const getVapidPublicKey = () =>
  import.meta.env.VITE_VAPID_PUBLIC_KEY || import.meta.env.VAPID_PUBLIC_KEY || '';

export async function ensurePermission() {
  if (!('Notification' in window)) {
    throw new Error('Navegador não suporta Notification API.');
  }
  const current = Notification.permission;
  if (current === 'granted') return 'granted';
  if (current === 'denied') throw new Error('Permissão negada pelo usuário.');
  const result = await Notification.requestPermission();
  if (result !== 'granted') throw new Error('Permissão não concedida.');
  return result;
}

export async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) {
    throw new Error('Service Worker não suportado no navegador.');
  }
  if (!isHttps()) {
    throw new Error('Service Worker exige HTTPS (ou localhost).');
  }

  // tenta caminhos comuns
  const candidates = ['/sw.js', '/firebase-messaging-sw.js', '/service-worker.js'];
  let reg = null;
  let lastErr = null;

  for (const url of candidates) {
    try {
      reg = await navigator.serviceWorker.register(url);
      if (reg) break;
    } catch (e) {
      lastErr = e;
    }
  }
  if (!reg) throw new Error(`Falha ao registrar SW. Último erro: ${lastErr?.message || lastErr}`);
  await navigator.serviceWorker.ready;
  return reg;
}

export async function getOrCreateSubscription(reg) {
  const key = getVapidPublicKey();
  if (!key) throw new Error('VAPID_PUBLIC_KEY ausente. Defina VITE_VAPID_PUBLIC_KEY no Vercel.');

  const existing = await reg.pushManager.getSubscription();
  if (existing) return existing;

  return reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(key),
  });
}

export async function saveSubscriptionInFirestore(userId, sub) {
  if (!userId) throw new Error('saveSubscriptionInFirestore: userId obrigatório.');

  const payload = {
    endpoint: sub?.endpoint || null,
    keys: sub?.toJSON?.().keys || null,
    createdAt: serverTimestamp(),
    userAgent: navigator.userAgent,
  };
  await setDoc(doc(db, 'push_subscriptions', userId), payload, { merge: true });
  return true;
}

export async function sendRealPush(payload = { title: 'Ping (real)', body: 'Teste do sistema de push' }) {
  const key = getVapidPublicKey();
  if (!key) throw new Error('VAPID_PUBLIC_KEY não encontrado. Defina VITE_VAPID_PUBLIC_KEY no Vercel.');

  const res = await fetch('/api/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...payload }),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`Falha no push real: ${res.status} ${txt}`);
  }
  return res.json().catch(() => ({}));
}

export async function sendBroadcast(payload = { title: 'Broadcast', body: 'Mensagem para todos' }) {
  const res = await fetch('/api/push/broadcast', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...payload }),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`Falha no broadcast: ${res.status} ${txt}`);
  }
  return res.json().catch(() => ({}));
}

export function clearBadge() {
  if ('setAppBadge' in navigator) {
    try { navigator.clearAppBadge(); } catch {}
  }
}

// Função extra que seu botão está importando
export async function getDebugInfo() {
  const key = getVapidPublicKey();
  const swReg = (await navigator.serviceWorker?.getRegistration()) || null;
  const sub = swReg ? await swReg.pushManager.getSubscription() : null;

  return {
    permission: (typeof Notification !== 'undefined' && Notification.permission) || 'n/a',
    swRegistered: !!swReg,
    swScope: swReg?.scope || null,
    hasSubscription: !!sub,
    endpoint: sub?.endpoint || null,
    hasVapid: !!key,
    vapidPrefix: key ? key.slice(0, 8) + '...' : null,
    envHasViteVapid: !!import.meta.env.VITE_VAPID_PUBLIC_KEY,
    envHasPlainVapid: !!import.meta.env.VAPID_PUBLIC_KEY,
    isHttps: isHttps(),
  };
}
