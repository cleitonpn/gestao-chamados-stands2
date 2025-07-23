import { 
  collection, 
  doc, 
  getDocs, 
  getDoc, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  query, 
  where, 
  orderBy,
  onSnapshot,
  arrayUnion  // NOVO: Para atualizar arrays no Firestore
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { AREAS } from './userService';
import { emailService } from './emailService';

// Status dos chamados
export const TICKET_STATUS = {
  OPEN: 'aberto',                                    // Chamado criado
  IN_ANALYSIS: 'em_analise',                         // Produtor analisando
  SENT_TO_AREA: 'enviado_para_area',                // Enviado para área específica
  IN_EXECUTION: 'em_execucao',                       // Produtor executando no pavilhão
  IN_TREATMENT: 'em_tratativa',                      // Operador dando tratativa
  AWAITING_APPROVAL: 'aguardando_aprovacao',         // Escalado para gerência
  APPROVED: 'aprovado',                              // Aprovado pela gerência
  REJECTED: 'rejeitado',                             // Rejeitado pela gerência
  EXECUTED_AWAITING_VALIDATION: 'executado_aguardando_validacao', // Área executou, aguarda validação
  ESCALATED_TO_OTHER_AREA: 'escalado_para_outra_area', // Escalado para outra área
  COMPLETED: 'concluido',                            // Chamado finalizado
  CANCELLED: 'cancelado'                             // Chamado cancelado
};

// Funções/Perfis de usuário
export const USER_ROLES = {
  CONSULTOR: 'consultor',
  PRODUTOR: 'produtor', 
  GERENTE: 'gerente',
  OPERADOR: 'operador',
  ADMINISTRADOR: 'administrador'
};

// Tipos de chamado
export const TICKET_TYPES = {
  FREIGHT: 'frete',
  FURNITURE_CHANGE: 'troca_mobiliario',
  WAREHOUSE_MATERIAL: 'material_almoxarifado',
  VISUAL_COMMUNICATION: 'comunicacao_visual',
  RENTAL: 'locacao',
  PURCHASE: 'compra',
  MAINTENANCE: 'manutencao',
  MAINTENANCE_PRODUCTION: 'manutencao_producao',
  MAINTENANCE_FURNITURE: 'manutencao_mobiliario',
  MAINTENANCE_VISUAL: 'manutencao_comunicacao_visual',
  OTHER: 'outro'
};

// Prioridades
export const PRIORITIES = {
  LOW: 'baixa',
  MEDIUM: 'media',
  HIGH: 'alta',
  URGENT: 'urgente'
};

export const ticketService = {
  // Criar chamado
  async createTicket(ticketData) {
    try {
      // Importar AREAS para usar constante correta
      const { AREAS } = await import('./userService');
      
      // CORREÇÃO: Roteamento baseado em quem criou o chamado
      const finalTicketData = {
        ...ticketData,
        status: TICKET_STATUS.OPEN,
        createdAt: new Date(),
        updatedAt: new Date(),
        slaOperacao: null,
        slaValidacao: null,
        executadoEm: null,
        validadoEm: null,
        // NOVO: Inicializar histórico de status
        historicoStatus: [{
          statusAnterior: null,
          novoStatus: TICKET_STATUS.OPEN,
          data: new Date(),
          responsavel: ticketData.criadoPor,
          comentario: 'Chamado criado'
        }],
        // Roteamento inteligente baseado no criador
        areaOriginal: ticketData.area, // Salva área original para escalação posterior
        area: (() => {
          // Se foi criado por consultor, sempre vai para produção primeiro (triagem)
          if (ticketData.criadoPorFuncao === 'consultor') {
            return AREAS.PRODUCTION;
          }
          // Se foi criado por produtor ou operador operacional, vai direto para a área especificada
          else if (ticketData.criadoPorFuncao === 'produtor' || ticketData.criadoPorFuncao === 'operador') {
            return ticketData.area;
          }
          // Fallback para área especificada
          return ticketData.area;
        })(),
        // Definir responsável atual baseado no criador
        responsavelAtual: (() => {
          if (ticketData.criadoPorFuncao === 'consultor') {
            return 'produtor'; // Consultor -> Produtor (triagem)
          } else if (ticketData.criadoPorFuncao === 'produtor') {
            return 'operador'; // Produtor -> Operador da área
          } else if (ticketData.criadoPorFuncao === 'operador') {
            return 'operador'; // Operador -> Operador da área (pode ser ele mesmo ou outro)
          }
          return 'operador'; // Fallback
        })()
      };
      
      const docRef = await addDoc(collection(db, 'chamados'), finalTicketData);
      
      const ticketId = docRef.id;
      
      // Enviar notificações (não bloquear se falhar)
      try {
        // Importar serviços dinamicamente para evitar dependência circular
        const { userService } = await import('./userService');
        const { projectService } = await import('./projectService');
        const { unifiedNotificationService } = await import('./unifiedNotificationService');
        
        // Buscar nome do projeto
        let projectName = 'Projeto não identificado';
        if (ticketData.projetoId) {
          const project = await projectService.getProjectById(ticketData.projetoId);
          if (project) {
            projectName = project.nome;
          }
        }
        
        // Enviar notificações via sistema unificado (SendGrid)
        const ticketWithId = { ...ticketData, id: ticketId };
        await unifiedNotificationService.notifyTicketCreated(ticketWithId);
        console.log('✅ Notificações de criação SendGrid enviadas com sucesso');
        
      } catch (notificationError) {
        console.error('❌ Erro ao enviar notificações (não crítico):', notificationError);
        // Não falhar a criação do chamado por causa das notificações
      }
      
      return ticketId;
    } catch (error) {
      console.error('Erro ao criar chamado:', error);
      throw error;
    }
  },

  // Buscar chamado por ID
  async getTicketById(ticketId) {
    try {
      const docRef = doc(db, 'chamados', ticketId);
      const docSnap = await getDoc(docRef);
      
      if (docSnap.exists()) {
        return { id: docSnap.id, ...docSnap.data() };
      } else {
        return null;
      }
    } catch (error) {
      console.error('Erro ao buscar chamado:', error);
      throw error;
    }
  },

  // Listar todos os chamados (apenas para administradores)
  async getAllTickets() {
    try {
      const querySnapshot = await getDocs(
        collection(db, 'chamados')
      );
      
      const tickets = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      // Ordenar por data de criação (mais recente primeiro)
      return tickets.sort((a, b) => {
        const dateA = a.createdAt?.toDate?.() || new Date(a.createdAt);
        const dateB = b.createdAt?.toDate?.() || new Date(b.createdAt);
        return dateB - dateA;
      });
    } catch (error) {
      console.error('Erro ao listar chamados:', error);
      throw error;
    }
  },

  // Buscar chamados por projeto
  async getTicketsByProject(projectId) {
    try {
      if (!projectId || typeof projectId !== 'string') {
        console.warn('getTicketsByProject: projectId inválido:', projectId);
        return [];
      }

      const q = query(
        collection(db, 'chamados'), 
        where('projetoId', '==', projectId)
      );
      const querySnapshot = await getDocs(q);
      
      const tickets = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      // Ordenar por data de criação (mais recente primeiro)
      return tickets.sort((a, b) => {
        const dateA = a.createdAt?.toDate?.() || new Date(a.createdAt);
        const dateB = b.createdAt?.toDate?.() || new Date(b.createdAt);
        return dateB - dateA;
      });
    } catch (error) {
      console.error('Erro ao buscar chamados por projeto:', error);
      throw error;
    }
  },

  // Buscar chamados por múltiplos projetos (para produtores/consultores)
  async getTicketsByProjects(projectIds) {
    try {
      if (!projectIds || !Array.isArray(projectIds) || projectIds.length === 0) {
        console.warn('getTicketsByProjects: projectIds inválido:', projectIds);
        return [];
      }

      // Filtrar IDs válidos
      const validProjectIds = projectIds.filter(id => id && typeof id === 'string');
      if (validProjectIds.length === 0) {
        console.warn('getTicketsByProjects: nenhum projectId válido encontrado');
        return [];
      }

      // Firestore tem limite de 10 itens no array 'in', então vamos fazer consultas em lotes
      const batchSize = 10;
      const batches = [];
      
      for (let i = 0; i < validProjectIds.length; i += batchSize) {
        const batch = validProjectIds.slice(i, i + batchSize);
        batches.push(batch);
      }

      const allTickets = [];
      
      for (const batch of batches) {
        const q = query(
          collection(db, 'chamados'),
          where('projetoId', 'in', batch)
        );
        
        const querySnapshot = await getDocs(q);
        const batchTickets = querySnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        
        allTickets.push(...batchTickets);
      }

      // Ordenar todos os chamados por data de criação (mais recente primeiro)
      return allTickets.sort((a, b) => {
        const dateA = a.createdAt?.toDate?.() || new Date(a.createdAt);
        const dateB = b.createdAt?.toDate?.() || new Date(b.createdAt);
        return dateB - dateA;
      });
    } catch (error) {
      console.error('Erro ao buscar chamados por projetos:', error);
      throw error;
    }
  },

  // Buscar chamados por área
  async getTicketsByArea(area) {
    try {
      if (!area || typeof area !== 'string') {
        console.warn('getTicketsByArea: area inválida:', area);
        return [];
      }

      // Buscar chamados da área E chamados escalados para gerência da área
      const queries = [
        // Chamados normais da área
        query(collection(db, 'chamados'), where('area', '==', area)),
        // Chamados escalados para gerência (se for gerente)
        query(collection(db, 'chamados'), where('areaGerencia', '==', `gerente_${area}`))
      ];

      const [normalTickets, managementTickets] = await Promise.all(
        queries.map(q => getDocs(q))
      );
      
      const allTickets = [
        ...normalTickets.docs.map(doc => ({ id: doc.id, ...doc.data() })),
        ...managementTickets.docs.map(doc => ({ id: doc.id, ...doc.data() }))
      ];

      // Remover duplicatas (caso um chamado apareça em ambas as consultas)
      const uniqueTickets = allTickets.filter((ticket, index, self) => 
        index === self.findIndex(t => t.id === ticket.id)
      );

      // Ordenar por data de criação (mais recente primeiro)
      return uniqueTickets.sort((a, b) => {
        const dateA = a.createdAt?.toDate?.() || new Date(a.createdAt);
        const dateB = b.createdAt?.toDate?.() || new Date(b.createdAt);
        return dateB - dateA;
      });
    } catch (error) {
      console.error('Erro ao buscar chamados por área:', error);
      throw error;
    }
  },

  // Buscar chamados por status
  async getTicketsByStatus(status) {
    try {
      if (!status || typeof status !== 'string') {
        console.warn('getTicketsByStatus: status inválido:', status);
        return [];
      }

      const q = query(
        collection(db, 'chamados'), 
        where('status', '==', status)
      );
      const querySnapshot = await getDocs(q);
      
      const tickets = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      // Ordenar por data de criação (mais recente primeiro)
      return tickets.sort((a, b) => {
        const dateA = a.createdAt?.toDate?.() || new Date(a.createdAt);
        const dateB = b.createdAt?.toDate?.() || new Date(b.createdAt);
        return dateB - dateA;
      });
    } catch (error) {
      console.error('Erro ao buscar chamados por status:', error);
      throw error;
    }
  },

  // Buscar chamados por usuário (criados pelo usuário)
  async getTicketsByUser(userId) {
    try {
      if (!userId || typeof userId !== 'string') {
        console.warn('getTicketsByUser: userId inválido:', userId);
        return [];
      }

      const q = query(
        collection(db, 'chamados'), 
        where('criadoPor', '==', userId)
      );
      const querySnapshot = await getDocs(q);
      
      const tickets = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      // Ordenar por data de criação (mais recente primeiro)
      return tickets.sort((a, b) => {
        const dateA = a.createdAt?.toDate?.() || new Date(a.createdAt);
        const dateB = b.createdAt?.toDate?.() || new Date(b.createdAt);
        return dateB - dateA;
      });
    } catch (error) {
      console.error('Erro ao buscar chamados por usuário:', error);
      throw error;
    }
  },

  // Atualizar status do chamado
  async updateTicketStatus(ticketId, newStatus, userId, comment, ticket) {
    try {
      if (!ticketId || !newStatus || !userId) {
        throw new Error('Parâmetros obrigatórios não fornecidos');
      }

      // Obter status anterior
      const oldStatus = ticket?.status || 'desconhecido';

      const docRef = doc(db, 'chamados', ticketId);
      const updateData = {
        status: newStatus,
        updatedAt: new Date(),
        updatedBy: userId
      };

      // NOVO: Adicionar entrada ao histórico de status
      const historicoEntry = {
        statusAnterior: oldStatus,
        novoStatus: newStatus,
        data: new Date(),
        responsavel: userId,
        comentario: comment || null
      };

      // Se já existe histórico, adicionar nova entrada; senão, criar array
      if (ticket?.historicoStatus) {
        updateData.historicoStatus = [...ticket.historicoStatus, historicoEntry];
      } else {
        updateData.historicoStatus = [historicoEntry];
      }

      // Adicionar timestamps específicos baseados no status
      if (newStatus === TICKET_STATUS.EXECUTED_AWAITING_VALIDATION) {
        updateData.executadoEm = new Date();
        if (ticket && ticket.createdAt) {
          // Certifique-se de que ticket.createdAt é um objeto Timestamp antes de usar toDate()
          const createdAtDate = ticket.createdAt?.toDate ? ticket.createdAt.toDate() : new Date(ticket.createdAt);
          updateData.slaOperacao = this.calculateSLA(createdAtDate, new Date());
        }
      } else if (newStatus === TICKET_STATUS.COMPLETED) {
        updateData.validadoEm = new Date();
        if (ticket && ticket.executadoEm) {
          const executadoEmDate = ticket.executadoEm?.toDate ? ticket.executadoEm.toDate() : new Date(ticket.executadoEm);
          updateData.slaValidacao = this.calculateSLA(executadoEmDate, new Date());
        }
      }

      await updateDoc(docRef, updateData);

      // Adicionar mensagem ao chat do chamado sobre a atualização de status
      if (comment) {
        // Importar messageService dinamicamente para evitar dependência circular
        const { messageService } = await import('./messageService');
        await messageService.sendMessage(ticketId, {
          texto: `Status atualizado para: ${newStatus.replace(/_/g, ' ').toUpperCase()}. Comentário: ${comment}`,
          autorId: userId,
          autorNome: 'Sistema'
        });
      }

      // Enviar notificações (não bloquear se falhar)
      try {
        // Importar serviços dinamicamente para evitar dependência circular
        const { userService } = await import('./userService');
        const { projectService } = await import('./projectService');
        const { unifiedNotificationService } = await import('./unifiedNotificationService');
        
        // Buscar nome do projeto
        let projectName = 'Projeto não identificado';
        if (ticket?.projetoId) {
          const project = await projectService.getProjectById(ticket.projetoId);
          if (project) {
            projectName = project.nome;
          }
        }
        
        // Enviar notificações via sistema unificado (SendGrid)
        const ticketWithId = { ...ticket, id: ticketId, status: newStatus };
        
        // Determinar tipo de evento baseado no status
        if (newStatus === 'concluido') {
          await unifiedNotificationService.notifyTicketCompleted(ticketWithId);
        } else {
          await unifiedNotificationService.notifyTicketUpdated(ticketWithId);
        }
        console.log('✅ Notificações de atualização SendGrid enviadas com sucesso');
        
      } catch (notificationError) {
        console.error('❌ Erro ao enviar notificações (não crítico):', notificationError);
        // Não falhar a atualização do chamado por causa das notificações
      }

      return true;
    } catch (error) {
      console.error('Erro ao atualizar status do chamado:', error);
      throw error;
    }
  },

  // Atualizar chamado
  // Atualizar chamado com lógica de roteamento
  async updateTicket(ticketId, ticketData) {
    try {
      const docRef = doc(db, 'chamados', ticketId);
      
      // Buscar dados atuais do chamado
      const currentTicket = await this.getTicketById(ticketId);
      if (!currentTicket) {
        throw new Error('Chamado não encontrado');
      }
      
      // NOVO: Se o status está sendo alterado, adicionar ao histórico
      if (ticketData.status && ticketData.status !== currentTicket.status) {
        const historicoEntry = {
          statusAnterior: currentTicket.status,
          novoStatus: ticketData.status,
          data: new Date(),
          responsavel: ticketData.updatedBy || 'sistema',
          comentario: ticketData.comentario || null
        };

        // Adicionar ao histórico existente ou criar novo
        if (currentTicket.historicoStatus) {
          ticketData.historicoStatus = [...currentTicket.historicoStatus, historicoEntry];
        } else {
          ticketData.historicoStatus = [historicoEntry];
        }
      }
      
      // Aplicar lógica de roteamento baseada no novo status
      const updatedData = await this.applyRoutingLogic(currentTicket, ticketData);
      
      // Filtrar campos undefined para evitar erro no Firebase
      const filteredData = Object.fromEntries(
        Object.entries(updatedData).filter(([_, value]) => value !== undefined)
      );
      
      await updateDoc(docRef, {
        ...filteredData,
        updatedAt: new Date()
      });
      
      // Enviar notificações se necessário
      await this.sendStatusUpdateNotifications(ticketId, currentTicket, updatedData);
      
      return true;
    } catch (error) {
      console.error('Erro ao atualizar chamado:', error);
      throw error;
    }
  },

  // Aplicar lógica de roteamento baseada no status e ação
  async applyRoutingLogic(currentTicket, updateData) {
    const { AREAS } = await import('./userService');
    const newStatus = updateData.status;
    const userRole = updateData.atualizadoPorFuncao || updateData.userRole;
    
    let routingData = { ...updateData };
    
    // Lógica para CONSULTOR (apenas validação final)
    if (userRole === USER_ROLES.CONSULTOR) {
      // Consultor só pode validar chamados que ele mesmo abriu
      if (currentTicket.criadoPorFuncao === 'consultor' && 
          currentTicket.status === TICKET_STATUS.EXECUTED_AWAITING_VALIDATION &&
          newStatus === TICKET_STATUS.COMPLETED) {
        routingData.responsavelAtual = null;
        routingData.validadoEm = new Date().toISOString();
        routingData.validadoPor = 'consultor';
      }
    }
    
    // Lógica para PRODUTOR
    else if (userRole === USER_ROLES.PRODUTOR) {
      switch (newStatus) {
        case TICKET_STATUS.SENT_TO_AREA:
          // Enviar para área específica (operador da área)
          routingData.area = updateData.areaDestino || currentTicket.areaOriginal || currentTicket.area;
          routingData.responsavelAtual = USER_ROLES.OPERADOR;
          routingData.enviadoParaArea = true;
          break;
          
        case TICKET_STATUS.IN_EXECUTION:
          // Produtor executando no pavilhão - mantém na produção
          routingData.area = AREAS.PRODUCTION;
          routingData.responsavelAtual = USER_ROLES.PRODUTOR;
          routingData.executandoNoPavilhao = true;
          break;
          
        case TICKET_STATUS.EXECUTED_AWAITING_VALIDATION:
          // Produtor executou, agora aguarda validação do consultor (se foi aberto por consultor) ou auto-valida
          if (currentTicket.criadoPorFuncao === 'consultor') {
            // Volta para consultor E produtor validarem
            routingData.responsavelAtual = 'consultor_produtor';
            routingData.aguardandoValidacao = true;
          } else {
            // Chamado do produtor, ele mesmo valida
            routingData.status = TICKET_STATUS.COMPLETED;
            routingData.responsavelAtual = null;
            routingData.validadoEm = new Date().toISOString();
            routingData.validadoPor = 'produtor';
          }
          break;
          
        case TICKET_STATUS.COMPLETED:
          // Produtor validando chamado que estava aguardando validação
          if (currentTicket.status === TICKET_STATUS.EXECUTED_AWAITING_VALIDATION) {
            routingData.responsavelAtual = null;
            routingData.validadoEm = new Date().toISOString();
            routingData.validadoPor = 'produtor';
          }
          break;
      }
    }
    
    // Lógica para OPERADOR (área específica)
    else if (userRole === USER_ROLES.OPERADOR) {
      switch (newStatus) {
        case TICKET_STATUS.IN_TREATMENT:
          // Operador iniciou tratativa
          routingData.responsavelAtual = USER_ROLES.OPERADOR;
          routingData.inicioTratativa = new Date().toISOString();
          break;
          
        case TICKET_STATUS.EXECUTED_AWAITING_VALIDATION:
          // Área executou, volta para quem criou o chamado
          if (currentTicket.criadoPorFuncao === 'consultor') {
            // Chamado do consultor: volta para consultor E produtor
            routingData.area = AREAS.PRODUCTION;
            routingData.responsavelAtual = 'consultor_produtor';
          } else if (currentTicket.criadoPorFuncao === 'produtor') {
            // Chamado do produtor: volta apenas para produtor
            routingData.area = AREAS.PRODUCTION;
            routingData.responsavelAtual = USER_ROLES.PRODUTOR;
          } else if (currentTicket.criadoPorFuncao === 'operador') {
            // Chamado do operador: volta para o operador que criou
            routingData.area = currentTicket.areaOriginal || currentTicket.area;
            routingData.responsavelAtual = USER_ROLES.OPERADOR;
          }
          routingData.aguardandoValidacao = true;
          routingData.executadoEm = new Date().toISOString();
          break;
          
        case TICKET_STATUS.ESCALATED_TO_OTHER_AREA:
          // Escalado para outra área
          routingData.area = updateData.areaDestino;
          routingData.responsavelAtual = USER_ROLES.OPERADOR;
          routingData.escalonamentos = currentTicket.escalonamentos || [];
          routingData.escalonamentos.push({
            de: currentTicket.area,
            para: updateData.areaDestino,
            motivo: updateData.motivoEscalonamento,
            data: new Date().toISOString(),
            usuario: updateData.atualizadoPor
          });
          break;
          
        case TICKET_STATUS.AWAITING_APPROVAL:
          // Escalado para gerência
          console.log('DEBUG-Escalação: Chamado escalado com o status:', TICKET_STATUS.AWAITING_APPROVAL);
          routingData.responsavelAtual = USER_ROLES.GERENTE;
          // Usar areaGerencia em vez de gerenteDestino
          if (updateData.areaGerencia) {
            routingData.gerenteDestino = updateData.areaGerencia;
          }
          routingData.escalonamentos = currentTicket.escalonamentos || [];
          routingData.escalonamentos.push({
            de: currentTicket.area,
            para: 'gerencia',
            gerente: updateData.areaGerencia || updateData.gerenteDestino,
            motivo: updateData.escalationReason || updateData.motivoEscalonamento,
            data: new Date().toISOString(),
            usuario: updateData.escaladoPor || updateData.atualizadoPor
          });
          break;
      }
    }
    
    // Lógica para GERENTE
    else if (userRole === USER_ROLES.GERENTE) {
      switch (newStatus) {
        case TICKET_STATUS.APPROVED:
          // Aprovado, volta para área original
          routingData.area = currentTicket.areaOriginal || currentTicket.area;
          routingData.responsavelAtual = USER_ROLES.OPERADOR;
          routingData.aprovadoEm = new Date().toISOString();
          break;
          
        case TICKET_STATUS.REJECTED:
          // Rejeitado, encerra chamado
          routingData.responsavelAtual = null;
          routingData.rejeitadoEm = new Date().toISOString();
          routingData.status = TICKET_STATUS.CANCELLED;
          break;
      }
    }
    
    return routingData;
  },

  // Enviar notificações de atualização de status
  async sendStatusUpdateNotifications(ticketId, oldTicket, newData) {
    try {
      const { notificationService } = await import('./notificationService');
      
      // Determinar quem deve receber a notificação baseado no novo responsável
      let targetRole = newData.responsavelAtual;
      let targetArea = newData.area;
      
      if (targetRole && targetArea) {
        await notificationService.createNotification({
          tipo: 'status_update',
          titulo: `Chamado #${ticketId.slice(-8)} atualizado`,
          mensagem: `Status alterado para: ${this.getStatusText(newData.status)}`,
          ticketId,
          targetRole,
          targetArea,
          criadoEm: new Date().toISOString()
        });
      }
    } catch (error) {
      console.warn('Erro ao enviar notificações:', error);
    }
  },

  // Obter texto do status
  getStatusText(status) {
    const statusTexts = {
      [TICKET_STATUS.OPEN]: 'Aberto',
      [TICKET_STATUS.IN_ANALYSIS]: 'Em Análise',
      [TICKET_STATUS.SENT_TO_AREA]: 'Enviado para Área',
      [TICKET_STATUS.IN_EXECUTION]: 'Em Execução',
      [TICKET_STATUS.AWAITING_APPROVAL]: 'Aguardando Aprovação',
      [TICKET_STATUS.APPROVED]: 'Aprovado',
      [TICKET_STATUS.REJECTED]: 'Rejeitado',
      [TICKET_STATUS.EXECUTED_AWAITING_VALIDATION]: 'Executado - Aguardando Validação',
      [TICKET_STATUS.COMPLETED]: 'Concluído',
      [TICKET_STATUS.CANCELLED]: 'Cancelado'
    };
    return statusTexts[status] || 'Status Desconhecido';
  },

  // Escalar chamado para outra área
  async escalateTicket(ticketId, targetArea, userId, comment, ticket) {
    try {
      if (!ticketId || !targetArea || !userId) {
        throw new Error('Parâmetros obrigatórios não fornecidos para escalação');
      }

      const docRef = doc(db, 'chamados', ticketId);
      
      // Criar histórico de escalação
      const escalationHistory = ticket.escalationHistory || [];
      const newEscalation = {
        fromArea: ticket.area,
        toArea: targetArea,
        escalatedBy: userId,
        escalatedAt: new Date(),
        comment: comment || '',
        status: 'escalated'
      };
      
      const updateData = {
        status: TICKET_STATUS.ESCALATED,
        area: targetArea, // Nova área responsável
        escaladoPara: targetArea,
        escaladoPor: userId,
        escaladoEm: new Date(),
        escalationHistory: [...escalationHistory, newEscalation],
        updatedAt: new Date(),
        updatedBy: userId
      };

      await updateDoc(docRef, updateData);

      // Adicionar mensagem ao chat sobre a escalação
      if (comment) {
        const { messageService } = await import('./messageService');
        await messageService.sendMessage(ticketId, {
          texto: `🔄 Chamado escalado de ${ticket.area.replace(/_/g, ' ').toUpperCase()} para ${targetArea.replace(/_/g, ' ').toUpperCase()}.\n\nMotivo: ${comment}`,
          autorId: userId,
          autorNome: 'Sistema de Escalação'
        });
      }

      // Enviar notificação por e-mail (não bloquear se falhar)
      try {
        const { userService } = await import('./userService');
        const { projectService } = await import('./projectService');
        
        // Buscar nome do projeto
        let projectName = 'Projeto não identificado';
        if (ticket?.projetoId) {
          const project = await projectService.getProjectById(ticket.projetoId);
          if (project) {
            projectName = project.nome;
          }
        }
        
        // Obter e-mails da nova área responsável
        const areaEmails = await emailService.getEmailsByArea(targetArea, userService);
        const adminEmails = await emailService.getAdminEmails(userService);
        const allEmails = [...new Set([...areaEmails, ...adminEmails])];
        
        if (allEmails.length > 0) {
          // Usar sistema unificado de notificações (SendGrid)
          const { unifiedNotificationService } = await import('./unifiedNotificationService');
          const updatedTicket = { 
            ...ticket, 
            area: targetArea, 
            escaladoPara: targetArea,
            status: TICKET_STATUS.ESCALATED 
          };
          
          await unifiedNotificationService.notifyTicketEscalated(updatedTicket);
          console.log('✅ Notificação de escalação SendGrid enviada com sucesso');
        }
      } catch (emailError) {
        console.error('❌ Erro ao enviar notificação de escalação (não crítico):', emailError);
      }

      return true;
    } catch (error) {
      console.error('Erro ao escalar chamado:', error);
      throw error;
    }
  },

  // Deletar chamado
  async deleteTicket(ticketId) {
    try {
      const docRef = doc(db, 'chamados', ticketId);
      await deleteDoc(docRef);
      return true;
    } catch (error) {
      console.error('Erro ao deletar chamado:', error);
      throw error;
    }
  },

  // Calcular SLA em horas
  calculateSLA(startDate, endDate) {
    const start = startDate?.toDate?.() || new Date(startDate);
    const end = endDate?.toDate?.() || new Date(endDate);
    const diffInMs = end - start;
    return Math.round(diffInMs / (1000 * 60 * 60)); // Converter para horas
  },

  // Listener em tempo real para chamados
  onTicketsSnapshot(callback, filters = {}) {
    try {
      let q = collection(db, 'chamados');
      
      if (filters.projectId) {
        q = query(q, where('projetoId', '==', filters.projectId));
      }
      if (filters.area) {
        q = query(q, where('area', '==', filters.area));
      }
      if (filters.status) {
        q = query(q, where('status', '==', filters.status));
      }
      
      return onSnapshot(q, (querySnapshot) => {
        const tickets = querySnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));

        // Ordenar por data de criação (mais recente primeiro)
        const sortedTickets = tickets.sort((a, b) => {
          const dateA = a.createdAt?.toDate?.() || new Date(a.createdAt);
          const dateB = b.createdAt?.toDate?.() || new Date(b.createdAt);
          return dateB - dateA;
        });

        callback(sortedTickets);
      });
    } catch (error) {
      console.error('Erro ao configurar listener de chamados:', error);
      throw error;
    }
  },

  // NOVO: Função específica para escalação com arrayUnion
  async escalateTicketToArea(ticketId, newArea, updateData = {}) {
    try {
      console.log('DEBUG-Escalação: Escalando chamado', ticketId, 'para área:', newArea);
      console.log('DEBUG-Escalação: Dados de entrada:', updateData);
      
      const docRef = doc(db, 'chamados', ticketId);
      
      // Buscar dados atuais do chamado para logs
      const currentDoc = await getDoc(docRef);
      if (currentDoc.exists()) {
        const currentData = currentDoc.data();
        console.log('DEBUG-Escalação: Dados antes da atualização:', {
          id: ticketId,
          areaAtual: currentData.area,
          areasEnvolvidasAntes: currentData.areasEnvolvidas || [],
          status: currentData.status
        });
      }
      
      // Dados de atualização com arrayUnion para areasEnvolvidas
      const escalationData = {
        ...updateData,
        area: newArea, // Atualizar área atual
        areasEnvolvidas: arrayUnion(newArea), // Adicionar nova área ao histórico
        updatedAt: new Date()
      };
      
      console.log('DEBUG-Escalação: Dados de atualização completos:', escalationData);
      console.log('DEBUG-Escalação: Nova área será adicionada a areasEnvolvidas:', newArea);
      
      await updateDoc(docRef, escalationData);
      
      console.log('DEBUG-Escalação: Chamado escalado com sucesso');
      
      // Verificar dados após atualização
      const updatedDoc = await getDoc(docRef);
      if (updatedDoc.exists()) {
        const updatedData = updatedDoc.data();
        console.log('DEBUG-Escalação: Dados após atualização:', {
          id: ticketId,
          areaAtual: updatedData.area,
          areasEnvolvidasDepois: updatedData.areasEnvolvidas || [],
          status: updatedData.status
        });
      }
      
    } catch (error) {
      console.error('Erro ao escalar chamado:', error);
      throw error;
    }
  },

  // NOVO: Função para buscar chamados por área envolvida (array-contains)
  async getTicketsByAreaInvolved(area) {
    try {
      console.log('DEBUG: Iniciando consulta com índice...');
      console.log('DEBUG-TicketService: Buscando chamados para área:', area);
      
      const ticketsRef = collection(db, 'chamados');
      
      // CORREÇÃO: Usar createdAt para corresponder ao índice composto existente
      // Índice: areasEnvolvidas (array) + createdAt (desc)
      const q = query(
        ticketsRef,
        where('areasEnvolvidas', 'array-contains', area),
        orderBy('createdAt', 'desc')
      );
      
      console.log('DEBUG: Executando consulta com índice composto (areasEnvolvidas + createdAt)...');
      const querySnapshot = await getDocs(q);
      console.log('DEBUG: Consulta executada. Documentos encontrados:', querySnapshot.size);
      
      const tickets = querySnapshot.docs.map(doc => {
        const data = doc.data();
        console.log('DEBUG: Documento mapeado:', {
          id: doc.id,
          area: data.area,
          areasEnvolvidas: data.areasEnvolvidas,
          createdAt: data.createdAt,
          updatedAt: data.updatedAt,
          titulo: data.titulo,
          status: data.status
        });
        return {
          id: doc.id,
          ...data
        };
      });
      
      console.log('DEBUG: Chamados mapeados:', tickets.length, 'total');
      console.log('DEBUG-TicketService: Encontrados', tickets.length, 'chamados para área', area);
      
      // Verificar estrutura dos dados para debug
      if (tickets.length > 0) {
        console.log('DEBUG-TicketService: Exemplo de chamado:', {
          id: tickets[0].id,
          titulo: tickets[0].titulo,
          area: tickets[0].area,
          areasEnvolvidas: tickets[0].areasEnvolvidas,
          createdAt: tickets[0].createdAt,
          updatedAt: tickets[0].updatedAt,
          status: tickets[0].status
        });
        
        // Validar se todos os chamados têm o campo areasEnvolvidas
        const chamadosSemAreasEnvolvidas = tickets.filter(t => !t.areasEnvolvidas || !Array.isArray(t.areasEnvolvidas));
        if (chamadosSemAreasEnvolvidas.length > 0) {
          console.warn('DEBUG-TicketService: Encontrados', chamadosSemAreasEnvolvidas.length, 'chamados sem campo areasEnvolvidas válido');
        }
        
        // Verificar se a área está presente em areasEnvolvidas
        const chamadosComAreaCorreta = tickets.filter(t => t.areasEnvolvidas && t.areasEnvolvidas.includes(area));
        console.log('DEBUG-TicketService: Chamados com área', area, 'em areasEnvolvidas:', chamadosComAreaCorreta.length);
      } else {
        console.log('DEBUG-TicketService: Nenhum chamado encontrado para área:', area);
      }
      
      return tickets;
      
    } catch (error) {
      console.error('Erro ao buscar chamados por área envolvida:', error);
      console.error('DEBUG: Stack trace completo:', error.stack);
      
      // Fallback: se der erro (ex: campo não existe ainda), buscar por área atual
      console.log('DEBUG-TicketService: Usando fallback - busca por área atual');
      
      try {
        const ticketsRef = collection(db, 'chamados');
        const q = query(
          ticketsRef,
          where('area', '==', area),
          orderBy('createdAt', 'desc')
        );
        
        const querySnapshot = await getDocs(q);
        const tickets = querySnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        
        console.log('DEBUG-TicketService: Fallback encontrou', tickets.length, 'chamados');
        
        return tickets;
      } catch (fallbackError) {
        console.error('DEBUG-TicketService: Erro no fallback também:', fallbackError);
        return [];
      }
    }
  }
};

