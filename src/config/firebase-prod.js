// Firebase configuration para produção
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: "AIzaSyBvOkBwb0KQiS5_2cGYD0sxb-L_bHqHnfM",
  authDomain: "gestao-chamados-stands.firebaseapp.com",
  projectId: "gestao-chamados-stands",
  storageBucket: "gestao-chamados-stands.appspot.com",
  messagingSenderId: "123456789012",
  appId: "1:123456789012:web:abcdef123456789012345"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase services
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

export default app;

