import firestoreNotificationService from './firestoreNotificationService';

class NotificationService {
  constructor() {
    this.firestoreService = firestoreNotificationService;
  }

  /**
   * 1. NOTIFICAÇÃO DE NOVO CHAMADO
   */
  async notifyNewTicket(ticketId, ticketData, creatorId) {
    try {
      console.log('🔔 Enviando notificação de novo chamado...');
      
      const recipients = [];
      
      // Adicionar consultor (se não for o criador)
      if (ticketData.consultorId && ticketData.consultorId !== creatorId) {
        recipients.push(ticketData.consultorId);
      }
      
      // Adicionar produtor (se não for o criador)
      if (ticketData.produtorId && ticketData.produtorId !== creatorId) {
        recipients.push(ticketData.produtorId);
      }
      
      // Buscar operadores da área específica
      if (ticketData.areaAtual && ticketData.areaAtual !== 'produtor') {
        const areaUsers = await this.firestoreService.getUsersByArea(ticketData.areaAtual);
        areaUsers.forEach(user => {
          if (user.id !== creatorId && !recipients.includes(user.id)) {
            recipients.push(user.id);
          }
        });
      }

      // Enviar notificações
      if (recipients.length > 0) {
        await this.firestoreService.sendNotificationToUsers(recipients, {
          tipo: 'new_ticket',
          titulo: `Novo chamado: ${ticketData.titulo}`,
          mensagem: `Chamado criado no projeto ${ticketData.projetoNome}`,
          link: `/tickets/${ticketId}`,
          ticketId: ticketId,
          prioridade: ticketData.prioridade || 'media'
        });
        
        console.log(`✅ Notificação de novo chamado enviada para ${recipients.length} usuários`);
      }
    } catch (error) {
      console.error('❌ Erro ao enviar notificação de novo chamado:', error);
    }
  }

  /**
   * 2. NOTIFICAÇÃO DE NOVA MENSAGEM
   */
  async notifyNewMessage(ticketId, ticketData, messageData, senderId) {
    try {
      console.log('🔔 Enviando notificação de nova mensagem...');
      
      const recipients = [];
      
      // Adicionar consultor (se não for o remetente)
      if (ticketData.consultorId && ticketData.consultorId !== senderId) {
        recipients.push(ticketData.consultorId);
      }
      
      // Adicionar produtor (se não for o remetente)
      if (ticketData.produtorId && ticketData.produtorId !== senderId) {
        recipients.push(ticketData.produtorId);
      }
      
      // Buscar operadores da área atual
      if (ticketData.areaAtual && ticketData.areaAtual !== 'produtor') {
        const areaUsers = await this.firestoreService.getUsersByArea(ticketData.areaAtual);
        areaUsers.forEach(user => {
          if (user.id !== senderId && !recipients.includes(user.id)) {
            recipients.push(user.id);
          }
        });
      }

      // Enviar notificações
      if (recipients.length > 0) {
        await this.firestoreService.sendNotificationToUsers(recipients, {
          tipo: 'new_message',
          titulo: `Nova mensagem no chamado #${ticketId.slice(-6)}`,
          mensagem: messageData.texto.substring(0, 100) + (messageData.texto.length > 100 ? '...' : ''),
          link: `/tickets/${ticketId}`,
          ticketId: ticketId,
          prioridade: 'media'
        });
        
        console.log(`✅ Notificação de nova mensagem enviada para ${recipients.length} usuários`);
      }
    } catch (error) {
      console.error('❌ Erro ao enviar notificação de nova mensagem:', error);
    }
  }

  /**
   * 3. NOTIFICAÇÃO DE ESCALAÇÃO DE CHAMADO
   */
  async notifyTicketEscalation(ticketId, ticketData, escalationData, escalatorId) {
    try {
      console.log('🔔 Enviando notificação de escalação de chamado...');
      
      const recipients = [];
      
      // Adicionar consultor (se não for o escalador)
      if (ticketData.consultorId && ticketData.consultorId !== escalatorId) {
        recipients.push(ticketData.consultorId);
      }
      
      // Adicionar produtor (se não for o escalador)
      if (ticketData.produtorId && ticketData.produtorId !== escalatorId) {
        recipients.push(ticketData.produtorId);
      }
      
      // Buscar operadores da área de destino
      if (escalationData.areaDestino) {
        const areaUsers = await this.firestoreService.getUsersByArea(escalationData.areaDestino);
        areaUsers.forEach(user => {
          if (user.id !== escalatorId && !recipients.includes(user.id)) {
            recipients.push(user.id);
          }
        });
      }

      // Enviar notificações
      if (recipients.length > 0) {
        await this.firestoreService.sendNotificationToUsers(recipients, {
          tipo: 'ticket_escalated',
          titulo: `Chamado escalado para ${escalationData.areaDestino}`,
          mensagem: `Chamado #${ticketId.slice(-6)} foi escalado: ${escalationData.motivo}`,
          link: `/tickets/${ticketId}`,
          ticketId: ticketId,
          prioridade: 'alta'
        });
        
        console.log(`✅ Notificação de escalação enviada para ${recipients.length} usuários`);
      }
    } catch (error) {
      console.error('❌ Erro ao enviar notificação de escalação:', error);
    }
  }

