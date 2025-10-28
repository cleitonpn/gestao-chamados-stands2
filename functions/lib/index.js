// functions/index.js
import * as functions from 'firebase-functions';
import admin from 'firebase-admin';
import webpush from 'web-push';

admin.initializeApp();

// Se seu projeto usa southamerica-east1, defina aqui:
const region = 'southamerica-east1';

const cfg = functions.config().messaging;
if (!cfg?.vapid_subject || !cfg?.vapid_public_key || !cfg?.vapid_private_key) {
  console.error('[init] VAPID config ausente. Rode: firebase functions:config:set ...');
}

webpush.setVapidDetails(
  cfg.vapid_subject,      // ex: "mailto:voce@dominio.com"
  cfg.vapid_public_key,
  cfg.vapid_private_key
);

// Envia Web Push para um array de PushSubscriptions
async function sendWebPushToSubs(subs, payload) {
  const results = await Promise.allSettled(
    subs.map((sub) => webpush.sendNotification(sub, JSON.stringify(payload)))
  );

  // Opcional: remover inscrições inválidas (410/404)
  const toDelete = [];
  results.forEach((r, idx) => {
    if (r.status === 'rejected') {
      const msg = String(r.reason?.message || '');
      if (msg.includes('410') || msg.includes('404') || msg.includes('not found')) {
        // marcar para remoção pelo endpoint
        toDelete.push(subs[idx].endpoint);
      }
    }
  });

  if (toDelete.length) {
    const batch = admin.firestore().batch();
    const snap = await admin.firestore().collection('push_subscriptions').get();
    snap.docs.forEach((doc) => {
      const d = doc.data();
      if (toDelete.includes(d.endpoint)) batch.delete(doc.ref);
    });
    await batch.commit().catch(() => {});
  }

  return {
    ok: true,
    sent: results.filter(r => r.status === 'fulfilled').length,
    failed: results.filter(r => r.status === 'rejected').length,
    results: results.map(r => (r.status === 'fulfilled' ? 'ok' : (r.reason?.message || 'error'))),
  };
}

// Endpoint HTTP para disparo manual: POST /notify
export const notify = functions.region(region).https.onRequest(async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method not allowed' });

  try {
    const { title = 'Notificação', body = 'Olá!', url = '/', tag = 'default' } = req.body || {};

    // 1) Buscar subscriptions ativas
    const snap = await admin.firestore()
      .collection('push_subscriptions')
      .where('enabled', '==', true)
      .get();

    const subs = snap.docs.map((d) => {
      const { endpoint, keys } = d.data();
      return { endpoint, keys };
    });

    if (!subs.length) return res.json({ ok: true, sent: 0, failed: 0, results: [] });

    // 2) Payload que seu SW irá exibir (firebase-messaging-sw.js)
    const payload = { title, body, url, tag };

    // 3) Enviar via Web Push
    const out = await sendWebPushToSubs(subs, payload);
    return res.json(out);
  } catch (err) {
    console.error('[notify]', err);
    return res.status(500).json({ ok: false, error: String(err?.message || err) });
  }
});
