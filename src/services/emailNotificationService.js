import { collection, addDoc, serverTimestamp, doc, getDoc } from 'firebase/firestore';
import { db } from '../config/firebase';

class EmailNotificationService {
  constructor() {
    this.isEnabled = true;
    this.emailQueue = [];
    this.templates = this.initializeTemplates();
    // SendGrid backend permanente
    this.backendUrl = 'https://lnh8imcd1j93.manus.space';
  }

  // Inicializar templates de e-mail
  initializeTemplates() {
    return {
      new_ticket: {
        subject: '🎫 Novo Chamado Criado - #{ticketId}',
        template: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: #f8f9fa; padding: 20px; border-radius: 8px;">
              <h2 style="color: #2563eb; margin: 0 0 20px 0;">🎫 Novo Chamado Criado</h2>
              
              <div style="background: white; padding: 20px; border-radius: 6px; margin-bottom: 20px;">
                <h3 style="margin: 0 0 15px 0; color: #1f2937;">#{ticketId} - {titulo}</h3>
                
                <div style="display: grid; gap: 10px;">
                  <div><strong>Área:</strong> {area}</div>
                  <div><strong>Prioridade:</strong> <span style="color: {priorityColor};">{prioridade}</span></div>
                  <div><strong>Criado por:</strong> {criadoPorNome}</div>
                  <div><strong>Data:</strong> {dataFormatada}</div>
                </div>
                
                {descricao && <div style="margin-top: 15px; padding: 15px; background: #f8f9fa; border-radius: 4px;">
                  <strong>Descrição:</strong><br>
                  {descricao}
                </div>}
              </div>
              
              <div style="text-align: center;">
                <a href="{systemUrl}" style="background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
                  Ver Chamado no Sistema
                </a>
              </div>
            </div>
          </div>
        `
      },
      
      ticket_update: {
        subject: '🔄 Chamado Atualizado - #{ticketId}',
        template: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: #f8f9fa; padding: 20px; border-radius: 8px;">
              <h2 style="color: #059669; margin: 0 0 20px 0;">🔄 Chamado Atualizado</h2>
              
              <div style="background: white; padding: 20px; border-radius: 6px; margin-bottom: 20px;">
                <h3 style="margin: 0 0 15px 0; color: #1f2937;">#{ticketId} - {titulo}</h3>
                
                <div style="display: grid; gap: 10px;">
                  <div><strong>Status:</strong> <span style="color: {statusColor};">{status}</span></div>
                  <div><strong>Área:</strong> {area}</div>
                  <div><strong>Atualizado por:</strong> {atualizadoPorNome}</div>
                  <div><strong>Data:</strong> {dataFormatada}</div>
                </div>
                
                {comentario && <div style="margin-top: 15px; padding: 15px; background: #f0f9ff; border-radius: 4px; border-left: 4px solid #2563eb;">
                  <strong>Comentário:</strong><br>
                  {comentario}
                </div>}
              </div>
              
              <div style="text-align: center;">
                <a href="{systemUrl}" style="background: #059669; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
                  Ver Chamado no Sistema
                </a>
              </div>
            </div>
          </div>
        `
      },
      
      ticket_escalated: {
        subject: '⚠️ Chamado Escalado - #{ticketId}',
        template: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: #f8f9fa; padding: 20px; border-radius: 8px;">
              <h2 style="color: #dc2626; margin: 0 0 20px 0;">⚠️ Chamado Escalado</h2>
              
              <div style="background: white; padding: 20px; border-radius: 6px; margin-bottom: 20px;">
                <h3 style="margin: 0 0 15px 0; color: #1f2937;">#{ticketId} - {titulo}</h3>
                
                <div style="display: grid; gap: 10px;">
                  <div><strong>Escalado para:</strong> {escaladoPara}</div>
                  <div><strong>Área:</strong> {area}</div>
                  <div><strong>Prioridade:</strong> <span style="color: {priorityColor};">{prioridade}</span></div>
                  <div><strong>Escalado por:</strong> {escaladoPorNome}</div>
                  <div><strong>Data:</strong> {dataFormatada}</div>
                </div>
                
                {motivo && <div style="margin-top: 15px; padding: 15px; background: #fef2f2; border-radius: 4px; border-left: 4px solid #dc2626;">
                  <strong>Motivo da Escalação:</strong><br>
                  {motivo}
                </div>}
              </div>
              
              <div style="text-align: center;">
                <a href="{systemUrl}" style="background: #dc2626; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
                  Ver Chamado no Sistema
                </a>
              </div>
            </div>
          </div>
        `
      },
      
      ticket_completed: {
        subject: '✅ Chamado Concluído - #{ticketId}',
        template: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: #f8f9fa; padding: 20px; border-radius: 8px;">
              <h2 style="color: #059669; margin: 0 0 20px 0;">✅ Chamado Concluído</h2>
              
              <div style="background: white; padding: 20px; border-radius: 6px; margin-bottom: 20px;">
                <h3 style="margin: 0 0 15px 0; color: #1f2937;">#{ticketId} - {titulo}</h3>
                
                <div style="display: grid; gap: 10px;">
                  <div><strong>Status:</strong> <span style="color: #059669;">Concluído</span></div>
                  <div><strong>Área:</strong> {area}</div>
                  <div><strong>Concluído por:</strong> {concluidoPorNome}</div>
                  <div><strong>Data:</strong> {dataFormatada}</div>
                  <div><strong>Tempo total:</strong> {tempoTotal}</div>
                </div>
                
                {resolucao && <div style="margin-top: 15px; padding: 15px; background: #f0fdf4; border-radius: 4px; border-left: 4px solid #059669;">
                  <strong>Resolução:</strong><br>
                  {resolucao}
                </div>}
              </div>
              
              <div style="text-align: center;">
                <a href="{systemUrl}" style="background: #059669; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
                  Ver Chamado no Sistema
                </a>
              </div>
            </div>
          </div>
        `
      }
    };
  }

