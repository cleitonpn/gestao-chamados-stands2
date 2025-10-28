// /api/push/send.mjs
// Envia UM push para a subscription recebida no body.
// Aceita body: { subscription, title, body, icon, badge, data }
// Requer variáveis no Vercel: VAPID_PUBLIC_KEY e VAPID_PRIVATE_KEY (as MESMAS usadas no front, sem o prefixo VITE_).
// Runtime Node (não Edge).

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      res.statusCode = 405;
      res.setHeader('Allow', 'POST');
      return res.end('Method Not Allowed');
    }

    const body = await readJson(req);
    const { subscription, title, body: messageBody, icon, badge, data } = body || {};

    if (!subscription || typeof subscription !== 'object' || !subscription.endpoint) {
      return json(res, 400, { ok: false, error: 'subscription ausente ou inválida' });
    }

    const VAPID_PUBLIC_KEY =
      process.env.VAPID_PUBLIC_KEY ||
      process.env.WEB_PUSH_PUBLIC_KEY ||
      process.env.VITE_VAPID_PUBLIC_KEY;

    const VAPID_PRIVATE_KEY =
      process.env.VAPID_PRIVATE_KEY || process.env.WEB_PUSH_PRIVATE_KEY;

    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
      return json(res, 500, {
        ok: false,
        error: 'VAPID keys ausentes no servidor. Defina VAPID_PUBLIC_KEY e VAPID_PRIVATE_KEY no Vercel.'
      });
    }

    const { default: webpush } = await import('web-push');
    webpush.setVapidDetails('mailto:push@sistemastands.com.br', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

    const payload = JSON.stringify({
      title: title || 'Teste (real)',
      body: typeof messageBody === 'string' ? messageBody : 'Ping do sistema de push',
      icon: icon || '/icon-192.png',
      badge: badge || '/icon-72.png',
      data: data || { ts: Date.now() }
    });

    const result = await webpush.sendNotification(subscription, payload);
    // web-push costuma retornar 201/ok true em result.statusCode
    return json(res, 200, { ok: true, result: sanitizeResult(result) });
  } catch (err) {
    console.error('[send.mjs] erro:', err);
    return json(res, 500, { ok: false, error: err?.message || String(err) });
  }
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

function json(res, status, obj) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(obj));
}

function sanitizeResult(r) {
  if (!r) return null;
  const out = {};
  for (const k of ['statusCode', 'statusMessage', 'body']) {
    if (k in r) out[k] = r[k];
  }
  return out;
}
