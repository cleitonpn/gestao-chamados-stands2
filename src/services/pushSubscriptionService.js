// src/services/pushSubscriptionService.js
// Salva/atualiza a assinatura de push no Firestore usando o client SDK.
// Importa o `db` do arquivo do seu projeto em src/config/firebase.js
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../config/firebase'; // ✅ caminho corrigido

// Usa o endpoint como ID estável (deduplica automaticamente)
function endpointToId(endpoint) {
  try {
    return btoa(endpoint).replace(/=+$/g, '').replace(/\+/g,'-').replace(/\//g,'_');
  } catch {
    return String(endpoint).slice(-64);
  }
}

/**
 * Salva a assinatura de push do usuário.
 * @param {Object} params
 * @param {string} params.userId - UID do usuário (Auth)
 * @param {string} params.endpoint - subscription.endpoint
 * @param {PushSubscriptionJSON|Object} params.subscription - subscription toJSON()
 * @param {string|null} [params.area] - área atual (opcional)
 * @param {string|null} [params.device] - userAgent/identificação do dispositivo (opcional)
 */
export async function savePushSubscription({ userId, endpoint, subscription, area = null, device = null }) {
  if (!userId) throw new Error('userId obrigatório para salvar assinatura');
  if (!endpoint) throw new Error('endpoint ausente');
  const id = endpointToId(endpoint);
  const payload = {
    userId,
    endpoint,
    subscription,
    area: area || null,
    device: device || (typeof navigator !== 'undefined' ? navigator.userAgent : null),
    active: true,
    updatedAt: serverTimestamp(),
    createdAt: serverTimestamp(),
  };
  await setDoc(doc(db, 'push_subscriptions', id), payload, { merge: true });
  return id;
}
