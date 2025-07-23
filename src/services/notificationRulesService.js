/**
 * Serviço de Regras de Notificação
 * Define quando e para quem enviar notificações baseado nos perfis e eventos
 */

class NotificationRulesService {
  constructor() {
    this.rules = this.initializeRules();
  }

  // Inicializar regras de notificação
  initializeRules() {
    return {
      // Regras para CONSULTORES
      consultor: {
        // Quando consultor abre um chamado
        new_ticket_by_self: {
          email: true,
          realtime: true,
          recipients: ['self', 'producers_by_project', 'managers'],
          message: 'Seu chamado foi criado e enviado para análise'
        },
        
        // Quando chamado do consultor tem movimentação
        ticket_movement: {
          email: true,
          realtime: true,
          recipients: ['self'],
          message: 'Seu chamado teve uma atualização'
        },
        
        // Quando chamado do consultor é concluído/validado
        ticket_completed: {
          email: true,
          realtime: true,
          recipients: ['self'],
          message: 'Seu chamado foi concluído'
        },
        
        // Quando chamado de projeto do consultor é aberto por outros
        project_ticket_opened: {
          email: true,
          realtime: true,
          recipients: ['self'],
          message: 'Um novo chamado foi aberto em seu projeto'
        },
        
        // Quando chamado de projeto do consultor é concluído
        project_ticket_completed: {
          email: true,
          realtime: true,
          recipients: ['self'],
          message: 'Um chamado do seu projeto foi concluído'
        }
      },

      // Regras para PRODUTORES
      produtor: {
        // Quando produtor abre um chamado
        new_ticket_by_self: {
          email: true,
          realtime: true,
          recipients: ['self', 'operators_by_area', 'managers'],
          message: 'Seu chamado foi criado e enviado para execução'
        },
        
        // Quando consultor abre chamado de projeto sob responsabilidade do produtor
        consultant_opens_project_ticket: {
          email: true,
          realtime: true,
          recipients: ['self'],
          message: 'Um consultor abriu um chamado em projeto sob sua responsabilidade'
        },
        
        // Quando chamado do produtor ou consultor tem movimentação
        ticket_movement: {
          email: true,
          realtime: true,
          recipients: ['self'],
          message: 'Um chamado sob sua responsabilidade teve atualização'
        },
        
        // Quando chamado é executado pelo operador
        ticket_executed: {
          email: true,
          realtime: true,
          recipients: ['self'],
          message: 'Um chamado foi executado e aguarda sua validação'
        },
        
        // Quando chamado é aprovado/reprovado pelo gerente
        ticket_manager_decision: {
          email: true,
          realtime: true,
          recipients: ['self'],
          message: 'Um gerente tomou uma decisão sobre o chamado escalado'
        }
      },

      // Regras para OPERADORES
      operador: {
        // Quando chega novo chamado para o operador
        new_ticket_for_area: {
          email: true,
          realtime: true,
          recipients: ['operators_by_area'],
          message: 'Novo chamado chegou para sua área'
        },
        
        // Quando chamado escalado volta para o operador
        escalated_ticket_returned: {
          email: true,
          realtime: true,
          recipients: ['self'],
          message: 'Um chamado escalado retornou para você'
        },
        
        // Quando chamado executado é concluído ou rejeitado pelo produtor
        executed_ticket_decision: {
          email: true,
          realtime: true,
          recipients: ['self'],
          message: 'Decisão tomada sobre chamado que você executou'
        }
      },

      // Regras para GERENTES
      gerente: {
        // Quando chamado é escalado para gerente
        ticket_escalated_to_manager: {
          email: true,
          realtime: true,
          recipients: ['managers_by_area'],
          message: 'Um chamado foi escalado para sua análise'
        },
        
        // Visibilidade geral (apenas realtime, sem spam de email)
        general_visibility: {
          email: false,
          realtime: true,
          recipients: ['self'],
          message: 'Atualização geral do sistema'
        }
      },

      // Regras para ADMINISTRADORES
      administrador: {
        // Administradores veem tudo em tempo real, mas emails seletivos
        all_tickets: {
          email: false, // Evitar spam
          realtime: true,
          recipients: ['self'],
          message: 'Atualização do sistema'
        },
        
        // Apenas escalações críticas por email
        critical_escalations: {
          email: true,
          realtime: true,
          recipients: ['self'],
          message: 'Escalação crítica requer atenção'
        }
      }
    };
  }

