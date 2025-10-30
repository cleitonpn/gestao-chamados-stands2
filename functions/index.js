// functions/index.js
const functions = require('firebase-functions');
const admin = require('firebase-admin');

admin.initializeApp();

/**
 * Util: extrai token FCM do endpoint WebPush (FCM) salvo na subscription.
 * Ex.: https://fcm.googleapis.com/fcm/send/<TOKEN_AQUI>
 */
function extractFcmToken(endpoint) {
  if (!endpoint || typeof endpoint !== 'string') return null;
  const parts = endpoint.split('/send/');
  return parts[1] || null;
}

/**
 * HTTP -> /notify
 * Broadcast opcionalmente filtrando por userIds (array) se enviado no body.
 * Aceita CORS simples.
 *
 * Body JSON:
 * { title, body, url, tag, userIds?: string[] }
 */
exports.notify = functions
  .region('us-central1')
  .https.onRequest(async (req, res) => {
    // CORS básico
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      return res.status(204).send('');
    }
    if (req.method !== 'POST') {
      return res.status(405).json({ ok: false, error: 'method not allowed' });
    }

    try {
      const {
        title = 'Notificação',
        body = 'Mensagem',
        url = '/',
        tag = 'default',
        userIds = [], // opcional: restringe por userId das subscriptions
      } = req.body || {};

      const db = admin.firestore();
      let query = db.collection('push_subscriptions').where('enabled', '==', true);

      const targets = Array.isArray(userIds)
        ? userIds.filter(Boolean).map(String)
        : [];

      // Se veio filtro por usuários e couber no "in" (<=10), usa-o
      if (targets.length > 0 && targets.length <= 10) {
        query = query.where('userId', 'in', targets);
      }

      const snap = await query.get();

      const tokens = [];
      snap.forEach((doc) => {
        const endpoint = doc.get('endpoint');
        const token = extractFcmToken(endpoint);
        if (token) tokens.push(token);
      });

      if (!tokens.length) {
        return res.status(200).json({ ok: false, error: 'sem tokens válidos' });
      }

      const messaging = admin.messaging();
      const message = {
        tokens,
        data: { url: String(url) },
        webpush: {
          notification: {
            title: String(title),
            body: String(body),
            icon: '/icons/icon-192.png',
            badge: '/icons/badge.png',
            tag: String(tag || 'default'),
            renotify: false,
          },
          fcmOptions: { link: String(url) },
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
      return res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

/**
 * Trigger Firestore -> ao criar documento em "mensagens"
 * Envia push para: userId (padrão) + remetenteId + destinatarioId (se existirem).
 */
exports.onMensagemCreated = functions
  .region('us-central1')
  .firestore.document('mensagens/{mensagemId}')
  .onCreate(async (snap, _context) => {
    const msg = snap.data() || {};

    // Colete possíveis alvos (remove falsy e duplica com Set)
    const destinos = Array.from(
      new Set(
        [msg.userId, msg.remetenteId, msg.destinatarioId]
          .filter(Boolean)
          .map(String)
      )
    );

    if (!destinos.length) {
      console.log('[onMensagemCreated] sem destinos (userId/remetenteId/destinatarioId)');
      return null;
    }

    const db = admin.firestore();

    // Query usando "in" (máx. 10 ids)
    let subsSnap = await db
      .collection('push_subscriptions')
      .where('enabled', '==', true)
      .where('userId', 'in', destinos.slice(0, 10))
      .get();

    // Extraia tokens FCM
    const tokens = [];
    subsSnap.forEach((doc) => {
      const endpoint = doc.get('endpoint');
      const token = extractFcmToken(endpoint);
      if (token) tokens.push(token);
    });

    if (!tokens.length) {
      console.log('[onMensagemCreated] nenhum token válido para', destinos);
      return null;
    }

    const title = String(msg.title || 'Nova mensagem');
    const body = String(msg.conteudo || 'Você recebeu uma atualização.');
    const url = String(msg.url || '/');

    const payload = {
      tokens,
      data: { url },
      webpush: {
        notification: {
          title,
          body,
          icon: '/icons/icon-192.png',
          badge: '/icons/badge.png',
          tag: 'mensagens',
          renotify: false,
        },
        fcmOptions: { link: url },
      },
    };

    const resp = await admin.messaging().sendEachForMulticast(payload);
    console.log('[onMensagemCreated] push:', {
      destinos,
      sent: resp.successCount,
      failed: resp.failureCount,
    });
    return null;
  });
