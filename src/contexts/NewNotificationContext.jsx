import React, { createContext, useContext, useState, useEffect } from 'react';
import { useAuth } from './AuthContext';
import { unifiedNotificationService } from '../services/unifiedNotificationService';

const NewNotificationContext = createContext();

export const useNewNotifications = () => {
  const context = useContext(NewNotificationContext);
  if (!context) {
    throw new Error('useNewNotifications deve ser usado dentro de NewNotificationProvider');
  }
  return context;
};

export const NewNotificationProvider = ({ children }) => {
  const { user, userProfile } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [isActive, setIsActive] = useState(false);

  // Inicializar/parar serviço baseado no login
  useEffect(() => {
    if (user && userProfile) {
      console.log('🔔 Inicializando sistema unificado de notificações para:', userProfile.nome);
      
      // Criar objeto de usuário completo
      const fullUser = {
        ...user,
        ...userProfile,
        uid: user.uid,
        email: user.email
      };
      
      // Inicializar serviço
      unifiedNotificationService.initialize(fullUser);
      setIsActive(true);
      
      // Atualizar estado inicial
      updateState();
      
      // Adicionar listener para mudanças
      const removeListener = unifiedNotificationService.addListener((notification) => {
        console.log('📨 Notificação recebida no contexto:', notification);
        updateState();
      });

      return () => {
        console.log('🧹 Limpando listeners de notificação');
        removeListener();
      };
    } else {
      console.log('🛑 Parando sistema unificado de notificações');
      unifiedNotificationService.stop();
      setIsActive(false);
      setNotifications([]);
      setUnreadCount(0);
    }
  }, [user, userProfile]);

  // Atualizar estado
  const updateState = () => {
    try {
      const currentNotifications = unifiedNotificationService.getNotifications();
      const currentUnreadCount = unifiedNotificationService.getUnreadCount();
      const currentSoundEnabled = unifiedNotificationService.soundEnabled;
      
      setNotifications(currentNotifications);
      setUnreadCount(currentUnreadCount);
      setSoundEnabled(currentSoundEnabled);
      
      console.log(`📊 Estado atualizado: ${currentNotifications.length} notificações, ${currentUnreadCount} não lidas`);
    } catch (error) {
      console.error('❌ Erro ao atualizar estado das notificações:', error);
    }
  };

  // Marcar como lida
  const markAsRead = (notificationId) => {
    try {
      const success = unifiedNotificationService.markAsRead(notificationId);
      if (success) {
        updateState();
      }
      return success;
    } catch (error) {
      console.error('❌ Erro ao marcar notificação como lida:', error);
      return false;
    }
  };

  // Marcar todas como lidas
  const markAllAsRead = () => {
    try {
      unifiedNotificationService.markAllAsRead();
      updateState();
    } catch (error) {
      console.error('❌ Erro ao marcar todas como lidas:', error);
    }
  };

  // Alternar som
  const toggleSound = () => {
    try {
      const newState = unifiedNotificationService.toggleSound();
      setSoundEnabled(newState);
      return newState;
    } catch (error) {
      console.error('❌ Erro ao alternar som:', error);
      return soundEnabled;
    }
  };

  // Testar notificação
  const testNotification = () => {
    try {
      unifiedNotificationService.testNotification();
      updateState();
    } catch (error) {
      console.error('❌ Erro ao testar notificação:', error);
    }
  };

  // Obter notificações recentes
  const getRecentNotifications = (limit = 10) => {
    return notifications.slice(0, limit);
  };

  // Obter status do sistema
  const getStatus = () => {
    try {
      return unifiedNotificationService.getStatus();
    } catch (error) {
      console.error('❌ Erro ao obter status:', error);
      return { isActive: false, error: error.message };
    }
  };

  const value = {
    notifications,
    unreadCount,
    soundEnabled,
    isActive,
    markAsRead,
    markAllAsRead,
    toggleSound,
    testNotification,
    getRecentNotifications,
    getStatus
  };

  return (
    <NewNotificationContext.Provider value={value}>
      {children}
    </NewNotificationContext.Provider>
  );
};

