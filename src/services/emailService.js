// Serviço para integração com o sistema de notificações por e-mail

const EMAIL_SERVICE_URL = 'https://8xhpiqce3om1.manus.space';

export const emailService = {
  // Enviar notificação de chamado criado
  async sendTicketCreatedNotification(ticketData, projectName, emails, ticketId) {
    try {
      const response = await fetch(`${EMAIL_SERVICE_URL}/send-ticket-created`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          emails: emails,
          ticket: ticketData,
          project_name: projectName,
          ticket_id: ticketId
        })
      });

      if (!response.ok) {
        throw new Error(`Erro HTTP: ${response.status}`);
      }

      const result = await response.json();
      console.log('✅ Notificação de criação enviada:', result);
      return result;
    } catch (error) {
      console.error('❌ Erro ao enviar notificação de criação:', error);
      throw error;
    }
  },

  // Enviar notificação de chamado atualizado
  async sendTicketUpdatedNotification(ticketData, projectName, emails, ticketId, oldStatus, newStatus) {
    try {
      const response = await fetch(`${EMAIL_SERVICE_URL}/send-ticket-updated`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          emails: emails,
          ticket: ticketData,
          project_name: projectName,
          ticket_id: ticketId,
          old_status: oldStatus,
          new_status: newStatus
        })
      });

      if (!response.ok) {
        throw new Error(`Erro HTTP: ${response.status}`);
      }

      const result = await response.json();
      console.log('✅ Notificação de atualização enviada:', result);
      return result;
    } catch (error) {
      console.error('❌ Erro ao enviar notificação de atualização:', error);
      throw error;
    }
  },

  // Testar envio de e-mail
  async testEmail(email) {
    try {
      const response = await fetch(`${EMAIL_SERVICE_URL}/test-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: email
        })
      });

      if (!response.ok) {
        throw new Error(`Erro HTTP: ${response.status}`);
      }

      const result = await response.json();
      console.log('✅ E-mail de teste enviado:', result);
      return result;
    } catch (error) {
      console.error('❌ Erro ao enviar e-mail de teste:', error);
      throw error;
    }
  },

  // Obter e-mails dos usuários de uma área específica
  async getEmailsByArea(area, userService) {
    try {
      const users = await userService.getUsersByArea(area);
      const emails = users
        .filter(user => user.email && user.email.trim() !== '')
        .map(user => user.email);
      
      console.log(`📧 E-mails encontrados para área ${area}:`, emails);
      return emails;
    } catch (error) {
      console.error(`❌ Erro ao buscar e-mails da área ${area}:`, error);
      return [];
    }
  },

  // Obter e-mails dos administradores
  async getAdminEmails(userService) {
    try {
      const admins = await userService.getUsersByRole('administrador');
      const emails = admins
        .filter(user => user.email && user.email.trim() !== '')
        .map(user => user.email);
      
      console.log('📧 E-mails dos administradores:', emails);
      return emails;
    } catch (error) {
      console.error('❌ Erro ao buscar e-mails dos administradores:', error);
      return [];
    }
  },

  // Obter e-mail do criador do chamado
  async getCreatorEmail(userId, userService) {
    try {
      const user = await userService.getUserById(userId);
      if (user && user.email) {
        console.log(`📧 E-mail do criador: ${user.email}`);
        return [user.email];
      }
      return [];
    } catch (error) {
      console.error('❌ Erro ao buscar e-mail do criador:', error);
      return [];
    }
  },

  // Obter e-mail do produtor do projeto
  async getProducerEmail(projectId, projectService, userService) {
    try {
      const project = await projectService.getProjectById(projectId);
      if (project && project.produtorId) {
        const producer = await userService.getUserById(project.produtorId);
        if (producer && producer.email) {
          console.log(`📧 E-mail do produtor: ${producer.email}`);
          return [producer.email];
        }
      }
      return [];
    } catch (error) {
      console.error('❌ Erro ao buscar e-mail do produtor:', error);
      return [];
    }
  },

  // Consolidar todos os e-mails para notificação
  async getAllNotificationEmails(ticketData, userService, projectService) {
    try {
      const allEmails = new Set();

      // E-mails da área responsável
      const areaEmails = await this.getEmailsByArea(ticketData.area, userService);
      areaEmails.forEach(email => allEmails.add(email));

      // E-mails dos administradores
      const adminEmails = await this.getAdminEmails(userService);
      adminEmails.forEach(email => allEmails.add(email));

      // E-mail do criador
      if (ticketData.criadoPor) {
        const creatorEmails = await this.getCreatorEmail(ticketData.criadoPor, userService);
        creatorEmails.forEach(email => allEmails.add(email));
      }

      // E-mail do produtor (se houver projeto)
      if (ticketData.projetoId) {
        const producerEmails = await this.getProducerEmail(ticketData.projetoId, projectService, userService);
        producerEmails.forEach(email => allEmails.add(email));
      }

      const finalEmails = Array.from(allEmails);
      console.log('📧 Todos os e-mails para notificação:', finalEmails);
      return finalEmails;
    } catch (error) {
      console.error('❌ Erro ao consolidar e-mails:', error);
      return [];
    }
  }
};

