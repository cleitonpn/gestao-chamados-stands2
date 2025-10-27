// src/lib/pushClient.js

async function fetchPublicKeyFromApi() {
  try {
    const r = await fetch("/api/push/public-key");
    if (!r.ok) throw new Error(await r.text());
    const { key } = await r.json();
    if (!key || typeof key !== "string") throw new Error("Resposta inválida da /api/push/public-key");
    return key;
  } catch (e) {
    console.error("[PUSH] Falha ao obter chave pública via API:", e);
    throw e;
  }
}

async function getVapidPublicKey({ debug = false } = {}) {
  const fromVite = import.meta?.env?.VITE_VAPID_PUBLIC_KEY;
  const fromMeta = document.querySelector('meta[name="vapid-public-key"]')?.content;
  const fromWindow = window.__VAPID_PUBLIC_KEY;

  if (debug) {
    console.log("[PUSH] VAPID (Vite):", fromVite);
    console.log("[PUSH] VAPID (meta):", fromMeta);
    console.log("[PUSH] VAPID (win):", fromWindow);
  }

  const candidate = fromVite || fromMeta || fromWindow;
  if (candidate && typeof candidate === "string") return candidate;

  // Fallback robusto (runtime): busca no servidor.
  const fromApi = await fetchPublicKeyFromApi();
  if (debug) console.log("[PUSH] VAPID (api):", fromApi);
  return fromApi;
}

async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    throw new Error("Este navegador não suporta Service Worker.");
  }
  const reg = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;
  return reg;
}

export async function ensureVapidKeyAndSubscribe({ debug = false } = {}) {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Permissão de notificação negada.");

  const vapidPublicKey = await getVapidPublicKey({ debug });
  if (!vapidPublicKey || !vapidPublicKey.startsWith("B")) {
    throw new Error("VAPID public key inválida. Confira a env no Vercel.");
  }

  const registration = await registerServiceWorker();
  const existing = await registration.pushManager.getSubscription();
  if (existing) {
    if (debug) console.log("[PUSH] Já inscrito.", existing);
    return existing;
  }

  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
  });

  const res = await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ subscription }),
  });
  if (!res.ok) throw new Error("Falha ao registrar assinatura: " + (await res.text()));

  if (debug) console.log("[PUSH] Assinatura registrada.", subscription);
  return subscription;
}

export async function testRealPush({ debug = false } = {}) {
  const r = await fetch("/api/push/send", { method: "POST" });
  if (!r.ok) throw new Error(await r.text());
  if (debug) console.log("[PUSH] Envio de teste requisitado.");
}

export async function clearBadge() {
  try {
    if (navigator.setAppBadge) await navigator.setAppBadge(0);
    if ("clearAppBadge" in navigator) await navigator.clearAppBadge();
  } catch {}
}

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}
