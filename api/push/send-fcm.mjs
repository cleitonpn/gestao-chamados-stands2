// /api/push/send-fcm.mjs
// (Vercel Edge/Node runtime)
// Envia push para UM ÚNICO token FCM.
// Espera { token, title, body, url } no corpo da requisição.

// NOTA: Esta API não precisa do 'firebase-admin' porque não lê o banco,
// ela apenas envia para o FCM usando a chave do servidor.

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'method not allowed' });
  }

  try {
    const serverKey = process.env.FCM_SERVER_KEY;
    if (!serverKey) {
      return res.status(500).json({ ok: false, error: 'FCM_SERVER_KEY ausente' });
    }

    // 1. Obter os dados do corpo da requisição
    const { token, title, body, url } = req.body || {};
    if (!token) {
      return res.status(400).json({ ok: false, error: 'token é obrigatório' });
    }

    // 2. Montar o payload para um ÚNICO token
    //    Usamos 'to' para um token, e 'registration_ids' para múltiplos
    const payload = {
      notification: {
        title: (title || 'Teste (Real)'),
        body: (body || 'Ping do sistema de push'),
        click_action: url || undefined,
      },
      to: token,
    };

    // 3. Enviar para a API do FCM
    const r = await fetch('https://fcm.googleapis.com/fcm/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `key=${serverKey}`,
      },
      body: JSON.stringify(payload),
    });

    const json = await r.json().catch(() => ({}));

    // 4. Verificar falhas
    if (!r.ok || json.failure) {
      console.error('[send-fcm] Falha ao enviar:', json);
      return res.status(500).json({ ok: false, error: 'FCM API error', raw: json });
    }

    return res.status(200).json({ ok: true, sent: json.success, failed: json.failure, raw: json });

  } catch (e) {
    console.error('[send-fcm] error', e);
    return res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
}