  // Buscar dados de usuários do Firebase
  async getUsersData() {
    try {
      // Em uma implementação real, isso buscaria todos os usuários
      // Por enquanto, retorna array vazio
      return [];
    } catch (error) {
      console.error('Erro ao buscar dados de usuários:', error);
      return [];
    }
  }

  // Determinar destinatários baseado no evento e perfil
  async getRecipients(ticket, eventType, currentUser) {
    const recipients = new Set();
    
    // Buscar dados dos usuários
    const users = await this.getUsersData();
    
    switch (eventType) {
      case 'new_ticket':
        recipients.add(...this.getRecipientsForNewTicket(ticket, users, currentUser));
        break;
        
      case 'ticket_update':
        recipients.add(...this.getRecipientsForUpdate(ticket, users, currentUser));
        break;
        
      case 'ticket_escalated':
        recipients.add(...this.getRecipientsForEscalation(ticket, users, currentUser));
        break;
        
      case 'ticket_completed':
        recipients.add(...this.getRecipientsForCompletion(ticket, users, currentUser));
        break;
    }
    
    return Array.from(recipients).filter(email => email && email.includes('@'));
  }

  // Destinatários para novo chamado
  getRecipientsForNewTicket(ticket, users, currentUser) {
    const recipients = [];
    
    // Regras específicas baseadas no perfil do usuário atual
    const userRole = currentUser?.funcao?.toLowerCase();
    
    if (userRole === 'consultor') {
      // Consultor criou chamado - notificar operadores da área e produtores
      recipients.push(...this.getOperatorsByArea(ticket.area, users));
      recipients.push(...this.getProducersByProject(ticket.projeto, users));
      recipients.push(...this.getManagers(users));
    } else if (userRole === 'operador') {
      // Operador criou chamado - notificar gerentes e produtores
      recipients.push(...this.getManagers(users));
      recipients.push(...this.getProducersByProject(ticket.projeto, users));
    } else if (userRole === 'produtor') {
      // Produtor criou chamado - notificar operadores da área e gerentes
      recipients.push(...this.getOperatorsByArea(ticket.area, users));
      recipients.push(...this.getManagers(users));
    }
    
    return recipients;
  }

