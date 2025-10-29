// src/utils/registerPush.js
import { getAuth } from "firebase/auth";
import { getFirestore, collection, query, where, getDocs, doc, setDoc, serverTimestamp } from "firebase/firestore";

// Converte a VAPID pública base64 em Uint8Array para o subscribe()
function base64ToUint8Array(base64) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) out[i] = raw.charCodeAt(i);
  return out;
}

/**
 * Registra a assinatura de push e salva/atualiza no Firestore com userId.
 * Rechame sempre que o usuário logar OU o SW disparar 'pushsubscriptionchange'.
 */
export async function registerPushAndSave() {
  const auth = getAuth();
  const db = getFirestore();
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("Sem usuário logado");

  // 1) Garante SW registrado
  const reg = await navigator.serviceWorker.ready;

  // 2) Cria/pega subscription
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    // pegue sua PUBLIC_VAPID_KEY do .env (Vercel → Project → Environment Variables)
    const publicKey =
      import.meta.env.VITE_PUBLIC_VAPID_KEY ||
      window.__PUBLIC_VAPID_KEY__; // fallback se você definir globalmente
    if (!publicKey) throw new Error("PUBLIC VAPID KEY ausente");

    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64ToUint8Array(publicKey),
    });
  }

  // 3) Evita duplicar: tenta achar por endpoint e atualiza
  const q = query(
    collection(db, "push_subscriptions"),
    where("endpoint", "==", sub.endpoint)
  );
  const snap = await getDocs(q);

  const payload = {
    userId: uid,
    endpoint: sub.endpoint,
    keys: sub.toJSON().keys,          // { p256dh, auth }
    enabled: true,
    userAgent: navigator.userAgent,
    updatedAt: serverTimestamp(),
    // se quiser: createdAt só quando criar
  };

  if (snap.empty) {
    await setDoc(doc(collection(db, "push_subscriptions")), {
      ...payload,
      createdAt: serverTimestamp(),
    });
  } else {
    // atualiza todos que tenham esse endpoint (normalmente 1)
    await Promise.all(
      snap.docs.map(d =>
        setDoc(d.ref, payload, { merge: true })
      )
    );
  }

  return sub;
}
