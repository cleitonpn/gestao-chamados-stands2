// src/lib/pushClient.js
export async function ensurePushEnabled(vapidPublicKey) {
  if (!('serviceWorker' in navigator)) throw new Error('Service Worker não suportado');
  if (!('PushManager' in window)) throw new Error('Push API não suportada');

  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('Permissão de notificação negada');

  const reg = await navigator.serviceWorker.ready;

  // Subscrição com VAPID
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
  });

  return sub;
}

export async function sendSelfTestPush(subscription, payload) {
  const res = await fetch('/api/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subscription, payload }),
  });
  const text = await res.text();
  if (!res.ok) {
    let extra = '';
    try { const j = JSON.parse(text); extra = ` | ${j.statusCode || ''} ${j.error || ''}`; } catch {}
    throw new Error(`Falha ao enviar push: ${res.status} ${res.statusText}${extra}`);
  }
  try { return JSON.parse(text); } catch { return { ok: true, raw: text }; }
}

// util
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
