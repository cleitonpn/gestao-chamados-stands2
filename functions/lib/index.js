// functions/index.js
import * as functions from 'firebase-functions';
import admin from 'firebase-admin';
import webpush from 'web-push';

admin.initializeApp();

const cfg = functions.config().messaging;
webpush.setVapidDetails(
  cfg.vapid_subject,           // ex: "mailto:voce@dominio.com"
  cfg.vapid_public_key,
  cfg.vapid_private_key
);

// Envia Web Push para um array de PushSubscriptions
async function sendWebPushToSubs(subs, payload) {
  const results = await Promise.allSettled(
    subs.map((sub) => webpush.sendNotification(sub, JSON.stringify(payload)))
  );
  return {
    ok: true,
    sent: results.filter(r => r.status === 'fulfilled').length,
    failed: results.filter(r => r.status === 'rejected').length,
    results: results.map(r => r.status === 'fulfilled' ? 'ok' : r.reason?.message || 'error')
  };
}

// Exemplo de endpoint HTTP que lê subscriptions e envia:
export const notify = functions.https.onRequest(async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ ok:false, error:'method not allowed' });

  try {
    const { title='Notificação', body='Olá!', url='/' } = req.body || {};

    // 1) Obter as subscriptions (ex.: todas ativas em push_subscriptions)
    const snap = await admin.firestore().collection('push_subscriptions')
      .where('enabled', '==', true).get();

    const subs = snap.docs.map(d => {
      const { endpoint, keys } = d.data();
      return { endpoint, keys };
    });

    if (!subs.length) return res.json({ ok:true, sent:0, failed:0, results:[] });

    // 2) Montar payload exibido pelo seu SW
    const payload = {
      title,
      body,
      url, // seu SW usa notification.data.url
      tag: 'default'
    };

    // 3) Enviar via Web Push
    const out = await sendWebPushToSubs(subs, payload);
    return res.json(out);

  } catch (err) {
    console.error('[notify]', err);
    return res.status(500).json({ ok:false, error: String(err?.message || err) });
  }
});
