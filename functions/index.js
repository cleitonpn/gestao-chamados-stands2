// functions/index.js (CommonJS)
const functions = require("firebase-functions");
const admin = require("firebase-admin");

if (admin.apps.length === 0) {
  admin.initializeApp();
}

const REGION = "us-central1";

// Util: extrai tokens FCM do endpoint webpush do FCM
function extractFcmTokenFromEndpoint(endpoint) {
  if (typeof endpoint !== "string") return null;
  const parts = endpoint.split("/send/");
  return parts[1] || null;
}

// Util: envia push via FCM (multicast)
async function sendFcmMulticast(tokens, { title, body, url }) {
  if (!tokens.length) {
    return { successCount: 0, failureCount: 0, responses: [] };
  }
  const messaging = admin.messaging();
  const message = {
    tokens,
    data: { url: url || "/" }, // disponível no SW
    webpush: {
      notification: {
        title: title || "Notificação",
        body: body || "",
        icon: "/icons/icon-192x192.png",
        badge: "/icons/badge-72x72.png",
        tag: "default",
        renotify: false,
      },
      fcmOptions: { link: url || "/" }, // abre a URL ao clicar
    },
  };
  return messaging.sendEachForMulticast(message);
}

/**
 * HTTP: POST /notify
 * Corpo: { title, body, url, userIds?: string[] }  // se omitir userIds => broadcast
 * Com CORS liberado para chamadas do browser.
 */
exports.notify = functions.region(REGION).https.onRequest(async (req, res) => {
  // CORS simples
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  if (req.method === "OPTIONS") return res.status(204).send();

  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "method not allowed" });
  }

  try {
    const { title = "Notificação", body = "Mensagem", url = "/", userIds } =
      req.body || {};
    const db = admin.firestore();

    let query = db.collection("push_subscriptions").where("enabled", "==", true);

    // Se veio lista de usuários, filtra por eles (máx 10 por 'in')
    if (Array.isArray(userIds) && userIds.length) {
      const ids = [...new Set(userIds)].slice(0, 10);
      query = query.where("userId", "in", ids);
    }

    const snap = await query.get();
    const tokens = [];
    snap.forEach((doc) => {
      const endpoint = doc.get("endpoint");
      const token = extractFcmTokenFromEndpoint(endpoint);
      if (token) tokens.push(token);
    });

    const resp = await sendFcmMulticast(tokens, { title, body, url });
    return res.status(200).json({
      ok: true,
      sent: resp.successCount,
      failed: resp.failureCount,
      results: resp.responses.map((r) => (r.error ? r.error.message : "ok")),
    });
  } catch (e) {
    console.error("[notify] error:", e);
    return res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

/**
 * Firestore: espelho de mensagens -> push
 * Dispara quando um doc é criado em /mensagens/{id}
 * Envia para: destinatarioId, remetenteId e userId (se existirem).
 */
exports.onMensagemCreated = functions
  .region(REGION)
  .firestore.document("mensagens/{msgId}")
  .onCreate(async (snap) => {
    const msg = snap.data() || {};

    // Determina título e URL
    const title =
      msg.type === "status_update"
        ? "Atualização de status"
        : msg.type === "novo_comentario"
        ? "Novo comentário"
        : "Mensagem";
    const body =
      typeof msg.conteudo === "string"
        ? msg.conteudo.slice(0, 180)
        : "Você recebeu uma atualização.";
    const url =
      (msg.ticketId && `/tickets/${msg.ticketId}`) ||
      (msg.projectId && `/projects/${msg.projectId}`) ||
      "/";

    // Monta alvo: destinatário + remetente + userId
    const recipients = new Set();
    if (msg.destinatarioId) recipients.add(String(msg.destinatarioId));
    if (msg.remetenteId) recipients.add(String(msg.remetenteId));
    if (msg.userId) recipients.add(String(msg.userId));

    const ids = [...recipients].filter(Boolean);
    if (ids.length === 0) {
      console.log("[onMensagemCreated] nenhum id de destino no doc.");
      return null;
    }

    // Busca inscrições ativas desses usuários
    const db = admin.firestore();
    const chunks = []; // 'in' aceita até 10
    for (let i = 0; i < ids.length; i += 10) chunks.push(ids.slice(i, i + 10));

    let tokens = [];
    for (const group of chunks) {
      const q = await db
        .collection("push_subscriptions")
        .where("enabled", "==", true)
        .where("userId", "in", group)
        .get();
      q.forEach((d) => {
        const token = extractFcmTokenFromEndpoint(d.get("endpoint"));
        if (token) tokens.push(token);
      });
    }

    tokens = [...new Set(tokens)];
    if (!tokens.length) {
      console.log("[onMensagemCreated] sem tokens para enviar.");
      return null;
    }

    const resp = await sendFcmMulticast(tokens, { title, body, url });
    console.log(
      "[onMensagemCreated] sent:",
      resp.successCount,
      "failed:",
      resp.failureCount
    );
    return null;
  });
