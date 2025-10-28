// src/lib/firebaseClient.js
// Inicializa Firebase uma única vez e exporta `app` e **db`
// Também salva `db` em globalThis.__FIREBASE_DB como fallback.

import { initializeApp, getApp, getApps } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

// Import robusto: aceita default export OU named exports
import * as CfgModule from '../config/firebase.js';

let firebaseConfig =
  (CfgModule && (CfgModule.default || CfgModule.firebaseConfig || CfgModule.FIREBASE_CONFIG || CfgModule.config)) ||
  null;

// Fallback por variáveis de ambiente do Vite (opcional)
if (!firebaseConfig || !firebaseConfig.projectId) {
  const maybeFromEnv = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
  };
  if (maybeFromEnv.projectId) {
    firebaseConfig = maybeFromEnv;
  }
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

// Fallback global (usado caso outro módulo importe antes)
try {
  globalThis.__FIREBASE_DB = db;
} catch (_) {}

export { app, db };