  /**
   * 4. NOTIFICAÇÃO DE ESCALAÇÃO PARA GERENTE
   */
  async notifyManagerEscalation(ticketId, ticketData, escalationData, escalatorId) {
    try {
      console.log('🔔 Enviando notificação de escalação para gerente...');
      
      const recipients = [];
      
      // Adicionar consultor (se não for o escalador)
      if (ticketData.consultorId && ticketData.consultorId !== escalatorId) {
        recipients.push(ticketData.consultorId);
      }
      
      // Adicionar produtor (se não for o escalador)
      if (ticketData.produtorId && ticketData.produtorId !== escalatorId) {
        recipients.push(ticketData.produtorId);
      }
      
      // Adicionar gerente específico
      if (escalationData.gerenteId && !recipients.includes(escalationData.gerenteId)) {
        recipients.push(escalationData.gerenteId);
      }

      // Enviar notificações
      if (recipients.length > 0) {
        await this.firestoreService.sendNotificationToUsers(recipients, {
          tipo: 'escalated_to_manager',
          titulo: `Chamado escalado para gerência`,
          mensagem: `Chamado #${ticketId.slice(-6)} escalado para ${escalationData.gerenteNome}: ${escalationData.motivo}`,
          link: `/tickets/${ticketId}`,
          ticketId: ticketId,
          prioridade: 'urgente'
        });
        
        console.log(`✅ Notificação de escalação gerencial enviada para ${recipients.length} usuários`);
      }
    } catch (error) {
      console.error('❌ Erro ao enviar notificação de escalação gerencial:', error);
    }
  }

  /**
   * 5. NOTIFICAÇÃO DE MUDANÇA DE STATUS
   */
  async notifyStatusChange(ticketId, ticketData, statusData, changerId) {
    try {
      console.log('🔔 Enviando notificação de mudança de status...');
      
      const recipients = [];
      
      // Adicionar consultor (se não for quem mudou)
      if (ticketData.consultorId && ticketData.consultorId !== changerId) {
        recipients.push(ticketData.consultorId);
      }
      
      // Adicionar produtor (se não for quem mudou)
      if (ticketData.produtorId && ticketData.produtorId !== changerId) {
        recipients.push(ticketData.produtorId);
      }
      
      // Buscar operadores da área atual
      if (ticketData.areaAtual && ticketData.areaAtual !== 'produtor') {
        const areaUsers = await this.firestoreService.getUsersByArea(ticketData.areaAtual);
        areaUsers.forEach(user => {
          if (user.id !== changerId && !recipients.includes(user.id)) {
            recipients.push(user.id);
          }
        });
      }
      
      // Se mudou para nova área, notificar operadores da nova área
      if (statusData.novaArea && statusData.novaArea !== ticketData.areaAtual) {
        const newAreaUsers = await this.firestoreService.getUsersByArea(statusData.novaArea);
        newAreaUsers.forEach(user => {
          if (user.id !== changerId && !recipients.includes(user.id)) {
            recipients.push(user.id);
          }
        });
      }

      // Enviar notificações
      if (recipients.length > 0) {
        await this.firestoreService.sendNotificationToUsers(recipients, {
          tipo: 'status_changed',
          titulo: `Status alterado: ${statusData.novoStatus}`,
          mensagem: `Chamado #${ticketId.slice(-6)} teve status alterado para "${statusData.novoStatus}"`,
          link: `/tickets/${ticketId}`,
          ticketId: ticketId,
          prioridade: 'media'
        });
        
        console.log(`✅ Notificação de mudança de status enviada para ${recipients.length} usuários`);
      }
    } catch (error) {
      console.error('❌ Erro ao enviar notificação de mudança de status:', error);
    }
  }

  /**
   * 6. NOTIFICAÇÃO DE NOVO EVENTO
   */
  async notifyNewEvent(eventId, eventData, creatorId) {
    try {
      console.log('🔔 Enviando notificação de novo evento...');
      
      // Buscar todos os usuários do sistema
      const allUsers = await this.firestoreService.getUsersByRole('consultor');
      const producers = await this.firestoreService.getUsersByRole('produtor');
      const operators = await this.firestoreService.getUsersByRole('operador');
      const managers = await this.firestoreService.getUsersByRole('gerente');
      
      const recipients = [];
      
      // Adicionar todos os usuários (exceto o criador)
      [...allUsers, ...producers, ...operators, ...managers].forEach(user => {
        if (user.id !== creatorId && !recipients.includes(user.id)) {
          recipients.push(user.id);
        }
      });

      // Enviar notificações
      if (recipients.length > 0) {
        await this.firestoreService.sendNotificationToUsers(recipients, {
          tipo: 'new_event',
          titulo: `Novo evento cadastrado: ${eventData.nome}`,
          mensagem: `Evento "${eventData.nome}" foi cadastrado no pavilhão ${eventData.pavilhao}`,
          link: `/events`,
          eventId: eventId,
          prioridade: 'media'
        });
        
        console.log(`✅ Notificação de novo evento enviada para ${recipients.length} usuários`);
      }
    } catch (error) {
      console.error('❌ Erro ao enviar notificação de novo evento:', error);
    }
  }

  /**
   * Métodos auxiliares para acessar o serviço Firestore
   */
  async getUserNotifications(userId) {
    return await this.firestoreService.getUserNotifications(userId);
  }

  async markAsRead(userId, notificationId) {
    return await this.firestoreService.markAsRead(userId, notificationId);
  }

  async markAsUnread(userId, notificationId) {
    return await this.firestoreService.markAsUnread(userId, notificationId);
  }

  async markAllAsRead(userId) {
    return await this.firestoreService.markAllAsRead(userId);
  }

  async deleteNotification(userId, notificationId) {
    return await this.firestoreService.deleteNotification(userId, notificationId);
  }

  subscribeToNotifications(userId, callback) {
    return this.firestoreService.subscribeToNotifications(userId, callback);
  }

  unsubscribeFromNotifications(userId) {
    return this.firestoreService.unsubscribeFromNotifications(userId);
  }
}

// Criar instância única do serviço
const notificationService = new NotificationService();
export default notificationService;

