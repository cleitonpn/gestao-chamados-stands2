// src/components/EnableNotificationsButton.jsx
import React, { useMemo, useState } from "react";

// ⚠️ Import RELATIVO garante que o Vercel resolva o caminho corretamente.
import {
  ensurePermission,
  registerServiceWorker,
  getOrCreateSubscription,
  saveSubscriptionInFirestore,
  sendRealPush,
  sendBroadcast,
  clearBadge,
  getDebugInfo,
} from "../lib/pushClient";

function Badge({ ok }) {
  return (
    <span
      className={`ml-2 inline-block h-2 w-2 rounded-full ${
        ok ? "bg-emerald-500" : "bg-zinc-400"
      }`}
      title={ok ? "ok" : "não"}
    />
  );
}

export default function EnableNotificationsButton() {
  const [busy, setBusy] = useState(false);

  const dbg = useMemo(() => getDebugInfo?.() || {}, [busy]);

  const alertJSON = (title, payload) => {
    try {
      window.alert(`${title}: ${JSON.stringify(payload)}`);
    } catch {
      window.alert(title);
    }
  };

  const handleEnable = async () => {
    if (busy) return;
    setBusy(true);
    try {
      // 1) Garantir permissão do navegador
      const perm = await ensurePermission();
      if (perm !== "granted") {
        window.alert("Permissão de notificação negada/cancelada.");
        return;
      }

      // 2) Registrar (ou obter) o Service Worker
      const reg = await registerServiceWorker();
      if (!reg) {
        window.alert("Falha ao registrar o Service Worker.");
        return;
      }

      // 3) Criar (ou obter) a assinatura Web Push
      const sub = await getOrCreateSubscription(reg);
      if (!sub) {
        window.alert("Não foi possível criar/obter a assinatura Web Push.");
        return;
      }

      // 4) Persistir no Firestore (coleção push_subscriptions)
      const saved = await saveSubscriptionInFirestore(sub);
      alertJSON("Assinatura salva", { ok: saved ? true : false });
    } catch (err) {
      console.error(err);
      window.alert(`Falha ao assinar push: ${String(err?.message || err)}`);
    } finally {
      setBusy(false);
    }
  };

  const handleTestRealPush = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await sendRealPush({
        title: "Teste (real)",
        body: "Ping do sistema de push",
        url: "https://www.sistemastands.com.br",
      });
      alertJSON("✅ Push real enviado", res);
    } catch (err) {
      console.error(err);
      window.alert(`Falha no push real: ${String(err?.message || err)}`);
    } finally {
      setBusy(false);
    }
  };

  const handleBroadcast = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await sendBroadcast({
        title: "Broadcast (teste)",
        body: "Ping geral do sistema de push",
      });
      alertJSON("✅ Broadcast enviado", res);
    } catch (err) {
      console.error(err);
      window.alert(`Falha no broadcast: ${String(err?.message || err)}`);
    } finally {
      setBusy(false);
    }
  };

  const handleClearBadge = async () => {
    try {
      await clearBadge();
      window.alert("Badge/bolinha limpa.");
    } catch (err) {
      console.error(err);
      window.alert(`Falha ao limpar badge: ${String(err?.message || err)}`);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={handleEnable}
        disabled={busy}
        className="rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
      >
        Assinar Push real
      </button>

      <button
        type="button"
        onClick={handleTestRealPush}
        disabled={busy}
        className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
      >
        Testar Push real
      </button>

      <button
        type="button"
        onClick={handleBroadcast}
        disabled={busy}
        className="rounded-md bg-purple-600 px-3 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50"
      >
        Broadcast (teste)
      </button>

      <button
        type="button"
        onClick={handleClearBadge}
        className="rounded-md bg-zinc-600 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-700"
      >
        Limpar bolinha
      </button>

      {/* Indicadores rápidos (sem overlay flutuando na tela) */}
      <div className="ml-3 text-xs text-zinc-500">
        Permissão: <strong>{dbg.permission ?? "—"}</strong>
        <Badge ok={dbg.permission === "granted"} />
        <span className="mx-2">|</span>
        SW registrado: <strong>{dbg.swRegistered ? "sim" : "não"}</strong>
        <Badge ok={!!dbg.swRegistered} />
        <span className="mx-2">|</span>
        VAPID: <strong>{dbg.vapidMode ?? "—"}</strong>
        <Badge ok={!!dbg.vapidMode} />
        <span className="mx-2">|</span>
        Busy: <strong>{busy ? "sim" : "não"}</strong>
        <Badge ok={!busy} />
      </div>
    </div>
  );
}
