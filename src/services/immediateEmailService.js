/**
 * Serviço de E-mail Imediato
 * Solução que funciona diretamente do frontend sem problemas de CORS
 */

class ImmediateEmailService {
  constructor() {
    this.isEnabled = true;
    this.emailQueue = [];
    this.templates = this.initializeTemplates();
    
    // Configuração EmailJS (serviço gratuito que funciona do frontend)
    this.emailJSConfig = {
      serviceId: 'service_uset_notifications',
      templateId: 'template_ticket_notification',
      publicKey: 'user_uset_notifications'
    };
    
    // Fallback: usar mailto para casos críticos
    this.useMailtoFallback = true;
    
    console.log('📧 Serviço de e-mail imediato inicializado');
  }

  // Inicializar templates de e-mail
  initializeTemplates() {
    return {
      new_ticket: {
        subject: '🎫 Novo Chamado Criado - #{ticketId}',
        template: `
          Novo Chamado Criado
          
          #{ticketId} - {titulo}
          
          Área: {area}
          Prioridade: {prioridade}
          Criado por: {criadoPorNome}
          Data: {dataFormatada}
          
          Descrição:
          {descricao}
          
          Acesse o sistema: {systemUrl}
        `
      },
      
      ticket_updated: {
        subject: '🔄 Chamado Atualizado - #{ticketId}',
        template: `
          Chamado Atualizado
          
          #{ticketId} - {titulo}
          
          Status: {status}
          Área: {area}
          Atualizado por: {atualizadoPorNome}
          Data: {dataFormatada}
          
          {ultimaAtualizacao && 'Última atualização: ' + ultimaAtualizacao}
          
          Acesse o sistema: {systemUrl}
        `
      },
      
      ticket_escalated: {
        subject: '⚠️ Chamado Escalado - #{ticketId}',
        template: `
          Chamado Escalado
          
          #{ticketId} - {titulo}
          
          Escalado para: {escaladoPara}
          Área: {area}
          Prioridade: {prioridade}
          Escalado por: {escaladoPorNome}
          Data: {dataFormatada}
          
          {motivo && 'Motivo da Escalação: ' + motivo}
          
          Acesse o sistema: {systemUrl}
        `
      },
      
      ticket_completed: {
        subject: '✅ Chamado Concluído - #{ticketId}',
        template: `
          Chamado Concluído
          
          #{ticketId} - {titulo}
          
          Status: Concluído
          Área: {area}
          Concluído por: {concluidoPorNome}
          Data: {dataFormatada}
          
          {resolucao && 'Resolução: ' + resolucao}
          
          Acesse o sistema: {systemUrl}
        `
      }
    };
  }

  // Enviar notificação por e-mail (método principal)
  async sendNotification(ticket, eventType, currentUser, allUsers = []) {
    if (!this.isEnabled) {
      console.log('📧 Serviço de e-mail desabilitado');
      return;
    }

    try {
      console.log(`📧 Enviando notificação de ${eventType} para chamado ${ticket.id}`);
      
      // Obter destinatários baseado no tipo de evento e usuários reais
      const recipients = await this.getRecipientsForEvent(eventType, ticket, currentUser, allUsers);
      
      if (recipients.length === 0) {
        console.log('📧 Nenhum destinatário encontrado para notificação');
        return;
      }

      // Preparar dados do e-mail
      const emailData = this.prepareEmailData(ticket, eventType, currentUser);
      
      // Tentar enviar via SendGrid
      const success = await this.sendViaMultipleMethods(recipients, emailData, eventType);
      
      if (success) {
        console.log(`✅ Notificação enviada com sucesso para ${recipients.length} destinatário(s)`);
      } else {
        console.warn('⚠️ Falha ao enviar notificação por e-mail');
      }
      
    } catch (error) {
      console.error('❌ Erro ao enviar notificação:', error);
    }
  }

