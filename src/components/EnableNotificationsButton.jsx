// src/components/EnableNotificationsButton.jsx
import React, { useEffect, useMemo, useState } from "react";
// IMPORT RELATIVO (evita erro no Vercel se o alias "@" não estiver configurado)
import {
  ensureVapidKeyAndSubscribe,
  testRealPush,
  clearBadge,
} from "../lib/pushClient";

function Pill({ color = "slate", children }) {
  const cls =
    color === "green"
      ? "bg-emerald-600"
      : color === "red"
      ? "bg-rose-600"
      : color === "yellow"
      ? "bg-amber-600"
      : "bg-slate-700";
  return (
    <span className={`inline-block text-white text-xs px-2 py-1 rounded ${cls}`}>
      {children}
    </span>
  );
}

export default function EnableNotificationsButton() {
  const [busy, setBusy] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");
  const [lastError, setLastError] = useState("");
  const [perm, setPerm] = useState(Notification?.permission || "default");
  const [swReady, setSwReady] = useState(false);
  const [hasVapidHint, setHasVapidHint] = useState(false);

  // Detecta presença de VAPID no bundle (Vite) / meta / window (só como indicador)
  const vapidInBundle = useMemo(() => {
    try {
      // Vite (em build) injeta import.meta.env.* quando disponíveis
      const k = import.meta?.env?.VITE_VAPID_PUBLIC_KEY;
      return Boolean(k && typeof k === "string" && k.startsWith("B"));
    } catch {
      return false;
    }
  }, []);

  useEffect(() => {
    const metaKey = document.querySelector('meta[name="vapid-public-key"]')?.content;
    const winKey = window.__VAPID_PUBLIC_KEY;
    setHasVapidHint(Boolean(metaKey || winKey || vapidInBundle));

    // Checa SW
    (async () => {
      try {
        if ("serviceWorker" in navigator) {
          const reg = await navigator.serviceWorker.getRegistration();
          setSwReady(Boolean(reg));
        } else {
          setSwReady(false);
        }
      } catch {
        setSwReady(false);
      }
    })();
  }, [vapidInBundle]);

  const handleAskPermissionLocal = async () => {
    try {
      setBusy(true);
      setLastError("");
      const permission = await Notification.requestPermission();
      setPerm(permission);

      if (permission !== "granted") {
        setStatusMsg("Permissão negada pelo usuário.");
        return;
      }

      // Notificação local simples (sem push) para validar UI do sistema
      new Notification("🔔 Notificações ativas", {
        body: "Teste local exibido com sucesso.",
        tag: "local-test",
      });
      setStatusMsg("Teste local enviado.");
    } catch (err) {
      console.error(err);
      setLastError(err?.message || String(err));
      setStatusMsg("Falha ao testar local.");
    } finally {
      setBusy(false);
    }
  };

  const handleSubscribeReal = async () => {
    try {
      setBusy(true);
      setLastError("");
      setStatusMsg("Assinando push real…");

      await ensureVapidKeyAndSubscribe({ debug: true });

      setStatusMsg("Dispositivo assinado para push real ✅");
    } catch (err) {
      console.error(err);
      setLastError(err?.message || String(err));
      // Mantém o alerta — útil para usuários
      alert(err?.message || "Falha ao assinar push.");
      setStatusMsg("Falha ao assinar push real.");
    } finally {
      setBusy(false);
    }
  };

  const handleTestRealPush = async () => {
    try {
      setBusy(true);
      setLastError("");
      setStatusMsg("Solicitando envio…");

      await testRealPush({ debug: true });

      setStatusMsg("Disparo solicitado. Verifique a barra de notificações.");
    } catch (err) {
      console.error(err);
      setLastError(err?.message || String(err));
      alert("Falha ao enviar push real: " + (err?.message || err));
      setStatusMsg("Falha ao solicitar envio.");
    } finally {
      setBusy(false);
    }
  };

  const handleClearBadge = async () => {
    try {
      setBusy(true);
      setLastError("");
      await clearBadge();
      setStatusMsg("Contador/bolinha limpo.");
    } catch (err) {
      console.warn(err);
      setLastError(err?.message || String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Linha de botões */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          disabled={busy}
          onClick={handleAskPermissionLocal}
          className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
          title="Pede permissão e mostra uma notificação local (sem push)"
        >
          Ativar & Testar (local)
        </button>

        <button
          disabled={busy}
          onClick={handleSubscribeReal}
          className="px-4 py-2 rounded bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60"
          title="Registra a assinatura com a VAPID key (push real)"
        >
          Assinar Push real
        </button>

        <button
          disabled={busy}
          onClick={handleTestRealPush}
          className="px-4 py-2 rounded bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-60"
          title="Dispara um push real via endpoint do servidor"
        >
          Testar Push real
        </button>

        <button
          disabled={busy}
          onClick={handleClearBadge}
          className="px-4 py-2 rounded bg-slate-700 text-white hover:bg-slate-800 disabled:opacity-60"
          title="Zera o contador/bolinha do app"
        >
          Limpar bolinha
        </button>

        {/* Status curto */}
        {statusMsg ? (
          <span className="text-sm text-slate-300 ml-2">• {statusMsg}</span>
        ) : null}
      </div>

      {/* Painel de debug */}
      <div className="text-xs grid grid-cols-1 md:grid-cols-2 gap-2 p-3 rounded-lg bg-slate-800/70 border border-slate-700">
        <div className="flex items-center gap-2">
          <span className="text-slate-300">Permissão:</span>
          {perm === "granted" ? (
            <Pill color="green">granted</Pill>
          ) : perm === "denied" ? (
            <Pill color="red">denied</Pill>
          ) : (
            <Pill>default</Pill>
          )}
        </div>

        <div className="flex items-center gap-2">
          <span className="text-slate-300">SW registrado:</span>
          {swReady ? <Pill color="green">sim</Pill> : <Pill color="red">não</Pill>}
        </div>

        <div className="flex items-center gap-2">
          <span className="text-slate-300">VAPID no bundle/meta:</span>
          {hasVapidHint ? <Pill color="green">presente</Pill> : <Pill color="yellow">via API</Pill>}
        </div>

        <div className="flex items-center gap-2">
          <span className="text-slate-300">Busy:</span>
          {busy ? <Pill color="yellow">sim</Pill> : <Pill>não</Pill>}
        </div>

        {lastError ? (
          <div className="md:col-span-2">
            <div className="mt-1 p-2 rounded bg-rose-900/40 text-rose-200 border border-rose-800">
              <strong>Erro:</strong> {lastError}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
