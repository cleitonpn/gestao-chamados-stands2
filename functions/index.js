// functions/index.js (CommonJS)
const functions = require('firebase-functions');
const admin = require('firebase-admin');
const webpush = require('web-push');

admin.initializeApp();

// Lê config do Functions (vamos injetar via workflow)
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

// util: dispara web push para várias subs
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

// HTTP: POST /notify
exports.notify = functions.region('us-central1').https.onRequest(async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'method not allowed' });
  }

  try {
    const { title = 'Notificação', body = 'Olá!', url = '/' } = req.body || {};

    // lê subscriptions do Firestore
    const snap = await admin.firestore()
      .collection('push_subscriptions')
      .where('enabled', '==', true)
      .get();

    const subs = snap.docs.map(d => {
      const { endpoint, keys } = d.data();
      return { endpoint, keys };
    });

    if (!subs.length) {
      return res.json({ ok: true, sent: 0, failed: 0, results: [] });
    }

    const payload = { title, body, url, tag: 'default' };
    const out = await sendWebPushToSubs(subs, payload);
    return res.json(out);

  } catch (err) {
    console.error('[notify]', err);
    return res.status(500).json({ ok: false, error: String(err?.message || err) });
  }
});
