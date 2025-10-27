// src/lib/pushClient.js
export async function ensurePushEnabled(vapidPublicKeyBase64Url) {
  if (!('serviceWorker' in navigator)) throw new Error('Service Worker não suportado');
  if (!('PushManager' in window)) throw new Error('Push API não suportada neste navegador');
  if (!vapidPublicKeyBase64Url) throw new Error('VAPID public key ausente');

  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('Permissão de notificação negada');

  const reg = await navigator.serviceWorker.ready;

  const subscription = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidPublicKeyBase64Url),
  });

  return subscription;
}

export async function sendSelfTestPush(subscription, { title, body, url = '/', badgeCount, tag = 'teste' } = {}) {
  if (!subscription) throw new Error('Subscription inválida');
  const res = await fetch('/api/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subscription, payload: { title, body, url, badgeCount, tag } }),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error('Falha ao enviar push: ' + res.status + ' ' + txt);
  }
  return res.json();
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}
