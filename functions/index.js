// functions/index.js (CommonJS)
const functions = require('firebase-functions');
const admin = require('firebase-admin');
const webpush = require('web-push');

admin.initializeApp();

// ---- Config VAPID vinda do functions:config:set messaging.*  ----
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

// ---- helpers ---------------------------------------------------
async function sendWebPushToSubs(subDocsOrSubs, payload) {
  // Aceita array de docs do Firestore OU array de objetos {endpoint, keys, id}
  const items = subDocsOrSubs.map((it) => {
    if (it?.data) {
      const d = it.data();
      return { id: it.id, ref: it.ref, endpoint: d.endpoint, keys: d.keys };
    }
    return it; // já no formato {endpoint, keys, id}
  });

  const results = await Promise.allSettled(
    items.map((sub) => webpush.sendNotification(sub, JSON.stringify(payload)))
  );

  // Limpeza de inscrições inválidas (404/410)
  const toDelete = [];
  results.forEach((r, i) => {
    if (r.status === 'rejected') {
      const code = r.reason?.statusCode || r.reason?.status || 0;
      if ((code === 404 || code === 410) && items[i].ref) {
        toDelete.push(items[i].ref.delete().catch(() => {}));
      }
    }
  });
  if (toDelete.length) await Promise.allSettled(toDelete);

  return {
    ok: true,
    sent: results.filter(r => r.status === 'fulfilled').length,
    failed: results.filter(r => r.status === 'rejected').length,
    results: results.map(r =>
      r.status === 'fulfilled' ? 'ok' : (r.reason?.message || 'error')
    ),
  };
}

// ---- HTTP: broadcast manual (continua em us-central1) ----------
exports.notify = functions.region('us-central1').https.onRequest(async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'method not allowed' });
  }

  try {
    const { title = 'Notificação', body = 'Olá!', url = '/' } = req.body || {};

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

// ---- Firestore trigger: mensagens -> push para o DESTINATÁRIO ----
// Atenção à região: igual à do banco (sua tela mostra southamerica-east1)
exports.onMensagemCreate = functions
  .region('southamerica-east1')
  .firestore.document('mensagens/{id}')
  .onCreate(async (snap, context) => {
    const msg = snap.data() || {};
    const uid = msg.userId || msg.uid || null; // destinatário

    if (!uid) {
      console.warn('[onMensagemCreate] Sem userId no documento', context.params.id);
      return;
    }

    // Monte o payload que seu SW entende
    const title = msg.titulo || msg.title || `Nova mensagem`;
    // Preferi usar "conteudo" como body; ajuste ao seu padrão
    const body  = msg.conteudo || msg.body || `${msg.remetenteNome || 'Sistema'}`;
    // URL que você quer abrir ao clicar (ex: ir pro ticket)
    const url   = msg.url || (msg.ticketId ? `/tickets/${msg.ticketId}` : '/');
    const tag   = msg.type || 'mensagem';

    const payload = {
      title, body, url, tag,
      // pode repassar mais dados (ícone, badge, meta…):
      // icon: '/icons/icon-192x192.png',
      // badge: '/icons/badge-72x72.png',
      // meta: { ticketId: msg.ticketId }
    };

    // Buscar inscrições desse usuário
    const subsSnap = await admin.firestore()
      .collection('push_subscriptions')
      .where('userId', '==', uid)
      .where('enabled', '==', true)
      .get();

    if (subsSnap.empty) {
      await snap.ref.update({
        push: { sent: 0, failed: 0, when: admin.firestore.FieldValue.serverTimestamp() }
      });
      return;
    }

    const out = await sendWebPushToSubs(subsSnap.docs, payload);

    // Registrar resultado no próprio doc de mensagem
    await snap.ref.update({
      push: {
        sent: out.sent,
        failed: out.failed,
        when: admin.firestore.FieldValue.serverTimestamp()
      }
    });
  });
