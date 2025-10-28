// /api/push/send-fcm.mjs
import admin from "firebase-admin";

const svcJson = process.env.FIREBASE_ADMIN_JSON;
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(svcJson)),
  });
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "method not allowed" });
  }

  try {
    const { tokens = [], title = "Notificação", body = "Mensagem", url = "/" } = req.body || {};
    if (!Array.isArray(tokens) || tokens.length === 0) {
      return res.status(400).json({ ok: false, error: "tokens obrigatórios" });
    }

    const resp = await admin.messaging().sendEachForMulticast({
      tokens,
      data: { url },
      webpush: {
        notification: { title, body, icon: "/icons/icon-192.png", badge: "/icons/badge.png" },
        fcmOptions: { link: url },
      },
    });

    res.status(200).json({ ok: true, sent: resp.successCount, failed: resp.failureCount });
  } catch (e) {
    console.error("[send-fcm.mjs] erro:", e);
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
}
