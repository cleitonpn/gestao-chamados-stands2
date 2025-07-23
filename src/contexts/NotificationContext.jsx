import React, { createContext, useContext, useState, useEffect } from 'react';
import { useAuth } from './AuthContext';
import { simpleNotificationService } from '../services/simpleNotificationService';

const NotificationContext = createContext();

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications deve ser usado dentro de NotificationProvider');
  }
  return context;
};

export const NotificationProvider = ({ children }) => {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [soundEnabled, setSoundEnabled] = useState(true);

  // Inicializar/parar serviço baseado no login
  useEffect(() => {
    if (user) {
      console.log('🔔 Inicializando notificações para:', user.nome);
      simpleNotificationService.initialize(user);
      updateNotifications();
    } else {
      console.log('🛑 Parando notificações');
      simpleNotificationService.stop();
      setNotifications([]);
      setUnreadCount(0);
    }
  }, [user]);

  // Listener para eventos de notificação
  useEffect(() => {
    const handleNotification = (event) => {
      console.log('📨 Evento de notificação recebido:', event.detail);
      updateNotifications();
    };

    window.addEventListener('newNotification', handleNotification);
    
    return () => {
      window.removeEventListener('newNotification', handleNotification);
    };
  }, []);

  // Atualizar estado das notificações
  const updateNotifications = () => {
    const recentNotifications = simpleNotificationService.getRecentNotifications();
    const unread = simpleNotificationService.getUnreadCount();
    
    setNotifications(recentNotifications);
    setUnreadCount(unread);
    
    console.log(`📊 Notificações atualizadas: ${recentNotifications.length} total, ${unread} não lidas`);
  };

  // Marcar como lida
  const markAsRead = (notificationId) => {
    const success = simpleNotificationService.markAsRead(notificationId);
    if (success) {
      updateNotifications();
    }
    return success;
  };

  // Marcar todas como lidas
  const markAllAsRead = () => {
    simpleNotificationService.markAllAsRead();
    updateNotifications();
  };

  // Alternar som
  const toggleSound = () => {
    const newState = simpleNotificationService.toggleSound();
    setSoundEnabled(newState);
    return newState;
  };

  // Testar notificação
  const testNotification = () => {
    simpleNotificationService.testNotification();
  };

  // Obter notificações recentes
  const getRecentNotifications = (limit = 10) => {
    return notifications.slice(0, limit);
  };

  const value = {
    notifications,
    unreadCount,
    soundEnabled,
    markAsRead,
    markAllAsRead,
    toggleSound,
    testNotification,
    getRecentNotifications
  };

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
};

