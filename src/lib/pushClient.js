// src/lib/pushClient.js

// ---------- Helpers ----------
const log = (...a) => console.log('[pushClient]', ...a);

function urlBase64ToUint8Array(base64String) {
  // remove padding e normaliza
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) output[i] = raw.charCodeAt(i);
  return output;
}

async function getVapidPublicKey() {
  // 1) tenta .env (Vite)
  let key = import.meta?.env?.VITE_VAPID_PUBLIC_KEY;
  if (key && typeof key === 'string' && key.trim()) return { key: key.trim(), source: 'env' };

  // 2) tenta <meta name="vapid-public-key">
  const meta = document.querySelector('meta[name="vapid-public-key"]');
  if (meta?.content) return { key: meta.content.trim(), source: 'meta' };

  // 3) fallback: API
  try {
    const r = await fetch('/api/push/vapid');
    if (r.ok) {
      const j = await r.json();
      if (j?.publicKey) return { key: j.publicKey.trim(), source: 'api' };
    }
  } catch (_) {}
  throw new Error('VAPID public key não encontrada (VITE_VAPID_PUBLIC_KEY / meta / API).');
}

function getBadgeAPI() {
  return navigator.setAppBadge || navigator.clearAppBadge ? navigator : null;
}

// ---------- Permissão ----------
export async function ensurePermission() {
  if (!('Notification' in window)) throw new Error('Notifications não suportadas neste navegador.');
  const current = Notification.permission;
  if (current === 'granted') return 'granted';
  if (current === 'denied') throw new Error('Permissão de notificação foi negada pelo usuário.');
  const result = await Notification.requestPermission();
  if (result !== 'granted') throw new Error('Permissão de notificação não concedida.');
  return result;
}

// ---------- Service Worker ----------
export async function registerServiceWorker(path = null) {
  if (!('serviceWorker' in navigator)) throw new Error('Service Worker não suportado.');
  // Se seu PWA já registra, só aguarda o ready:
  const existing = await navigator.serviceWorker.getRegistration();
  if (existing) return existing;

  // Se quiser registrar manualmente, informe o caminho (ex.: '/sw.js')
  if (path) {
    const reg = await navigator.serviceWorker.register(path);
    await navigator.serviceWorker.ready;
    return reg;
  }

  // Sem caminho e sem registro prévio: tenta esperar o ready (em apps que registram no bootstrap)
  return await navigator.serviceWorker.ready;
}

// ---------- Subscription ----------
async function internalSubscribe(swReg, vapidKey) {
  const appServerKey = urlBase64ToUint8Array(vapidKey);
  return await swReg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: appServerKey,
  });
}

/**
 * Obtém a subscription existente; se não houver, cria.
 * Opcionalmente tenta salvar no backend (POST /api/push/subscribe).
 */
export async function getOrCreateSubscription(swReg, { saveOnServer = true, extra = {} } = {}) {
  if (!swReg) throw new Error('SW registration ausente.');
  const subExisting = await swReg.pushManager.getSubscription();
  if (subExisting) return { subscription: subExisting, created: false };

  const { key: vapidKey } = await getVapidPublicKey();
  const subscription = await internalSubscribe(swReg, vapidKey);

  if (saveOnServer) {
    try {
      await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription, extra }),
      });
    } catch (err) {
      // não bloqueia o fluxo
      console.warn('Falha ao salvar subscription (ignorado):', err);
    }
  }

  return { subscription, created: true };
}

/**
 * Atalho “tudo-em-um”: garante permissão, SW e subscription.
 * Mantido por compatibilidade com versões anteriores.
 */
export async function ensureVapidKeyAndSubscribe(options = {}) {
  await ensurePermission();
  const swReg = await registerServiceWorker();
  const out = await getOrCreateSubscription(swReg, options);
  return { ...out, swReg };
}

