// src/lib/pushClient.js
// Cliente unificado para Web Push (via Web-Push no backend) e FCM (Firebase Cloud Messaging)

import { initializeApp, getApps, getApp } from "firebase/app";
import { getMessaging, getToken, isSupported } from "firebase/messaging";
import {
  getFirestore,
  doc,
  setDoc,
  serverTimestamp,
} from "firebase/firestore";
import { getAuth } from "firebase/auth";

// ⚙️ Carrega o config do seu projeto (já existe no repo)
import firebaseConfig from "../config/firebase";

// ----------------------- util -----------------------
const log = (...a) => console.log("[PUSH]", ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Garante uma única instância do app Firebase (evita app/duplicate-app) */
function ensureFirebaseApp() {
  if (typeof window === "undefined") return null;
  if (getApps().length) return getApp();
  return initializeApp(firebaseConfig);
}

/** Obtém a VAPID public key (prioridade: env -> meta tag -> erro) */
function getVapidPublicKey() {
  const fromEnv = import.meta?.env?.VITE_VAPID_PUBLIC_KEY;
  if (fromEnv && String(fromEnv).trim()) return String(fromEnv).trim();

  const meta = document.querySelector('meta[name="vapid-public-key"]');
  const fromMeta = meta?.getAttribute("content");
  if (fromMeta && String(fromMeta).trim()) return String(fromMeta).trim();

  throw new Error(
    "VITE_VAPID_PUBLIC_KEY ausente. Defina no Vercel e faça novo deploy."
  );
}

/** Registro do SW da aplicação (reutiliza seu PWA). */
async function waitServiceWorkerReady() {
  if (!("serviceWorker" in navigator)) {
    throw new Error("Service Worker não suportado no navegador.");
  }
  // Se já estiver pronto, retorna; caso contrário espera ficar pronto
  const reg = await navigator.serviceWorker.ready;
  return reg;
}

// -------------------- API pública --------------------

/**
 * Cria/garante assinatura FCM (token) usando a VAPID key.
 * Salva em Firestore (coleção `fcmTokens`) para poder enviar push real depois.
 * Retorna o token.
 */
export async function ensureVapidKeyAndSubscribe() {
  // Permissão do usuário
  if (Notification.permission !== "granted") {
    const perm = await Notification.requestPermission();
    if (perm !== "granted") {
      throw new Error("Permissão de notificação negada pelo usuário.");
    }
  }

  // SW pronto
  await waitServiceWorkerReady();

  // Suporte ao FCM/messaging
  const supported = await isSupported().catch(() => false);
  if (!supported) {
    throw new Error("Este navegador não suporta Firebase Messaging.");
  }

  // Firebase app único
  const app = ensureFirebaseApp();

  const messaging = getMessaging(app);
  const vapidKey = getVapidPublicKey();

  // Obtém token FCM com a VAPID key
  const token = await getToken(messaging, {
    vapidKey,
    serviceWorkerRegistration: await navigator.serviceWorker.ready,
  });

  if (!token) {
    throw new Error("Não foi possível gerar token FCM.");
  }

  // Salva em Firestore (coleção protegida pelas suas regras)
  const db = getFirestore(app);
  const auth = getAuth(app);
  const uid = auth.currentUser?.uid ?? "anon";

  await setDoc(
    doc(db, "fcmTokens", token),
    {
      userId: uid,
      token,
      ua: navigator.userAgent,
      updatedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
    },
    { merge: true }
  );

  log("Assinatura FCM criada e salva:", token.slice(0, 12) + "…");
  return token;
}

/**
 * Envia um push “real” (FCM) para **o token atual do navegador**.
 * Útil para teste rápido. O endpoint /api/push/notify deve existir.
 */
export async function testRealPush() {
  const token = await ensureVapidKeyAndSubscribe();

  const res = await fetch("/api/push/notify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      token,
      title: "Teste (real)",
      body: "Ping do sistema de push",
      data: { kind: "test", at: Date.now() },
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Falha no teste real: ${res.status} - ${body}`);
  }

  const json = await res.json().catch(() => ({}));
  log("Teste real enviado:", json);
  return json;
}

/**
 * Faz um broadcast (via Web-Push do backend) para todos os subscriptions
 * salvos na coleção `push_subscriptions`.
 */
export async function broadcastTest() {
  const res = await fetch("/api/push/broadcast", { method: "POST" });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Falha no broadcast: ${res.status} - ${body}`);
  }
  const json = await res.json().catch(() => ({}));
  log("Broadcast:", json);
  return json;
}

/** Limpa badge (se o browser suportar) */
export async function clearBadge() {
  try {
    if ("clearAppBadge" in navigator) {
      // @ts-ignore
      await navigator.clearAppBadge();
    }
  } catch {
    /* ignore */
  }
}

/**
 * Estado resumido para colocar no seu overlay/debug (opcional).
 * Retorna { permission, sw, vapidSource }
 */
export async function getDebugState() {
  const permission = Notification.permission;
  let sw = "não";
  try {
    sw = (await navigator.serviceWorker?.ready) ? "sim" : "não";
  } catch {
    sw = "erro";
  }

  let vapidSource = "env";
  const meta = document.querySelector('meta[name="vapid-public-key"]');
  if (meta?.getAttribute("content")) vapidSource = "meta";

  return { permission, sw, vapidSource };
}
