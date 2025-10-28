// functions/index.js
const functions = require('firebase-functions');
const admin = require('firebase-admin');
const webpush = require('web-push');

// Init Admin only once
try { admin.app(); } catch { admin.initializeApp(); }

// Load VAPID keys from functions config: messaging.vapid_subject, messaging.vapid_public_key, messaging.vapid_private_key
const cfg = functions.config().messaging || {};
if (cfg.vapid_public_key && cfg.vapid_private_key) {
  webpush.setVapidDetails(cfg.vapid_subject || 'mailto:admin@example.com',
                          cfg.vapid_public_key,
                          cfg.vapid_private_key);
} else {
  console.warn('[functions] VAPID keys not set (functions:config:set messaging.*) — notify endpoints will fail.');
}

// Helper: get push subscriptions (optionally filtered by userId)
async function getSubsForUser(userId = null) {
  let ref = admin.firestore().collection('push_subscriptions').where('enabled', '==', true);
  if (userId) ref = ref.where('userId', '==', userId);

  const snap = await ref.get();
  const subs = snap.docs.map(d => {
    const { endpoint, keys } = d.data() || {};
    return endpoint && keys ? { endpoint, keys } : null;
  }).filter(Boolean);

  return subs;
}

// Helper: send Web Push to an array of subscriptions
async function sendWebPushToSubs(subs, payload) {
  const results = await Promise.allSettled(
    subs.map((sub) => webpush.sendNotification(sub, JSON.stringify(payload)))
  );
  return {
    ok: true,
    sent: results.filter(r => r.status === 'fulfilled').length,
    failed: results.filter(r => r.status === 'rejected').length,
    results: results.map(r => r.status === 'fulfilled' ? 'ok' : (r.reason && r.reason.message) || 'error')
  };
}

// Helper: build a standard payload from a 'mensagens' doc
function buildPayloadFromMessage(data = {}) {
  const title = data.titulo || data.title || 'Atualização';
  const body = data.conteudo || data.mensagem || data.body || 'Você tem uma atualização.';
  const url =
    data.link || data.url ||
    (data.ticketId ? `/chamado/${data.ticketId}` : '/');
  const tag = data.type || data.tipo || 'default';

  return { title, body, url, tag };
}

// HTTP endpoint to manually trigger a broadcast push to all enabled subscriptions
exports.notify = functions.https.onRequest(async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ ok:false, error:'method not allowed' });

  try {
    const { title='Notificação', body='Olá!', url='/' } = req.body || {};
    const subs = await getSubsForUser(null);

    if (!subs.length) return res.json({ ok:true, sent:0, failed:0, results:[] });

    const payload = { title, body, url, tag: 'default' };
    const out = await sendWebPushToSubs(subs, payload);
    return res.json(out);
  } catch (err) {
    console.error('[notify]', err);
    return res.status(500).json({ ok:false, error: String(err && err.message || err) });
  }
});

// Firestore trigger: whenever a document in 'mensagens' is created or updated, send push
exports.onMensagemWrite = functions.firestore
  .document('mensagens/{docId}')
  .onWrite(async (change, context) => {
    // Ignore deletes
    if (!change.after.exists) return null;

    const before = change.before.exists ? change.before.data() : null;
    const after = change.after.data() || {};

    // If no meaningful change, skip
    if (before && JSON.stringify(before) === JSON.stringify(after)) return null;

    // Build payload
    const payload = buildPayloadFromMessage(after);

    // Optional targeting: if the doc has userId, send only to that user; else, broadcast
    const userId = after.userId || null;
    const subs = await getSubsForUser(userId);

    if (!subs.length) {
      console.log('[mensagens] no subscriptions found', { userId });
      return null;
    }

    try {
      const out = await sendWebPushToSubs(subs, payload);
      console.log('[mensagens push]', context.params.docId, out);
    } catch (e) {
      console.error('[mensagens push] error', e);
    }
    return null;
  });
