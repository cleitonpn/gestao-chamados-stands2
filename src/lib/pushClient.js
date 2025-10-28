// Cliente de Push: assina, salva no Firestore e dispara push (real/broadcast)

import { db } from "./firebaseClient";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";

// ------------------------ helpers ------------------------
function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = typeof atob !== "undefined" ? atob(base64) : Buffer.from(base64, "base64").toString("binary");
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

export function getVapidPublicKey() {
  return (
    (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_VAPID_PUBLIC_KEY) ||
    process.env?.VITE_VAPID_PUBLIC_KEY ||
    globalThis.__VAPID_PUBLIC_KEY ||
    ""
  );
}

// ------------------- SW / Permission / Subscription -------------------
export async function ensurePermission() {
  if (!("Notification" in globalThis)) throw new Error("Notifications não suportadas");
  const status = await Notification.requestPermission();
  if (status !== "granted") throw new Error("Permissão negada");
}

export async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) throw new Error("Service Worker não suportado");
  let reg = await navigator.serviceWorker.getRegistration();
  if (!reg) {
    // tenta primeiro o SW do Firebase; se não existir, usa /sw.js
    try {
      reg = await navigator.serviceWorker.register("/firebase-messaging-sw.js", { scope: "/" });
    } catch {
      reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    }
  }
  return reg;
}

export async function getOrCreateSubscription() {
  const reg = await registerServiceWorker();
  const existing = await reg.pushManager.getSubscription();
  if (existing) return existing;

  const vapid = getVapidPublicKey();
  if (!vapid) throw new Error("VITE_VAPID_PUBLIC_KEY ausente");

  return reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapid),
  });
}

// ------------------------ Firestore ------------------------
export async function saveSubscriptionInFirestore(subscription, { uid = "anonymous" } = {}) {
  if (!db) throw new Error("db não disponível (exporte `db` de src/lib/firebaseClient.js)");
  const json = subscription.toJSON ? subscription.toJSON() : subscription;
  const id = btoa(json.endpoint).replace(/=+$/g, "");
  const ref = doc(db, "push_subscriptions", id);
  await setDoc(
    ref,
    {
      uid,
      endpoint: json.endpoint,
      keys: json.keys || {},
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
  return id;
}

// ------------------------ Envio ------------------------
export async function sendRealPush({ title = "Teste (real)", body = "Ping do sistema de push", data = {} } = {}) {
  // Garante que a subscription exista e ENVIE-A no corpo
  const subscription = await getOrCreateSubscription();
  const res = await fetch("/api/push/send", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ subscription, title, body, data }),
  });
  const result = await res.json().catch(() => ({}));
  if (!res.ok || result?.ok === false) {
    throw new Error(`Falha no push real: ${res.status} ${JSON.stringify(result)}`);
  }
  return result;
}

export async function sendBroadcast({ title = "Broadcast (teste)", body = "Ping broadcast", data = {} } = {}) {
  const res = await fetch("/api/push/notify", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title, body, data }),
  });
  const result = await res.json().catch(() => ({}));
  if (!res.ok || result?.ok === false) {
    throw new Error(`Falha no broadcast: ${res.status} ${JSON.stringify(result)}`);
  }
  return result;
}

export function clearBadge() {
  // evita crash em navegadores sem API
  try {
    if ("clearAppBadge" in navigator) navigator.clearAppBadge();
  } catch {}
}

// Usado pelo botão "Debug" para mostrar o estado no topo
export async function getDebugInfo() {
  const envHasViteVapid = !!getVapidPublicKey();
  const vapidPrefix = getVapidPublicKey()?.slice(0, 10) || "";
  const permission = (globalThis.Notification && Notification.permission) || "unsupported";
  const isHttps = location.protocol === "https:";
  let swRegistered = false;
  let swScope = null;
  let hasSubscription = false;
  let endpoint = null;

  if ("serviceWorker" in navigator) {
    const reg = await navigator.serviceWorker.getRegistration();
    swRegistered = !!reg;
    if (reg) {
      swScope = reg.scope;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        hasSubscription = true;
        endpoint = sub.endpoint;
      }
    }
  }

  return {
    endpoint,
    envHasPlainVapid: false,
    envHasViteVapid,
    hasSubscription,
    hasVapid: !!getVapidPublicKey(),
    isHttps,
    permission,
    swRegistered,
    swScope,
    vapidPrefix,
  };
}
