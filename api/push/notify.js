
// /api/push/notify.js (Vercel Edge/Node runtime)
// Envia push em lote para todos os inscritos na coleção `push_subscriptions`.
// Aceita docs com dois formatos:
//   - {kind:'fcm', token}
//   - {kind:'webpush', endpoint, keys}
//
// Para FCM, usa a variável de ambiente FCM_SERVER_KEY (Legacy HTTP API).
// Para WebPush, se quiser suportar também, precisará configurar WEB_PUSH_PUBLIC/PRIVATE_KEY e usar a lib 'web-push'.
// Abaixo, enviamos apenas via FCM. Para webpush puro, extraímos o token do endpoint
// (quando o endpoint é do FCM) por conveniência.
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

function initAdmin() {
  if (getApps().length) return;
  const raw = process.env.FIREBASE_ADMIN_JSON;
  if (!raw) throw new Error('FIREBASE_ADMIN_JSON não configurado');
  const json = JSON.parse(raw);
  initializeApp({ credential: cert(json) });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method not allowed' });

  try {
    const serverKey = process.env.FCM_SERVER_KEY;
    if (!serverKey) return res.status(500).json({ ok: false, error: 'FCM_SERVER_KEY ausente' });

    initAdmin();
    const db = getFirestore();
    const snap = await db.collection('push_subscriptions').get();

    const tokens = [];
    snap.forEach((doc) => {
      const d = doc.data();
      if (d?.kind === 'fcm' && d?.token) tokens.push(d.token);
      else if (d?.endpoint && typeof d.endpoint === 'string' && d.endpoint.includes('/fcm/send/')) {
        const token = d.endpoint.split('/').pop();
        if (token) tokens.push(token);
      }
    });

    if (!tokens.length) return res.status(200).json({ ok: true, sent: 0, failed: 0, reason: 'no-tokens' });

    const payload = {
      notification: {
        title: (req.body?.title || 'Broadcast'),
        body: (req.body?.body || 'Ping'),
        click_action: req.body?.url || undefined,
      },
      registration_ids: tokens,
    };

    const r = await fetch('https://fcm.googleapis.com/fcm/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `key=${serverKey}`,
      },
      body: JSON.stringify(payload),
    });

    const json = await r.json().catch(() => ({}));
    const failed = Array.isArray(json?.results) ? json.results.filter((x) => x.error).length : 0;
    const sent = Array.isArray(json?.results) ? json.results.length - failed : 0;

    return res.status(200).json({ ok: true, sent, failed, raw: json });
  } catch (e) {
    console.error('[notify] error', e);
    return res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
}
