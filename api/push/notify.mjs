// /api/push/notify.mjs
// Broadcast para TODAS as subscriptions do Firestore (coleção: push_subscriptions).
// Requer envs no Vercel:
//  - VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY
//  - FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY (com \n)
// Runtime Node (não Edge).

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      res.statusCode = 405;
      res.setHeader('Allow', 'POST');
      return res.end('Method Not Allowed');
    }

    const body = await readJson(req);
    const title = body?.title || 'Broadcast (teste)';
    const messageBody = body?.body || 'Ping do broadcast';

    const VAPID_PUBLIC_KEY =
      process.env.VAPID_PUBLIC_KEY ||
      process.env.WEB_PUSH_PUBLIC_KEY ||
      process.env.VITE_VAPID_PUBLIC_KEY;
    const VAPID_PRIVATE_KEY =
      process.env.VAPID_PRIVATE_KEY || process.env.WEB_PUSH_PRIVATE_KEY;

    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
      return json(res, 500, {
        ok: false,
        error: 'VAPID keys ausentes. Defina VAPID_PUBLIC_KEY e VAPID_PRIVATE_KEY no Vercel.'
      });
    }

    const { FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY } = process.env;
    if (!FIREBASE_PROJECT_ID || !FIREBASE_CLIENT_EMAIL || !FIREBASE_PRIVATE_KEY) {
      return json(res, 500, {
        ok: false,
        error: 'Credenciais Firebase Admin ausentes. Defina FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL e FIREBASE_PRIVATE_KEY.'
      });
    }

    const { default: admin } = await import('firebase-admin');
    if (!admin.apps?.length) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: FIREBASE_PROJECT_ID,
          clientEmail: FIREBASE_CLIENT_EMAIL,
          privateKey: FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
        })
      });
    }
    const db = admin.firestore();

    const snapshot = await db.collection('push_subscriptions').get();
    const subs = snapshot.docs.map((d) => d.data()).filter((d) => d && d.endpoint);

    const { default: webpush } = await import('web-push');
    webpush.setVapidDetails('mailto:push@sistemastands.com.br', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

    let sent = 0, failed = 0;
    await Promise.all(
      subs.map(async (s) => {
        try {
          const payload = JSON.stringify({
            title,
            body: messageBody,
            icon: '/icon-192.png',
            badge: '/icon-72.png',
            data: { ts: Date.now(), subscriptionId: s.id || null }
          });
          await webpush.sendNotification(s, payload);
          sent++;
        } catch (e) {
          console.error('[notify.mjs] falha em uma subscription:', e?.message || e);
          failed++;
        }
      })
    );

    return json(res, 200, { ok: true, sent, failed, total: subs.length });
  } catch (err) {
    console.error('[notify.mjs] erro:', err);
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
