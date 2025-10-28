// Envia push REAL para UMA subscription Web Push (VAPID).
// Espera { subscription, title, body, data } no corpo.

import webpush from "web-push";

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || process.env.VITE_VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails("mailto:admin@sistemastands.com.br", VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    if (req.body && typeof req.body === "object") return resolve(req.body);
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }

  try {
    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
      return res.status(500).json({ ok: false, error: "VAPID keys ausentes no servidor" });
    }

    const body = await readJson(req);
    const { subscription, title, body: bodyText, data = {} } = body || {};

    if (!subscription || !subscription.endpoint) {
      return res.status(400).json({ ok: false, error: "subscription ausente" });
    }

    const payload = JSON.stringify({
      title: title || "Push",
      body: bodyText || "",
      data,
      icon: "/icons/icon-192x192.png",
      badge: "/icons/badge-72x72.png",
    });

    const result = await webpush.sendNotification(subscription, payload);
    return res.status(200).json({ ok: true, result });
  } catch (err) {
    return res.status(500).json({ ok: false, error: String(err?.message || err) });
  }
}
