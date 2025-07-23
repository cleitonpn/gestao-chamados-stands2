import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import notificationService from '../services/notificationService';

/**
 * Hook personalizado para gerenciar notificações de chamados
 * @param {Array<Object>} tickets - Array de chamados
 * @returns {Object} Estado e funções de notificação
 */
export const useNotifications = (tickets = []) => {
  const { user, userProfile } = useAuth();
  const [unreadCounts, setUnreadCounts] = useState({});
  const [loading, setLoading] = useState(true);

  // Extrair IDs dos chamados
  const ticketIds = tickets.map(ticket => ticket.id).filter(Boolean);

  /**
   * Carrega contadores iniciais
   */
  const loadUnreadCounts = useCallback(async () => {
    if (!user?.uid || !userProfile?.id || ticketIds.length === 0) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const counts = await notificationService.getUnreadCounts(ticketIds, userProfile.id);
      setUnreadCounts(counts);
      console.log('📊 Contadores carregados:', counts);
    } catch (error) {
      console.error('❌ Erro ao carregar contadores:', error);
    } finally {
      setLoading(false);
    }
  }, [user?.uid, userProfile?.id, ticketIds.join(',')]);

  /**
   * Marca um chamado como visualizado
   */
  const markAsViewed = useCallback(async (ticketId) => {
    if (!user?.uid || !userProfile?.id) return;

    try {
      await notificationService.markAsViewed(ticketId, userProfile.id);
      
      // Atualizar estado local
      setUnreadCounts(prev => ({
        ...prev,
        [ticketId]: 0
      }));

      console.log('👁️ Chamado marcado como visualizado:', ticketId);
    } catch (error) {
      console.error('❌ Erro ao marcar como visualizado:', error);
    }
  }, [user?.uid, userProfile?.id]);

  /**
   * Registra uma nova atividade
   */
  const registerActivity = useCallback(async (ticketId, type, data = {}) => {
    if (!user?.uid || !userProfile?.id) return;

    try {
      await notificationService.registerActivity(ticketId, type, userProfile.id, data);
      console.log('🔔 Atividade registrada:', { ticketId, type });
    } catch (error) {
      console.error('❌ Erro ao registrar atividade:', error);
    }
  }, [user?.uid, userProfile?.id]);

  /**
   * Registra mudança de status
   */
  const registerStatusChange = useCallback(async (ticketId, oldStatus, newStatus) => {
    await registerActivity(ticketId, 'status_change', { oldStatus, newStatus });
  }, [registerActivity]);

  /**
   * Registra nova mensagem
   */
  const registerMessage = useCallback(async (ticketId, messageText) => {
    await registerActivity(ticketId, 'message', { 
      messageText: messageText.substring(0, 100) 
    });
  }, [registerActivity]);

  /**
   * Registra escalonamento
   */
  const registerEscalation = useCallback(async (ticketId, fromArea, toArea, reason) => {
    await registerActivity(ticketId, 'escalation', { fromArea, toArea, reason });
  }, [registerActivity]);

  /**
   * Obtém contador para um chamado específico
   */
  const getUnreadCount = useCallback((ticketId) => {
    return unreadCounts[ticketId] || 0;
  }, [unreadCounts]);

  /**
   * Obtém total de notificações não lidas
   */
  const getTotalUnread = useCallback(() => {
    return Object.values(unreadCounts).reduce((total, count) => total + count, 0);
  }, [unreadCounts]);

  // Carregar contadores iniciais
  useEffect(() => {
    loadUnreadCounts();
  }, [loadUnreadCounts]);

  // Escutar mudanças em tempo real
  useEffect(() => {
    if (!user?.uid || !userProfile?.id || ticketIds.length === 0) {
      return;
    }

    console.log('🔄 Iniciando escuta de notificações para:', ticketIds.length, 'chamados');

    const unsubscribe = notificationService.subscribeToMultipleTickets(
      ticketIds,
      userProfile.id,
      (newCounts) => {
        setUnreadCounts(newCounts);
        console.log('🔔 Contadores atualizados:', newCounts);
      }
    );

    return () => {
      console.log('🔇 Parando escuta de notificações');
      unsubscribe();
    };
  }, [user?.uid, userProfile?.id, ticketIds.join(',')]);

  // Cleanup ao desmontar
  useEffect(() => {
    return () => {
      notificationService.unsubscribeAll();
    };
  }, []);

  return {
    unreadCounts,
    loading,
    markAsViewed,
    registerStatusChange,
    registerMessage,
    registerEscalation,
    getUnreadCount,
    getTotalUnread,
    refreshCounts: loadUnreadCounts
  };
};

export default useNotifications;

