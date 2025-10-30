// src/lib/pushClient.js

// ... seus outros imports/utilidades (se houver) permanecem aqui

function encodeKey(key) {
  if (!key) return null;
  const bytes = new Uint8Array(key);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  // btoa é suficiente para debug (não precisa urlsafe/base64url aqui)
  return btoa(binary);
}

/**
 * Retorna informações de diagnóstico do push no navegador.
 * Útil para conferir se há SW, permissão, subscription, endpoint e chaves.
 */
export async function getDebugInfo() {
  const supported = 'Notification' in window && 'serviceWorker' in navigator;

  // Permissão do Notification API (ou "unsupported" se não houver)
  const permission = supported ? Notification.permission : 'unsupported';

  // Tenta pegar o registro do SW principal do app (ajuste o caminho se diferente)
  let registration = null;
  if ('serviceWorker' in navigator) {
    registration =
      (await navigator.serviceWorker.getRegistration('/firebase-messaging-sw.js')) ||
      (await navigator.serviceWorker.ready).catch(() => null);
  }

  const swActive = Boolean(registration?.active);

  // Subscription (endpoint e chaves)
  let subscription = null;
  let endpoint = null;
  let keys = null;

  if (registration?.pushManager) {
    try {
      subscription = await registration.pushManager.getSubscription();
      endpoint = subscription?.endpoint ?? null;
      if (subscription) {
        keys = {
          p256dh: encodeKey(subscription.getKey('p256dh')),
          auth: encodeKey(subscription.getKey('auth')),
        };
      }
    } catch (_) {
      // ignora erros de acesso ao pushManager
    }
  }

  return {
    supported,
    permission,
    swRegistered: Boolean(registration),
    swActive,
    hasSubscription: Boolean(subscription),
    endpoint,
    keys,
    // Campos extras que às vezes ajudam:
    userAgent: navigator.userAgent,
  };
}

// ===== exports já existentes (mantém exatamente como você tinha) =====
// Exemplo: (não remova os que seu app já usa)
export { requestNotificationPermission } from './whatever-you-had';
export { subscribeUser } from './whatever-you-had';
export { sendTestPush } from './whatever-you-had';
export { sendBroadcast } from './whatever-you-had';
export { clearBadge } from './whatever-you-had';
// ... e qualquer outro export que você já possua
