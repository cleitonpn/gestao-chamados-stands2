// functions/index.js  (CommonJS)
const functions = require('firebase-functions');
const admin = require('firebase-admin');
const webpush = require('web-push');

admin.initializeApp();

// ------------------------------------------------------------
// VAPID via Functions Config (defina com:
//   firebase functions:config:set \
//     messaging.vapid_subject="mailto:seu-email@dominio.com" \
//     messaging.vapid_public_key="SUACHAVEPUBLICA" \
//     messaging.vapid_private_key="SUACHAVEPRIVADA"
// )
// ------------------------------------------------------------
const cfg = functions.config().messaging || {};
if (!cfg.vapid_subject || !cfg.vapid_public_key || !cfg.vapid_private_key) {
  console.warn('[notify] VAPID ausente nas config de functions. Configure antes de usar.');
}
try {
  webpush.setVapidDetails(
    cfg.vapid_subject || 'mailto:example@example.com',
    cfg.vapid_public_key || '',
    cfg.vapid_private_key || ''
  );
} catch (e) {
  console.warn('[notify] setVapidDetails falhou (provavelmente chaves vazias).', e.message);
}

// ------------------------------------------------------------
// Helper: envia Web Push para um array de PushSubscriptions
// subs: [{ endpoint, keys: { p256dh, auth } }, ...]
// payload: { title, body, url, tag, badgeCount, meta, icon, badge }
// ------------------------------------------------------------
async function sendWebPushToSubs(subs, payload) {
  const results = await Promise.allSettled(
    subs.map((sub) => webpush.sendNotification(sub, JSON.stringify(payload)))
  );
  return {
    ok: true,
    sent: results.filter(r => r.status === 'fulfilled').length,
    failed: results.filter(r => r.status === 'rejected').length,
    results: results.map(r => (r.status === 'fulfilled' ? 'ok' : (r.reason?.message || 'error')))
  };
}

// ------------------------------------------------------------
// HTTP manual: POST /notify
// body: { title, body, url }
// Busca todas as subs enabled=true (broadcast)
// ------------------------------------------------------------
exports.notify = functions
  .region('us-central1')
  .https.onRequest(async (req, res) => {
    if (req.method !== 'POST') {
      return res.status(405).json({ ok: false, error: 'method not allowed' });
    }

    try {
      const {
        title = 'Notificação',
        body = 'Olá!',
        url = '/',
        tag = 'default',
        icon,
        badge,
        badgeCount,
        meta = null
      } = req.body || {};

      const db = admin.firestore();
      const snap = await db.collection('push_subscriptions')
        .where('enabled', '==', true)
        .get();

      const subs = snap.docs.map(d => {
        const { endpoint, keys } = d.data() || {};
        return endpoint && keys ? { endpoint, keys } : null;
      }).filter(Boolean);

      if (!subs.length) {
        return res.json({ ok: true, sent: 0, failed: 0, results: [], note: 'sem subs ativas' });
      }

      const payload = {
        title, body, url, tag,
        icon:  icon  || '/icons/icon-192x192.png',
        badge: badge || '/icons/badge-72x72.png',
        badgeCount,
        meta
      };

      const out = await sendWebPushToSubs(subs, payload);
      return res.json(out);

    } catch (err) {
      console.error('[notify]', err);
      return res.status(500).json({ ok: false, error: String(err?.message || err) });
    }
  });

// ------------------------------------------------------------
// Firestore Trigger: espelha coleção "mensagens"
// Quando criar um doc em mensagens, envia push só para o DESTINATÁRIO (userId).
// Campos esperados no doc de mensagens (ajuste aos seus nomes reais):
//   userId (destinatário), conteudo, remetenteNome, type, ticketId, url
// Cria/atualiza: pushed, pushStatus{sent,failed,error,at} no próprio doc.
// ------------------------------------------------------------
exports.onMensagemCreated = functions
  .region('us-central1')
  .firestore
  .document('mensagens/{mensagemId}')
  .onCreate(async (snap, ctx) => {
    try {
      const msg = snap.data() || {};
      const {
        userId,                 // DESTINATÁRIO (obrigatório para endereçar)
        conteudo = '',
        remetenteNome = 'Sistema',
        type = 'mensagem',
        ticketId = null,
        url: urlDoDoc
      } = msg;

      if (!userId) {
        console.warn('[onMensagemCreated] mensagem sem userId', ctx.params.mensagemId);
        return snap.ref.update({
          pushed: false,
          pushStatus: {
            error: 'mensagem sem userId',
            at: admin.firestore.FieldValue.serverTimestamp()
          }
        });
      }

      // Título/corpo (ajuste livre)
      const title = (type === 'status_update')
        ? 'Atualização de status'
        : `Nova mensagem de ${remetenteNome}`;
      const body = String(conteudo || '').slice(0, 180);
      const url  = urlDoDoc || (ticketId ? `/tickets/${ticketId}` : '/');

      // Subscriptions ativas do destinatário
      const db = admin.firestore();
      const q = await db.collection('push_subscriptions')
        .where('userId', '==', userId)
        .where('enabled', '==', true)
        .get();

      const subs = q.docs.map(d => {
        const { endpoint, keys } = d.data() || {};
        return endpoint && keys ? { endpoint, keys } : null;
      }).filter(Boolean);

      if (!subs.length) {
        console.log(`[onMensagemCreated] sem subs ativas para userId=${userId}`);
        await snap.ref.update({
          pushed: false,
          pushStatus: {
            sent: 0,
            failed: 0,
            error: 'sem subs ativas',
            at: admin.firestore.FieldValue.serverTimestamp()
          }
        });
        return null;
      }

      const payload = {
        title,
        body,
        url,
        tag: `msg-${userId}`,
        icon:  '/icons/icon-192x192.png',
        badge: '/icons/badge-72x72.png',
        badgeCount: 1,
        meta: { type, ticketId, mensagemId: ctx.params.mensagemId }
      };

      const out = await sendWebPushToSubs(subs, payload);

      await snap.ref.update({
        pushed: true,
        pushStatus: {
          sent: out.sent,
          failed: out.failed,
          at: admin.firestore.FieldValue.serverTimestamp()
        }
      });

      console.log(`[onMensagemCreated] push -> userId=${userId}`, out);
      return null;

    } catch (err) {
      console.error('[onMensagemCreated] erro', err);
      try {
        await snap.ref.update({
          pushed: false,
          pushStatus: {
            error: String(err?.message || err),
            at: admin.firestore.FieldValue.serverTimestamp()
          }
        });
      } catch (_) {}
      return null;
    }
  });
