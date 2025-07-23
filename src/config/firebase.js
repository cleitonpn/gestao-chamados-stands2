import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: "AIzaSyAJRaV-rBHBbbsygASDyY6ZbW1WJ8SKu8A",
  authDomain: "gestao-chamados-stands.firebaseapp.com",
  projectId: "gestao-chamados-stands",
  storageBucket: "gestao-chamados-stands.firebasestorage.app",
  messagingSenderId: "468392158134",
  appId: "1:468392158134:web:8e6f6419bcbb72a3bdd717"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

export default app;


