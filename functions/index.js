// functions/index.js
// Cloud Function que envia WebPush quando um doc é criado em `mensagens/{id}`.
// Versão CommonJS para funcionar sem "type":"module".
// Requisitos no functions/package.json:
//   "dependencies": {
//     "firebase-admin": "^12.5.0",
//     "firebase-functions": "^4.6.0",
//     "web-push": "^3.6.7"
//   },
//   "engines": { "node": "20" }

const admin = require('firebase-admin');
const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const logger = require('firebase-functions/logger');
const webpush = require('web-push');

try {
  admin.initializeApp();
} catch (_) {
  // noop (evita erro em ambientes que inicializam duas vezes)
}

// As chaves VAPID devem vir de variáveis de ambiente/Secrets do GitHub Actions
const VAPID_SUBJECT = process.env.WEBPUSH_SUBJECT;
const VAPID_PUBLIC_KEY = process.env.WEBPUSH_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.WEBPUSH_PRIVATE_KEY;

if (!VAPID_SUBJECT || !VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
  logger.warn('WEBPUSH_* env vars ausentes — os pushes irão falhar.');
}

webpush.setVapidDetails(VAPID_SUBJECT || 'mailto:admin@example.com', VAPID_PUBLIC_KEY || '', VAPID_PRIVATE_KEY || '');

/**
 * Monta o payload do push (title/body + deep-link)
 */
function buildPayloadFromMessage(msg) {
  const link = msg.link || (msg.ticketId ? `/chamado/${msg.ticketId}` : '/');
  return JSON.stringify({
    title: msg.title || 'Nova mensagem',
    body: msg.body || msg.conteudo || '',
    data: { link },
  });
}

/**
 * onMensagemCreated — dispara push quando um novo documento é criado em `mensagens/`.
 */
exports.onMensagemCreated = onDocumentCreated('mensagens/{id}', async (event) => {
  const snap = event.data;
  if (!snap) return;

  const msg = snap.data();
  const { userId, title, body } = msg || {};

  // Campos mínimos para notificar
  if (!userId || !(title || body || msg?.conteudo)) {
    logger.warn('Doc em mensagens sem campos mínimos', { id: event.params.id, msg });
    return;
  }

  // Busca inscrições de push do destinatário
  const subsSnap = await admin
    .firestore()
    .collection('push_subscriptions')
    .where('userId', '==', userId)
    .where('enabled', '==', true)
    .get();

  if (subsSnap.empty) {
    logger.info('Nenhuma inscrição ativa para o usuário', { userId });
    return;
  }

  const payload = buildPayloadFromMessage(msg);

  const tasks = subsSnap.docs.map(async (d) => {
    const sub = d.data();
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: {
            auth: sub.keys?.auth,
            p256dh: sub.keys?.p256dh,
          },
        },
        payload,
        { TTL: 60 }
      );
      logger.info('Push enviado', { userId, subId: d.id });
    } catch (err) {
      logger.error('Falha ao enviar push', { userId, subId: d.id, err: err?.message });
    }
  });

  await Promise.allSettled(tasks);
});
