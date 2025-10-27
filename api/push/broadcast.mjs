// api/push/broadcast.mjs
import webpush from 'web-push';
import * as admin from 'firebase-admin';

export const config = { runtime: 'nodejs' };

function setVapid() {
  const subj = (process.env.VAPID_SUBJECT || '').trim();
  const pub  = (process.env.VAPID_PUBLIC_KEY || '').trim();
  const priv = (process.env.VAPID_PRIVATE_KEY || '').trim();
  if (!subj || !pub || !priv) {
    throw new Error('VAPID_* ausentes: defina VAPID_SUBJECT, VAPID_PUBLIC_KEY e VAPID_PRIVATE_KEY no Vercel.');
  }
  webpush.setVapidDetails(
    /^https?:\/\//.test(subj) || subj.startsWith('mailto:') ? subj : `mailto:${subj}`,
    pub,
    priv
  );
}

function getAdmin() {
  const g = globalThis;
  if (g.__ADMIN__) return g.__ADMIN__;

  let credential;
  try {
    if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
      credential = admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON));
    } else if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
      credential = admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      });
    } else {
      throw new Error('Credenciais do Firebase ausentes: use FIREBASE_SERVICE_ACCOUNT_JSON (recomendado).');
    }
  } catch (e) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON inválido: ' + (e?.message || e));
  }

  const app = admin.apps.length ? admin.app() : admin.initializeApp({ credential });
  const db  = admin.firestore();
  g.__ADMIN__ = { app, db };
  return g.__ADMIN__;
}

async function readJson(req) {
  if (req.body) return req.body;
  let data = ''; for await (const c of req) data += c;
  return data ? JSON.parse(data) : {};
}

export default async function handler(req, res) {
  res.setHeader('content-type', 'application/json; charset=utf-8');

  if (req.method !== 'POST') {
    res.status(405).end(JSON.stringify({ ok:false, error:'Method not allowed' })); return;
  }

  try {
    setVapid();
    const { db } = getAdmin();

    const body = await readJson(req);
    const { filters = {}, payload = {} } = body || {};

    // busca assinaturas ativas (com filtros simples)
    let query = db.collection('push_subscriptions').where('active', '==', true);
    if (filters.userId) query = query.where('userId', '==', String(filters.userId));
    if (filters.area)   query = query.where('area', '==', String(filters.area));

    const snap = await query.get();
    const subs = [];
    snap.forEach(d => subs.push({ id:d.id, ...d.data() }));

    const msg = JSON.stringify({
      title: payload.title || '🔔 Broadcast',
      body : payload.body  || 'Teste de broadcast',
      url  : payload.url   || '/dashboard',
      tag  : payload.tag   || 'broadcast',
      badgeCount: payload.badgeCount || 1,
    });

    let sent = 0, failed = 0, deactivated = 0, errors = [];
    for (const s of subs) {
      try {
        const subscription = s.subscription || { endpoint: s.endpoint, keys: s.keys };
        await webpush.sendNotification(subscription, msg, { TTL: 90, urgency:'high' });
        sent += 1;
      } catch (err) {
        failed += 1;
        const body = err?.body || err?.message || String(err);
        errors.push({ endpoint: s.endpoint, error: body });
        if (err?.statusCode === 404 || err?.statusCode === 410 || /not\s*registered|invalid/i.test(body)) {
          try {
            await db.collection('push_subscriptions').doc(s.id).update({ active:false, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
            deactivated += 1;
          } catch {}
        }
      }
    }

    res.status(200).end(JSON.stringify({ ok:true, total: subs.length, sent, failed, deactivated, errors }));
  } catch (e) {
    res.status(500).end(JSON.stringify({ ok:false, error: e?.message || String(e) }));
  }
}
