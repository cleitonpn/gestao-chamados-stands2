// api/push/send.mjs
import webpush from 'web-push';

// opcional: pode remover; por padrão já é Node
export const config = { runtime: 'nodejs' };

function envOrNull(name) { return process.env[name] || null; }

async function readJsonBody(req) {
  // Vercel costuma preencher req.body se Content-Type=application/json,
  // mas garantimos aqui mesmo assim.
  if (req.body) return req.body;
  let data = '';
  for await (const chunk of req) data += chunk;
  try { return JSON.parse(data || '{}'); } catch { return {}; }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ ok:false, error:'Method not allowed', method:req.method });
    return;
  }

  try {
    const body = await readJsonBody(req);
    const { subscription, payload } = body || {};

    // 🔎 Lê ENVs *dentro* do handler e checa faltas
    const VAPID_SUBJECT = envOrNull('VAPID_SUBJECT');
    const VAPID_PUBLIC_KEY = envOrNull('VAPID_PUBLIC_KEY');
    const VAPID_PRIVATE_KEY = envOrNull('VAPID_PRIVATE_KEY');

    const missing = [];
    if (!VAPID_SUBJECT) missing.push('VAPID_SUBJECT');
    if (!VAPID_PUBLIC_KEY) missing.push('VAPID_PUBLIC_KEY');
    if (!VAPID_PRIVATE_KEY) missing.push('VAPID_PRIVATE_KEY');

    if (missing.length) {
      res.status(500).json({
        ok: false,
        error: 'Env faltando',
        missing,
        envPresent: {
          VAPID_SUBJECT: !!VAPID_SUBJECT,
          VAPID_PUBLIC_KEY: !!VAPID_PUBLIC_KEY,
          VAPID_PRIVATE_KEY: !!VAPID_PRIVATE_KEY,
        }
      });
      return;
    }

    // Configura VAPID só agora (com as ENVs válidas)
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

    if (!subscription) {
      res.status(400).json({ ok:false, error:'subscription ausente' });
      return;
    }

    const data = JSON.stringify(
      payload || { title: 'Ping', body: 'Hello from server', url: '/' }
    );

    const result = await webpush.sendNotification(subscription, data, {
      TTL: 60,
      urgency: 'high',
    });

    res.status(200).json({ ok:true, result });
  } catch (err) {
    res.status(err?.statusCode || 500).json({
      ok: false,
      name: err?.name || null,
      statusCode: err?.statusCode || 500,
      error: err?.body || err?.message || String(err),
      stack: err?.stack || null, // tire depois que estabilizar
    });
  }
}
