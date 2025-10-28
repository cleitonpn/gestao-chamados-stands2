// src/lib/firebaseClient.js
// Inicializa Firebase uma única vez. Exporta `app` e **db`.
// Aceita config via default export, named export, FIREBASE_CONFIG ou via ENV.

import { initializeApp, getApp, getApps } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

// Import robusto: funciona com qualquer formato do arquivo de config
import * as CfgModule from '../config/firebase.js';

let firebaseConfig =
  CfgModule?.default ||
  CfgModule?.firebaseConfig ||
  CfgModule?.FIREBASE_CONFIG ||
  CfgModule?.config ||
  null;

// Fallback via ENV do Vite (se preferir configurar no Vercel)
if (!firebaseConfig || !firebaseConfig.projectId) {
  const maybeEnv = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
  };
  if (maybeEnv.projectId) firebaseConfig = maybeEnv;
}

if (!firebaseConfig || !firebaseConfig.projectId) {
  throw new Error(
    'firebaseClient: config do Firebase não encontrado. ' +
      'Exporte default OU named (firebaseConfig/FIREBASE_CONFIG) em src/config/firebase.js ' +
      'ou defina VITE_FIREBASE_* no Vercel.'
  );
}

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const db = getFirestore(app);

// Fallback global (outros módulos podem usar se o import ocorrer fora de ordem)
try {
  globalThis.__FIREBASE_DB = db;
} catch (_) {}

export { app, db };
