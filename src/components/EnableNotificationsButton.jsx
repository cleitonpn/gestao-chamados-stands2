// src/components/EnableNotificationsButton.jsx
import React, { useCallback, useMemo, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
// -> usa o serviço que você já criou e que salvou no Firestore (push_subscriptions)
import { savePushSubscription } from "../services/pushclient";

const DEBUG = true; // deixe true por enquanto; depois pode trocar p/ false

function log(...args) {
  if (DEBUG) console.log("[PUSH]", ...args);
}
function warn(...args) {
  if (DEBUG) console.warn("[PUSH]", ...args);
}
function err(...args) {
  console.error("[PUSH]", ...args);
}

function urlBase64ToUint8Array(base64String) {
  // compatível com applicationServerKey
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/\-/g, "+").replace(/_/g, "/");
  const rawData = globalThis.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

export default function EnableNotificationsButton({ className = "" }) {
  const { currentUser } = useAuth();
  const [busy, setBusy] = useState(false);

  const VAPID = useMemo(() => (import.meta?.env?.VITE_VAPID_PUBLIC_KEY || "").trim(), []);

  const ensureVapid = useCallback(() => {
    if (!VAPID) {
      alert("Defina VITE_VAPID_PUBLIC_KEY no Vercel e redeploy.");
      warn("VITE_VAPID_PUBLIC_KEY ausente no build.");
      return false;
    }
    return true;
  }, [VAPID]);

  const registerServiceWorker = useCallback(async () => {
    if (!("serviceWorker" in navigator)) throw new Error("Service Worker não suportado");
    const reg = await navigator.serviceWorker.register("/sw.js");
    log("Service Worker registrado:", reg.scope || reg);
    return reg;
  }, []);

  const requestPermission = useCallback(async () => {
    if (!("Notification" in window)) throw new Error("Notifications não suportado neste navegador");
    if (Notification.permission === "granted") return true;
    const result = await Notification.requestPermission();
    log("Permissão de notificação:", result);
    return result === "granted";
  }, []);

  const doSubscribe = useCallback(
    async (reg) => {
      const sub =
        (await reg.pushManager.getSubscription()) ||
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID),
        }));
      log("Subscription OK:", sub?.endpoint);
      return sub;
    },
    [VAPID]
  );

  const saveSubscription = useCallback(
    async (subscription) => {
      try {
        // salva usando o serviço que já funciona no seu projeto
        await savePushSubscription(subscription, {
          userId: currentUser?.uid || null,
          area:
            currentUser?.area_atual ||
            currentUser?.areaAtual ||
            currentUser?.area ||
            null,
          device: navigator.userAgent,
        });
        log("Assinatura salva no Firestore.");
      } catch (e) {
        err("Falha ao salvar assinatura:", e);
        throw e;
      }
    },
    [currentUser]
  );

  const handleSubscribeReal = useCallback(async () => {
    try {
      setBusy(true);
      if (!ensureVapid()) return;

      const granted = await requestPermission();
      if (!granted) {
        alert("Permissão de notificações negada.");
        return;
      }

      const reg = await registerServiceWorker();
      const sub = await doSubscribe(reg);
      await saveSubscription(sub);

      alert("Assinado com sucesso neste dispositivo!");
    } catch (e) {
      err(e);
      alert("Falha ao assinar: " + (e?.message || e));
    } finally {
      setBusy(false);
    }
  }, [ensureVapid, requestPermission, registerServiceWorker, doSubscribe, saveSubscription]);

  const handleBroadcastTest = useCallback(async () => {
    try {
      setBusy(true);
      // envia broadcast (o endpoint sempre responde JSON no patch que te passei)
      const r = await fetch("/api/push/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // se quiser mandar só pra você durante os testes:
          // filters: { userId: currentUser?.uid || "" },
          filters: {},
          payload: {
            title: "📣 Broadcast de teste",
            body: "Enviado pelo botão da Dashboard.",
            url: "/dashboard",
            tag: "broadcast-test",
          },
        }),
      });

      // parse "à prova" (se por algum motivo voltar texto/HTML)
      const text = await r.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        data = { ok: false, error: text || `HTTP ${r.status}` };
      }
      log("Broadcast result:", data);

      if (!r.ok || !data.ok) throw new Error(data.error || `HTTP ${r.status}`);
      alert(`Broadcast OK — enviados: ${data.sent}/${data.total}`);
    } catch (e) {
      err(e);
      alert("Falha no broadcast: " + (e?.message || e));
    } finally {
      setBusy(false);
    }
  }, [currentUser?.uid]);

  const handleClearBadge = useCallback(async () => {
    try {
      if ("clearAppBadge" in navigator) {
        // PWA badge API
        // @ts-ignore
        await navigator.clearAppBadge();
      }
      if ("setAppBadge" in navigator) {
        // @ts-ignore
        await navigator.setAppBadge(0);
      }
      log("Badge limpo.");
    } catch (e) {
      warn("Badge API indisponível:", e?.message || e);
    }
  }, []);

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <button
        onClick={handleSubscribeReal}
        disabled={busy}
        className="rounded-md bg-emerald-700 px-4 py-2 text-white hover:bg-emerald-800 disabled:opacity-60"
        title="Registra SW, pede permissão e assina com a VAPID PUBLIC KEY"
      >
        Assinar Push real
      </button>

      <button
        onClick={handleBroadcastTest}
        disabled={busy}
        className="rounded-md bg-violet-600 px-4 py-2 text-white hover:bg-violet-700 disabled:opacity-60"
        title="Envia um broadcast de teste usando /api/push/broadcast"
      >
        Broadcast (teste)
      </button>

      <button
        onClick={handleClearBadge}
        className="rounded-md bg-slate-700 px-4 py-2 text-white hover:bg-slate-800"
        title="Zera o badge do ícone do app"
      >
        Limpar bolinha
      </button>
    </div>
  );
}
