// Cliente Firebase único para o app (Web SDK modular).
// Exporta `app` e **db** e ainda salva o db em `globalThis.__FIREBASE_DB`
// para fallback em outros módulos.

import { initializeApp, getApp, getApps } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

// Ajuste este import se o seu arquivo/export for diferente.
// Em 99% dos seus projetos você usa isso:
import { firebaseConfig } from '../config/firebase.js';

// Se no seu projeto o export é `default`, troque a linha acima por:
// import firebaseConfig from '../config/firebase.js';

if (!firebaseConfig || !firebaseConfig.projectId) {
  // Último fallback: tenta buscar de variáveis Vite (se você preferir assim).
  const cfg = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
  };
  // Só usa se tiver projectId válido.
  if (cfg.projectId) {
    // @ts-ignore
    firebaseConfig = cfg;
  }
}

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const db = getFirestore(app);

// Deixa acessível como fallback (se algum módulo importar tarde/errado).
// O seu código de push já entende esse fallback.
try {
  globalThis.__FIREBASE_DB = db;
} catch (_) {
  /* ignore */
}

export { app, db };
