// /api/push/send-fcm.mjs
// Atualizado para a API v1 (HTTP) usando firebase-admin/messaging

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';

// A mesma função de inicialização do 'notify'
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

  if (json.private_key) {
    json.private_key = json.private_key.replace(/\\n/g, '\n');
  }

  initializeApp({ credential: cert(json) });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'method not allowed' });
  }

  try {
    // Não precisamos mais da FCM_SERVER_KEY
    initAdmin(); 

    const { token, title, body, url } = req.body || {};
    if (!token) {
      return res.status(400).json({ ok: false, error: 'token é obrigatório' });
    }

    // Payload para a API v1 (enviando para UM token)
    const payload = {
      notification: {
        title: (title || 'Teste (Real)'),
        body: (body || 'Ping do sistema de push'),
      },
      webpush: {
        fcm_options: {
          link: url || undefined,
        },
      },
      token: token, // 'token' para um único dispositivo
    };

    // Usando a função 'send' do Admin SDK
    const messaging = getMessaging();
    const response = await messaging.send(payload);

    return res.status(200).json({ ok: true, sent: 1, failed: 0, raw: response });

  } catch (e) {
    console.error('[send-fcm] error', e);
    // Erros do Firebase (como token inválido) vêm como exceção
    return res.status(500).json({ 
      ok: false, 
      error: e?.message || String(e), 
      code: e?.code 
    });
  }
}