  // Obter destinatários baseado no evento
  async getRecipientsForEvent(eventType, ticket, currentUser, allUsers) {
    const recipients = [];
    
    try {
      console.log(`📧 Obtendo destinatários para evento: ${eventType}`);
      console.log(`📧 Usuários disponíveis: ${allUsers?.length || 0}`);
      
      // Baseado no tipo de evento e regras de negócio
      switch (eventType) {
        case 'new_ticket':
          // 1. Notificar operadores da área específica do chamado
          if (ticket.area) {
            const operadoresArea = allUsers?.filter(user => 
              user.funcao === 'operador' && 
              user.area === ticket.area &&
              user.email
            ) || [];
            
            operadoresArea.forEach(operador => {
              recipients.push(operador.email);
              console.log(`📧 Adicionado operador da área ${ticket.area}: ${operador.email}`);
            });
          }
          
          // 2. Notificar apenas o produtor responsável pelo projeto (não todos)
          if (ticket.projetoId) {
            // Buscar o projeto para encontrar o produtor responsável
            try {
              const { projectService } = await import('../services/projectService');
              const projeto = await projectService.getProjectById(ticket.projetoId);
              
              if (projeto?.produtorResponsavel) {
                const produtorResponsavel = allUsers?.find(user => 
                  user.uid === projeto.produtorResponsavel && user.email
                );
                
                if (produtorResponsavel) {
                  recipients.push(produtorResponsavel.email);
                  console.log(`📧 Adicionado produtor responsável pelo projeto: ${produtorResponsavel.email}`);
                }
              }
            } catch (error) {
              console.warn('⚠️ Erro ao buscar produtor responsável:', error);
              // Fallback: notificar criador se for produtor
              if (ticket.criadoPorFuncao === 'produtor') {
                const criadorProdutor = allUsers?.find(user => user.uid === ticket.criadoPor);
                if (criadorProdutor?.email) {
                  recipients.push(criadorProdutor.email);
                  console.log(`📧 Adicionado criador produtor: ${criadorProdutor.email}`);
                }
              }
            }
          }
          
          break;
          
        case 'ticket_updated':
          // 1. Notificar o criador do chamado (se não for o usuário atual)
          if (ticket.criadoPor && ticket.criadoPor !== currentUser?.uid) {
            const criador = allUsers?.find(user => user.uid === ticket.criadoPor);
            if (criador?.email) {
              recipients.push(criador.email);
              console.log(`📧 Adicionado criador do chamado: ${criador.email}`);
            }
          }
          
          // 2. Notificar operadores da área
          if (ticket.area) {
            const operadoresArea = allUsers?.filter(user => 
              user.funcao === 'operador' && 
              user.area === ticket.area &&
              user.email &&
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
            // Mapeamento de áreas para gerentes específicos
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
                user.email
              );
              
              if (gerenteEspecifico) {
                recipients.push(gerenteEspecifico.email);
                console.log(`📧 Adicionado gerente específico da área ${ticket.area}: ${gerenteEspecifico.email}`);
              }
            }
          }
          
          // Se escalado para área específica, notificar operadores dessa área
          else if (ticket.escaladoPara && ticket.escaladoPara !== 'gerencia') {
            const operadoresEscalados = allUsers?.filter(user => 
              user.funcao === 'operador' && 
              user.area === ticket.escaladoPara &&
              user.email
            ) || [];
            
            operadoresEscalados.forEach(operador => {
              recipients.push(operador.email);
              console.log(`📧 Adicionado operador da área escalada ${ticket.escaladoPara}: ${operador.email}`);
            });
          }
          
          break;
          
        case 'ticket_completed':
          // 1. Notificar o criador do chamado
          if (ticket.criadoPor) {
            const criador = allUsers?.find(user => user.uid === ticket.criadoPor);
            if (criador?.email) {
              recipients.push(criador.email);
              console.log(`📧 Adicionado criador para conclusão: ${criador.email}`);
            }
          }
          
          // 2. Notificar apenas o produtor responsável pelo projeto (para validação)
          if (ticket.projetoId) {
            try {
              const { projectService } = await import('../services/projectService');
              const projeto = await projectService.getProjectById(ticket.projetoId);
              
              if (projeto?.produtorResponsavel) {
                const produtorResponsavel = allUsers?.find(user => 
                  user.uid === projeto.produtorResponsavel && user.email
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
      email !== 'sistemauset@gmail.com' // Remover remetente dos destinatários
    );
    
    console.log(`📧 Destinatários finais (${uniqueRecipients.length}):`, uniqueRecipients);
    return uniqueRecipients;
  }

  // Preparar dados do e-mail
  prepareEmailData(ticket, eventType, currentUser) {
    const template = this.templates[eventType];
    if (!template) {
      throw new Error(`Template não encontrado para evento: ${eventType}`);
    }

    // Dados base
    const baseData = {
      ticketId: ticket.id || 'N/A',
      titulo: ticket.titulo || 'Sem título',
      area: ticket.area || 'Não definida',
      prioridade: ticket.prioridade || 'Normal',
      status: ticket.status || 'Aberto',
      descricao: ticket.descricao || 'Sem descrição',
      dataFormatada: new Date().toLocaleString('pt-BR'),
      systemUrl: window.location.origin,
      criadoPorNome: currentUser?.nome || 'Sistema',
      atualizadoPorNome: currentUser?.nome || 'Sistema',
      escaladoPorNome: currentUser?.nome || 'Sistema',
      concluidoPorNome: currentUser?.nome || 'Sistema'
    };

    // Processar template
    let subject = template.subject;
    let body = template.template;

    // Substituir variáveis no subject e body
    Object.keys(baseData).forEach(key => {
      const value = baseData[key] || '';
      subject = subject.replace(new RegExp(`{${key}}`, 'g'), value);
      body = body.replace(new RegExp(`{${key}}`, 'g'), value);
    });

    return {
      subject,
      body,
      data: baseData
    };
  }

  // Enviar via múltiplos métodos (fallback)
  async sendViaMultipleMethods(recipients, emailData, eventType = 'new_ticket') {
    // Método 1: Tentar via SendGrid backend
    try {
      const success = await this.sendViaSimpleFetch(recipients, emailData, eventType);
      if (success) {
        console.log('✅ E-mail enviado automaticamente via SendGrid');
        return true;
      }
    } catch (error) {
      console.warn('⚠️ Envio automático SendGrid falhou:', error.message);
    }

    // Se falhar, salvar na fila para tentar novamente depois
    console.log('📝 Salvando na fila para nova tentativa automática');
    this.addToQueue(recipients, emailData, eventType);
    return false; // Não abrir cliente de e-mail
  }

  // Método 1: SendGrid via backend (método principal)
  async sendViaSimpleFetch(recipients, emailData, eventType = 'new_ticket') {
    try {
      // Usar o backend SendGrid permanente
      const response = await fetch('https://lnh8imcd1j93.manus.space/api/email/send-notification', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          eventType: eventType,
          ticket: {
            id: emailData.data.ticketId,
            numero: emailData.data.ticketId,
            titulo: emailData.data.titulo,
            descricao: emailData.data.descricao,
            area: emailData.data.area,
            prioridade: emailData.data.prioridade,
            status: emailData.data.status,
            criadoPor: 'sistema',
            createdAt: new Date().toISOString()
          },
          recipients: recipients,
          currentUser: {
            uid: 'sistema',
            nome: emailData.data.criadoPorNome || 'Sistema',
            funcao: 'sistema'
          },
          allUsers: []
        })
      });

      if (response.ok) {
        const result = await response.json();
        console.log('✅ E-mail enviado via SendGrid:', result);
        return true;
      } else {
        const error = await response.text();
        console.warn('⚠️ Erro na resposta SendGrid:', error);
        return false;
      }
    } catch (error) {
      console.error('❌ Erro ao enviar via SendGrid:', error);
      return false;
    }
  }

  // Método 2: Mailto (abre cliente de e-mail do usuário)
  sendViaMailto(recipients, emailData) {
    const mailtoUrl = `mailto:${recipients.join(',')}?subject=${encodeURIComponent(emailData.subject)}&body=${encodeURIComponent(emailData.body)}`;
    
    // Abrir em nova janela para não interromper o fluxo
    window.open(mailtoUrl, '_blank');
    
    console.log('📧 E-mail aberto no cliente padrão do usuário');
  }

  // Método 3: Adicionar à fila para envio posterior
  addToQueue(recipients, emailData, eventType = 'new_ticket') {
    const queueItem = {
      id: Date.now(),
      recipients,
      emailData,
      eventType,
      timestamp: new Date().toISOString(),
      attempts: 0
    };
    
    this.emailQueue.push(queueItem);
    
    // Salvar na localStorage para persistência
    try {
      localStorage.setItem('emailQueue', JSON.stringify(this.emailQueue));
      console.log('📧 E-mail adicionado à fila para envio posterior');
    } catch (error) {
      console.warn('⚠️ Erro ao salvar fila de e-mails:', error);
    }
  }

  // Processar fila de e-mails
  async processQueue() {
    if (this.emailQueue.length === 0) return;

    console.log(`📧 Processando ${this.emailQueue.length} e-mails na fila`);

    for (let i = this.emailQueue.length - 1; i >= 0; i--) {
      const item = this.emailQueue[i];
      
      try {
        const success = await this.sendViaSimpleFetch(item.recipients, item.emailData, item.eventType || 'new_ticket');
        
        if (success) {
          this.emailQueue.splice(i, 1);
          console.log(`✅ E-mail da fila enviado: ${item.emailData.subject}`);
        } else {
          item.attempts++;
          if (item.attempts >= 3) {
            this.emailQueue.splice(i, 1);
            console.warn(`❌ E-mail removido da fila após 3 tentativas: ${item.emailData.subject}`);
          }
        }
      } catch (error) {
        console.warn(`⚠️ Erro ao processar item da fila:`, error);
      }
    }

    // Atualizar localStorage
    try {
      localStorage.setItem('emailQueue', JSON.stringify(this.emailQueue));
    } catch (error) {
      console.warn('⚠️ Erro ao atualizar fila de e-mails:', error);
    }
  }

  // Carregar fila do localStorage
  loadQueue() {
    try {
      const saved = localStorage.getItem('emailQueue');
      if (saved) {
        this.emailQueue = JSON.parse(saved);
        console.log(`📧 Carregados ${this.emailQueue.length} e-mails da fila`);
      }
    } catch (error) {
      console.warn('⚠️ Erro ao carregar fila de e-mails:', error);
      this.emailQueue = [];
    }
  }

  // Habilitar/desabilitar serviço
  setEnabled(enabled) {
    this.isEnabled = enabled;
    console.log(`📧 Serviço de e-mail ${enabled ? 'habilitado' : 'desabilitado'}`);
  }

  // Obter status do serviço
  getStatus() {
    return {
      enabled: this.isEnabled,
      queueSize: this.emailQueue.length,
      lastProcessed: new Date().toISOString()
    };
  }
}

// Instância global
export const immediateEmailService = new ImmediateEmailService();

// Carregar fila ao inicializar
immediateEmailService.loadQueue();

// Processar fila a cada 30 segundos
setInterval(() => {
  immediateEmailService.processQueue();
}, 30000);

export default immediateEmailService;