  // Destinatários para atualização
  getRecipientsForUpdate(ticket, users, currentUser) {
    const recipients = [];
    
    // Sempre notificar criador do chamado (se não foi ele que atualizou)
    if (ticket.criadoPorEmail && ticket.criadoPorEmail !== currentUser?.email) {
      recipients.push(ticket.criadoPorEmail);
    }
    
    // Notificar responsável atual
    if (ticket.responsavelEmail && ticket.responsavelEmail !== currentUser?.email) {
      recipients.push(ticket.responsavelEmail);
    }
    
    // Notificar gerentes
    recipients.push(...this.getManagers(users));
    
    // Se é chamado de projeto, notificar consultor e produtor
    if (ticket.projeto) {
      recipients.push(...this.getConsultorsByProject(ticket.projeto, users));
      recipients.push(...this.getProducersByProject(ticket.projeto, users));
    }
    
    return recipients;
  }

  // Destinatários para escalação
  getRecipientsForEscalation(ticket, users, currentUser) {
    const recipients = [];
    
    // Pessoa para quem foi escalado
    if (ticket.escaladoParaEmail) {
      recipients.push(ticket.escaladoParaEmail);
    }
    
    // Criador do chamado
    if (ticket.criadoPorEmail) {
      recipients.push(ticket.criadoPorEmail);
    }
    
    // Gerentes
    recipients.push(...this.getManagers(users));
    
    return recipients;
  }

  // Destinatários para conclusão
  getRecipientsForCompletion(ticket, users, currentUser) {
    const recipients = [];
    
    // Criador do chamado
    if (ticket.criadoPorEmail) {
      recipients.push(ticket.criadoPorEmail);
    }
    
    // Responsável pelo chamado
    if (ticket.responsavelEmail) {
      recipients.push(ticket.responsavelEmail);
    }
    
    // Se é chamado de projeto, notificar consultor
    if (ticket.projeto) {
      recipients.push(...this.getConsultorsByProject(ticket.projeto, users));
    }
    
    return recipients;
  }

  // Métodos auxiliares para buscar usuários por função/área
  getOperatorsByArea(area, users) {
    return users
      .filter(u => u.funcao === 'operador' && u.area === area)
      .map(u => u.email);
  }

  getProducersByProject(projeto, users) {
    // Em uma implementação real, isso buscaria produtores responsáveis pelo projeto
    return users
      .filter(u => u.funcao === 'produtor')
      .map(u => u.email);
  }

  getConsultorsByProject(projeto, users) {
    // Em uma implementação real, isso buscaria consultores do projeto
    return users
      .filter(u => u.funcao === 'consultor')
      .map(u => u.email);
  }

  getManagers(users) {
    return users
      .filter(u => u.funcao === 'gerente' || u.funcao === 'administrador')
      .map(u => u.email);
  }

  // Processar template com dados
  processTemplate(templateType, data) {
    const template = this.templates[templateType];
    if (!template) {
      throw new Error(`Template ${templateType} não encontrado`);
    }
    
    let html = template.template;
    let subject = template.subject;
    
    // Substituir variáveis no template
    Object.keys(data).forEach(key => {
      const regex = new RegExp(`{${key}}`, 'g');
      html = html.replace(regex, data[key] || '');
      subject = subject.replace(regex, data[key] || '');
    });
    
    return { html, subject };
  }

  // Preparar dados para template
  prepareTemplateData(ticket, eventType, additionalData = {}) {
    const baseData = {
      ticketId: ticket.id,
      titulo: ticket.titulo || 'Sem título',
      area: ticket.area || 'N/A',
      prioridade: ticket.prioridade || 'media',
      status: ticket.status || 'aberto',
      criadoPorNome: ticket.criadoPorNome || 'Usuário',
      dataFormatada: new Date().toLocaleString('pt-BR'),
      systemUrl: `${window.location.origin}/#/chamado/${ticket.id}`,
      priorityColor: this.getPriorityColor(ticket.prioridade),
      statusColor: this.getStatusColor(ticket.status),
      descricao: ticket.descricao || '',
      ...additionalData
    };
    
    return baseData;
  }

