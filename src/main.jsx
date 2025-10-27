// src/main.jsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.jsx';

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
      // console.log('SW registrado:', reg);

      // Recebe mensagens do SW (badge e alteração de assinatura)
      navigator.serviceWorker.addEventListener('message', (evt) => {
        const msg = evt.data || {};

        // Atualiza "bolinha" (Badging API) quando suportado
        if (msg.type === 'BADGE_SET') {
          const n = Number(msg.count) || 0;

          if ('setAppBadge' in navigator && n > 0) {
            navigator.setAppBadge(n).catch(() => {});
          } else if ('clearAppBadge' in navigator && (n <= 0 || Number.isNaN(n))) {
            navigator.clearAppBadge().catch(() => {});
          }
        }

        // A assinatura de push mudou/expirou → refaça a inscrição (Passo 2)
        if (msg.type === 'PUSH_SUBSCRIPTION_CHANGED') {
          // TODO (Passo 2):
          // ensurePushEnabled(VAPID_PUBLIC_KEY_BASE64URL).catch(() => {});
        }
      });
    } catch (err) {
      console.error('Falha ao registrar o Service Worker:', err);
    }
  });
}
