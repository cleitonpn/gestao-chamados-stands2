// src/components/EnableNotificationsButton.jsx
import React, { useState } from 'react';
import { ensurePushEnabled, sendSelfTestPush } from '../lib/pushClient';

// Lê a chave pública do VAPID do build do Vite e normaliza (evita espaços/quebras)
const VAPID_PUBLIC = (import.meta?.env?.VITE_VAPID_PUBLIC_KEY || '').trim();

// 🔎 DEBUG: ajuda a confirmar se a env chegou no bundle
// (mostra só o começo para não vazar a chave completa no console)
console.debug('[PUSH] MODE =', import.meta.env?.MODE, '| VAPID key present =', !!VAPID_PUBLIC);
if (VAPID_PUBLIC) {
  console.debug('[PUSH] VITE_VAPID_PUBLIC_KEY prefix =', VAPID_PUBLIC.slice(0, 12) + '…');
} else {
  console.warn('[PUSH] VITE_VAPID_PUBLIC_KEY ausente no build — defina no Vercel e faça novo deploy.');
}

export default function EnableNotificationsButton() {
  const [status, setStatus] = useState('idle');
  const [sub, setSub] = useState(null);

  const testLocalNotif = async () => {
    try {
      setStatus('asking');
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') { setStatus('denied'); return; }
      const reg = await navigator.serviceWorker.ready;
      await reg.showNotification('🔔 Teste de notificação (local)', {
        body: 'Se você está vendo isso, as notificações nativas funcionam neste dispositivo.',
        icon: '/icons/icon-192x192.png',
        badge: '/icons/icon-192x192.png',
        vibrate: [100, 50, 100],
        tag: 'teste-local'
      });
      if ('setAppBadge' in navigator) {
        try { await navigator.setAppBadge(1); } catch {}
      }
      setStatus('ok-local');
    } catch (err) {
      console.error(err);
      setStatus('error');
    }
  };

  const subscribeRealPush = async () => {
    try {
      setStatus('subscribing');

      // ✅ Checagem amigável: sem VAPID no bundle não tem como assinar
      if (!VAPID_PUBLIC) {
        setStatus('error-sub');
        alert('A chave VITE_VAPID_PUBLIC_KEY não está presente no build.\n\n' +
              '1) Vercel → Project → Settings → Environment Variables\n' +
              '   - VITE_VAPID_PUBLIC_KEY = (sua PUBLIC KEY começando com B...)\n' +
              '2) Faça um novo deploy\n' +
              '3) Reabra o PWA instalado');
        return;
      }

      const subscription = await ensurePushEnabled(VAPID_PUBLIC);
      setSub(subscription);
      setStatus('subscribed');
    } catch (err) {
      console.error(err);
      setStatus('error-sub');
    }
  };

  const testRealPush = async () => {
    try {
      setStatus('sending');
      // Reutiliza a subscription existente ou busca do SW
      const subscription = sub || (await (async () => {
        const reg = await navigator.serviceWorker.ready;
        return await reg.pushManager.getSubscription();
      })());
      if (!subscription) {
        setStatus('need-sub');
        alert('Assine o push primeiro (clique em "Assinar Push real").');
        return;
      }
      await sendSelfTestPush(subscription, {
        title: '🚀 Push real funcionando!',
        body: 'Esta notificação veio do servidor via Web Push (VAPID).',
        url: '/dashboard',
        badgeCount: 3,
        tag: 'push-real'
      });
      setStatus('sent');
    } catch (err) {
      console.error(err);
      setStatus('error-send');
    }
  };

  const clearBadge = async () => {
    if ('clearAppBadge' in navigator) {
      try { await navigator.clearAppBadge(); } catch {}
    }
  };

  return (
    <div style={{display:'flex', gap:8, alignItems:'center', flexWrap:'wrap'}}>
      <button onClick={testLocalNotif} style={{padding:'8px 12px', borderRadius:8, background:'#2563eb', color:'#fff'}}>
        Ativar & Testar (local)
      </button>
      <button onClick={subscribeRealPush} style={{padding:'8px 12px', borderRadius:8, background:'#047857', color:'#fff'}}>
        Assinar Push real
      </button>
      <button onClick={testRealPush} style={{padding:'8px 12px', borderRadius:8, background:'#7c3aed', color:'#fff'}}>
        Testar Push real
      </button>
      <button onClick={clearBadge} style={{padding:'8px 12px', borderRadius:8, background:'#374151', color:'#fff'}}>
        Limpar bolinha
      </button>
      <span style={{fontSize:12, opacity:0.85}}>
        {status === 'ok-local' && '✔️ Notificação local OK.'}
        {status === 'subscribing' && '…assinando push real'}
        {status === 'subscribed' && '✔️ Assinatura de push criada.'}
        {status === 'need-sub' && 'Assine o push real antes de testar.'}
        {status === 'sent' && '✔️ Push real enviado. Verifique a barra de notificação.'}
        {status === 'denied' && '❌ Permissão negada.'}
        {status === 'error-sub' && '⚠️ Falha ao assinar: VAPID ausente ou erro — veja o console.'}
        {status === 'error-send' && '⚠️ Erro ao enviar push — veja o console.'}
        {status === 'error' && '⚠️ Erro — veja o console.'}
      </span>
    </div>
  );
}
