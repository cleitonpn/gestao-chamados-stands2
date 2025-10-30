// functions/index.js  (CommonJS)
const functions = require('firebase-functions');
const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();
const messaging = admin.messaging();

const REGION = 'us-central1';
const ICON  = '/icons/icon-192x192.png';
const BADGE = '/icons/badge-72x72.png';

// ---------------------------------------------------------
// Util: extrai o token FCM do endpoint do Web Push do FCM
// ex: https://fcm.googleapis.com/fcm/send/<TOKEN>
// ---------------------------------------------------------
function tokenFromEndpoint(endpoint) {
  if (typeof endpoint !== 'string') return '';
  const parts = endpoint.split('/send/');
  return parts[1] || '';
}

// ---------------------------------------------------------
// Util: busca inscrições (push_subscriptions) de 1 usuário
// retorna pares { token, ref } para permitir limpeza
// ---------------------------------------------------------
async function getUserTokensWithRefs(userId) {
  const out = [];
  if (!userId) return out;

  const snap = await db
    .collection('push_subscriptions')
    .where('userId', '==', userId)
    .where('enabled', '==', true)
    .get();

  snap.forEach(doc => {
    const endpoint = doc.get('endpoint');
    const token = tokenFromEndpoint(endpoint);
    if (token) out.push({ token, ref: doc.ref });
  });

  return out;
}

// ---------------------------------------------------------
// Util: envia em lotes e faz limpeza de tokens inválidos
// ---------------------------------------------------------
async function sendToTokens(pairs, payload) {
  if (!pairs.length) return { sent: 0, failed: 0, results: [] };

  const tokens = pairs.map(p => p.token);

  const message = {
    tokens,
    data: {
      url: payload.url || '/',
      tag: payload.tag || 'default',
    },
    webpush: {
      notification: {
        title: payload.title || 'Notificação',
        body: payload.body || '',
        icon: payload.icon || ICON,
        badge: payload.badge || BADGE,
        tag: payload.tag || 'default',
        renotify: !!payload.renotify,
      },
      fcmOptions: { link: payload.url || '/' },
    },
  };

  const resp = await messaging.sendEachForMulticast(message);

  // limpa tokens inválidos
  const NEED_DISABLE = new Set([
    'messaging/invalid-registration-token',
    'messaging/registration-token-not-registered',
  ]);

  await Promise.all(
    resp.responses.map(async (r, i) => {
      if (r.error && NEED_DISABLE.has(r.error.code) && pairs[i]?.ref) {
        try {
          await pairs[i].ref.update({ enabled: false, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
        } catch (_) {}
      }
    })
  );

  return {
    sent: resp.successCount,
    failed: resp.failureCount,
    results: resp.responses.map(r => (r.error ? r.error.message : 'ok')),
  };
}

// ---------------------------------------------------------
// HTTP manual (broadcast): POST /notify
// body: { title, body, url, tag }
// ---------------------------------------------------------
exports.notify = functions.region(REGION).https.onRequest(async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'method not allowed' });
  }

  try {
    const { title = 'Notificação', body = 'Mensagem', url = '/', tag = 'default' } = req.body || {};

    // busca TODAS as inscrições ativas
    const snap = await db.collection('push_subscriptions').where('enabled', '==', true).get();
    const pairs = [];
    snap.forEach(doc => {
      const t = tokenFromEndpoint(doc.get('endpoint'));
      if (t) pairs.push({ token: t, ref: doc.ref });
    });

    if (!pairs.length) {
      return res.json({ ok: true, sent: 0, failed: 0, results: [] });
    }

    const out = await sendToTokens(pairs, { title, body, url, tag });
    return res.json({ ok: true, ...out });
  } catch (e) {
    console.error('[notify]', e);
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// ---------------------------------------------------------
// TRIGGER: quando criar um doc em `mensagens`
// Envia push para:
//  - `userId` (destinatário atual da sua coleção);
//  - `destinatarioId` (se existir);
//  - todos em `destinatarios` (array), se existir;
//  - **remetente** quando existir `remetenteId` OU `senderId` OU `createdBy`.
// ---------------------------------------------------------
exports.onMensagemCreated = functions
  .region(REGION)
  .firestore.document('mensagens/{mensagemId}')
  .onCreate(async (snap, ctx) => {
    try {
      const data = snap.data() || {};

      // monta payload
      const payload = {
        title: data.titulo || 'Mensagem',
        body: data.conteudo || '',
        url: data.url || '/',
        tag: data.type || 'mensagem',
      };

      // coleta UIDs únicos
      const uidSet = new Set();

      // destinatário "oficial" do seu schema atual
      if (typeof data.userId === 'string' && data.userId) uidSet.add(data.userId);

      // compatibilidade com outros campos
      if (typeof data.destinatarioId === 'string' && data.destinatarioId) uidSet.add(data.destinatarioId);
      if (Array.isArray(data.destinatarios)) {
        for (const u of data.destinatarios) {
          if (typeof u === 'string' && u) uidSet.add(u);
        }
      }

      // remetente (enviar para ambos)
      const maybeSender =
        data.remetenteId || data.senderId || data.createdBy || null;
      if (typeof maybeSender === 'string' && maybeSender) uidSet.add(maybeSender);

      // nada para enviar?
      if (!uidSet.size) {
        console.log('[onMensagemCreated] nenhum userId/destinatário encontrado.');
        return null;
      }

      // busca tokens de todos os usuários
      const tokenPairs = [];
      for (const uid of uidSet) {
        const pairs = await getUserTokensWithRefs(uid);
        tokenPairs.push(...pairs);
      }

      // deduplica tokens
      const seen = new Set();
      const dedupPairs = [];
      for (const p of tokenPairs) {
        if (!seen.has(p.token)) {
          seen.add(p.token);
          dedupPairs.push(p);
        }
      }

      if (!dedupPairs.length) {
        console.log('[onMensagemCreated] sem tokens ativos.');
        return null;
      }

      const out = await sendToTokens(dedupPairs, payload);
      console.log('[onMensagemCreated] resultado:', out);
      return null;
    } catch (e) {
      console.error('[onMensagemCreated] erro:', e);
      return null;
    }
  });
