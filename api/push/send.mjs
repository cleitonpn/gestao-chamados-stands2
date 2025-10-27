// api/push/send.mjs
import webpush from 'web-push';

// Se quiser, você pode remover completamente este config.
// O default do Vercel já usa Node (atual). Mantido aqui apenas para clareza.
export const config = { runtime: 'nodejs' };

function getEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Env ${name} não definido`);
  return v;
}

webpush.setVapidDetails(
  getEnv('VAPID_SUBJECT'),           // ex.: 'mailto:seu-email@dominio.com'
  getEnv('VAPID_PUBLIC_KEY'),        // PUBLIC KEY
  getEnv('VAPID_PRIVATE_KEY')        // PRIVATE KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  try {
    const { subscription, payload } = req.body || {};
    if (!subscription) {
      res.status(400).json({ error: 'subscription ausente' });
      return;
    }

    const data = JSON.stringify(
      payload || { title: 'Ping', body: 'Hello from server', url: '/' }
    );

    await webpush.sendNotification(subscription, data, { TTL: 60, urgency: 'high' });

    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('push/send error', err?.statusCode, err?.body || err?.message);
    res.status(500).send(err?.body || err?.message || 'Erro desconhecido');
  }
}
