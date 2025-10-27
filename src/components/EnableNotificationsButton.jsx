import React, { useState } from 'react';

export default function EnableNotificationsButton() {
  const [status, setStatus] = useState('idle');

  const testLocalNotif = async () => {
    try {
      setStatus('asking');

      // iOS exige gesto do usuário (clique) - estamos dentro de onClick, ok
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') {
        setStatus('denied');
        return;
      }

      // aguarda SW ficar pronto
      const reg = await navigator.serviceWorker.ready;

      // dispara uma notificação local (sem push)
      await reg.showNotification('🔔 Teste de notificação', {
        body: 'Se você está vendo isso, as notificações nativas funcionam neste dispositivo.',
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        vibrate: [100, 50, 100],
        tag: 'teste-local'
      });

      // tenta setar a “bolinha” (badge) quando suportado (Windows/macOS/iOS HSWA)
      if ('setAppBadge' in navigator) {
        try { await navigator.setAppBadge(1); } catch (e) {}
      }

      setStatus('ok');
    } catch (err) {
      console.error(err);
      setStatus('error');
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
        Ativar & Testar
      </button>
      <button onClick={clearBadge} style={{padding:'8px 12px', borderRadius:8, background:'#374151', color:'#fff'}}>
        Limpar bolinha
      </button>
      <span style={{fontSize:12, opacity:0.85}}>
        {status === 'ok' && '✔️ Deu certo! Você deve ver uma notificação nativa.'}
        {status === 'denied' && '❌ Permissão negada. Ative manualmente nas configurações do sistema.'}
        {status === 'asking' && '…pedindo permissão'}
        {status === 'error' && '⚠️ Erro ao testar. Veja o console (F12).'}
      </span>
    </div>
  );
}