  // Determinar se deve enviar notificação baseado no evento e usuário
  shouldNotify(eventType, ticket, currentUser, targetUser) {
    const userRole = targetUser.funcao?.toLowerCase();
    const rules = this.rules[userRole];
    
    if (!rules) {
      return { email: false, realtime: false };
    }

    // Mapear evento para regra específica
    const ruleKey = this.mapEventToRule(eventType, ticket, currentUser, targetUser);
    const rule = rules[ruleKey];
    
    if (!rule) {
      return { email: false, realtime: false };
    }

    // Verificar se o usuário está na lista de destinatários
    const shouldReceive = this.isUserInRecipients(rule.recipients, ticket, currentUser, targetUser);
    
    return {
      email: rule.email && shouldReceive,
      realtime: rule.realtime && shouldReceive,
      message: rule.message
    };
  }

  // Mapear evento para regra específica
  mapEventToRule(eventType, ticket, currentUser, targetUser) {
    const currentUserRole = currentUser?.funcao?.toLowerCase();
    const targetUserRole = targetUser.funcao?.toLowerCase();
    
    switch (eventType) {
      case 'new_ticket':
        if (currentUser.uid === targetUser.uid) {
          return 'new_ticket_by_self';
        }
        if (targetUserRole === 'consultor' && this.isUserProjectRelated(ticket, targetUser)) {
          return 'project_ticket_opened';
        }
        if (targetUserRole === 'produtor' && currentUserRole === 'consultor') {
          return 'consultant_opens_project_ticket';
        }
        if (targetUserRole === 'operador' && ticket.area === targetUser.area) {
          return 'new_ticket_for_area';
        }
        return 'general_visibility';
        
      case 'ticket_update':
        if (ticket.criadoPor === targetUser.uid) {
          return 'ticket_movement';
        }
        if (targetUserRole === 'produtor' && ticket.status === 'executado') {
          return 'ticket_executed';
        }
        if (targetUserRole === 'operador' && ticket.responsavel === targetUser.uid) {
          return 'executed_ticket_decision';
        }
        return 'general_visibility';
        
      case 'ticket_escalated':
        if (targetUserRole === 'gerente') {
          return 'ticket_escalated_to_manager';
        }
        if (ticket.criadoPor === targetUser.uid || ticket.responsavel === targetUser.uid) {
          return 'ticket_movement';
        }
        return 'general_visibility';
        
      case 'ticket_completed':
        if (ticket.criadoPor === targetUser.uid) {
          return 'ticket_completed';
        }
        if (targetUserRole === 'consultor' && this.isUserProjectRelated(ticket, targetUser)) {
          return 'project_ticket_completed';
        }
        return 'general_visibility';
        
      default:
        return 'general_visibility';
    }
  }

  // Verificar se usuário está na lista de destinatários
  isUserInRecipients(recipients, ticket, currentUser, targetUser) {
    for (const recipient of recipients) {
      switch (recipient) {
        case 'self':
          if (currentUser.uid === targetUser.uid) return true;
          break;
          
        case 'operators_by_area':
          if (targetUser.funcao === 'operador' && targetUser.area === ticket.area) return true;
          break;
          
        case 'producers_by_project':
          if (targetUser.funcao === 'produtor' && this.isUserProjectRelated(ticket, targetUser)) return true;
          break;
          
        case 'consultors_by_project':
          if (targetUser.funcao === 'consultor' && this.isUserProjectRelated(ticket, targetUser)) return true;
          break;
          
        case 'managers':
          if (targetUser.funcao === 'gerente' || targetUser.funcao === 'administrador') return true;
          break;
          
        case 'managers_by_area':
          if ((targetUser.funcao === 'gerente' || targetUser.funcao === 'administrador') && 
              this.isManagerForArea(targetUser, ticket.area)) return true;
          break;
      }
    }
    return false;
  }

