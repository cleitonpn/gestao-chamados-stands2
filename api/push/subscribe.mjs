// /api/push/subscribe.mjs
import crypto from 'node:crypto';
import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

function initAdmin() {
  if (!getApps().length) {
    const adminJson = process.env.FIREBASE_ADMIN_JSON
      || process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (!adminJson) throw new Error('FIREBASE_ADMIN_JSON ausente');
    const creds = JSON.parse(adminJson);
    initializeApp({ credential: cert(creds) });
  }
  return getFirestore();
}

export default async function handler(req, res) {
  // Aceita só POST
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'method not allowed' });
  }

  try {
    const body = typeof req.body === 'object' ? req.body : JSON.parse(req.body || '{}');

    // Checagens básicas
    if (!body || !body.endpoint) {
      return res.status(400).json({ ok: false, error: 'invalid subscription (endpoint ausente)' });
    }

    const userId =
      req.headers['x-user-id'] ||
      body.userId ||
      null;

    const db = initAdmin();

    // Gera um id estável a partir do endpoint (sha1)
    const docId = crypto.createHash('sha1').update(body.endpoint).digest('hex');

    const payload = {
      endpoint: body.endpoint,
      keys: body.keys || null,
      userId,
      userAgent: req.headers['user-agent'] || null,
      enabled: true,
      updatedAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp(),
    };

    await db
      .collection('push_subscriptions')
      .doc(docId)
      .set(payload, { merge: true });

    return res.status(200).json({ ok: true, id: docId });
  } catch (err) {
    console.error('[subscribe.mjs] erro:', err);
    return res.status(500).json({ ok: false, error: String(err?.message || err) });
  }
}
