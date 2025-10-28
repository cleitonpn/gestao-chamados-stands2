// src/lib/firebaseClient.js
// Inicializa Firebase uma única vez e exporta { app, db }.
// Aceita config via default export, via named (firebaseConfig/FIREBASE_CONFIG/config)
// ou via variáveis de ambiente (VITE_FIREBASE_*).

import { initializeApp, getApp, getApps } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

// Import robusto: não usa named import (evita erro de "não exportado")
import * as CfgModule from '../config/firebase.js';

let firebaseConfig =
  CfgModule?.default ||
  CfgModule?.firebaseConfig ||
  CfgModule?.FIREBASE_CONFIG ||
  CfgModule?.config ||
  null;

// Fallback pelas ENV do Vite (configure no Vercel: Settings > Environment Variables)
if (!firebaseConfig || !firebaseConfig.projectId) {
  const envCfg = {
    apiKey:             import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain:         import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId:          import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket:      import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId:  import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId:              import.meta.env.VITE_FIREBASE_APP_ID,
  };
  if (envCfg.projectId) firebaseConfig = envCfg;
}

if (!firebaseConfig || !firebaseConfig.projectId) {
  throw new Error(
    'firebaseClient: config do Firebase não encontrada. ' +
    'Exporte default OU named (firebaseConfig/FIREBASE_CONFIG/config) em src/config/firebase.js ' +
    'ou defina VITE_FIREBASE_* no Vercel.'
  );
}

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const db = getFirestore(app);

// Fallback global para módulos que rodem antes
try { globalThis.__FIREBASE_DB = db; } catch {}

export { app, db };
