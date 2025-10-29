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

  const profileUnsubRef = useRef(null);

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, async (u) => {
      // Limpa listener de perfil anterior
      if (profileUnsubRef.current) {
        try { profileUnsubRef.current(); } catch {}
        profileUnsubRef.current = null;
      }

      setUser(u || null);

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

  const login = async (email, password) => {
    return await signInWithEmailAndPassword(auth, email, password);
  };

  const logout = async () => {
    await signOut(auth);
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
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
