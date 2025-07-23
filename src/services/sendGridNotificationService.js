/**
 * Serviço de Notificação SendGrid
 * Substitui o sistema defeituoso por uma solução robusta usando SendGrid
 */

class SendGridNotificationService {
  constructor() {
    this.isEnabled = true;
    this.backendUrl = 'https://lnh8imcd1j93.manus.space'; // URL do backend SendGrid permanente
    this.retryAttempts = 3;
    this.retryDelay = 1000; // 1 segundo
    
    console.log('📧 SendGrid Notification Service inicializado');
  }

  /**
   * Enviar notificação por e-mail usando o backend SendGrid
   */
  async sendNotification(eventType, ticket, currentUser, allUsers = []) {
    if (!this.isEnabled) {
      console.log('📧 Serviço SendGrid desabilitado');
      return { success: false, reason: 'disabled' };
    }

    try {
      console.log(`📧 Enviando notificação SendGrid: ${eventType}`);
      console.log(`📧 Ticket: #${ticket.numero || ticket.id}`);

      // Obter destinatários baseado nas regras de negócio
      const recipients = await this.getRecipientsForEvent(eventType, ticket, currentUser, allUsers);
      
      if (recipients.length === 0) {
        console.log('📧 Nenhum destinatário encontrado para notificação SendGrid');
        return { success: true, recipients: 0, reason: 'no_recipients' };
      }

      console.log(`📧 Destinatários SendGrid (${recipients.length}):`, recipients);

      // Preparar dados para o backend
      const payload = {
        eventType,
        ticket: this.sanitizeTicketData(ticket),
        recipients,
        currentUser: this.sanitizeUserData(currentUser),
        allUsers: allUsers.map(user => this.sanitizeUserData(user))
      };

      // Enviar para o backend SendGrid com retry
      const result = await this.sendWithRetry(payload);
      
      if (result.success) {
        console.log(`✅ Notificação SendGrid enviada com sucesso para ${recipients.length} destinatário(s)`);
        return {
          success: true,
          recipients: recipients.length,
          messageId: result.details?.messageId,
          service: 'sendgrid'
        };
      } else {
        console.error('❌ Falha ao enviar notificação SendGrid:', result.error);
        return {
          success: false,
          error: result.error,
          service: 'sendgrid'
        };
      }

    } catch (error) {
      console.error('❌ Erro no serviço SendGrid:', error);
      return {
        success: false,
        error: error.message,
        service: 'sendgrid'
      };
    }
  }

