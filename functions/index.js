// functions/index.js
import { onRequest } from "firebase-functions/v2/https";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import * as logger from "firebase-functions/logger";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";

if (!getApps().length) initializeApp();
const db = getFirestore();

// Ajuste os nomes das coleções aqui, se forem diferentes no seu projeto
const MESSAGES_COLLECTION = "mensagens";   // <— sua coleção de mensagens
const TICKETS_COLLECTION  = "tickets";     // <— coleção de tickets
const USERS_COLLECTION    = "users";       // <— onde ficam os tokens
const NOTIFICATIONS_COLL  = "notifications";

// Tenta achar tokens em userDoc.fcmTokens/pushTokens OU subcoleções tokens/devices
async function getUserTokens(uid) {
  if (!uid) return [];
  try {
    const userRef = db.collection(USERS_COLLECTION).doc(uid);
    const snap = await userRef.get();
    const uniq = new Set();

    if (snap.exists) {
      const data = snap.data() || {};
      if (Array.isArray(data.fcmTokens))  data.fcmTokens.forEach(t => t && uniq.add(t));
      if (Array.isArray(data.pushTokens)) data.pushTokens.forEach(t => t && uniq.add(t));
    }
    const tokensCol = await userRef.collection("tokens").get();
    tokensCol.forEach(d => { const t = d.get("token"); if (t) uniq.add(t); });
    const devicesCol = await userRef.collection("devices").get();
    devicesCol.forEach(d => { const t = d.get("fcmToken") || d.get("token"); if (t) uniq.add(t); });

    return [...uniq];
  } catch (e) {
    logger.error("getUserTokens error", e);
    return [];
  }
}

async function pushAndPersist({ recipientId, title, body, data }) {
  // salva notificação (web/in-app)
  await db.collection(NOTIFICATIONS_COLL).add({
    recipientId,
    title,
    body,
    data: data || {},
    read: false,
    createdAt: new Date(),
  });

  // envia FCM (mobile/webpush) se tiver tokens
  const tokens = await getUserTokens(recipientId);
  if (!tokens.length) return;

  try {
    await getMessaging().sendEachForMulticast({
      tokens,
      notification: { title, body },
      data: Object.fromEntries(Object.entries(data || {}).map(([k, v]) => [k, String(v)])),
      android: { priority: "high" },
      apns:   { payload: { aps: { sound: "default" } } },
      webpush:{ headers: { Urgency: "high" } },
    });
  } catch (e) {
    logger.error("FCM send error", e);
  }
}

// Mantive seu endpoint HTTP de compatibilidade
export const notify = onRequest({ cors: true }, async (req, res) => {
  try {
    const { recipientId, title, body, data } =
      req.method === "POST" ? req.body : req.query;

    if (!recipientId || !title || !body) {
      res.status(400).json({ ok: false, error: "recipientId, title e body são obrigatórios" });
      return;
    }
    await pushAndPersist({
      recipientId: String(recipientId),
      title: String(title),
      body: String(body),
      data: data || {},
    });
    res.json({ ok: true });
  } catch (e) {
    logger.error(e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// 🔔 Dispara quando criar uma nova mensagem
export const onMensagemCreated = onDocumentCreated(
  `${MESSAGES_COLLECTION}/{mensagemId}`,
  async (event) => {
    const snap = event.data;
    if (!snap) return;

    const msg = snap.data();
    const ticketId = msg.ticketId || "";
    const actorId  = msg.userId || ""; // quem realizou a ação (remetente)

    // tenta achar o "dono" do ticket
    let ticketOwnerId = null;
    if (ticketId) {
      const t = await db.collection(TICKETS_COLLECTION).doc(ticketId).get();
      if (t.exists) {
        const td = t.data() || {};
        ticketOwnerId = td.userId || td.createdBy || td.openedById || null;
      }
    }

    // monta texto
    const texto = (msg.conteudo && String(msg.conteudo).replace(/\*\*/g, "")) || "Nova mensagem";
    const titulo = msg.type === "status_update" ? "Atualização no chamado" : "Nova mensagem";
    const body   = ticketId ? `${texto} (Chamado: ${ticketId})` : texto;

    // notifica ambos (sem duplicar se forem iguais)
    const ids = new Set([actorId, ticketOwnerId].filter(Boolean));
    await Promise.all(
      [...ids].map((uid) =>
        pushAndPersist({
          recipientId: uid,
          title: titulo,
          body,
          data: { ticketId, mensagemId: snap.id, type: msg.type || "mensagem" },
        })
      )
    );
  }
);
