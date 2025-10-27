// api/push/notify.mjs
import webpush from 'web-push';
import * as admin from 'firebase-admin';

export const config = { runtime: 'nodejs' };

// ---------- init firebase-admin (singleton) ----------
const g = globalThis;
if (!g.__FIREBASE_ADMIN__) {
  let credential = null;

  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    const parsed = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    credential = admin.credential.cert(parsed);
  } else if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
    credential = admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    });
  } else {
    console.warn('[notify] credenciais ausentes — defina FIREBASE_SERVICE_ACCOUNT_JSON (recomendado).');
  }

  admin.initializeApp({ credential });
  g.__FIREBASE_ADMIN__ = { admin, db: admin.firestore() };
}
const { db } = g.__FIREBASE_ADMIN__;

// ---------- VAPID ----------
const subj = (process.env.VAPID_SUBJECT || '').trim();
const pub  = (process.env.VAPID_PUBLIC_KEY || '').trim();
const priv = (process.env.VAPID_PRIVATE_KEY || '').trim();
webpush.setVapidDetails(/^https?:\/\//.test(subj) || subj.startsWith('mailto:') ? subj : `mailto:${subj}`, pub, priv);

// ---------- helpers ----------
async function readJson(req) {
  if (req.body) return req.body;
  let data = ''; for await (const c of req) data += c;
  try { return JSON.parse(data || '{}'); } catch { return {}; }
}

const BASE = (process.env.APP_PUBLIC_ORIGIN || '').replace(/\/+$/,''); // ex: https://sistemastands.com.br

async function getProjectUids(projectId) {
  if (!projectId) return [];
  const snap = await db.collection('projetos').doc(projectId).get();
  const p = snap.exists ? snap.data() : {};
  const arr = [];
  ['produtorUid','produtorId','consultorUid','consultorId'].forEach(k => { if (p?.[k]) arr.push(String(p[k])); });
  return [...new Set(arr)];
}

async function findOperatorUidsByArea(area) {
  if (!area) return [];
  const us = await db.collection('usuarios').where('funcao','==','operador').get();
  const match = [];
  us.forEach(d => {
    const u = d.data() || {};
    const ua = (u.area_atual || u.areaAtual || u.area || '').toString().toLowerCase().trim();
    if (ua && ua === String(area).toLowerCase().trim()) match.push(d.id);
  });
  return match;
}

async function collectSubs({ userIds = [], area = null }) {
  const subs = [];

  // 1) por userIds (em chunks de 10 por limitação do "in")
  for (let i = 0; i < userIds.length; i += 10) {
    const chunk = userIds.slice(i, i + 10);
    const qs = await db.collection('push_subscriptions')
      .where('active','==',true).where('userId','in',chunk).get();
    qs.forEach(d => subs.push({ id:d.id, ...d.data() }));
  }

  // 2) por area (todos ativos com area igual)
  if (area) {
    const qs = await db.collection('push_subscriptions')
      .where('active','==',true).where('area','==',area).get();
    qs.forEach(d => subs.push({ id:d.id, ...d.data() }));
  }

  // dedup por endpoint
  const map = new Map();
  subs.forEach(s => {
    const ep = s.endpoint || s.subscription?.endpoint;
    if (ep) map.set(ep, s);
  });
  return [...map.values()];
}

async function sendTo(subs, payload) {
  const results = { total: subs.length, sent: 0, failed: 0, deactivated: 0, errors: [] };
  const data = JSON.stringify(payload);
  for (const s of subs) {
    try {
      const subscription = s.subscription || { endpoint: s.endpoint, keys: s.keys };
      await webpush.sendNotification(subscription, data, { TTL: 90, urgency:'high' });
      results.sent += 1;
    } catch (err) {
      results.failed += 1;
      const body = err?.body || err?.message || String(err);
      results.errors.push({ endpoint: s.endpoint, error: body });
      if (err?.statusCode === 404 || err?.statusCode === 410 || /not\s*registered|invalid/i.test(body)) {
        try {
          await db.collection('push_subscriptions').doc(s.id).update({
            active:false, updatedAt: admin.firestore.FieldValue.serverTimestamp()
          });
          results.deactivated += 1;
        } catch {}
      }
    }
  }
  return results;
}

// ---------- handler ----------
export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ ok:false, error:'Method not allowed' }); return; }
  if (!pub || !priv || !subj) { res.status(500).json({ ok:false, error:'VAPID não configurado' }); return; }

  const body = await readJson(req);
  const { type, action, ticketId, projectId, eventId, area: areaInformed } = body || {};

  try {
    let title = '🔔 Notificação';
    let url   = `${BASE || ''}/dashboard`;
    let userIds = [];
    let area = null;

    if (type === 'ticket') {
      // status → destinos/quem recebe
      // "aberto" | "em_tratativa" | "executado" | "concluido"
      const allow = ['aberto','em_tratativa','executado','concluido'];
      if (!allow.includes(action)) throw new Error(`status não permitido: ${action}`);

      // tenta descobrir area e projeto
      let projId = projectId;
      let ticketArea = areaInformed;
      const tSnap = ticketId ? await db.collection('chamados').doc(ticketId).get() : null;
      const t = tSnap?.exists ? tSnap.data() : {};
      projId = projId || t?.projectId || t?.projetoId || t?.projeto || null;
      ticketArea = ticketArea || t?.area_atual || t?.area || t?.destino || null;

      // operadores da área
      const opUids = await findOperatorUidsByArea(ticketArea);

      // produtor + consultor do projeto
      const pcUids = await getProjectUids(projId);

      userIds = [...new Set([...opUids, ...pcUids])];
      area = ticketArea;

      title = `📌 Chamado ${action.replace('_',' ')}`;
      url   = `${BASE || ''}/tickets/${ticketId}`;
    }

    if (type === 'project' && action === 'created') {
      // novos projetos: produtor + consultor
      userIds = await getProjectUids(projectId);
      title = '🧱 Novo projeto';
      url   = `${BASE || ''}/projects/${projectId}`;
    }

    if (type === 'event' && action === 'created') {
      // novos eventos: todos os usuários (todas as assinaturas ativas)
      const qs = await db.collection('push_subscriptions').where('active','==',true).get();
      const all = []; qs.forEach(d => all.push({ id:d.id, ...d.data() }));
      const result = await sendTo(all, {
        title: '📅 Novo evento',
        body: 'Um novo evento foi criado.',
        url: `${BASE || ''}/events/${eventId || ''}`,
        tag: `event-${eventId || 'new'}`,
        badgeCount: 1
      });
      res.status(200).json({ ok:true, ...result }); return;
    }

    // coleta assinaturas e envia
    const subs = await collectSubs({ userIds, area });
    const result = await sendTo(subs, {
      title,
      body: body.body || 'Toque para abrir.',
      url,
      tag: `${type}-${action}-${ticketId || projectId || eventId || ''}`,
      badgeCount: 1
    });

    res.status(200).json({ ok:true, ...result, matchedUsers: userIds.length, area });
  } catch (e) {
    res.status(500).json({ ok:false, error: e?.message || String(e) });
  }
}
