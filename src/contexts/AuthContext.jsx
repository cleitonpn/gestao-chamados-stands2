// src/contexts/AuthContext.jsx
import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  createUserWithEmailAndPassword
} from 'firebase/auth';
import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../config/firebase';

// ⬇️ Ajuste este caminho se seu arquivo estiver em outro lugar.
// Ex.: '../lib/push/registerPush' ou '../utils/registerpush'
import registerPush from '../registerpush';

const AuthContext = createContext(null);

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth deve ser usado dentro de um AuthProvider');
  return ctx;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);               // Firebase User
  const [userProfile, setUserProfile] = useState(null); // Firestore: usuarios/{uid}
  const [loading, setLoading] = useState(true);
  const [authInitialized, setAuthInitialized] = useState(false);

  // estado opcional: status do push
  const [pushReady, setPushReady] = useState(false);
  const [pushError, setPushError] = useState(null);

  const profileUnsubRef = useRef(null);

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, async (u) => {
      // Limpa listener de perfil anterior
      if (profileUnsubRef.current) {
        try { profileUnsubRef.current(); } catch {}
        profileUnsubRef.current = null;
      }

      setUser(u || null);
      setPushReady(false);
      setPushError(null);

      if (u?.uid) {
        // Escuta em tempo real o doc do usuário
        const ref = doc(db, 'usuarios', u.uid);
        profileUnsubRef.current = onSnapshot(ref, (snap) => {
          if (snap.exists()) {
            setUserProfile({ id: u.uid, ...snap.data() });
          } else {
            setUserProfile({ id: u.uid });
          }
          setLoading(false);
          setAuthInitialized(true);
        }, (err) => {
          console.error('Erro no snapshot do perfil:', err);
          setUserProfile({ id: u.uid });
          setLoading(false);
          setAuthInitialized(true);
        });

        // fallback imediato (primeiro paint) lendo uma vez se necessário
        try {
          const once = await getDoc(ref);
          if (once.exists()) setUserProfile({ id: u.uid, ...once.data() });
          else setUserProfile({ id: u.uid });
        } catch {}

        // 🔔 tenta registrar push para este usuário (não bloqueia a UI)
        // - se o usuário negar, apenas registra erro e segue a vida
        try {
          if (typeof registerPush === 'function') {
            registerPush(u.uid)
              .then(() => setPushReady(true))
              .catch((err) => {
                console.warn('[push] falhou ao registrar:', err);
                setPushError(String(err?.message || err));
              });
          }
        } catch (err) {
          console.warn('[push] erro inesperado ao disparar registro:', err);
          setPushError(String(err?.message || err));
        }

      } else {
        setUserProfile(null);
        setLoading(false);
        setAuthInitialized(true);
      }
    });

    return () => {
      unsubAuth && unsubAuth();
      if (profileUnsubRef.current) {
        try { profileUnsubRef.current(); } catch {}
        profileUnsubRef.current = null;
      }
    };
  }, []);

  // expõe um método para forçar o registro de push sob demanda
  const ensurePushSubscription = async () => {
    if (!user?.uid) throw new Error('Usuário não autenticado');
    if (typeof registerPush !== 'function') throw new Error('Função registerPush não encontrada (ajuste o import)');
    setPushError(null);
    await registerPush(user.uid);
    setPushReady(true);
  };

  const login = async (email, password) => {
    return await signInWithEmailAndPassword(auth, email, password);
  };

  const logout = async () => {
    await signOut(auth);
    setPushReady(false);
    setPushError(null);
  };

  const register = async (email, password, userData) => {
    const result = await createUserWithEmailAndPassword(auth, email, password);
    // Cria perfil inicial no Firestore
    await setDoc(doc(db, 'usuarios', result.user.uid), {
      email,
      ...userData,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    return result;
  };

  const refreshUser = async () => {
    try { await auth.currentUser?.reload(); } catch {}
  };

  const avatarURL = userProfile?.fotoURL || user?.photoURL || null;

  const value = {
    user,
    userProfile,
    avatarURL,
    login,
    logout,
    register,
    refreshUser,
    loading,
    authInitialized,

    // 🔔 push
    pushReady,
    pushError,
    ensurePushSubscription,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
