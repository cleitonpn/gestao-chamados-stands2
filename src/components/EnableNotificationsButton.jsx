import React, { useState } from "react";
import { ensureVapidKeyAndSubscribe, testRealPush, clearBadge } from "@/lib/pushClient";

export default function EnableNotificationsButton() {
  const [busy, setBusy] = useState(false);

  const onSubscribeClick = async () => {
    try {
      setBusy(true);
      await ensureVapidKeyAndSubscribe({ debug: true });
      alert("Pronto! Dispositivo assinado para receber push real ✅");
    } catch (err) {
      console.error(err);
      alert(err?.message || "Falha ao assinar push.");
    } finally {
      setBusy(false);
    }
  };

  const onTestRealPushClick = async () => {
    try {
      setBusy(true);
      await testRealPush({ debug: true });
      alert("Disparo solicitado. Veja se chegou uma notificação na barra do sistema.");
    } catch (err) {
      console.error(err);
      alert("Falha ao enviar push real: " + (err?.message || err));
    } finally {
      setBusy(false);
    }
  };

  const onClearBadgeClick = async () => {
    try { await clearBadge(); alert("Bolinha/contagem limpa."); } catch (e) { console.warn(e); }
  };

  return (
    <div className="flex gap-2">
      <button disabled={busy} className="px-4 py-2 rounded bg-emerald-600 text-white" onClick={onSubscribeClick}>
        Assinar Push real
      </button>

      <button disabled={busy} className="px-4 py-2 rounded bg-violet-600 text-white" onClick={onTestRealPushClick}>
        Testar Push real
      </button>

      <button className="px-4 py-2 rounded bg-slate-700 text-white" onClick={onClearBadgeClick}>
        Limpar bolinha
      </button>
    </div>
  );
}
