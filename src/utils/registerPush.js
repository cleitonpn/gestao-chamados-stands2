// src/utils/registerPush.js
import {
  getFirestore,
  collection,
  query,
  where,
  getDocs,
  doc,
  setDoc,
  serverTimestamp,
} from "firebase/firestore";

/** Converte VAPID pública base64 em Uint8Array para subscribe() */
function base64ToUint8Array(base64) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/** Hash do endpoint para ID estável do doc (evita docId gigante) */
async function hashEndpoint(endpoint) {
  const encoder = new TextEncoder();
  const data = encoder.encode(endpoint);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Registra/atualiza a assinatura de push do usuário no Firestore:
 * - Cria/atualiza doc em `push_subscriptions/{hash(endpoint)}`
 * - Grava userId, endpoint, keys, enabled, userAgent, createdAt/updatedAt
 * - Se já existir, apenas atualiza (merge)
 */
async function registerPush(userId) {
  if (!userId) throw new Error("registerPush: userId ausente.");

  if (!("serviceWorker" in navigator)) {
    throw new Error("registerPush: Service Worker não suportado.");
  }
  if (!("PushManager" in window)) {
    throw new Error("registerPush: Push API não suportada.");
  }

  // puxa a VAPID pública (defina VITE_VAPID_PUBLIC_KEY no Vercel)
  const vapidPublic =
    import.meta.env.VITE_VAPID_PUBLIC_KEY || window.__VAPID_PUBLIC_KEY__;
  if (!vapidPublic) {
    throw new Error(
      "registerPush: VAPID pública ausente. Defina VITE_VAPID_PUBLIC_KEY."
    );
  }

  // p/ garantir: pede permissão
  let permission = Notification.permission;
  if (permission === "default") {
    permission = await Notification.requestPermission();
  }
  if (permission !== "granted") {
    throw new Error("registerPush: permissão de notificação negada.");
  }

  // espera o SW ficar pronto (já deve estar registrado pela sua app)
  const swReg = await navigator.serviceWorker.ready;

  // tenta pegar assinatura existente
  let sub = await swReg.pushManager.getSubscription();
  if (!sub) {
    sub = await swReg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64ToUint8Array(vapidPublic),
    });
  }

  const json = sub.toJSON(); // { endpoint, keys: {p256dh, auth} }
  const { endpoint, keys } = json || {};
  if (!endpoint || !keys) {
    throw new Error("registerPush: assinatura inválida.");
  }

  // salva no Firestore
  const db = getFirestore();
  const id = await hashEndpoint(endpoint); // doc estável por endpoint
  const ref = doc(db, "push_subscriptions", id);

  await setDoc(
    ref,
    {
      userId,
      endpoint,
      keys,
      enabled: true,
      userAgent: navigator.userAgent || null,
      updatedAt: serverTimestamp(),
      // createdAt só será setado na primeira escrita (merge não sobrescreve)
      createdAt: serverTimestamp(),
    },
    { merge: true }
  );

  // opcional: limpa assinaturas antigas sem userId (higiene)
  try {
    const q = query(
      collection(db, "push_subscriptions"),
      where("userId", "==", null)
    );
    const snap = await getDocs(q);
    // não removo aqui para não extrapolar quotas — só exemplo:
    // for (const d of snap.docs) { await deleteDoc(d.ref) }
  } catch (_) {}

  return { ok: true, endpoint };
}

export default registerPush;