  /**
   * Obter destinatários baseado no evento e regras de negócio
   */
  async getRecipientsForEvent(eventType, ticket, currentUser, allUsers) {
    const recipients = [];
    
    try {
      console.log(`📧 Obtendo destinatários para evento: ${eventType}`);
      console.log(`📧 Usuários disponíveis: ${allUsers?.length || 0}`);
      
      switch (eventType) {
        case 'new_ticket':
          // 1. Operadores da área específica do chamado
          if (ticket.area) {
            const operadoresArea = allUsers?.filter(user => 
              user.funcao === 'operador' && 
              user.area === ticket.area &&
              user.email &&
              user.email !== 'sistemauset@gmail.com'
            ) || [];
            
            operadoresArea.forEach(operador => {
              recipients.push(operador.email);
              console.log(`📧 Adicionado operador da área ${ticket.area}: ${operador.email}`);
            });
          }
          
          // 2. Produtor responsável pelo projeto (se houver)
          if (ticket.projetoId) {
            try {
              const { projectService } = await import('./projectService');
              const projeto = await projectService.getProjectById(ticket.projetoId);
              
              if (projeto?.produtorResponsavel) {
                const produtorResponsavel = allUsers?.find(user => 
                  user.uid === projeto.produtorResponsavel && 
                  user.email &&
                  user.email !== 'sistemauset@gmail.com'
                );
                
                if (produtorResponsavel) {
                  recipients.push(produtorResponsavel.email);
                  console.log(`📧 Adicionado produtor responsável: ${produtorResponsavel.email}`);
                }
              }
            } catch (error) {
              console.warn('⚠️ Erro ao buscar produtor responsável:', error);
            }
          }
          break;
          
        case 'ticket_updated':
          // 1. Criador do chamado (se não for o usuário atual)
          if (ticket.criadoPor && ticket.criadoPor !== currentUser?.uid) {
            const criador = allUsers?.find(user => user.uid === ticket.criadoPor);
            if (criador?.email && criador.email !== 'sistemauset@gmail.com') {
              recipients.push(criador.email);
              console.log(`📧 Adicionado criador do chamado: ${criador.email}`);
            }
          }
          
          // 2. Operadores da área
          if (ticket.area) {
            const operadoresArea = allUsers?.filter(user => 
              user.funcao === 'operador' && 
              user.area === ticket.area &&
              user.email &&
              user.email !== 'sistemauset@gmail.com' &&
              user.uid !== currentUser?.uid
            ) || [];
            
            operadoresArea.forEach(operador => {
              recipients.push(operador.email);
              console.log(`📧 Adicionado operador da área: ${operador.email}`);
            });
          }
          break;
          
        case 'ticket_escalated':
          // Se escalado para gerência, notificar gerente específico da área
          if (ticket.escaladoPara === 'gerencia') {
            const mapeamentoGerentes = {
              'compras': 'gerente_operacional',
              'locacao': 'gerente_operacional', 
              'operacao': 'gerente_operacional',
              'logistica': 'gerente_operacional',
              'comercial': 'gerente_comercial',
              'produtor': 'gerente_producao',
              'almoxarifado': 'gerente_producao',
              'financeiro': 'gerente_financeiro'
            };
            
            const tipoGerente = mapeamentoGerentes[ticket.area?.toLowerCase()];
            if (tipoGerente) {
              const gerenteEspecifico = allUsers?.find(user => 
                user.funcao === 'gerente' && 
                user.area === tipoGerente &&
                user.email &&
                user.email !== 'sistemauset@gmail.com'
              );
              
              if (gerenteEspecifico) {
                recipients.push(gerenteEspecifico.email);
                console.log(`📧 Adicionado gerente específico da área ${ticket.area}: ${gerenteEspecifico.email}`);
              }
            }
          }
          // Se escalado para área específica
          else if (ticket.escaladoPara && ticket.escaladoPara !== 'gerencia') {
            const operadoresEscalados = allUsers?.filter(user => 
              user.funcao === 'operador' && 
              user.area === ticket.escaladoPara &&
              user.email &&
              user.email !== 'sistemauset@gmail.com'
            ) || [];
            
            operadoresEscalados.forEach(operador => {
              recipients.push(operador.email);
              console.log(`📧 Adicionado operador da área escalada ${ticket.escaladoPara}: ${operador.email}`);
            });
          }
          break;
          
        case 'ticket_completed':
          // 1. Criador do chamado
          if (ticket.criadoPor) {
            const criador = allUsers?.find(user => user.uid === ticket.criadoPor);
            if (criador?.email && criador.email !== 'sistemauset@gmail.com') {
              recipients.push(criador.email);
              console.log(`📧 Adicionado criador para conclusão: ${criador.email}`);
            }
          }
          
          // 2. Produtor responsável pelo projeto (para validação)
          if (ticket.projetoId) {
            try {
              const { projectService } = await import('./projectService');
              const projeto = await projectService.getProjectById(ticket.projetoId);
              
              if (projeto?.produtorResponsavel) {
                const produtorResponsavel = allUsers?.find(user => 
                  user.uid === projeto.produtorResponsavel && 
                  user.email &&
                  user.email !== 'sistemauset@gmail.com'
                );
                
                if (produtorResponsavel) {
                  recipients.push(produtorResponsavel.email);
                  console.log(`📧 Adicionado produtor responsável para validação: ${produtorResponsavel.email}`);
                }
              }
            } catch (error) {
              console.warn('⚠️ Erro ao buscar produtor responsável para validação:', error);
            }
          }
          break;
      }
      
    } catch (error) {
      console.error('❌ Erro ao obter destinatários:', error);
    }
    
    // Remover duplicatas e e-mails inválidos
    const uniqueRecipients = [...new Set(recipients)].filter(email => 
      email && 
      email.includes('@') && 
      email.includes('.') &&
      email !== 'sistemauset@gmail.com'
    );
    
    console.log(`📧 Destinatários finais SendGrid (${uniqueRecipients.length}):`, uniqueRecipients);
    return uniqueRecipients;
  }

