// api/push/public-key.mjs
export const config = { runtime: "nodejs" };

export default async function handler(req, res) {
  try {
    const key = process.env.VAPID_PUBLIC_KEY || process.env.VITE_VAPID_PUBLIC_KEY;
    if (!key) return res.status(500).send("VAPID public key ausente nas variáveis de ambiente.");
    res.setHeader("content-type", "application/json");
    res.status(200).end(JSON.stringify({ key }));
  } catch (e) {
    res.status(500).send(e?.message || "Erro ao obter VAPID key.");
  }
}
