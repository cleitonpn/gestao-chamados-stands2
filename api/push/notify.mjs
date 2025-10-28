// /api/push/notify.mjs
import admin from "firebase-admin";

const svcJson = process.env.FIREBASE_ADMIN_JSON;
if (!admin.apps.length) {
  if (!svcJson) {
    throw new Error("FIREBASE_ADMIN_JSON ausente");
  }
  admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(svcJson)),
  });
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "method not allowed" });
  }

  try {
    const { title = "Notificação", body = "Mensagem", url = "/" } = req.body || {};
    const db = admin.firestore();

    // Busca TODAS as inscrições ativas
    const snap = await db.collection("push_subscriptions").where("enabled", "==", true).get();

    // Extrai o token FCM do endpoint (última parte após /send/)
    const tokens = [];
    snap.forEach((doc) => {
      const endpoint = doc.get("endpoint");
      if (endpoint && typeof endpoint === "string") {
        const pieces = endpoint.split("/send/");
        const token = pieces[1] || "";
        if (token) tokens.push(token);
      }
    });

    if (tokens.length === 0) {
      return res.status(200).json({ ok: false, error: "sem tokens válidos" });
    }

    const messaging = admin.messaging();

    const message = {
      tokens,
      data: { url }, // útil para tratar clique
      webpush: {
        notification: {
          title,
          body,
          icon: "/icons/icon-192.png",
          badge: "/icons/badge.png",
          tag: "default",
          renotify: true,
        },
        fcmOptions: {
          link: url, // abre esta URL ao clicar
        },
      },
    };

    // >>> método correto nas versões recentes:
    const resp = await messaging.sendEachForMulticast(message);

    return res.status(200).json({
      ok: true,
      sent: resp.successCount,
      failed: resp.failureCount,
      results: resp.responses.map((r) => (r.error ? r.error.message : "ok")),
    });
  } catch (e) {
    console.error("[notify.mjs] erro:", e);
    return res.status(500).json({ ok: false, error: String(e.message || e) });
  }
}
