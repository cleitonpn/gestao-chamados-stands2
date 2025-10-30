import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { defineSecret } from "firebase-functions/params";
import * as admin from "firebase-admin";
import webpush from "web-push";

if (admin.apps.length === 0) admin.initializeApp();

// Secrets definidos no Firebase (passo 1 do workflow)
const WEBPUSH_SUBJECT = defineSecret("WEBPUSH_SUBJECT");
const WEBPUSH_PUBLIC_KEY = defineSecret("WEBPUSH_PUBLIC_KEY");
const WEBPUSH_PRIVATE_KEY = defineSecret("WEBPUSH_PRIVATE_KEY");

// Utilitário para montar a notificação
function buildPayload(msg) {
  const title = "Nova mensagem no chamado";
  const body =
    typeof msg?.conteudo === "string"
      ? msg.conteudo.slice(0, 220)
      : "Você recebeu uma atualização.";
  return JSON.stringify({
    title,
    body,
    data: {
      ticketId: msg?.ticketId || null,
      type: msg?.type || "message",
    },
  });
}

/**
 * Dispara push quando um documento for criado em /mensagens
 * Espera que a mensagem tenha: userId (destinatário), conteudo, ticketId
 * Envia para todos os endpoints em /push_subscriptions com userId == destinatário
 */
export const onMensagemCreated = onDocumentCreated(
  {
    region: "us-central1",
    document: "mensagens/{msgId}",
    secrets: [WEBPUSH_SUBJECT, WEBPUSH_PUBLIC_KEY, WEBPUSH_PRIVATE_KEY],
    timeoutSeconds: 60,
    memory: "256MiB",
  },
  async (event) => {
    const msg = event.data?.data();
    if (!msg) return;

    const userId = msg.userId;
    if (!userId) {
      console.log("Mensagem sem userId (destinatário), não vou enviar push.");
      return;
    }

    // Busca inscrições do destinatário
    const snap = await admin
      .firestore()
      .collection("push_subscriptions")
      .where("userId", "==", userId)
      .get();

    if (snap.empty) {
      console.log("Sem inscrições ativas para:", userId);
      return;
    }

    // Configura VAPID
    webpush.setVapidDetails(
      WEBPUSH_SUBJECT.value(),
      WEBPUSH_PUBLIC_KEY.value(),
      WEBPUSH_PRIVATE_KEY.value()
    );

    const payload = buildPayload(msg);

    // Envia para todos os endpoints do usuário
    const results = await Promise.allSettled(
      snap.docs.map(async (doc) => {
        const data = doc.data();

        // Aceita dois formatos:
        // {subscription: {...}}  OU  {endpoint, keys:{p256dh,auth}}
        const sub =
          data.subscription ||
          ({
            endpoint: data.endpoint,
            keys: data.keys,
          } as any);

        if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) {
          console.warn("Inscrição inválida, removendo:", doc.id);
          await doc.ref.delete();
          return;
        }

        try {
          await webpush.sendNotification(sub, payload);
        } catch (err) {
          console.error("Falha no web-push", err?.statusCode, err?.body || "");
          // 404/410 = endpoint expirado → apaga para limpar
          if (err?.statusCode === 404 || err?.statusCode === 410) {
            await doc.ref.delete();
          }
          throw err;
        }
      })
    );

    console.log("Resultados envio:", results.map(r => r.status));
  }
);
