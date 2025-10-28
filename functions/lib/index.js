// functions/lib/index.js
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const webpush = require("web-push");

admin.initializeApp();

// ----- Carrega VAPID das functions:config
// firebase functions:config:set messaging.vapid_subject="mailto:voce@dominio.com" messaging.vapid_public_key="..." messaging.vapid_private_key="..."
const cfg = functions.config();
const VAPID = cfg?.messaging || {};
webpush.setVapidDetails(
  VAPID.vapid_subject || "mailto:admin@example.com",
  VAPID.vapid_public_key || "",
  VAPID.vapid_private_key || ""
);

// Util: envia WebPush para uma lista de subscriptions
async function sendWebPushToSubs(subs, payload) {
  const results = await Promise.allSettled(
    subs.map((sub) => webpush.sendNotification(sub, JSON.stringify(payload)))
  );
  return {
    ok: true,
    sent: results.filter((r) => r.status === "fulfilled").length,
    failed: results.filter((r) => r.status === "rejected").length,
    results: results.map((r) =>
      r.status === "fulfilled" ? "ok" : (r.reason && r.reason.message) || "error"
    ),
  };
}

// HTTP: /notify  (POST JSON: {title, body, url})
exports.notify = functions.region("us-central1").https.onRequest(async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "method not allowed" });
  }
  try {
    const { title = "Notificação", body = "Olá!", url = "/" } = req.body || {};

    const snap = await admin.firestore()
      .collection("push_subscriptions")
      .where("enabled", "==", true)
      .get();

    const subs = snap.docs.map((d) => {
      const { endpoint, keys } = d.data();
      return { endpoint, keys };
    });

    if (!subs.length) return res.json({ ok: true, sent: 0, failed: 0, results: [] });

    const payload = { title, body, url, tag: "default" };
    const out = await sendWebPushToSubs(subs, payload);
    return res.json(out);
  } catch (err) {
    console.error("[notify]", err);
    return res.status(500).json({ ok: false, error: String(err?.message || err) });
  }
});

// TRIGGER: dispara push quando criar documento em /mensagens
exports.onMensagemCreated = functions
  .region("us-central1")
  .firestore.document("mensagens/{msgId}")
  .onCreate(async (snap, ctx) => {
    try {
      const data = snap.data() || {};
      const title = (data.titulo || "Nova mensagem");
      const body = (data.conteudo || "Você tem uma nova mensagem");
      const url = data.url || "/dashboard";

      const subsSnap = await admin.firestore()
        .collection("push_subscriptions")
        .where("enabled", "==", true)
        .get();

      const subs = subsSnap.docs.map((d) => {
        const { endpoint, keys } = d.data();
        return { endpoint, keys };
      });

      if (!subs.length) return null;

      const payload = { title, body, url, tag: "mensagens" };
      const out = await sendWebPushToSubs(subs, payload);
      console.log("[onMensagemCreated] push:", out);
      return null;
    } catch (err) {
      console.error("[onMensagemCreated] error:", err);
      return null;
    }
  });
