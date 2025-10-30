// functions/index.js
const functions = require("firebase-functions/v2");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");
const webpush = require("web-push");

try { admin.app(); } catch { admin.initializeApp(); }

const WEBPUSH_PRIVATE_KEY = defineSecret("WEBPUSH_PRIVATE_KEY");
const WEBPUSH_PUBLIC_KEY  = defineSecret("WEBPUSH_PUBLIC_KEY");
const WEBPUSH_SUBJECT     = defineSecret("WEBPUSH_SUBJECT");

exports.onMensagemCreated = functions
  .region("us-central1")
  .runWith({
    secrets: [WEBPUSH_PRIVATE_KEY, WEBPUSH_PUBLIC_KEY, WEBPUSH_SUBJECT],
    memory: "256MiB",
    timeoutSeconds: 30,
  })
  .firestore.document("mensagens/{mensagemId}")
  .onCreate(async (snap) => {
    const data = snap.data() || {};
    const userId = data.userId;

    if (!userId) {
      console.log("Mensagem sem userId — nada a enviar.");
      return;
    }

    // Configura VAPID com Secrets
    webpush.setVapidDetails(
      WEBPUSH_SUBJECT.value(),
      WEBPUSH_PUBLIC_KEY.value(),
      WEBPUSH_PRIVATE_KEY.value()
    );

    // Busca inscrições ativas do usuário
    const subsSnap = await admin
      .firestore()
      .collection("push_subscriptions")
      .where("userId", "==", userId)
      .where("enabled", "==", true)
      .get();

    if (subsSnap.empty) {
      console.log(`Sem inscrições ativas para userId=${userId}`);
      return;
    }

    // Monta o payload da notificação
    const title = data.title || "Atualização de chamado";
    const body =
      data.body ||
      data.conteudo ||
      "Você recebeu uma nova atualização no sistema.";
    const link = data.link || (data.ticketId ? `/chamados/${data.ticketId}` : "/");

    const payload = JSON.stringify({
      title,
      body,
      icon: "/icons/icon-192.png",
      badge: "/icons/badge.png",
      data: { link },
    });

    const results = [];
    for (const doc of subsSnap.docs) {
      const sub = doc.data();
      const pushSub = {
        endpoint: sub.endpoint,
        keys: {
          auth: sub.keys?.auth,
          p256dh: sub.keys?.p256dh,
        },
      };

      try {
        await webpush.sendNotification(pushSub, payload);
        results.push({ id: doc.id, ok: true });
      } catch (err) {
        console.error("Erro ao enviar push:", err.statusCode, err.body);
        // limpa inscrição expirada
        if (err.statusCode === 410 || err.statusCode === 404) {
          await doc.ref.update({
            enabled: false,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        }
        results.push({ id: doc.id, ok: false, status: err.statusCode });
      }
    }

    console.log("Resultado do envio:", results);
  });
