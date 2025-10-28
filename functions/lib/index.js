// functions/lib/index.js
import * as functions from 'firebase-functions';
import admin from 'firebase-admin';
import webpush from 'web-push';

admin.initializeApp();

const cfg = functions.config().messaging || {};
webpush.setVapidDetails(
  cfg.vapid_subject,
  cfg.vapid_public_key,
  cfg.vapid_private_key
);

// Util: envia Web Push para uma lista de subscriptions (endpoint/keys)
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

// HTTP pública para testes manuais
export const notify = functions
  .runWith({ invoker: 'public' }) // garante acesso público
  .https.onRequest(async (req, res) => {
    if (req.method !== 'POST') {
      return res.status(405).json({ ok: false, error: 'method not allowed' });
    }

    try {
      const { title = 'Notificação', body = 'Olá!', url = '/' } = req.body || {};

      // Busca subscriptions ativas
      const snap = await admin.firestore()
        .collection('push_subscriptions')
        .where('enabled', '==', true)
        .get();

      const subs = snap.docs.map((d) => {
        const { endpoint, keys } = d.data();
        return { endpoint, keys };
      });

      if (!subs.length) {
        return res.json({ ok: true, sent: 0, failed: 0, results: [] });
      }

      // Payload que o SW mostra
      const payload = { title, body, url, tag: 'default' };

      // Dispara
      const out = await sendWebPushToSubs(subs, payload);
      return res.json(out);
    } catch (err) {
      console.error('[notify]', err);
      return res.status(500).json({ ok: false, error: String(err?.message || err) });
    }
  });

// Gatilho automático: quando criar documento em "mensagens"
export const onMensagemCreated = functions.firestore
  .document('mensagens/{msgId}')
  .onCreate(async (snap) => {
    try {
      const msg = snap.data() || {};
      const title = msg.remetenteNome ? `Mensagem de ${msg.remetenteNome}` : 'Nova mensagem';
      const body = msg.conteudo || 'Atualização';
      const url = '/dashboard';

      const subsSnap = await admin.firestore()
        .collection('push_subscriptions')
        .where('enabled', '==', true)
        .get();

      const subs = subsSnap.docs.map((d) => {
        const { endpoint, keys } = d.data();
        return { endpoint, keys };
      });

      if (!subs.length) return null;

      const payload = { title, body, url, tag: 'mensagens' };
      await sendWebPushToSubs(subs, payload);
      return null;
    } catch (err) {
      console.error('[onMensagemCreated]', err);
      return null;
    }
  });
