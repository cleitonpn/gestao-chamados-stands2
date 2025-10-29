// functions/index.js (CommonJS)
const functions = require('firebase-functions');
const admin = require('firebase-admin');
const webpush = require('web-push');

admin.initializeApp();

// ---------- Config ----------
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

// Domínios permitidos p/ CORS (ajuste se tiver novos ambientes)
const ALLOWED_ORIGINS = [
  'https://gestao-chamados-stands2.vercel.app',
  'https://gestao-chamados-stands2-git-main-cleiton-nascimentos-projects.vercel.app',
  'http://localhost:5173',
];

// ---------- Helpers ----------
function setCors(req, res) {
  const origin = req.headers.origin || '';
  const allowed = ALLOWED_ORIGINS.find((o) => origin.startsWith(o));
  if (allowed) {
    res.set('Access-Control-Allow-Origin', allowed);
  } else {
    // Para teste rápido, você pode liberar geral comentando acima e usando:
    // res.set('Access-Control-Allow-Origin', '*');
  }
  res.set('Vary', 'Origin');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
}

async function getEnabledSubscriptions() {
  const snap = await admin.firestore()
    .collection('push_subscriptions')
    .where('enabled', '==', true)
    .get();

  const subs = [];
  snap.forEach((doc) => {
    const data = doc.data() || {};
    if (data.endpoint && data.keys && data.keys.p256dh && data.keys.auth) {
      subs.push({ id: doc.id, endpoint: data.endpoint, keys: data.keys });
    }
  });
  return subs;
}

// Envia web push e remove do Firestore as subs inválidas (404/410)
async function sendWebPushToSubs(subs, payload) {
  const results = await Promise.allSettled(
    subs.map((sub) => webpush.sendNotification(sub, JSON.stringify(payload)))
  );

  const toDelete = [];
  const mapped = results.map((r, i) => {
    if (r.status === 'fulfilled') return 'ok';
    const err = r.reason;
    const code = err?.statusCode || err?.status || 0;
    // 404/410 -> inscrição inválida/expirada
    if (code === 404 || code === 410) toDelete.push(subs[i].id);
    return err?.message || `error ${code}`;
  });

  // limpeza assíncrona (não bloqueia a resposta)
  if (toDelete.length) {
    const batch = admin.firestore().batch();
    toDelete.forEach((id) =>
      batch.update(admin.firestore().collection('push_subscriptions').doc(id), {
        enabled: false,
        disabledAt: admin.firestore.FieldValue.serverTimestamp(),
        reason: 'gone',
      })
    );
    batch.commit().catch((e) => console.warn('[cleanup] batch commit error', e?.message));
  }

  return {
    ok: true,
    sent: results.filter((r) => r.status === 'fulfilled').length,
    failed: results.filter((r) => r.status === 'rejected').length,
    results: mapped,
    cleaned: toDelete.length,
  };
}

// ---------- HTTP: POST /notify ----------
exports.notify = functions.region('us-central1').https.onRequest(async (req, res) => {
  setCors(req, res);

  // Preflight
  if (req.method === 'OPTIONS') {
    return res.status(204).send('');
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'method not allowed' });
  }

  try {
    const {
      title = 'Notificação',
      body = 'Olá!',
      url = '/',
      tag = 'default',
      icon = '/icons/icon-192x192.png',
      badge = '/icons/badge-72x72.png',
      // você pode passar outros campos e o SW usa no click:
      meta = null,
    } = req.body || {};

    const subs = await getEnabledSubscriptions();
    if (!subs.length) {
      return res.json({ ok: true, sent: 0, failed: 0, results: [], cleaned: 0 });
    }

    const payload = { title, body, url, tag, icon, badge, meta };
    const out = await sendWebPushToSubs(subs, payload);
    return res.json(out);
  } catch (err) {
    console.error('[notify]', err);
    return res.status(500).json({ ok: false, error: String(err?.message || err) });
  }
});
