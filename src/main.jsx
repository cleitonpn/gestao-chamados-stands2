// src/main.jsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.jsx';

// ——————————————————————————————————————————
// DEBUG do build e das variáveis Vite (VAPID)
// ——————————————————————————————————————————
const MODE = import.meta.env?.MODE;
const VAPID_PUBLIC = (import.meta?.env?.VITE_VAPID_PUBLIC_KEY || '').trim();

console.debug('[BUILD] mode =', MODE, '| VITE_VAPID_PUBLIC_KEY present =', !!VAPID_PUBLIC);
if (VAPID_PUBLIC) {
  console.debug('[BUILD] VAPID prefix =', VAPID_PUBLIC.slice(0, 12) + '…');
} else {
  console.warn('[BUILD] VAPID não presente no bundle. Defina VITE_VAPID_PUBLIC_KEY no Vercel e faça novo deploy.');
}

const rootEl = document.getElementById('root');

createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>
);

// ——————————————————————————————————————————
// Registro do Service Worker + listeners de mensagens
// ——————————————————————————————————————————
if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      console.debug('[SW] registrado:', reg);

      // dispara quando um novo SW assume o controle
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        console.debug('[SW] controllerchange — nova versão ativa');
      });

      // Recebe mensagens do SW (badge e alteração de assinatura)
      navigator.serviceWorker.addEventListener('message', (evt) => {
        const msg = evt.data || {};
        console.debug('[SW→PAGE] message:', msg);

        // Atualiza "bolinha" (Badging API) quando suportado
        if (msg.type === 'BADGE_SET') {
          const n = Number(msg.count) || 0;
          if ('setAppBadge' in navigator && n > 0) {
            navigator.setAppBadge(n).catch(() => {});
          } else if ('clearAppBadge' in navigator && (n <= 0 || Number.isNaN(n))) {
            navigator.clearAppBadge().catch(() => {});
          }
        }

        // A assinatura de push mudou/expirou → refaça a inscrição (em outro fluxo)
        if (msg.type === 'PUSH_SUBSCRIPTION_CHANGED') {
          console.debug('[SW] assinatura de push alterada/expirada — re-assinar no cliente');
        }
      });
    } catch (err) {
      console.error('[SW] Falha ao registrar:', err);
    }
  });
} else {
  console.warn('[SW] Service Worker não suportado neste navegador.');
}
