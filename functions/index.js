// functions/index.js
const functions = require('firebase-functions');
const admin = require('firebase-admin');
const webpush = require('web-push');

if (!admin.apps.length) admin.initializeApp();

// ---- VAPID via functions:config() (opcional; se não houver, tudo bem p/ FCM puro) ----
const cfg = (functions.config() && functions.config().messaging) || {};
try {
  if (cfg.vapid_subject && cfg.vapid_public_key && cfg.vapid_private_key) {
    webpush.setVapidDetails(cfg.vapid_subject, cfg.vapid_public_key, cfg.vapid_private_key);
  }
} catch (e) {
    console.warn('[init webpush]', e.message);
}

// Util: extrai token FCM do endpoint WebPush (parte após /send/)
function endpointToFcmToken(endpoint) {
  if (!endpoint || typeof endpoint !== 'string') return null;
  const parts = endpoint.split('/send/');
  return parts[1] || null;
}

// ----------------------------------------------------------------------------
// HTTP: POST /notify  (broadcast simples para todos enabled=true)
// body: { title, body, url }
// ----------------------------------------------------------------------------
exports.notify = functions.region('us-central1').https.onRequest(async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'method not allowed' });
  }

  try {
    const { title = 'Notificação', body = 'Mensagem', url = '/' } = req.body || {};
    const db = admin.firestore();

    const snap = await db.collection('push_subscriptions').where('enabled', '==', true).get();

    const tokens = [];
    snap.forEach((doc) => {
      const endpoint = doc.get('endpoint');
      const token = endpointToFcmToken(endpoint);
      if (token) tokens.push(token);
    });

    if (!tokens.length) {
      return res.json({ ok: false, error: 'sem tokens válidos' });
    }

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

    const resp = await admin.messaging().sendEachForMulticast(message);
    return res.json({
      ok: true,
      sent: resp.successCount,
      failed: resp.failureCount,
      results: resp.responses.map(r => (r.error ? r.error.message : 'ok')),
    });
  } catch (e) {
    console.error('[notify]', e);
    return res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

// ----------------------------------------------------------------------------
// Firestore: espelha mensagens -> push
// Coleção: mensagens
// Campos esperados no doc: userId (remetente), destinatarioId (destino), conteudo, ticketId
// Envia push p/ ambos: userId e destinatarioId (se existirem subs ativas).
// ----------------------------------------------------------------------------
exports.onMensagemCreated = functions
  .region('us-central1')
  .firestore.document('mensagens/{msgId}')
  .onCreate(async (snap, context) => {
    const data = snap.data() || {};
    const { userId, destinatarioId, conteudo, ticketId } = data;

    // Monte lista de usuários alvo (remetente + destinatário, sem duplicar/undefined)
    const targets = Array.from(new Set([userId, destinatarioId].filter(Boolean)));
    if (!targets.length) {
      console.log('[onMensagemCreated] sem userId/destinatarioId, nada a fazer.');
      return null;
    }

    const db = admin.firestore();
    const allSubs = [];

    // Busca inscrições ativas por userId
    for (const uid of targets) {
      const q = await db.collection('push_subscriptions')
        .where('enabled', '==', true)
        .where('userId', '==', uid)
        .get();

      q.forEach(doc => {
        const endpoint = doc.get('endpoint');
        const token = endpointToFcmToken(endpoint);
        if (token) allSubs.push(token);
      });
    }

    if (!allSubs.length) {
      console.log('[onMensagemCreated] nenhum token ativo para os alvos');
      return null;
    }

    const title = 'Nova mensagem';
    const body  = conteudo ? String(conteudo).slice(0, 120) : 'Você recebeu uma nova mensagem.';
    const url   = ticketId ? `/tickets/${ticketId}` : '/';

    const msg = {
      tokens: allSubs,
      data: { url },
      webpush: {
        notification: {
          title,
          body,
          icon: '/icons/icon-192.png',
          badge: '/icons/badge.png',
          tag: ticketId || 'mensagem',
          renotify: false,
        },
        fcmOptions: { link: url },
      },
    };

    const resp = await admin.messaging().sendEachForMulticast(msg);
    console.log('[onMensagemCreated] sent:', resp.successCount, 'failed:', resp.failureCount);
    return null;
  });

