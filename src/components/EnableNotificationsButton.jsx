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
  getDebugInfo,
} from '../lib/pushClient';

export default function EnableNotificationsButton() {
  const [busy, setBusy] = useState(false);
  const lastInfoRef = useRef(null);

  async function doDebug() {
    const info = await getDebugInfo();
    lastInfoRef.current = info;
    console.log('[Push Debug]', info);
    alert('Debug gerado. Veja o console para detalhes.');
  }

  async function doSubscribe() {
    setBusy(true);
    try {
      await ensurePermission();
      const reg = await registerServiceWorker();
      const sub = await getOrCreateSubscription(reg);
      const saved = await saveSubscriptionInFirestore(sub, { scope: reg.scope });
      alert('Assinatura salva: ' + JSON.stringify({ id: saved.id, kind: saved.kind }).slice(0, 120));
    } catch (e) {
      alert('Falha ao assinar push: ' + (e?.message || e));
    } finally {
      setBusy(false);
    }
  }

  // ==================================================================
  // FUNÇÃO ATUALIZADA
  // Agora obtém a 'subscription' (com o token) antes de chamar sendRealPush
  // ==================================================================
  async function doTestReal() {
    setBusy(true);
    try {
      // 1. Precisamos obter a subscription atual para saber o token
      const reg = await registerServiceWorker();
      const sub = await getOrCreateSubscription(reg);
      if (!sub) throw new Error('Não foi possível obter a subscription para o teste.');

      // 2. Chamamos a função 'sendRealPush' atualizada, passando a subscription
      const out = await sendRealPush(sub, { title: 'Teste (real)', body: 'Ping do sistema de push', url: location.origin });
      
      alert('Push real enviado: ' + JSON.stringify(out?.result || out).slice(0, 160));
    } catch (e) {
      alert('Falha no push real: ' + (e?.message || e));
    } finally {
      setBusy(false);
    }
  }

  async function doBroadcast() {
    setBusy(true);
    try {
      const out = await sendBroadcast({ title: 'Broadcast (teste)', body: 'Ping do broadcast', url: location.origin });
      alert('Broadcast enviado: ' + JSON.stringify(out?.result || out).slice(0, 160));
    } catch (e) {
      alert('Falha no broadcast: ' + (e?.message || e));
    } finally {
      setBusy(false);
    }
  }

  async function doClearBadge() {
    try { await clearBadge(); } catch {}
  }

  return (
    <div className="flex flex-wrap gap-2">
      <button className="px-3 py-2 rounded bg-emerald-600 text-white" onClick={doSubscribe} disabled={busy}>
        Assinar Push
      </button>
      <button className="px-3 py-2 rounded bg-teal-600 text-white" onClick={doTestReal} disabled={busy}>
        Testar Push real
      </button>
      <button className="px-3 py-2 rounded bg-fuchsia-600 text-white" onClick={doBroadcast} disabled={busy}>
        Broadcast (teste)
      </button>
      <button className="px-3 py-2 rounded bg-slate-600 text-white" onClick={doClearBadge}>
        Limpar bolinha
      </button>
      <button className="px-3 py-2 rounded bg-slate-800 text-white" onClick={doDebug}>
        Debug
      </button>
    </div>
  );
}
