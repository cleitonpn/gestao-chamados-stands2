// api/push/send.mjs
import webpush from 'web-push';

// Vercel accepts "nodejs" here. You may remove this line; default is Node.
export const config = { runtime: 'nodejs' };

function mustEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Env ${name} não definido`);
  return v;
}

function readJsonBody(req) {
  return new Promise((resolve) => {
    try {
      // Vercel normalmente já popula req.body quando Content-Type = application/json
      if (req.body) return resolve(req.body);
      let data = '';
      req.on('data', (chunk) => { data += chunk; });
      req.on('end', () => {
        try { resolve(JSON.parse(data || '{}')); }
        catch { resolve({}); }
      });
      req.on('error', () => resolve({}));
    } catch {
      resolve({});
    }
  });
}

webpush.setVapidDetails(
  mustEnv('VAPID_SUBJECT'),
  mustEnv('VAPID_PUBLIC_KEY'),
  mustEnv('VAPID_PRIVATE_KEY')
);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed', method: req.method });
    return;
  }
  try {
    const body = await readJsonBody(req);
    const { subscription, payload } = body || {};

    if (!subscription) {
      res.status(400).json({
        error: 'subscription ausente',
        hint: 'Envie { subscription, payload } em JSON',
        contentType: req.headers['content-type'] || null,
        hasBody: !!body
      });
      return;
    }

    const data = JSON.stringify(
      payload || { title: 'Ping', body: 'Hello from server', url: '/' }
    );

    const result = await webpush.sendNotification(subscription, data, {
      TTL: 60,
      urgency: 'high',
    });

    res.status(200).json({ ok: true, result });
  } catch (err) {
    const status = err?.statusCode || 500;
    const message = err?.body || err?.message || String(err);
    // Exemplos comuns: 410/404 (assinatura expirada/invalid), 400/401 (VAPID inválido)
    res.status(status).json({
      ok: false,
      error: message,
      statusCode: status,
      // Para depuração — remova depois que estabilizar
      stack: err?.stack || null,
      name: err?.name || null,
    });
  }
}
