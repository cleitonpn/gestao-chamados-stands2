// api/push/gen-keys.mjs
import webpush from 'web-push';

export const config = { runtime: 'nodejs' };

export default async function handler(_req, res) {
  try {
    const keys = webpush.generateVAPIDKeys();
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.status(200).send(JSON.stringify(keys));
  } catch (err) {
    res.status(500).send(String(err?.message || err));
  }
}
