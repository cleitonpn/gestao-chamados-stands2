// api/push/broadcast.mjs
import webpush from 'web-push';
import * as admin from 'firebase-admin';

export const config = { runtime: 'nodejs' };

// ---- Init Firebase Admin (singleton) ----
const _global = globalThis;
if (!_global.__FIREBASE_ADMIN__) {
  const hasDirectCreds = process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY;
  const hasJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!hasDirectCreds && !hasJson) {
    console.warn('[broadcast] Credenciais do Firebase Admin ausentes. Defina FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL e FIREBASE_PRIVATE_KEY OU FIREBASE_SERVICE_ACCOUNT_JSON.');
  }

  let credential;
  if (hasJson) {
    try {
      const parsed = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
      credential = admin.credential.cert(parsed);
    } catch (e) {
      console.error('[broadcast] FIREBASE_SERVICE_ACCOUNT_JSON inválido:', e);
    }
  }
  if (!credential && hasDirectCreds) {
    credential = admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    });
  }

  admin.initializeApp({ credential });
  _global.__FIREBASE_ADMIN__ = { admin, db: admin.firestore() };
}

const { db } = _global.__FIREBASE_ADMIN__;

// ---- VAPID ----
function envOrNull(name) { return (process.env[name] || '').trim() || null; }
function normalizeSubject(subject) {
  if (!subject) return null;
  if (/^https?:\/\//i.test(subject) || /^mailto:/i.test(subject)) return subject;
  return `mailto:${subject}`;
}

// ---- Helpers ----
async function readJsonBody(req) {
  if (req.body) return req.body;
  let data = '';
  for await (const chunk of req) data += chunk;
  try { return JSON.parse(data || '{}'); } catch { return {}; }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ ok:false, error:'Method not allowed' });
    return;
  }

  const body = await readJsonBody(req);
  const { filters = {}, payload = {} } = body || {};

  const subject = normalizeSubject(envOrNull('VAPID_SUBJECT'));
  const pub = envOrNull('VAPID_PUBLIC_KEY');
  const priv = envOrNull('VAPID_PRIVATE_KEY');
  if (!subject || !pub || !priv) {
    res.status(500).json({ ok:false, error:'VAPID env ausente', missing: { subject: !!subject, pub: !!pub, priv: !!priv } });
    return;
  }
  webpush.setVapidDetails(subject, pub, priv);

  try {
    // Query básica: só "active == true" (evita índice composto).
    let q = db.collection('push_subscriptions').where('active', '==', true);
    if (filters.userId) q = q.where('userId', '==', String(filters.userId));
    const snap = await q.get();
    const subs = [];
    snap.forEach((d) => {
      const data = d.data();
      // filtro adicional por área (em memória, sem índice)
      if (filters.area && data?.area !== filters.area) return;
      subs.push({ id: d.id, ...data });
    });

    const results = { sent: 0, failed: 0, total: subs.length, deactivated: 0, errors: [] };
    const notif = JSON.stringify({
      title: payload.title || '🔔 Novo evento',
      body: payload.body || 'Você tem novas notificações.',
      url: payload.url || '/dashboard',
      tag: payload.tag || 'broadcast',
      badgeCount: payload.badgeCount || 1,
    });

    // Envia em sequência (poucos envios). Para alto volume, usar Promise.allSettled com throttling.
    for (const s of subs) {
      try {
        const subscription = s.subscription || { endpoint: s.endpoint, keys: s.keys };
        if (!subscription || !subscription.endpoint) throw new Error('assinatura inválida');
        await webpush.sendNotification(subscription, notif, { TTL: 60, urgency: 'high' });
        results.sent += 1;
      } catch (err) {
        results.failed += 1;
        const body = err?.body || err?.message || String(err);
        results.errors.push({ id: s.id, endpoint: s.endpoint, error: body });

        // 404/410/NotRegistered → desativa
        if (err?.statusCode === 404 || err?.statusCode === 410 || /not\s*registered|invalid/i.test(body)) {
          try {
            await db.collection('push_subscriptions').doc(s.id).update({ active: false, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
            results.deactivated += 1;
          } catch {}
        }
      }
    }

    res.status(200).json({ ok:true, ...results });
  } catch (e) {
    res.status(500).json({ ok:false, error: e?.message || String(e) });
  }
}
