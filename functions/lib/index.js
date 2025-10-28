// functions/index.js
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const webpush = require("web-push");

admin.initializeApp();

// Lê VAPID das configs do Firebase Functions (recomendado)
//   firebase functions:config:set vapid.public="..." vapid.private="..." vapid.subject="mailto:voce@exemplo.com"
const cfg = functions.config() || {};
const VAPID_PUBLIC = (cfg.vapid && cfg.vapid.public) || process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE = (cfg.vapid && cfg.vapid.private) || process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = (cfg.vapid && cfg.vapid.subject) || process.env.VAPID_SUBJECT || "mailto:admin@sistemastands.com.br";

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);

function toText(s) {
  return String(s || "")
    .replace(/\*\*/g, "")        // simples: tira **markdown**
    .replace(/[#>_`]/g, "")
    .trim();
}

exports.onMensagemCreate = functions.firestore
  .document("mensagens/{msgId}")
  .onCreate(async (snap, context) => {
    const msg = snap.data() || {};

    // Monte um payload amigável pro seu SW (firebase-messaging-sw.js)
    const title =
      toText(msg.titulo) ||
      toText(msg.conteudo?.split("\n")[0]) ||
      "Notificação";

    const body = toText(msg.conteudo) || "Você tem uma atualização.";
    const url =
      msg.link ||
      (msg.ticketId ? `/chamado/${msg.ticketId}` : "/dashboard");

    const payload = {
      title,
      body,
      url,
      tag: msg.ticketId || "mensagens",
      renotify: true,
      // se quiser enviar dados extras:
      data: { url, ticketId: msg.ticketId || null, tipo: msg.type || null },
      badge: "/icons/badge.png",
      icon: "/icons/icon-192.png",
    };

    const db = admin.firestore();
    const subsSnap = await db
      .collection("push_subscriptions")
      .where("enabled", "==", true)
      .get();

    if (subsSnap.empty) {
      console.log("[push] Nenhuma inscrição ativa.");
      return null;
    }

    const subs = subsSnap.docs.map((d) => ({
      ref: d.ref,
      sub: {
        endpoint: d.get("endpoint"),
        keys: {
          p256dh: d.get("keys.p256dh"),
          auth: d.get("keys.auth"),
        },
      },
    }));

    const results = await Promise.allSettled(
      subs.map((s) =>
        webpush.sendNotification(s.sub, JSON.stringify(payload))
      )
    );

    // Remove inscrições expiradas/inválidas (404/410)
    const toDelete = [];
    results.forEach((r, i) => {
      if (r.status === "rejected") {
        const code = r.reason?.statusCode;
        if (code === 404 || code === 410) {
          toDelete.push(subs[i].ref);
        }
      }
    });
    if (toDelete.length) {
      await Promise.all(toDelete.map((ref) => ref.delete()));
      console.log(`[push] Removidas ${toDelete.length} inscrições inválidas.`);
    }

    const sent = results.filter((r) => r.status === "fulfilled").length;
    const failed = results.length - sent;
    console.log(`[push] Enviadas: ${sent} | Falhas: ${failed}`);

    return null;
  });
