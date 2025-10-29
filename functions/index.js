// functions/index.js
const functions = require('firebase-functions');
const admin = require('firebase-admin');
const webpush = require('web-push');

admin.initializeApp();

// --- CORS ---
const ALLOWED_ORIGINS = [
  'https://www.sistemastands.com.br',
  'https://sistemastands.com.br',
  'https://gestao-chamados-stands2-git-main-cleiton-nascimentos-projects.vercel.app',
  'http://localhost:5173'
];

function setCors(res, origin) {
  res.set({
    'Access-Control-Allow-Origin': origin,
    'Vary': 'Origin',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  });
}

// --- VAPID ---
const cfg = functions.config().messaging || {};
if (!cfg.vapid_subject || !cfg.vapid_public_key || !cfg.vapid_private_key) {
  console.warn('[notify] VAPID ausente nas config de functions.');
}
try {
  webpush.setVapidDetails(
    cfg.vapid_subject || 'mailto:example@example.com',
    cfg.vapid_public_key || '',
    cfg.vapid_private_key || ''
  );
} catch (e) {
  console.warn('[notify] setVapidDetails falhou:', e.message);
}

// util: dispara web push para várias subs
async function sendWebPushToSubs(subDocs, payload) {
  const results = await Promise.allSettled(
    subDocs.map(d => {
      const { endpoint, keys } = d.data();
      return webpush.sendNotification({ endpoint, keys }, JSON.stringify(payload));
    })
  );

  // remover docs inválidos (Gone/Not Found)
  const toDelete = [];
  results.forEach((r, i) => {
    if (r.status === 'rejected') {
      const code = r.reason?.statusCode;
      if (code === 404 || code === 410) {
        toDelete.push(subDocs[i].ref);
      }
    }
  });
  if (toDelete.length) {
    const batch = admin.firestore().batch();
    toDelete.forEach(ref => batch.delete(ref));
    await batch.commit();
  }

  return {
    ok: true,
    sent: results.filter(r => r.status === 'fulfilled').length,
    failed: results.filter(r => r.status === 'rejected').length,
    results: results.map(r => (r.status === 'fulfilled' ? 'ok' : (r.reason?.message || 'error')))
  };
}

// HTTP: POST /notify
exports.notify = functions.region('us-central1').https.onRequest(async (req, res) => {
  // CORS
  const origin = req.headers.origin || '';
  const allow = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  setCors(res, allow);

  if (req.method === 'OPTIONS') {
    return res.status(204).send('');
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'method not allowed' });
  }

  try {
    // body pode vir string em alguns casos
    let body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch (_) {}
    }
    const { title = 'Notificação', body: msg = 'Olá!', url = '/', tag = 'default', badgeCount } = body || {};

    // lê subscriptions
    const snap = await admin.firestore()
      .collection('push_subscriptions')
      .where('enabled', '==', true)
      .get();

    if (snap.empty) {
      return res.json({ ok: true, sent: 0, failed: 0, results: [] });
    }

    const payload = { title, body: msg, url, tag, badgeCount };
    const out = await sendWebPushToSubs(snap.docs, payload);
    return res.json(out);

  } catch (err) {
    console.error('[notify]', err);
    return res.status(500).json({ ok: false, error: String(err?.message || err) });
  }
});
