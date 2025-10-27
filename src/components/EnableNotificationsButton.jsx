// src/components/EnableNotificationsButton.jsx
import React, { useState } from 'react';
import { ensurePushEnabled, sendSelfTestPush } from '../lib/pushClient';

const VAPID_PUBLIC = import.meta?.env?.VITE_VAPID_PUBLIC_KEY;

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
        try { await navigator.setAppBadge(1); } catch (e) {}
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
      const subscription = sub || (await (async () => {
        const reg = await navigator.serviceWorker.ready;
        return await reg.pushManager.getSubscription();
      })());
      if (!subscription) {
        setStatus('need-sub');
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
      try { await navigator.clearAppBadge(); } catch (e) {}
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
        {status?.startsWith('error') && '⚠️ Erro — veja o console.'}
      </span>
    </div>
  );
}
