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
      
      const recipients = new Set();
      
      if (ticketData.consultorId && ticketData.consultorId !== creatorId) {
        recipients.add(ticketData.consultorId);
      }
      
      if (ticketData.produtorId && ticketData.produtorId !== creatorId) {
        recipients.add(ticketData.produtorId);
      }
      
      if (ticketData.areaAtual && ticketData.areaAtual !== 'produtor') {
        const areaUsers = await this.firestoreService.getUsersByArea(ticketData.areaAtual);
        areaUsers.forEach(user => {
          if (user.id !== creatorId) {
            recipients.add(user.id);
          }
        });
      }

      if (recipients.size > 0) {
        await this.firestoreService.sendNotificationToUsers(Array.from(recipients), {
          tipo: 'new_ticket',
          titulo: `Novo chamado: ${ticketData.titulo}`,
          mensagem: `Chamado criado no projeto ${ticketData.projetoNome || ''}`,
          link: `/tickets/${ticketId}`,
          ticketId: ticketId,
          prioridade: ticketData.prioridade || 'media'
        });
        console.log(`✅ Notificação de novo chamado enviada para ${recipients.size} usuários`);
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
      
      const recipients = new Set();
      
      if (ticketData.consultorId && ticketData.consultorId !== senderId) {
        recipients.add(ticketData.consultorId);
      }
      
      if (ticketData.produtorId && ticketData.produtorId !== senderId) {
        recipients.add(ticketData.produtorId);
      }
      
      if (ticketData.areaAtual && ticketData.areaAtual !== 'produtor') {
        const areaUsers = await this.firestoreService.getUsersByArea(ticketData.areaAtual);
        areaUsers.forEach(user => {
          if (user.id !== senderId) {
            recipients.add(user.id);
          }
        });
      }

      if (recipients.size > 0) {
        await this.firestoreService.sendNotificationToUsers(Array.from(recipients), {
          tipo: 'new_message',
          titulo: `Nova mensagem no chamado #${ticketId.slice(-6)}`,
          mensagem: messageData.texto.substring(0, 100) + (messageData.texto.length > 100 ? '...' : ''),
          link: `/tickets/${ticketId}`,
          ticketId: ticketId,
          prioridade: 'media'
        });
        console.log(`✅ Notificação de nova mensagem enviada para ${recipients.size} usuários`);
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
      
      const recipients = new Set();
      
      if (ticketData.consultorId && ticketData.consultorId !== escalatorId) {
        recipients.add(ticketData.consultorId);
      }
      
      if (ticketData.produtorId && ticketData.produtorId !== escalatorId) {
        recipients.add(ticketData.produtorId);
      }
      
      if (escalationData.areaDestino) {
        const areaUsers = await this.firestoreService.getUsersByArea(escalationData.areaDestino);
        areaUsers.forEach(user => {
            recipients.add(user.id);
        });
      }

      if (recipients.size > 0) {
        await this.firestoreService.sendNotificationToUsers(Array.from(recipients), {
          tipo: 'ticket_escalated',
          titulo: `Chamado escalado para ${escalationData.areaDestino}`,
          mensagem: `Chamado #${ticketId.slice(-6)} foi escalado: ${escalationData.motivo}`,
          link: `/tickets/${ticketId}`,
          ticketId: ticketId,
          prioridade: 'alta'
        });
        console.log(`✅ Notificação de escalação enviada para ${recipients.size} usuários`);
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
      
      const recipients = new Set();
      
      if (ticketData.consultorId && ticketData.consultorId !== escalatorId) {
        recipients.add(ticketData.consultorId);
      }
      
      if (ticketData.produtorId && ticketData.produtorId !== escalatorId) {
        recipients.add(ticketData.produtorId);
      }
      
      if (escalationData.gerenteId) {
        recipients.add(escalationData.gerenteId);
      }

      if (recipients.size > 0) {
        await this.firestoreService.sendNotificationToUsers(Array.from(recipients), {
          tipo: 'escalated_to_manager',
          titulo: `Chamado escalado para gerência`,
          mensagem: `Chamado #${ticketId.slice(-6)} escalado para ${escalationData.gerenteNome}: ${escalationData.motivo}`,
          link: `/tickets/${ticketId}`,
          ticketId: ticketId,
          prioridade: 'urgente'
        });
        console.log(`✅ Notificação de escalação gerencial enviada para ${recipients.size} usuários`);
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
      
      const recipients = new Set();
      
      if (ticketData.consultorId && ticketData.consultorId !== changerId) {
        recipients.add(ticketData.consultorId);
      }
      
      if (ticketData.produtorId && ticketData.produtorId !== changerId) {
        recipients.add(ticketData.produtorId);
      }
      
      if (ticketData.areaAtual && ticketData.areaAtual !== 'produtor') {
        const areaUsers = await this.firestoreService.getUsersByArea(ticketData.areaAtual);
        areaUsers.forEach(user => {
            recipients.add(user.id);
        });
      }
      
      if (statusData.novaArea && statusData.novaArea !== ticketData.areaAtual) {
        const newAreaUsers = await this.firestoreService.getUsersByArea(statusData.novaArea);
        newAreaUsers.forEach(user => {
            recipients.add(user.id);
        });
      }
      
      // Remover quem fez a ação da lista de notificados
      recipients.delete(changerId);

      if (recipients.size > 0) {
        await this.firestoreService.sendNotificationToUsers(Array.from(recipients), {
          tipo: 'status_changed',
          titulo: `Status alterado: ${statusData.novoStatus}`,
          mensagem: `Chamado #${ticketId.slice(-6)} teve status alterado para "${statusData.novoStatus}"`,
          link: `/tickets/${ticketId}`,
          ticketId: ticketId,
          prioridade: 'media'
        });
        console.log(`✅ Notificação de mudança de status enviada para ${recipients.size} usuários`);
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
      
      const allUsers = await this.firestoreService.getAllUsers(); // Supondo que exista essa função
      const recipients = allUsers
        .map(user => user.id)
        .filter(id => id !== creatorId);

      if (recipients.length > 0) {
        await this.firestoreService.sendNotificationToUsers(recipients, {
          tipo: 'new_event',
          titulo: `Novo evento: ${eventData.nome}`,
          mensagem: `Evento "${eventData.nome}" cadastrado no pavilhão ${eventData.pavilhao}`,
          link: `/events`,
          eventId: eventId,
          prioridade: 'baixa'
        });
        console.log(`✅ Notificação de novo evento enviada para ${recipients.length} usuários`);
      }
    } catch (error) {
      console.error('❌ Erro ao enviar notificação de novo evento:', error);
    }
  }

  // ✅ MÉTODOS ADICIONADOS PARA A INTERFACE USAR
  // Estes métodos simplesmente repassam a chamada para o serviço de baixo nível,
  // mantendo a abstração e um ponto único de acesso.

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

  async markTicketNotificationsAsRead(userId, ticketId) {
    return await this.firestoreService.markTicketNotificationsAsRead(userId, ticketId);
  }
  
  subscribeToNotifications(userId, callback) {
    return this.firestoreService.subscribeToNotifications(userId, callback);
  }

  unsubscribeFromNotifications(userId) {
    return this.firestoreService.unsubscribeFromNotifications(userId);
  }
}

const notificationService = new NotificationService();
export default notificationService;