  // Obter cor da prioridade
  getPriorityColor(prioridade) {
    switch (prioridade?.toLowerCase()) {
      case 'urgente': return '#dc2626';
      case 'alta': return '#ea580c';
      case 'media': return '#2563eb';
      case 'baixa': return '#059669';
      default: return '#6b7280';
    }
  }

  // Obter cor do status
  getStatusColor(status) {
    switch (status?.toLowerCase()) {
      case 'concluido': return '#059669';
      case 'em_andamento': return '#2563eb';
      case 'pendente': return '#ea580c';
      case 'rejeitado': return '#dc2626';
      default: return '#6b7280';
    }
  }

  // Enviar e-mail via SendGrid backend
  async sendEmailViaBackend(recipients, subject, html) {
    try {
      const response = await fetch(`${this.backendUrl}/api/email/send-notification`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          eventType: 'notification',
          ticket: {
            id: 'notification',
            titulo: subject,
            descricao: html
          },
          recipients: recipients
        })
      });

      const result = await response.json();
      
      if (result.success) {
        console.log(`📧 E-mail enviado com sucesso via SendGrid para ${recipients.length} destinatário(s)`);
        return true;
      } else {
        console.error('❌ Erro ao enviar e-mail via SendGrid:', result.error);
        return false;
      }
    } catch (error) {
      console.error('❌ Erro na comunicação com backend SendGrid:', error);
      return false;
    }
  }

  // Enviar notificação por e-mail
  async sendNotification(ticket, eventType, currentUser, additionalData = {}) {
    if (!this.isEnabled) {
      console.log('📧 Notificações por e-mail desabilitadas');
      return;
    }

    try {
      // Obter destinatários
      const recipients = await this.getRecipients(ticket, eventType, currentUser);
      
      if (recipients.length === 0) {
        console.log('📧 Nenhum destinatário encontrado para notificação');
        return;
      }

      // Preparar dados do template
      const templateData = this.prepareTemplateData(ticket, eventType, additionalData);
      
      // Processar template
      const { html, subject } = this.processTemplate(eventType, templateData);
      
      // Enviar via backend
      await this.sendEmailViaBackend(recipients, subject, html);
      
    } catch (error) {
      console.error('❌ Erro ao enviar notificação por e-mail:', error);
    }
  }

  // Métodos específicos para cada tipo de evento
  async notifyNewTicket(ticket, currentUser) {
    await this.sendNotification(ticket, 'new_ticket', currentUser);
  }

  async notifyTicketUpdate(ticket, currentUser, comment = '') {
    await this.sendNotification(ticket, 'ticket_update', currentUser, {
      comentario: comment,
      atualizadoPorNome: currentUser?.nome || 'Sistema'
    });
  }

  async notifyTicketEscalated(ticket, currentUser, escalatedTo, reason = '') {
    await this.sendNotification(ticket, 'ticket_escalated', currentUser, {
      escaladoPara: escalatedTo?.nome || 'Gerente',
      escaladoPorNome: currentUser?.nome || 'Sistema',
      motivo: reason
    });
  }

  async notifyTicketCompleted(ticket, currentUser, resolution = '', totalTime = '') {
    await this.sendNotification(ticket, 'ticket_completed', currentUser, {
      concluidoPorNome: currentUser?.nome || 'Sistema',
      resolucao: resolution,
      tempoTotal: totalTime
    });
  }

  // Testar configuração de e-mail via SendGrid
  async testEmailConfiguration(testEmail) {
    try {
      const response = await fetch(`${this.backendUrl}/api/email/test`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: testEmail
        })
      });

      const result = await response.json();
      return result;
    } catch (error) {
      console.error('❌ Erro ao testar configuração SendGrid:', error);
      return { success: false, error: error.message };
    }
  }

  // Habilitar/desabilitar notificações
  setEnabled(enabled) {
    this.isEnabled = enabled;
    console.log(`📧 Notificações por e-mail ${enabled ? 'habilitadas' : 'desabilitadas'}`);
  }

  // Obter status do serviço
  getStatus() {
    return {
      enabled: this.isEnabled,
      backendUrl: this.backendUrl,
      templates: Object.keys(this.templates)
    };
  }
}

// Exportar instância única
export const emailNotificationService = new EmailNotificationService();

