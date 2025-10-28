// src/components/EnableNotificationsButton.jsx
import React, { useRef, useState } from 'react';
import {
  ensurePermission,
  registerServiceWorker,
  getOrCreateSubscription,
  saveSubscriptionInFirestore,
  sendRealPush,
  sendBroadcast,
  clearBadge,
  getDebugInfo, // agora exportado de fato por pushClient
} from '../lib/pushClient';

export default function EnableNotificationsButton({ userId, className = '' }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const debugRef = useRef(null);

  async function handleEnable() {
    try {
      setBusy(true);
      setMsg('');
      await ensurePermission();
      const reg = await registerServiceWorker();
      const sub = await getOrCreateSubscription(reg);
      await saveSubscriptionInFirestore(userId || 'anon', sub);
      setMsg('Assinatura criada! ✅');
    } catch (e) {
      alert(`Falha ao assinar push: ${e?.message || e}`);
    } finally {
      setBusy(false);
    }
  }

  async function handleTestReal() {
    try {
      setBusy(true);
      const res = await sendRealPush({ title: 'Teste (real)', body: 'Ping do sistema de push' });
      alert(`Push real enviado: ${JSON.stringify(res)}`);
    } catch (e) {
      alert(`Falha no push real: ${e?.message || e}`);
    } finally {
      setBusy(false);
    }
  }

  async function handleBroadcast() {
    try {
      setBusy(true);
      const res = await sendBroadcast({ title: 'Broadcast', body: 'Olá assinantes!' });
      alert(`Broadcast enviado: ${JSON.stringify(res)}`);
    } catch (e) {
      alert(`Falha no broadcast: ${e?.message || e}`);
    } finally {
      setBusy(false);
    }
  }

  function handleClearBadge() {
    try { clearBadge(); setMsg('Badges limpos'); } catch {}
  }

  async function handleDebug() {
    try {
      const info = await getDebugInfo();
      debugRef.current = info;
      console.log('[Push Debug]', info);
      alert('Info de debug registrada no console.');
    } catch (e) {
      alert(`Falha ao coletar debug: ${e?.message || e}`);
    }
  }

  return (
    <div className={className}>
      <div className="flex gap-2 flex-wrap">
        <button className="px-3 py-2 rounded bg-blue-600 text-white disabled:opacity-60" onClick={handleEnable} disabled={busy}>
          Assinar Push
        </button>
        <button className="px-3 py-2 rounded bg-emerald-600 text-white disabled:opacity-60" onClick={handleTestReal} disabled={busy}>
          Testar Push real
        </button>
        <button className="px-3 py-2 rounded bg-purple-600 text-white disabled:opacity-60" onClick={handleBroadcast} disabled={busy}>
          Broadcast (teste)
        </button>
        <button className="px-3 py-2 rounded bg-zinc-700 text-white disabled:opacity-60" onClick={handleClearBadge} disabled={busy}>
          Limpar bolinha
        </button>
        <button className="px-3 py-2 rounded bg-slate-500 text-white disabled:opacity-60" onClick={handleDebug} disabled={busy} title="Mostra informações de debug no console">
          Debug
        </button>
      </div>
      {msg && <p className="text-sm text-zinc-500 mt-2">{msg}</p>}
    </div>
  );
}