// ---------- Ações ----------
export async function testRealPush(subscription, payload = {}) {
  if (!subscription) {
    return { ok: false, error: 'subscription ausente' };
  }
  const body = {
    subscription,
    title: payload.title ?? 'Teste (real)',
    body: payload.body ?? 'Ping do sistema de push',
    data: payload.data ?? {},
  };
  try {
    const r = await fetch('/api/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const j = await r.json().catch(() => ({}));
    return { ok: r.ok, result: j };
  } catch (err) {
    return { ok: false, error: String(err?.message || err) };
  }
}

export async function broadcastTest(payload = {}) {
  const body = {
    title: payload.title ?? 'Broadcast (teste)',
    body: payload.body ?? 'Mensagem para todos',
    data: payload.data ?? {},
  };
  try {
    const r = await fetch('/api/push/broadcast', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const j = await r.json().catch(() => ({}));
    return { ok: r.ok, result: j };
  } catch (err) {
    return { ok: false, error: String(err?.message || err) };
  }
}

export async function clearBadge() {
  try {
    const api = getBadgeAPI();
    if (api?.clearAppBadge) await api.clearAppBadge();
  } catch {}
}

// ---------- Debug overlay (opcional) ----------
let overlayEl = null;

function readStatusForOverlay() {
  const status = {
    permission: Notification?.permission ?? 'n/a',
    sw: 'desconhecido',
    vapid: 'desconhecido',
    busy: (window.__pushBusy ?? false) ? 'sim' : 'não',
  };
  status.vapid = import.meta?.env?.VITE_VAPID_PUBLIC_KEY ? 'env' : 'via API/meta';

  return navigator.serviceWorker?.getRegistration()
    .then((reg) => ({ ...status, sw: reg ? 'sim' : 'não' }))
    .catch(() => ({ ...status, sw: 'erro' }));
}

function ensureOverlay() {
  if (overlayEl) return overlayEl;
  const el = document.createElement('div');
  el.style.cssText =
    'position:fixed;inset:0;pointer-events:none;display:flex;align-items:flex-start;justify-content:center;z-index:999999;';
  el.innerHTML = `
    <div id="pc-panel" style="
      margin-top:8px;
      background: rgba(28,31,35,.92);
      color:#e6edf3;
      border-radius:10px;
      padding:8px 10px;
      font: 12px/1.35 ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell;
      box-shadow: 0 8px 30px rgba(0,0,0,.4);
      pointer-events:auto;
      min-width: 260px;
    "></div>`;
  document.body.appendChild(el);
  overlayEl = el;
  return el;
}

function renderOverlayText(state) {
  const panel = overlayEl?.querySelector('#pc-panel');
  if (!panel) return;
  panel.innerHTML = `
    <div style="display:flex;gap:8px;align-items:center;margin-bottom:6px">
      <strong style="font-size:12px">Push debug</strong>
      <span style="font-size:10px;opacity:.8">(Pressione ESC para fechar)</span>
    </div>
    <div style="display:grid;gap:4px">
      <div>Permissão: <b>${state.permission}</b></div>
      <div>SW registrado: <b>${state.sw}</b></div>
      <div>VAPID no bundle/meta: <b>${state.vapid}</b></div>
      <div>Busy: <b>${state.busy}</b></div>
    </div>
  `;
}

export async function showDebugOverlayState(show = true) {
  if (!show) {
    if (overlayEl?.parentNode) overlayEl.parentNode.removeChild(overlayEl);
    overlayEl = null;
    return;
  }
  const el = ensureOverlay();
  const state = await readStatusForOverlay();
  renderOverlayText(state);
  // fecha com ESC
  const onKey = (e) => {
    if (e.key === 'Escape') {
      showDebugOverlayState(false);
      window.removeEventListener('keydown', onKey);
    }
  };
  window.addEventListener('keydown', onKey);
}

// Utilitário p/ mostrar “ocupado” no overlay
export function setBusyFlag(on) {
  window.__pushBusy = !!on;
  if (overlayEl) readStatusForOverlay().then(renderOverlayText);
}

// ---------- Exports adicionais (compatibilidade) ----------
export async function getVapidKeySource() {
  const { key, source } = await getVapidPublicKey();
  return { key, source };
}
