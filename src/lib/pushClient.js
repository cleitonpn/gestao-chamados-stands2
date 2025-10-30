// src/lib/pushClient.js

// Helpers -------------------------------------------------------
function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const output = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) output[i] = rawData.charCodeAt(i);
  return output;
}
function ab2b64(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}

// API para salvar no Firestore/HTTP --------------------------------
// Se você já grava direto no Firestore pelo client, pode adaptar aqui.
async function saveSubscriptionOnServer(payload) {
  // Exemplo simples via HTTPS API do seu backend:
  // return fetch("/api/savePushSubscription", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  // Se você prefere escrever direto no Firestore aqui, faça-o.
  return fetch("/api/savePushSubscription", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

// Principal -------------------------------------------------------
export async function ensurePushSubscription(firebaseApp, currentUserId) {
  try {
    if (!("Notification" in window) || !("serviceWorker" in navigator)) return;
    if (!currentUserId) return;

    // peça permissão SOMENTE após um gesto de usuário (ex: clique no sino ou abrir a dashboard)
    if (Notification.permission === "default") {
      const res = await Notification.requestPermission();
      if (res !== "granted") return;
    }
    if (Notification.permission !== "granted") return;

    // registra SW (se já estiver registrado, retorna o mesmo)
    const reg = await navigator.serviceWorker.register("/firebase-messaging-sw.js");

    // chave pública VAPID (Base64 url-safe). Use Vite env ou injete via window.__VAPID__
    const PUBLIC_VAPID =
      import.meta?.env?.VITE_WEBPUSH_PUBLIC_KEY ||
      window.__VAPID_PUBLIC_KEY__;

    if (!PUBLIC_VAPID) {
      console.warn("VAPID PUBLIC KEY ausente (VITE_WEBPUSH_PUBLIC_KEY)");
      return;
    }

    // cria (ou obtém) a subscription web-push nativa
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(PUBLIC_VAPID),
      });
    }

    // monta payload no formato esperado pela function
    const payload = {
      userId: currentUserId,
      endpoint: sub.endpoint,
      keys: {
        p256dh: ab2b64(sub.getKey("p256dh")),
        auth: ab2b64(sub.getKey("auth")),
      },
      enabled: true,
      userAgent: navigator.userAgent,
    };

    await saveSubscriptionOnServer(payload);
  } catch (err) {
    console.error("ensurePushSubscription error:", err);
  }
}
