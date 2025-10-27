// src/components/EnableNotificationsButton.jsx
import React, { useRef, useState } from 'react';
import {
  ensurePermission,
  registerServiceWorker,
  getOrCreateSubscription,
  saveSubscriptionInFirestore,
  sendRealPush,
  sendBroadcast,
} from '../lib/pushClient';

// HUD de debug OFF por padrão.
// Ligue só se quiser: localStorage.setItem('push:debug', 'on')
const wantDebug = typeof window !== 'undefined' && localStorage.getItem('push:debug') === 'on';

export default function EnableNotificationsButton() {
  const subRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [perm, setPerm] = useState(Notification?.permission ?? 'default');
  const [swReady, setSwReady] = useState(false);

  async function ensureReady() {
    await ensurePermission();
    setPerm('granted');
    const reg = await registerServiceWorker();
    setSwReady(true);
    const sub = await getOrCreateSubscription(reg);
    subRef.current = sub;
    await saveSubscriptionInFirestore(sub);
    return sub;
  }

  async function handleSubscribe() {
    try {
      setBusy(true);
      await ensureReady();
      alert('✅ Assinado com sucesso! Esta aba já pode receber push.');
    } catch (err) {
      console.error(err);
      alert('Falha ao assinar push: ' + (err?.message || err));
    } finally {
      setBusy(false);
    }
  }

  async function handleTestReal() {
    try {
      setBusy(true);
      let sub = subRef.current;
      if (!sub) sub = await ensureReady(); // garante que existe
      const resp = await sendRealPush(sub, {
        title: 'Teste (real)',
        body: 'Ping do sistema de push',
      });
      alert('✅ Push real enviado: ' + JSON.stringify(resp));
    } catch (err) {
      console.error(err);
      alert('Falha ao enviar push real: ' + (err?.message || err));
    } finally {
      setBusy(false);
    }
  }

  async function handleBroadcast() {
    try {
      setBusy(true);
      const resp = await sendBroadcast({
        title: 'Broadcast de teste',
        body: 'Mensagem para todos os inscritos ativos',
      });
      alert('✅ Broadcast enviado: ' + JSON.stringify(resp));
    } catch (err) {
      console.error(err);
      alert('Falha no broadcast: ' + (err?.message || err));
    } finally {
      setBusy(false);
    }
  }

  function clearBadge() {
    if ('setAppBadge' in navigator) {
      try { navigator.clearAppBadge(); } catch {}
    }
  }

  return (
    <div className="flex items-center gap-3">
      <button
        className="px-4 py-2 rounded bg-emerald-600 text-white disabled:opacity-60"
        onClick={handleSubscribe}
        disabled={busy}
      >
        Assinar Push real
      </button>

      <button
        className="px-4 py-2 rounded bg-indigo-600 text-white disabled:opacity-60"
        onClick={handleTestReal}
        disabled={busy}
      >
        Testar Push real
      </button>

      <button
        className="px-4 py-2 rounded bg-violet-600 text-white disabled:opacity-60"
        onClick={handleBroadcast}
        disabled={busy}
      >
        Broadcast (teste)
      </button>

      <button
        className="px-4 py-2 rounded bg-slate-700 text-white disabled:opacity-60"
        onClick={clearBadge}
        disabled={busy}
      >
        Limpar bolinha
      </button>

      {wantDebug && (
        <div
          style={{
            position: 'fixed',
            top: 8,
            left: 8,
            zIndex: 9999,
            padding: '8px 10px',
            background: 'rgba(20,20,30,0.92)',
            color: '#fff',
            borderRadius: 8,
            fontSize: 12,
          }}
        >
          <div>Permissão: <b>{perm}</b></div>
          <div>SW registrado: <b>{swReady ? 'sim' : 'não'}</b></div>
          <div>Busy: <b>{busy ? 'sim' : 'não'}</b></div>
          <div style={{ marginTop: 6 }}>
            <button
              onClick={() => { localStorage.removeItem('push:debug'); location.reload(); }}
              style={{ padding: '4px 6px', background: '#444', borderRadius: 6 }}
            >
              Fechar debug
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
