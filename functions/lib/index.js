// functions/lib/index.js
const functions = require('firebase-functions');
const admin = require('firebase-admin');
const webpush = require('web-push');

try {
  admin.initializeApp();
} catch (_) {
  /* no-op (evita erro em re-loads) */
}

/**
 * Carrega VAPID de env (recomendado) ou de functions.config().messaging (fallback)
 */
function loadVapid() {
  const env = {
    subject: process.env.VAPID_SUBJECT,
    publicKey: process.env.VAPID_PUBLIC_KEY,
    privateKey: process.env.VAPID_PRIVATE_KEY,
  };

  if (env.subject && env.publicKey && env.privateKey) return env;

  // fallback para functions:config, se foi configurado
  const cfg = (functions.config() && functions.config().messaging) || {};
  return {
    subject: env.subject || cfg.vapid_subject || 'mailto:you@example.com',
    publicKey: env.publicKey || cfg.vapid_public_key || '',
    privateKey: env.privateKey || cfg.vapid_private_key || '',
  };
}

const { subject, publicKey, privateKey } = loadVapid();
webpush.setVapidDetails(subject, publicKey, privateKey);

/** Valida se a subscription tem os campos mínimos */
function isValidSub(s) {
  return (
    s &&
    typeof s.endpoint === 'string' &&
    s.keys &&
    typeof s.keys.auth === 'string' &&
    typeof s.keys.p256dh === 'string'
  );
}

/** Busca subscriptions (todas enabled=true). Se userId for passado, filtra em memória. */
async function getSubscriptions(userId = null) {
  const snap = await admin.firestore().collection('push_subscriptions')
    .where('enabled', '==', true)
    .get();

  let subs = snap.docs.map(d => d.data()).filter(isValidSub);

  if (userId) {
    subs = subs.filter(s => s.userId === userId);
  }
  return subs.map(({ endpoint, keys }) => ({ endpoint, keys }));
}

/** Envia web push para um conjunto de subscriptions */
async function sendWebPushToSubs(subs, payload) {
  const results = await Promise.allSettled(
    subs.map((sub) => webpush.sendNotification(sub, JSON.stringify(payload)))
  );
  const sent   = results.filter(r => r.status === 'fulfilled').length;
  const failed = results.filter(r => r.status === 'rejected').length;

  return {
    ok: true,
    sent,
    failed,
    results: results.map(r =>
      r.status === 'fulfilled' ? 'ok' : (r.reason?.message || 'error')
    ),
  };
}

/**
 * HTTP: POST /notify
 * body: { title, body, url, userId? }
 * - Se userId for informado, tenta enviar só para as subscriptions desse usuário;
 *   caso contrário, envia para todos habilitados.
 */
exports.notify = functions
  .region('us-central1')
  .https.onRequest(async (req, res) => {
    if (req.method !== 'POST') {
      return res.status(405).json({ ok: false, error: 'method not allowed' });
    }

    try {
      const { title = 'Notificação', body = 'Olá!', url = '/', userId = null } =
        (req.body || {});

      const subs = await getSubscriptions(userId);
      if (!subs.length) {
        return res.json({
          ok: true,
          sent: 0,
          failed: 0,
          results: [],
          note: 'no subscriptions',
        });
      }

      const payload = { title, body, url, tag: 'default' };
      const out = await sendWebPushToSubs(subs, payload);
      return res.json(out);
    } catch (err) {
      console.error('[notify]', err);
      return res
        .status(500)
        .json({ ok: false, error: String(err?.message || err) });
    }
  });

/**
 * Firestore trigger: envia push quando **um novo documento é criado** em `mensagens/{msgId}`
 * Campos esperados no doc (flexível):
 * - conteudo (string) → exibido no body
 * - ticketId (string) → usado para montar a URL /chamado/{ticketId}
 * - userId (string | opcional) → se existir, tenta enviar somente para esse usuário
 * - title (opcional) → título customizado
 */
exports.onMensagemCreated = functions
  .region('us-central1')
  .firestore.document('mensagens/{msgId}')
  .onCreate(async (snap, context) => {
    try {
      const data = snap.data() || {};
      const title = data.title || 'Nova atualização';
      const body  = data.conteudo || 'Você tem uma nova mensagem.';
      const url   = data.ticketId ? `/chamado/${data.ticketId}` : '/dashboard';
      const userId = data.userId || null;

      const subs = await getSubscriptions(userId);
      if (!subs.length) {
        console.log('[onMensagemCreated] no subscriptions; skip');
        return null;
      }

      const payload = { title, body, url, tag: 'mensagem' };
      const out = await sendWebPushToSubs(subs, payload);

      console.log('[onMensagemCreated] result:', out);
      return null;
    } catch (err) {
      console.error('[onMensagemCreated] error:', err);
      return null;
    }
  });
