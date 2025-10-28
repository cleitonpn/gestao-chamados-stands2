// /api/push/notify.mjs
// Atualizado para a API v1 (HTTP) usando firebase-admin/messaging

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';

function initAdmin() {
  if (getApps().length) return;
  
  const raw = process.env.FIREBASE_ADMIN_JSON;
  if (!raw) throw new Error('FIREBASE_ADMIN_JSON não configurado');
  
  let json;
  try {
    json = JSON.parse(raw);
  } catch (e) {
    throw new Error('FIREBASE_ADMIN_JSON inválido (JSON inválido).');
  }

  // Corrige a formatação da chave privada (problema de \n)
  if (json.private_key) {
    json.private_key = json.private_key.replace(/\\n/g, '\n');
  }

  initializeApp({ credential: cert(json) });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method not allowed' });

  try {
    // A API v1 usa o Admin SDK, não precisamos mais da FCM_SERVER_KEY
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

    // Este é o novo payload para a API v1 (via Admin SDK)
    const payload = {
      notification: {
        title: (req.body?.title || 'Broadcast'),
        body: (req.body?.body || 'Ping'),
      },
      webpush: {
        fcm_options: {
          // A 'click_action' agora fica dentro de 'webpush.fcm_options.link'
          link: req.body?.url || undefined,
        },
      },
      tokens: tokens, // A lista de tokens
    };

    // Usando a função sendMulticast (envio em lote) do Admin SDK
    const messaging = getMessaging();
    const response = await messaging.sendMulticast(payload);

    const sent = response.successCount;
    const failed = response.failureCount;

    // Log para falhas (se houver)
    if (failed > 0) {
      response.responses.forEach((resp, idx) => {
        if (!resp.success) {
          console.error(`[notify] Falha ao enviar para ${tokens[idx]}:`, resp.error);
        }
      });
    }

    return res.status(200).json({ ok: true, sent, failed, raw: response });
  } catch (e) {
    console.error('[notify] error', e);
    return res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
}
