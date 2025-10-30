// /functions/index.js
// Runtime: Node 20 + firebase-functions v2 (commonjs)

const { onRequest } = require("firebase-functions/v2/https");
const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const admin = require("firebase-admin");

if (!admin.apps.length) {
  admin.initializeApp();
}
const db = admin.firestore();
const messaging = admin.messaging();

/**
 * HTTP -> Broadcast manual (testes via curl)
 * body: { title?: string, body?: string, url?: string }
 */
exports.notify = onRequest({ region: "us-central1" }, async (req, res) => {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ ok: false, error: "method not allowed" });
    }
    const { title = "Notificação", body = "Mensagem", url = "/" } = req.body || {};

    // busca TODAS inscrições ativas
    const snap = await db
      .collection("push_subscriptions")
      .where("enabled", "==", true)
      .get();

    const tokens = [];
    snap.forEach((doc) => {
      const endpoint = doc.get("endpoint");
      if (endpoint && typeof endpoint === "string") {
        const parts = endpoint.split("/send/");
        const token = parts[1] || "";
        if (token) tokens.push(token);
      }
    });

    if (tokens.length === 0) {
      return res.status(200).json({ ok: false, error: "sem tokens válidos" });
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

    const resp = await messaging.sendEachForMulticast(message);
    return res.status(200).json({
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

/**
 * Firestore trigger -> espelha mensagens em push
 * Coleção: mensagens (o seu doc tem campo userId, e queremos notificar
 * tanto o remetente quanto o destinatário)
 *
 * Esperado no doc de mensagem (exemplo):
 * {
 *   userId: "<destinatario principal>",
 *   remetenteId: "<quem executou a ação>",
 *   ticketId: "...",
 *   conteudo: "...",
 *   type: "status_update" | ...
 * }
 */
exports.onMensagemCreated = onDocumentCreated(
  "mensagens/{mensagemId}",
  async (event) => {
    try {
      const data = event.data?.data();
      if (!data) return;

      const {
        userId,        // destinatário (quem abriu o chamado)
        remetenteId,   // quem executou a ação
        conteudo = "",
        ticketId = "",
        type = "mensagem",
      } = data;

      // queremos notificar AMBOS (sem duplicar caso sejam iguais)
      const alvoIds = Array.from(new Set([userId, remetenteId].filter(Boolean)));
      if (alvoIds.length === 0) return;

      // busca inscrições ativas por userId
      const allTokens = [];
      for (const uid of alvoIds) {
        const qs = await db
          .collection("push_subscriptions")
          .where("enabled", "==", true)
          .where("userId", "==", uid)
          .get();

        qs.forEach((doc) => {
          const endpoint = doc.get("endpoint");
          if (endpoint && typeof endpoint === "string") {
            const parts = endpoint.split("/send/");
            const token = parts[1] || "";
            if (token) allTokens.push(token);
          }
        });
      }

      const tokens = Array.from(new Set(allTokens)).filter(Boolean);
      if (tokens.length === 0) return;

      const title =
        type === "status_update"
          ? "Atualização de status"
          : "Nova mensagem no chamado";

      const body = conteudo?.slice(0, 180) || "Você tem uma atualização";
      const url = ticketId ? `/tickets/${ticketId}` : "/";

      const message = {
        tokens,
        data: { url, ticketId: String(ticketId || ""), type: String(type || "") },
        webpush: {
          notification: {
            title,
            body,
            icon: "/icons/icon-192.png",
            badge: "/icons/badge.png",
            tag: `ticket-${ticketId || "generic"}`,
            renotify: true,
          },
          fcmOptions: { link: url },
        },
      };

      const resp = await messaging.sendEachForMulticast(message);
      console.log(
        "[onMensagemCreated] enviados:",
        resp.successCount,
        "falhas:",
        resp.failureCount
      );
    } catch (e) {
      console.error("[onMensagemCreated] erro:", e);
    }
  }
);
