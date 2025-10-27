// src/lib/firebaseClient.js
import { initializeApp, getApps, getApp } from "firebase/app";
import { getMessaging, isSupported } from "firebase/messaging";
import { getFirestore } from 'firebase/firestore';

// Se você já tem sua config centralizada, importe daqui:
import firebaseConfig from "@/config/firebase"; // ajuste o caminho se precisar

export function getFirebaseApp() {
  return getApps().length ? getApp() : initializeApp(firebaseConfig);
}

export async function getMessagingSafe() {
  const supported = await isSupported().catch(() => false);
  if (!supported) return null;
  const app = initializeApp(firebaseConfig);
  export const db = getFirestore(app);
  return getMessaging(app);
}
