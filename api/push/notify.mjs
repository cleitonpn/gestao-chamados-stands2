// /api/push/notify.mjs
import admin from "firebase-admin";

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
}

const svcJson = process.env.FIREBASE_ADMIN_JSON;
if (!admin.apps.length) {
  if (!svcJson) throw new Error("FIREBASE_ADMIN_JSON ausente");
  admin.initializeApp({ credential: admin.credential.cert(JSON.parse(svcJson)) });
}

function chunk(arr, size = 500) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export default async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "method not allowed" });
  }

  try {
    const {
      title = "Notificação",
      body = "Mensagem",
      url = "/",
      tag = "default",
      userId = null,           // << filtra por usuário (opcional)
      icon = "/icons/icon-192x192.png",
      badge = "/icons/badge-72x72.png",
    } = req.body || {};

    const db = admin.firestore();

    // monta a query de inscrições ativas
    let q = db.collection("push_subscriptions").where("enabled", "==", true);
    if (userId) q = q.where("userId", "==", userId);

    const snap = await q.get();
    if (snap.empty) {
      return res.status(200).json({ ok: true, sent: 0, failed: 0, results: [], note: "sem inscrições ativas" });
    }

    // extrai tokens (último segmento após /send/) + guarda ids para possível disable
    const tokens = [];
    const docIds = [];
    snap.forEach((doc) => {
      const endpoint = doc.get("endpoint");
      if (typeof endpoint === "string") {
        const token = endpoint.split("/send/")[1] || "";
        if (token) {
          tokens.push(token);
          docIds.push(doc.id);
        }
      }
    });

    if (!tokens.length) {
      return res.status(200).json({ ok: true, sent: 0, failed: 0, results: [], note: "sem tokens válidos" });
    }

    const messaging = admin.messaging();
    let sent = 0, failed = 0;
    const results = [];

    const notification = { title, body, icon, badge, tag, renotify: false };

    // envia em blocos de até 500
    const tokenChunks = chunk(tokens, 500);
    const idChunks = chunk(docIds, 500);

    for (let c = 0; c < tokenChunks.length; c++) {
      const message = {
        tokens: tokenChunks[c],
        data: { url, tag },
        webpush: {
          notification,
          fcmOptions: { link: url }, // abre a URL ao clicar
        },
      };

      const resp = await messaging.sendEachForMulticast(message);
      sent += resp.successCount;
      failed += resp.failureCount;

      // registra resultados e desabilita tokens inválidos
      await Promise.all(
        resp.responses.map(async (r, i) => {
          results.push(r.error ? r.error.message : "ok");
          if (r.error && r.error.code === "messaging/registration-token-not-registered") {
            try {
              await db.collection("push_subscriptions").doc(idChunks[c][i]).update({
                enabled: false,
                disabledReason: r.error.code,
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
              });
            } catch (_) {}
          }
        })
      );
    }

    return res.status(200).json({ ok: true, sent, failed, results });
  } catch (e) {
    console.error("[notify.mjs] erro:", e);
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}
