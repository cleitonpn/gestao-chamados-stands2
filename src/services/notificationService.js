import { 
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  getDocs,
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
   * Obtém todos os usuários de uma área específica
   * @param {string} area - Nome da área
   * @returns {Promise<Array>} Lista de usuários da área
   */
  async getUsersByArea(area) {
    try {
      const usersQuery = query(
        collection(db, 'usuarios'),
        where('area', '==', area)
      );
      
      const snapshot = await getDocs(usersQuery);
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
    } catch (error) {
      console.error('❌ Erro ao buscar usuários da área:', error);
      return [];
    }
  }

  /**
   * Obtém todos os gerentes do sistema
   * @returns {Promise<Array>} Lista de gerentes
   */
  async getManagers() {
    try {
      const managersQuery = query(
        collection(db, 'usuarios'),
        where('funcao', '==', 'gerente')
      );
      
      const snapshot = await getDocs(managersQuery);
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
    } catch (error) {
      console.error('❌ Erro ao buscar gerentes:', error);
      return [];
    }
  }

  /**
   * Obtém todos os usuários do sistema
   * @returns {Promise<Array>} Lista de todos os usuários
   */
  async getAllUsers() {
    try {
      const usersQuery = query(collection(db, 'usuarios'));
      const snapshot = await getDocs(usersQuery);
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
    } catch (error) {
      console.error('❌ Erro ao buscar todos os usuários:', error);
      return [];
    }
  }

  /**
   * Cria notificação para usuários específicos
   * @param {Array} userIds - IDs dos usuários que devem receber a notificação
   * @param {string} type - Tipo da notificação
   * @param {string} title - Título da notificação
   * @param {string} message - Mensagem da notificação
   * @param {Object} data - Dados adicionais
   */
  async createNotification(userIds, type, title, message, data = {}) {
    try {
      const promises = userIds.map(async (userId) => {
        const notificationRef = doc(collection(db, 'notifications'));
        
        await setDoc(notificationRef, {
          userId,
          type,
          title,
          message,
          data,
          read: false,
          timestamp: serverTimestamp(),
          createdAt: new Date()
        });
      });

      await Promise.all(promises);
      console.log('🔔 Notificações criadas para:', userIds);
    } catch (error) {
      console.error('❌ Erro ao criar notificações:', error);
    }
  }

  /**
   * ABERTURA DE CHAMADO
   * Notifica operadores da área de destino
   */
  async notifyTicketCreated(ticketId, ticketData, createdByUserId) {
    try {
      // Buscar operadores da área de destino
      const areaOperators = await this.getUsersByArea(ticketData.area);
      
      // Filtrar apenas operadores (não incluir o criador)
      const operatorIds = areaOperators
        .filter(user => user.funcao === 'operador' && user.id !== createdByUserId)
        .map(user => user.id);

      if (operatorIds.length > 0) {
        await this.createNotification(
          operatorIds,
          'ticket_created',
          'Novo Chamado Aberto',
          `Novo chamado #${ticketData.numero || ticketId.slice(-6)} na área ${ticketData.area}`,
          {
            ticketId,
            area: ticketData.area,
            priority: ticketData.prioridade,
            type: ticketData.tipo
          }
        );
      }

      // Registrar atividade
      await this.registerActivity(ticketId, 'ticket_created', createdByUserId, {
        area: ticketData.area,
        type: ticketData.tipo
      });

    } catch (error) {
      console.error('❌ Erro ao notificar criação de chamado:', error);
    }
  }

  /**
   * MENSAGENS NO CHAT
   * Notifica todos os envolvidos (consultor, produtor e operadores da área)
   */
  async notifyNewMessage(ticketId, ticketData, messageData, sentByUserId) {
    try {
      const notifyUserIds = new Set();

      // Adicionar consultor do projeto (se existir e não for quem enviou)
      if (ticketData.consultorId && ticketData.consultorId !== sentByUserId) {
        notifyUserIds.add(ticketData.consultorId);
      }

      // Adicionar produtor do projeto (se existir e não for quem enviou)
      if (ticketData.produtorId && ticketData.produtorId !== sentByUserId) {
        notifyUserIds.add(ticketData.produtorId);
      }

      // Adicionar operadores da área atual do chamado
      const areaOperators = await this.getUsersByArea(ticketData.areaAtual || ticketData.area);
      areaOperators
        .filter(user => user.funcao === 'operador' && user.id !== sentByUserId)
        .forEach(user => notifyUserIds.add(user.id));

      if (notifyUserIds.size > 0) {
        await this.createNotification(
          Array.from(notifyUserIds),
          'new_message',
          'Nova Mensagem no Chat',
          `Nova mensagem no chamado #${ticketData.numero || ticketId.slice(-6)}`,
          {
            ticketId,
            messagePreview: messageData.texto?.substring(0, 50) + '...',
            senderName: messageData.autorNome
          }
        );
      }

      // Registrar atividade
      await this.registerActivity(ticketId, 'message', sentByUserId, {
        messageText: messageData.texto?.substring(0, 100)
      });

    } catch (error) {
      console.error('❌ Erro ao notificar nova mensagem:', error);
    }
  }

  /**
   * ESCALAÇÃO DE CHAMADO
   * Notifica consultor, produtor e operadores da área de destino
   */
  async notifyTicketEscalated(ticketId, ticketData, escalationData, escalatedByUserId) {
    try {
      const notifyUserIds = new Set();

      // Adicionar consultor do projeto (se existir e não for quem escalou)
      if (ticketData.consultorId && ticketData.consultorId !== escalatedByUserId) {
        notifyUserIds.add(ticketData.consultorId);
      }

      // Adicionar produtor do projeto (se existir e não for quem escalou)
      if (ticketData.produtorId && ticketData.produtorId !== escalatedByUserId) {
        notifyUserIds.add(ticketData.produtorId);
      }

      // Adicionar operadores da área de destino
      const destinationOperators = await this.getUsersByArea(escalationData.areaDestino);
      destinationOperators
        .filter(user => user.funcao === 'operador' && user.id !== escalatedByUserId)
        .forEach(user => notifyUserIds.add(user.id));

      if (notifyUserIds.size > 0) {
        await this.createNotification(
          Array.from(notifyUserIds),
          'ticket_escalated',
          'Chamado Escalado',
          `Chamado #${ticketData.numero || ticketId.slice(-6)} foi escalado para ${escalationData.areaDestino}`,
          {
            ticketId,
            fromArea: escalationData.areaOrigem,
            toArea: escalationData.areaDestino,
            reason: escalationData.motivo
          }
        );
      }

      // Registrar atividade
      await this.registerActivity(ticketId, 'escalation', escalatedByUserId, {
        fromArea: escalationData.areaOrigem,
        toArea: escalationData.areaDestino,
        reason: escalationData.motivo
      });

    } catch (error) {
      console.error('❌ Erro ao notificar escalação:', error);
    }
  }

  /**
   * ESCALAÇÃO PARA GERENTE
   * Notifica consultor, produtor e gerente específico
   */
  async notifyEscalatedToManager(ticketId, ticketData, escalationData, escalatedByUserId) {
    try {
      const notifyUserIds = new Set();

      // Adicionar consultor do projeto (se existir e não for quem escalou)
      if (ticketData.consultorId && ticketData.consultorId !== escalatedByUserId) {
        notifyUserIds.add(ticketData.consultorId);
      }

      // Adicionar produtor do projeto (se existir e não for quem escalou)
      if (ticketData.produtorId && ticketData.produtorId !== escalatedByUserId) {
        notifyUserIds.add(ticketData.produtorId);
      }

      // Adicionar gerente específico (se informado) ou todos os gerentes
      if (escalationData.gerenteId) {
        notifyUserIds.add(escalationData.gerenteId);
      } else {
        // Se não especificou gerente, notificar todos
        const managers = await this.getManagers();
        managers
          .filter(manager => manager.id !== escalatedByUserId)
          .forEach(manager => notifyUserIds.add(manager.id));
      }

      if (notifyUserIds.size > 0) {
        await this.createNotification(
          Array.from(notifyUserIds),
          'escalated_to_manager',
          'Chamado Escalado para Gerência',
          `Chamado #${ticketData.numero || ticketId.slice(-6)} foi escalado para a gerência`,
          {
            ticketId,
            reason: escalationData.motivo,
            managerName: escalationData.gerenteNome
          }
        );
      }

      // Registrar atividade
      await this.registerActivity(ticketId, 'escalated_to_manager', escalatedByUserId, {
        reason: escalationData.motivo,
        managerId: escalationData.gerenteId,
        managerName: escalationData.gerenteNome
      });

    } catch (error) {
      console.error('❌ Erro ao notificar escalação para gerente:', error);
    }
  }

  /**
   * ALTERAÇÃO DE STATUS
   * Notifica consultor, produtor e operadores das áreas atual e de destino
   */
  async notifyStatusChanged(ticketId, ticketData, statusData, changedByUserId) {
    try {
      const notifyUserIds = new Set();

      // Adicionar consultor do projeto (se existir e não for quem alterou)
      if (ticketData.consultorId && ticketData.consultorId !== changedByUserId) {
        notifyUserIds.add(ticketData.consultorId);
      }

      // Adicionar produtor do projeto (se existir e não for quem alterou)
      if (ticketData.produtorId && ticketData.produtorId !== changedByUserId) {
        notifyUserIds.add(ticketData.produtorId);
      }

      // Adicionar operadores da área atual
      if (ticketData.areaAtual || ticketData.area) {
        const currentAreaOperators = await this.getUsersByArea(ticketData.areaAtual || ticketData.area);
        currentAreaOperators
          .filter(user => user.funcao === 'operador' && user.id !== changedByUserId)
          .forEach(user => notifyUserIds.add(user.id));
      }

      // Se mudou de área, adicionar operadores da área de destino
      if (statusData.novaArea && statusData.novaArea !== (ticketData.areaAtual || ticketData.area)) {
        const destinationOperators = await this.getUsersByArea(statusData.novaArea);
        destinationOperators
          .filter(user => user.funcao === 'operador' && user.id !== changedByUserId)
          .forEach(user => notifyUserIds.add(user.id));
      }

      if (notifyUserIds.size > 0) {
        await this.createNotification(
          Array.from(notifyUserIds),
          'status_changed',
          'Status do Chamado Alterado',
          `Status do chamado #${ticketData.numero || ticketId.slice(-6)} alterado para: ${statusData.novoStatus}`,
          {
            ticketId,
            oldStatus: statusData.statusAnterior,
            newStatus: statusData.novoStatus,
            area: statusData.novaArea || ticketData.areaAtual || ticketData.area
          }
        );
      }

      // Registrar atividade
      await this.registerActivity(ticketId, 'status_change', changedByUserId, {
        oldStatus: statusData.statusAnterior,
        newStatus: statusData.novoStatus,
        area: statusData.novaArea
      });

    } catch (error) {
      console.error('❌ Erro ao notificar mudança de status:', error);
    }
  }

  /**
   * NOVO EVENTO CADASTRADO
   * Notifica todos os usuários do sistema
   */
  async notifyNewEvent(eventData, createdByUserId) {
    try {
      // Buscar todos os usuários
      const allUsers = await this.getAllUsers();
      
      // Filtrar para não notificar quem criou o evento
      const userIds = allUsers
        .filter(user => user.id !== createdByUserId)
        .map(user => user.id);

      if (userIds.length > 0) {
        await this.createNotification(
          userIds,
          'new_event',
          'Novo Evento Cadastrado',
          `Novo evento: ${eventData.nome} - ${eventData.local}`,
          {
            eventId: eventData.id,
            eventName: eventData.nome,
            eventLocation: eventData.local,
            eventDate: eventData.dataInicio
          }
        );
      }

      console.log('🔔 Notificação de novo evento enviada para todos os usuários');

    } catch (error) {
      console.error('❌ Erro ao notificar novo evento:', error);
    }
  }

  /**
   * Marca uma notificação como lida
   * @param {string} notificationId - ID da notificação
   */
  async markNotificationAsRead(notificationId) {
    try {
      const notificationRef = doc(db, 'notifications', notificationId);
      await updateDoc(notificationRef, {
        read: true,
        readAt: serverTimestamp()
      });
    } catch (error) {
      console.error('❌ Erro ao marcar notificação como lida:', error);
    }
  }

  /**
   * Obtém notificações não lidas de um usuário
   * @param {string} userId - ID do usuário
   * @returns {Promise<Array>} Lista de notificações não lidas
   */
  async getUnreadNotifications(userId) {
    try {
      const notificationsQuery = query(
        collection(db, 'notifications'),
        where('userId', '==', userId),
        where('read', '==', false),
        orderBy('timestamp', 'desc')
      );

      const snapshot = await getDocs(notificationsQuery);
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
    } catch (error) {
      console.error('❌ Erro ao buscar notificações não lidas:', error);
      return [];
    }
  }

  /**
   * Escuta notificações em tempo real para um usuário
   * @param {string} userId - ID do usuário
   * @param {Function} callback - Função chamada quando há mudanças
   */
  subscribeToUserNotifications(userId, callback) {
    const listenerId = `notifications_${userId}`;
    
    // Cancelar listener anterior se existir
    if (this.listeners.has(listenerId)) {
      this.listeners.get(listenerId)();
    }

    const notificationsQuery = query(
      collection(db, 'notifications'),
      where('userId', '==', userId),
      where('read', '==', false),
      orderBy('timestamp', 'desc')
    );

    const unsubscribe = onSnapshot(notificationsQuery, (snapshot) => {
      const notifications = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      callback(notifications);
    });

    this.listeners.set(listenerId, unsubscribe);
    return unsubscribe;
  }

  // Métodos existentes mantidos para compatibilidade
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

  async getUnreadCount(ticketId, userId) {
    try {
      const viewRef = doc(db, 'ticket_views', `${ticketId}_${userId}`);
      const viewDoc = await getDoc(viewRef);
      
      let lastViewed = null;
      if (viewDoc.exists()) {
        lastViewed = viewDoc.data().lastViewed;
      }

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

  async getUnreadCounts(ticketIds, userId) {
    try {
      const counts = {};
      
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

  subscribeToTicketUpdates(ticketId, userId, callback) {
    const listenerId = `${ticketId}_${userId}`;
    
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

  subscribeToMultipleTickets(ticketIds, userId, callback) {
    const listenerId = `multiple_${userId}`;
    
    if (this.listeners.has(listenerId)) {
      this.listeners.get(listenerId)();
    }

    const unsubscribes = ticketIds.map(ticketId => {
      return this.subscribeToTicketUpdates(ticketId, userId, (count) => {
        this.getUnreadCounts(ticketIds, userId).then(callback);
      });
    });

    const unsubscribeAll = () => {
      unsubscribes.forEach(unsub => unsub());
    };

    this.listeners.set(listenerId, unsubscribeAll);
    return unsubscribeAll;
  }

  unsubscribeAll() {
    this.listeners.forEach(unsubscribe => unsubscribe());
    this.listeners.clear();
  }

  // Métodos de conveniência para registrar atividades específicas
  async registerStatusChange(ticketId, userId, oldStatus, newStatus) {
    await this.registerActivity(ticketId, 'status_change', userId, {
      oldStatus,
      newStatus
    });
  }

  async registerMessage(ticketId, userId, messageText) {
    await this.registerActivity(ticketId, 'message', userId, {
      messageText: messageText.substring(0, 100)
    });
  }

  async registerEscalation(ticketId, userId, fromArea, toArea, reason) {
    await this.registerActivity(ticketId, 'escalation', userId, {
      fromArea,
      toArea,
      reason
    });
  }

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

