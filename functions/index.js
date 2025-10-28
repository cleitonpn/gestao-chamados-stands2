// functions/index.js (CommonJS, Gen2 HTTPS)

const { onRequest } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const webpush = require('web-push');

try { admin.app(); } catch { admin.initializeApp(); }

// VAPID via functions:config OU env (fallback)
const cfg = (process.env.MESSAGING__VAPID_SUBJECT && process.env.MESSAGING__VAPID_PUBLIC_KEY)
  ? {
      vapid_subject: process.env.MESSAGING__VAPID_SUBJECT,
      vapid_public_key: process.env.MESSAGING__VAPID_PUBLIC_KEY,
      vapid_private_key: process.env.MESSAGING__VAPID_PRIVATE_KEY,
    }
  : require('firebase-functions').config().messaging || {};

webpush.setVapidDetails(
  cfg.vapid_subject,
  cfg.vapid_public_key,
  cfg.vapid_private_key
);

// Envia web push para várias subscriptions
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

// HTTP: POST /notify  { title, body, url }
exports.notify = onRequest({ region: 'us-central1', cors: true }, async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method not allowed' });

  try {
    const { title='Notificação', body='Olá!', url='/' } = req.body || {};

    // pegar as subscriptions do Firestore
    const snap = await admin.firestore().collection('push_subscriptions')
      .where('enabled', '==', true).get();

    const subs = snap.docs.map(d => {
      const { endpoint, keys } = d.data();
      return { endpoint, keys };
    });

    if (!subs.length) return res.json({ ok: true, sent: 0, failed: 0, results: [] });

    const payload = { title, body, url, tag: 'default' };
    const out = await sendWebPushToSubs(subs, payload);
    return res.json(out);

  } catch (err) {
    console.error('[notify]', err);
    return res.status(500).json({ ok: false, error: String(err?.message || err) });
  }
});