  /**
   * Enviar com retry automático
   */
  async sendWithRetry(payload, attempt = 1) {
    try {
      const response = await fetch(`${this.backendUrl}/api/email/send-notification`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      return result;

    } catch (error) {
      console.error(`❌ Tentativa ${attempt} falhou:`, error.message);
      
      if (attempt < this.retryAttempts) {
        console.log(`🔄 Tentando novamente em ${this.retryDelay}ms...`);
        await new Promise(resolve => setTimeout(resolve, this.retryDelay));
        return this.sendWithRetry(payload, attempt + 1);
      }
      
      throw error;
    }
  }

  /**
   * Sanitizar dados do ticket
   */
  sanitizeTicketData(ticket) {
    return {
      id: ticket.id || ticket.numero || 'N/A',
      numero: ticket.numero || ticket.id || 'N/A',
      titulo: ticket.titulo || ticket.descricao || 'Sem título',
      descricao: ticket.descricao || '',
      area: ticket.area || 'Não especificada',
      prioridade: ticket.prioridade || 'media',
      status: ticket.status || 'aberto',
      criadoPor: ticket.criadoPor || '',
      createdAt: ticket.createdAt || new Date().toISOString(),
      projetoId: ticket.projetoId || '',
      tipo: ticket.tipo || '',
      escaladoPara: ticket.escaladoPara || '',
      motivo: ticket.motivo || ''
    };
  }

  /**
   * Sanitizar dados do usuário
   */
  sanitizeUserData(user) {
    if (!user) return {};
    
    return {
      uid: user.uid || '',
      nome: user.nome || 'Usuário',
      email: user.email || '',
      funcao: user.funcao || '',
      area: user.area || ''
    };
  }

  /**
   * Testar conectividade com o backend
   */
  async testConnection() {
    try {
      const response = await fetch(`${this.backendUrl}/health`);
      const result = await response.json();
      
      console.log('✅ Conexão com backend SendGrid OK:', result);
      return { success: true, status: result };
      
    } catch (error) {
      console.error('❌ Erro na conexão com backend SendGrid:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Enviar e-mail de teste
   */
  async sendTestEmail(email = 'sistemauset@gmail.com') {
    try {
      const response = await fetch(`${this.backendUrl}/api/email/test`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email })
      });

      const result = await response.json();
      
      if (result.success) {
        console.log('✅ E-mail de teste SendGrid enviado com sucesso');
        return { success: true, messageId: result.details?.messageId };
      } else {
        console.error('❌ Falha no e-mail de teste SendGrid:', result.error);
        return { success: false, error: result.error };
      }
      
    } catch (error) {
      console.error('❌ Erro no teste SendGrid:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Habilitar/desabilitar serviço
   */
  setEnabled(enabled) {
    this.isEnabled = enabled;
    console.log(`📧 Serviço SendGrid ${enabled ? 'habilitado' : 'desabilitado'}`);
  }

  /**
   * Configurar URL do backend
   */
  setBackendUrl(url) {
    this.backendUrl = url;
    console.log(`📧 URL do backend SendGrid atualizada: ${url}`);
  }

  /**
   * Obter status do serviço
   */
  getStatus() {
    return {
      enabled: this.isEnabled,
      backendUrl: this.backendUrl,
      retryAttempts: this.retryAttempts,
      service: 'sendgrid'
    };
  }
}

// Instância global
export const sendGridNotificationService = new SendGridNotificationService();

export default sendGridNotificationService;

