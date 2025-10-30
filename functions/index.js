// functions/index.js  (CommonJS)
const functions = require('firebase-functions');
const admin = require('firebase-admin');

if (admin.apps.length === 0) {
  admin.initializeApp();
}

// ------------------------------
// helper: extrai token FCM do endpoint salvo
// ------------------------------
function tokenFromEndpoint(endpoint = '') {
  // endpoints vem como ".../fcm/send/<TOKEN>"
  const parts = String(endpoint).split('/send/');
  return parts[1] || '';
}

// ------------------------------
// helper: busca tokens FCM pelos userIds
// ------------------------------
async function getFcmTokensByUserIds(userIds = []) {
  const db = admin.firestore();
  const tokens = [];

  if (!Array.isArray(userIds) || userIds.length === 0) return tokens;

  // Firestore 'in' aceita até 10 itens (aqui são 1 ou 2)
  const snap = await db
    .collection('push_subscriptions')
    .where('enabled', '==', true)
    .where('userId', 'in', userIds)
    .get();

  snap.forEach((doc) => {
    const endpoint = doc.get('endpoint');
    const t = tokenFromEndpoint(endpoint);
    if (t) tokens.push(t);
  });

  return tokens;
}

// =======================================================
// HTTP: /notify  (broadcast manual / testes)
// =======================================================
exports.notify = functions
  .region('us-central1')
  .https.onRequest(async (req, res) => {
    if (req.method !== 'POST') {
      return res.status(405).json({ ok: false, error: 'method not allowed' });
    }

    try {
      const { title = 'Notificação', body = 'Mensagem', url = '/' } = req.body || {};
      const db = admin.firestore();

      const snap = await db
        .collection('push_subscriptions')
        .where('enabled', '==', true)
        .get();

      const tokens = [];
      snap.forEach((d) => {
        const endpoint = d.get('endpoint');
        const t = tokenFromEndpoint(endpoint);
        if (t) tokens.push(t);
      });

      if (tokens.length === 0) {
        return res.status(200).json({ ok: false, error: 'sem tokens válidos' });
      }

      const messaging = admin.messaging();
      const message = {
        tokens,
        data: { url },
        webpush: {
          notification: {
            title,
            body,
            icon: '/icons/icon-192.png',
            badge: '/icons/badge.png',
            tag: 'default',
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
        results: resp.responses.map((r) => (r.error ? r.error.message : 'ok')),
      });
    } catch (e) {
      console.error('[notify] erro:', e);
      return res.status(500).json({ ok: false, error: String(e.message || e) });
    }
  });

// =======================================================
// Firestore: espelha push quando cria doc em "mensagens"
// Envia para REMETENTE (userId) e DESTINATÁRIO (destinatarioId, se houver)
// =======================================================
exports.onMensagemCreated = functions
  .region('us-central1')
  .firestore.document('mensagens/{mensagemId}')
  .onCreate(async (snap, context) => {
    const data = snap.data() || {};

    // Campos esperados
    const {
      conteudo = '',
      ticketId = '',
      remetenteNome = 'Mensagem',
      userId,               // remetente
      destinatarioId,       // destinatário (se o frontend preencher)
    } = data;

    // Define destino: remetente + destinatário (sem duplicar / sem nulos)
    const destinatarios = Array.from(
      new Set([userId, destinatarioId].filter(Boolean))
    );

    if (destinatarios.length === 0) {
      console.warn('[onMensagemCreated] Sem userId/destinatarioId no documento, ignorando.');
      return null;
    }

    // Monta título/corpo/url
    const title = `📨 ${remetenteNome}`;
    const body = String(conteudo).slice(0, 180); // evita corpo gigantes
    const url = ticketId ? `/tickets/${ticketId}` : '/';

    // Busca tokens de push dos destinatários
    const tokens = await getFcmTokensByUserIds(destinatarios);
    if (tokens.length === 0) {
      console.warn('[onMensagemCreated] Sem tokens para', destinatarios);
      return null;
    }

    const messaging = admin.messaging();
    const message = {
      tokens,
      data: { url },
      webpush: {
        notification: {
          title,
          body,
          icon: '/icons/icon-192.png',
          badge: '/icons/badge.png',
          tag: `mensagem_${ticketId || 'default'}`,
          renotify: false,
        },
        fcmOptions: { link: url },
      },
    };

    const resp = await messaging.sendEachForMulticast(message);
    console.log('[onMensagemCreated] push =>', {
      destinatarios,
      sent: resp.successCount,
      failed: resp.failureCount,
    });
    return null;
  });
