// functions/index.js
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const webpush = require("web-push");

admin.initializeApp();
const db = admin.firestore();

// --- VAPID (opcional para Web Push direto; mantemos para compat) ---
const cfg = functions.config().messaging || {};
if (!cfg.vapid_subject || !cfg.vapid_public_key || !cfg.vapid_private_key) {
  console.warn("[notify] VAPID ausente nas config de functions. Configure se for usar web-push.");
}
try {
  webpush.setVapidDetails(
    cfg.vapid_subject || "mailto:example@example.com",
    cfg.vapid_public_key || "",
    cfg.vapid_private_key || ""
  );
} catch (e) {
  console.warn("[notify] setVapidDetails falhou.", e.message);
}

// Util: pega tokens FCM (ou endpoints) para um userId
async function getUserTokens(userId) {
  const snap = await db
    .collection("push_subscriptions")
    .where("enabled", "==", true)
    .where("userId", "==", userId || null)
    .get();

  const tokens = [];
  const webPushSubs = [];

  snap.forEach((doc) => {
    const endpoint = doc.get("endpoint");
    const keys = doc.get("keys");
    // Tokens FCM (quando endpoint é do FCM):
    if (endpoint && typeof endpoint === "string") {
      const pieces = endpoint.split("/send/");
      const token = pieces[1] || "";
      if (token) tokens.push(token);
    }
    if (endpoint && keys && keys.auth && keys.p256dh) {
      webPushSubs.push({ endpoint, keys });
    }
  });

  return { tokens, webPushSubs };
}

// HTTP: broadcast manual
exports.notify = functions.region("us-central1").https.onRequest(async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "method not allowed" });
  }

  try {
    const { title = "Notificação", body = "Mensagem", url = "/" } = req.body || {};

    const snap = await db.collection("push_subscriptions").where("enabled", "==", true).get();
    const tokens = [];
    snap.forEach((d) => {
      const endpoint = d.get("endpoint");
      if (endpoint && typeof endpoint === "string") {
        const pieces = endpoint.split("/send/");
        const token = pieces[1] || "";
        if (token) tokens.push(token);
      }
    });

    if (tokens.length === 0) {
      return res.json({ ok: true, sent: 0, failed: 0, results: [] });
    }

    const message = {
      tokens,
      data: { url },
      webpush: {
        notification: {
          title,
          body,
          icon: "/icons/icon-192.png",
          badge: "/icons/badge.png",
          tag: "default",
          renotify: true,
        },
        fcmOptions: { link: url },
      },
    };

    const resp = await admin.messaging().sendEachForMulticast(message);
    return res.json({
      ok: true,
      sent: resp.successCount,
      failed: resp.failureCount,
      results: resp.responses.map((r) => (r.error ? r.error.message : "ok")),
    });
  } catch (e) {
    console.error("[notify] erro:", e);
    return res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

// Firestore: espelhar mensagens → push para remetente E destinatário
exports.onMensagemCreated = functions
  .region("us-central1")
  .firestore.document("mensagens/{msgId}")
  .onCreate(async (snap) => {
    const data = snap.data() || {};

    const {
      userId,             // **destinatário** (seu modelo atual)
      destinatarioId,     // se existir, usamos também
      remetenteId,        // quem gerou a ação
      remetenteNome,
      ticketId,
      type = "mensagem",
      conteudo = "",
    } = data;

    // Definir título/corpo
    const titulo = remetenteNome
      ? `📬 Nova atualização de ${remetenteNome}`
      : "📬 Nova atualização";
    const corpo = conteudo?.toString().slice(0, 180) || "Você tem uma nova mensagem.";
    const url = ticketId ? `/tickets/${ticketId}` : "/";

    // Montar a lista única de usuários a notificar (destinatário + remetente)
    const ids = new Set();
    if (userId) ids.add(userId);
    if (destinatarioId) ids.add(destinatarioId);
    if (remetenteId) ids.add(remetenteId);

    const notifyResults = [];

    for (const id of ids) {
      const { tokens, webPushSubs } = await getUserTokens(id);

      // 1) FCM (para endpoints do FCM)
      if (tokens.length) {
        const message = {
          tokens,
          data: { url, ticketId: ticketId || "", type },
          webpush: {
            notification: {
              title: titulo,
              body: corpo,
              icon: "/icons/icon-192.png",
              badge: "/icons/badge.png",
              tag: "msg-" + (ticketId || "default"),
              renotify: true,
            },
            fcmOptions: { link: url },
          },
        };
        const resp = await admin.messaging().sendEachForMulticast(message);
        notifyResults.push({ userId: id, fcmSent: resp.successCount, fcmFailed: resp.failureCount });
      }

      // 2) (Opcional) Web Push puro para quem não tiver FCM (mantemos, mas silencioso)
      if (webPushSubs.length) {
        const payload = {
          title: titulo,
          body: corpo,
          url,
          tag: "msg-" + (ticketId || "default"),
        };
        const results = await Promise.allSettled(
          webPushSubs.map((sub) => webpush.sendNotification(sub, JSON.stringify(payload)))
        );
        notifyResults.push({
          userId: id,
          webPushOk: results.filter((r) => r.status === "fulfilled").length,
          webPushFail: results.filter((r) => r.status === "rejected").length,
        });
      }
    }

    console.log("[onMensagemCreated] notifyResults", notifyResults);
    return null;
  });