  // Verificar se usuário está relacionado ao projeto
  isUserProjectRelated(ticket, user) {
    // Em uma implementação real, isso verificaria a relação do usuário com o projeto
    // Por enquanto, retorna true para simplificar
    return ticket.projeto && user.projetos?.includes(ticket.projeto);
  }

  // Verificar se gerente é responsável pela área
  isManagerForArea(manager, area) {
    // Mapeamento baseado no conhecimento fornecido
    const areaManagerMap = {
      'compras': 'gerente_operacional',
      'locacao': 'gerente_operacional', 
      'operacao': 'gerente_operacional',
      'logistica': 'gerente_operacional',
      'comercial': 'gerente_comercial',
      'producao': 'gerente_producao',
      'almoxarifado': 'gerente_producao',
      'financeiro': 'gerente_financeiro',
      'projetos': 'gerente_projetos'
    };
    
    const requiredManagerType = areaManagerMap[area?.toLowerCase()];
    return manager.tipoGerente === requiredManagerType;
  }

  // Obter lista de destinatários para um evento específico
  getRecipientsForEvent(eventType, ticket, currentUser, allUsers) {
    const recipients = {
      email: [],
      realtime: []
    };

    for (const user of allUsers) {
      const notification = this.shouldNotify(eventType, ticket, currentUser, user);
      
      if (notification.email) {
        recipients.email.push({
          email: user.email,
          nome: user.nome,
          funcao: user.funcao
        });
      }
      
      if (notification.realtime) {
        recipients.realtime.push({
          uid: user.uid,
          email: user.email,
          nome: user.nome,
          funcao: user.funcao
        });
      }
    }

    return recipients;
  }

  // Obter regras específicas para um perfil
  getRulesForRole(role) {
    return this.rules[role?.toLowerCase()] || {};
  }

  // Validar se evento deve gerar notificação
  validateNotificationEvent(eventType, ticket, currentUser) {
    // Regras de validação gerais
    const validEvents = [
      'new_ticket',
      'ticket_update', 
      'ticket_escalated',
      'ticket_completed',
      'ticket_rejected'
    ];

    if (!validEvents.includes(eventType)) {
      return false;
    }

    // Não notificar sobre próprias ações (exceto criação)
    if (eventType !== 'new_ticket' && ticket.ultimaAtualizacaoPor === currentUser?.uid) {
      return false;
    }

    return true;
  }

  // Obter mensagem personalizada para notificação
  getNotificationMessage(eventType, ticket, currentUser, targetUser) {
    const userRole = targetUser.funcao?.toLowerCase();
    const rules = this.rules[userRole];
    
    if (!rules) {
      return 'Atualização do sistema';
    }

    const ruleKey = this.mapEventToRule(eventType, ticket, currentUser, targetUser);
    const rule = rules[ruleKey];
    
    return rule?.message || 'Atualização do sistema';
  }

  // Configurar regras personalizadas
  setCustomRule(role, eventKey, rule) {
    if (!this.rules[role]) {
      this.rules[role] = {};
    }
    this.rules[role][eventKey] = rule;
  }

  // Obter estatísticas das regras
  getRulesStats() {
    const stats = {};
    
    for (const [role, rules] of Object.entries(this.rules)) {
      stats[role] = {
        totalRules: Object.keys(rules).length,
        emailRules: Object.values(rules).filter(r => r.email).length,
        realtimeRules: Object.values(rules).filter(r => r.realtime).length
      };
    }
    
    return stats;
  }
}

// Exportar instância única
export const notificationRulesService = new NotificationRulesService();

