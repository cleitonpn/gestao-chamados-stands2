// src/components/EnableNotificationsButton.jsx
import React, { useState } from 'react';
import { ensurePushEnabled, sendSelfTestPush } from '../lib/pushClient';
import { savePushSubscription } from '../services/pushSubscriptionService';
import { useAuth } from '../contexts/AuthContext';

const VAPID_PUBLIC = (import.meta?.env?.VITE_VAPID_PUBLIC_KEY || '').trim();

export default function EnableNotificationsButton() {
  const [status, setStatus] = useState('idle');
  const [sub, setSub] = useState(null);
  const { currentUser } = useAuth();

  const testLocalNotif = async () => {
    try {
      setStatus('asking');
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') { setStatus('denied'); return; }
      const reg = await navigator.serviceWorker.ready;
      await reg.showNotification('🔔 Teste local', { body: 'OK!', icon: '/icons/icon-192x192.png', badge: '/icons/icon-192x192.png' });
      if ('setAppBadge' in navigator) { try { await navigator.setAppBadge(1); } catch {} }
      setStatus('ok-local');
    } catch { setStatus('error'); }
  };

  const subscribeRealPush = async () => {
    try {
      setStatus('subscribing');
      if (!VAPID_PUBLIC) { setStatus('error-sub'); alert('Defina VITE_VAPID_PUBLIC_KEY no Vercel e redeploy.'); return; }
      const subscription = await ensurePushEnabled(VAPID_PUBLIC);
      setSub(subscription);
      try {
        const endpoint = subscription?.endpoint;
        const json = subscription?.toJSON ? subscription.toJSON() : subscription;
        await savePushSubscription({ userId: currentUser?.uid || 'anon', endpoint, subscription: json });
      } catch (e) {
        console.warn('[PUSH] falha ao salvar assinatura no Firestore:', e);
      }
      setStatus('subscribed');
    } catch { setStatus('error-sub'); }
  };

  const testRealPush = async () => {
    try {
      setStatus('sending');
      const subscription = sub || (await (await navigator.serviceWorker.ready).pushManager.getSubscription());
      if (!subscription) { setStatus('need-sub'); alert('Assine o push primeiro.'); return; }
      await sendSelfTestPush(subscription, { title: '🚀 Push real', body: 'Isso veio do servidor.', url: '/dashboard' });
      setStatus('sent');
    } catch { setStatus('error-send'); }
  };

  // 🔊 Broadcast simples (chama /api/push/broadcast)
  const testBroadcast = async () => {
    try {
      setStatus('broadcasting');
      const r = await fetch('/api/push/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filters: {}, // opcional: { userId: currentUser?.uid } ou { area: 'financeiro' }
          payload: { title: '📣 Broadcast de teste', body: 'Enviado para todos ativos.', url: '/dashboard' }
        })
      });
      const j = await r.json();
      console.log('[BROADCAST]', j);
      if (j?.ok) setStatus('broadcast-ok'); else setStatus('broadcast-err');
    } catch (e) {
      console.error(e);
      setStatus('broadcast-err');
    }
  };

  const clearBadge = async () => {
    if ('clearAppBadge' in navigator) { try { await navigator.clearAppBadge(); } catch {} }
  };

  return (
    <div style={{display:'flex', gap:8, alignItems:'center', flexWrap:'wrap'}}>
      <button onClick={testLocalNotif} style={{padding:'8px 12px', borderRadius:8, background:'#2563eb', color:'#fff'}}>Ativar & Testar (local)</button>
      <button onClick={subscribeRealPush} style={{padding:'8px 12px', borderRadius:8, background:'#047857', color:'#fff'}}>Assinar Push real</button>
      <button onClick={testRealPush} style={{padding:'8px 12px', borderRadius:8, background:'#7c3aed', color:'#fff'}}>Testar Push real</button>
      <button onClick={testBroadcast} style={{padding:'8px 12px', borderRadius:8, background:'#111827', color:'#fff'}}>Broadcast (teste)</button>
      <button onClick={clearBadge} style={{padding:'8px 12px', borderRadius:8, background:'#374151', color:'#fff'}}>Limpar bolinha</button>
      <span style={{fontSize:12, opacity:0.85}}>
        {status === 'ok-local' && '✔️ Local OK.'}
        {status === 'subscribed' && '✔️ Assinado e salvo.'}
        {status === 'sent' && '✔️ Push real enviado.'}
        {status === 'broadcast-ok' && '✔️ Broadcast enviado.'}
        {status === 'broadcast-err' && '⚠️ Falha no broadcast (veja console).'} 
        {status?.startsWith('error') && '⚠️ Erro — veja console.'}
      </span>
    </div>
  );
}
