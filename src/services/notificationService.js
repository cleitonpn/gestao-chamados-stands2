import { 
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  updateDoc, 
  onSnapshot, 
  query, 
  where, 
  orderBy,
  serverTimestamp,
  increment
} from 'firebase/firestore';
import { db } from '../config/firebase';

class NotificationService {
  constructor() {
    this.listeners = new Map();
  }

  /**
   * Registra uma nova atividade no chamado
   * @param {string} ticketId - ID do chamado
   * @param {string} type - Tipo da atividade ('status_change', 'message', 'escalation', etc.)
   * @param {string} userId - ID do usuário que fez a ação
   * @param {Object} data - Dados adicionais da atividade
   */
  async registerActivity(ticketId, type, userId, data = {}) {
    try {
      const activityRef = doc(collection(db, 'ticket_activities'), `${ticketId}_${Date.now()}`);
      
      await setDoc(activityRef, {
        ticketId,
        type,
        userId,
        timestamp: serverTimestamp(),
        data,
        createdAt: new Date()
      });

      // Atualizar contador de atividades do chamado
      const ticketRef = doc(db, 'chamados', ticketId);
      await updateDoc(ticketRef, {
        lastActivity: serverTimestamp(),
        activityCount: increment(1)
      });

      console.log('🔔 Atividade registrada:', { ticketId, type, userId });
    } catch (error) {
      console.error('❌ Erro ao registrar atividade:', error);
    }
  }

  /**
   * Marca um chamado como visualizado pelo usuário
   * @param {string} ticketId - ID do chamado
   * @param {string} userId - ID do usuário
   */
  async markAsViewed(ticketId, userId) {
    try {
      const viewRef = doc(db, 'ticket_views', `${ticketId}_${userId}`);
      
      await setDoc(viewRef, {
        ticketId,
        userId,
        lastViewed: serverTimestamp(),
        viewedAt: new Date()
      }, { merge: true });

      console.log('👁️ Chamado marcado como visualizado:', { ticketId, userId });
    } catch (error) {
      console.error('❌ Erro ao marcar como visualizado:', error);
    }
  }

  /**
   * Obtém o número de atualizações não visualizadas para um chamado
   * @param {string} ticketId - ID do chamado
   * @param {string} userId - ID do usuário
   * @returns {Promise<number>} Número de atualizações não vistas
   */
  async getUnreadCount(ticketId, userId) {
    try {
      // Buscar última visualização do usuário
      const viewRef = doc(db, 'ticket_views', `${ticketId}_${userId}`);
      const viewDoc = await getDoc(viewRef);
      
      let lastViewed = null;
      if (viewDoc.exists()) {
        lastViewed = viewDoc.data().lastViewed;
      }

      // Buscar atividades após a última visualização
      let activitiesQuery = query(
        collection(db, 'ticket_activities'),
        where('ticketId', '==', ticketId),
        orderBy('timestamp', 'desc')
      );

      if (lastViewed) {
        activitiesQuery = query(
          collection(db, 'ticket_activities'),
          where('ticketId', '==', ticketId),
          where('timestamp', '>', lastViewed),
          orderBy('timestamp', 'desc')
        );
      }

      return new Promise((resolve) => {
        const unsubscribe = onSnapshot(activitiesQuery, (snapshot) => {
          // Filtrar atividades que não foram feitas pelo próprio usuário
          const unreadActivities = snapshot.docs.filter(doc => {
            const activity = doc.data();
            return activity.userId !== userId;
          });

          resolve(unreadActivities.length);
          unsubscribe();
        });
      });

    } catch (error) {
      console.error('❌ Erro ao obter contagem não lida:', error);
      return 0;
    }
  }

  /**
   * Obtém contadores de notificações para múltiplos chamados
   * @param {Array<string>} ticketIds - Array de IDs dos chamados
   * @param {string} userId - ID do usuário
   * @returns {Promise<Object>} Objeto com contadores por chamado
   */
  async getUnreadCounts(ticketIds, userId) {
    try {
      const counts = {};
      
      // Processar em lotes para melhor performance
      const promises = ticketIds.map(async (ticketId) => {
        const count = await this.getUnreadCount(ticketId, userId);
        counts[ticketId] = count;
      });

      await Promise.all(promises);
      return counts;
    } catch (error) {
      console.error('❌ Erro ao obter contagens:', error);
      return {};
    }
  }

  /**
   * Escuta mudanças em tempo real para um chamado específico
   * @param {string} ticketId - ID do chamado
   * @param {string} userId - ID do usuário
   * @param {Function} callback - Função chamada quando há mudanças
   */
  subscribeToTicketUpdates(ticketId, userId, callback) {
    const listenerId = `${ticketId}_${userId}`;
    
    // Cancelar listener anterior se existir
    if (this.listeners.has(listenerId)) {
      this.listeners.get(listenerId)();
    }

    const activitiesQuery = query(
      collection(db, 'ticket_activities'),
      where('ticketId', '==', ticketId),
      orderBy('timestamp', 'desc')
    );

    const unsubscribe = onSnapshot(activitiesQuery, async (snapshot) => {
      const count = await this.getUnreadCount(ticketId, userId);
      callback(count);
    });

    this.listeners.set(listenerId, unsubscribe);
    return unsubscribe;
  }

  /**
   * Escuta mudanças para múltiplos chamados
   * @param {Array<string>} ticketIds - Array de IDs dos chamados
   * @param {string} userId - ID do usuário
   * @param {Function} callback - Função chamada quando há mudanças
   */
  subscribeToMultipleTickets(ticketIds, userId, callback) {
    const listenerId = `multiple_${userId}`;
    
    // Cancelar listener anterior se existir
    if (this.listeners.has(listenerId)) {
      this.listeners.get(listenerId)();
    }

    // Criar listeners para cada chamado
    const unsubscribes = ticketIds.map(ticketId => {
      return this.subscribeToTicketUpdates(ticketId, userId, (count) => {
        // Recalcular contadores para todos os chamados
        this.getUnreadCounts(ticketIds, userId).then(callback);
      });
    });

    const unsubscribeAll = () => {
      unsubscribes.forEach(unsub => unsub());
    };

    this.listeners.set(listenerId, unsubscribeAll);
    return unsubscribeAll;
  }

  /**
   * Cancela todos os listeners ativos
   */
  unsubscribeAll() {
    this.listeners.forEach(unsubscribe => unsubscribe());
    this.listeners.clear();
  }

  /**
   * Registra mudança de status do chamado
   */
  async registerStatusChange(ticketId, userId, oldStatus, newStatus) {
    await this.registerActivity(ticketId, 'status_change', userId, {
      oldStatus,
      newStatus
    });
  }

  /**
   * Registra nova mensagem no chat
   */
  async registerMessage(ticketId, userId, messageText) {
    await this.registerActivity(ticketId, 'message', userId, {
      messageText: messageText.substring(0, 100) // Primeiros 100 caracteres
    });
  }

  /**
   * Registra escalonamento do chamado
   */
  async registerEscalation(ticketId, userId, fromArea, toArea, reason) {
    await this.registerActivity(ticketId, 'escalation', userId, {
      fromArea,
      toArea,
      reason
    });
  }

  /**
   * Registra atribuição de operador
   */
  async registerOperatorAssignment(ticketId, userId, operatorId, operatorName) {
    await this.registerActivity(ticketId, 'operator_assignment', userId, {
      operatorId,
      operatorName
    });
  }
}

// Instância singleton
const notificationService = new NotificationService();

export default notificationService;

