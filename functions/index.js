// functions/index.js  (CommonJS)
const functions = require('firebase-functions');
const admin = require('firebase-admin');

admin.initializeApp();
const db = admin.firestore();

const REGION = 'us-central1';

// -----------------------
// Helpers
// -----------------------
async function getFcmTokensByUserIds(userIds = []) {
  if (!userIds.length) return [];

  // Firestore 'in' aceita no máx 10 itens; então fatiamos se passar.
  const chunks = [];
  for (let i = 0; i < userIds.length; i += 10) {
    chunks.push(userIds.slice(i, i + 10));
  }

  const tokens = [];
  for (const group of chunks) {
    const snap = await db.collection('push_subscriptions')
      .where('enabled', '==', true)
      .where('userId', 'in', group)
      .get();

    snap.forEach(doc => {
      const endpoint = doc.get('endpoint') || '';
      // tokens FCM ficam após '/send/' no endpoint do FCM
      const pieces = endpoint.split('/send/');
      const token = pieces[1] || '';
      if (token) tokens.push(token);
    });
  }
  // remove duplicados
  return [...new Set(tokens)];
}

async function sendFcm(tokens, payload) {
  if (!tokens.length) return { successCount: 0, failureCount: 0, responses: [] };
  const resp = await admin.messaging().sendEachForMulticast({
    tokens,
    data: { url: payload.url || '/' }, // útil no click
    webpush: {
      notification: {
        title: payload.title || 'Notificação',
        body: payload.body || '',
        icon: payload.icon || '/icons/icon-192.png',
        badge: payload.badge || '/icons/badge.png',
        tag: payload.tag || 'default',
        renotify: !!payload.renotify,
      },
      fcmOptions: { link: payload.url || '/' },
    },
  });
  return resp;
}

// -----------------------
// HTTP: Broadcast manual
// -----------------------
exports.notify = functions.region(REGION).https.onRequest(async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'method not allowed' });
  }
  try {
    const { title = 'Notificação', body = 'Mensagem', url = '/' } = req.body || {};
    // pega TODOS os tokens enabled
    const snap = await db.collection('push_subscriptions').where('enabled', '==', true).get();
    const tokens = [];
    snap.forEach(doc => {
      const endpoint = doc.get('endpoint') || '';
      const pieces = endpoint.split('/send/');
      const token = pieces[1] || '';
      if (token) tokens.push(token);
    });

    const resp = await sendFcm([...new Set(tokens)], { title, body, url, tag: 'broadcast' });
    return res.json({
      ok: true,
      sent: resp.successCount,
      failed: resp.failureCount,
      results: resp.responses.map(r => (r.error ? r.error.message : 'ok')),
    });
  } catch (e) {
    console.error('[notify] error:', e);
    return res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

// -----------------------
// Firestore → mensagens
// Envia push para REMETENTE e DESTINATÁRIO
// -----------------------
exports.onMensagemCreated = functions
  .region(REGION)
  .firestore
  .document('mensagens/{mensagemId}')
  .onCreate(async (snap, ctx) => {
    try {
      const msg = snap.data() || {};
      const {
        conteudo = '',
        ticketId = '',
        remetenteNome = 'Usuário',
        userId: remetenteId = null,        // quem escreveu
        destinatarioId: destinatarioIdRaw, // se existir no doc
      } = msg;

      // Descobrir destinatário se não veio no doc:
      // fallback: criador do chamado
      let destinatarioId = destinatarioIdRaw || null;
      if (!destinatarioId && ticketId) {
        const ticketRef = db.collection('chamados').doc(ticketId);
        const ticketSnap = await ticketRef.get();
        if (ticketSnap.exists) {
          const t = ticketSnap.data() || {};
          // seu modelo usa 'criadoPor' no ticket (criador do chamado). :contentReference[oaicite:1]{index=1}
          if (t.criadoPor) destinatarioId = t.criadoPor;
        }
      }

      // Monta a lista de usuários que DEVEM receber:
      // - remetente (espelhar pra ele ver a própria msg chegar)
      // - destinatário (se conhecido)
      const alvoIds = new Set();
      if (remetenteId) alvoIds.add(remetenteId);
      if (destinatarioId) alvoIds.add(destinatarioId);

      if (!alvoIds.size) {
        console.log('[onMensagemCreated] ninguém para notificar (sem userIds).');
        return null;
      }

      const tokens = await getFcmTokensByUserIds([...alvoIds]);
      if (!tokens.length) {
        console.log('[onMensagemCreated] sem tokens FCM para', [...alvoIds]);
        return null;
      }

      const url = ticketId ? `/chamado/${ticketId}` : '/';
      const body = conteudo.length > 120 ? conteudo.slice(0, 117) + '…' : conteudo;

      const resp = await sendFcm(tokens, {
        title: `Nova mensagem de ${remetenteNome}`,
        body,
        url,
        tag: ticketId || 'mensagem',
      });

      console.log('[onMensagemCreated] push => sent:', resp.successCount, 'failed:', resp.failureCount);
      return null;
    } catch (e) {
      console.error('[onMensagemCreated] erro:', e);
      return null;
    }
  });
