// api/push/broadcast.mjs
export const config = { runtime: "nodejs" };

import webpush from "web-push";
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

function getServiceAccount() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON ausente.");

  let json;
  try { json = JSON.parse(raw); } catch {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON inválido (JSON inválido).");
  }

  const projectId   = json.project_id   || json.projectId;
  const clientEmail = json.client_email || json.clientEmail;
  let privateKey    = json.private_key  || json.privateKey;

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON inválido (campos obrigatórios ausentes).");
  }

  // Corrige \n escapado
  privateKey = privateKey.replace(/\\n/g, "\n");
  return { projectId, clientEmail, privateKey };
}

function initFirebase() {
  if (!getApps().length) {
    const sa = getServiceAccount();
    initializeApp({ credential: cert(sa) });
  }
  return getFirestore();
}

function configWebPush() {
  const publicKey  = process.env.VAPID_PUBLIC_KEY || process.env.VITE_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject    = process.env.VAPID_SUBJECT || "mailto:admin@example.com";

  if (!publicKey || !privateKey)
    throw new Error("VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY ausentes.");
  if (!/^https?:\/\//.test(subject) && !subject.startsWith("mailto:"))
    throw new Error("VAPID_SUBJECT inválido. Use uma URL ou 'mailto:email@dominio'.");

  webpush.setVapidDetails(subject, publicKey, privateKey);
  return { publicKey, subject };
}

export default async function handler(req, res) {
  try {
    const db = initFirebase();
    configWebPush();

    const snap = await db.collection("push_subscriptions").where("active", "==", true).get();
    if (snap.empty) return res.status(200).json({ sent: 0, failed: 0, note: "Nenhuma assinatura ativa." });

    let sent = 0, failed = 0;
    const tasks = [];

    snap.forEach(doc => {
      const data = doc.data();
      const sub = data.subscription;
      if (!sub || !sub.endpoint) return;

      const payload = JSON.stringify({
        title: "📣 Broadcast",
        body: "Notificação enviada para todos os dispositivos ativos.",
        icon: "/icon-192.png",
        tag: "broadcast",
        data: { openedAt: Date.now() },
      });

      const t = webpush.sendNotification(sub, payload)
        .then(() => {
          sent++;
          return doc.ref.update({ lastSentAt: FieldValue.serverTimestamp() });
        })
        .catch(async (err) => {
          failed++;
          // 404/410: subscription inválida → desativa
          if (err?.statusCode === 404 || err?.statusCode === 410) {
            await doc.ref.update({ active: false, inactivatedAt: FieldValue.serverTimestamp() });
          }
        });

      tasks.push(t);
    });

    await Promise.allSettled(tasks);
    return res.status(200).json({ sent, failed });
  } catch (e) {
    console.error("[broadcast] erro:", e);
    return res.status(500).send("Falha no broadcast: " + (e?.message || e));
  }
}
