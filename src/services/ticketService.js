// src/services/ticketService.js
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
  arrayUnion
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { emailService } from './emailService';

// Status dos chamados
export const TICKET_STATUS = {
  OPEN: 'aberto',
  IN_ANALYSIS: 'em_analise',
  SENT_TO_AREA: 'enviado_para_area',
  IN_EXECUTION: 'em_execucao',
  IN_TREATMENT: 'em_tratativa',
  AWAITING_APPROVAL: 'aguardando_aprovacao',
  APPROVED: 'aprovado',
  REJECTED: 'rejeitado',
  EXECUTED_AWAITING_VALIDATION: 'executado_aguardando_validacao',
  ESCALATED_TO_OTHER_AREA: 'escalado_para_outra_area',
  COMPLETED: 'concluido',
  CANCELLED: 'cancelado',
};

// Perfis de usuário
export const USER_ROLES = {
  CONSULTOR: 'consultor',
  PRODUTOR: 'produtor',
  GERENTE: 'gerente',
  OPERADOR: 'operador',
  ADMINISTRADOR: 'administrador',
};

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
  OTHER: 'outro',
};

export const PRIORITIES = {
  LOW: 'baixa',
  MEDIUM: 'media',
  HIGH: 'alta',
  URGENT: 'urgente',
};

export const ticketService = {
  async createTicket(ticketData) {
    try {
      // Import dinâmico para evitar dependência circular
      const { AREAS } = await import('./userService');

      const finalTicketData = {
        ...ticketData,
        status: TICKET_STATUS.OPEN,
        createdAt: new Date(),
        updatedAt: new Date(),
        slaOperacao: null,
        slaValidacao: null,
        executadoEm: null,
        validadoEm: null,
        historicoStatus: [{
          statusAnterior: null,
          novoStatus: TICKET_STATUS.OPEN,
          data: new Date(),
          responsavel: ticketData.criadoPor,
          comentario: 'Chamado criado',
        }],
        areaOriginal: ticketData.area,
        area: (() => {
          if (ticketData.criadoPorFuncao === 'consultor') return AREAS.PRODUCTION;
          if (ticketData.criadoPorFuncao === 'produtor' || ticketData.criadoPorFuncao === 'operador') return ticketData.area;
          return ticketData.area;
        })(),
        responsavelAtual: (() => {
          if (ticketData.criadoPorFuncao === 'consultor') return 'produtor';
          if (ticketData.criadoPorFuncao === 'produtor') return 'operador';
          if (ticketData.criadoPorFuncao === 'operador') return 'operador';
          return 'operador';
        })(),
      };

      const docRef = await addDoc(collection(db, 'chamados'), finalTicketData);
      const ticketId = docRef.id;

      // Notificações (não bloqueantes)
      try {
        const { projectService } = await import('./projectService');
        const { unifiedNotificationService } = await import('./unifiedNotificationService');
        let projectName = 'Projeto não identificado';
        if (ticketData.projetoId) {
          const project = await projectService.getProjectById(ticketData.projetoId).catch(() => null);
          if (project) projectName = project.nome;
        }
        const ticketWithId = { ...ticketData, id: ticketId, projetoNome: projectName };
        await unifiedNotificationService.notifyTicketCreated(ticketWithId);
      } catch (e) {
        console.warn('NotifyTicketCreated falhou (não crítico):', e);
      }

      return ticketId;
    } catch (error) {
      console.error('Erro ao criar chamado:', error);
      throw error;
    }
  },

  async getTicketById(ticketId) {
    const ref = doc(db, 'chamados', ticketId);
    const snap = await getDoc(ref);
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
    },

  async getAllTickets() {
    const snap = await getDocs(collection(db, 'chamados'));
    const tickets = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    return tickets.sort((a, b) => {
      const aD = a.createdAt?.toDate?.() || new Date(a.createdAt);
      const bD = b.createdAt?.toDate?.() || new Date(b.createdAt);
      return bD - aD;
    });
  },

  async getTicketsByProject(projectId) {
    if (!projectId || typeof projectId !== 'string') return [];
    const q = query(collection(db, 'chamados'), where('projetoId', '==', projectId));
    const snap = await getDocs(q);
    const tickets = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    return tickets.sort((a, b) => {
      const aD = a.createdAt?.toDate?.() || new Date(a.createdAt);
      const bD = b.createdAt?.toDate?.() || new Date(b.createdAt);
      return bD - aD;
    });
  },

  async getTicketsByProjects(projectIds) {
    if (!Array.isArray(projectIds) || projectIds.length === 0) return [];
    const valid = projectIds.filter((id) => id && typeof id === 'string');
    if (valid.length === 0) return [];
    const all = [];
    const batchSize = 10;
    for (let i = 0; i < valid.length; i += batchSize) {
      const batch = valid.slice(i, i + batchSize);
      const q = query(collection(db, 'chamados'), where('projetoId', 'in', batch));
      const snap = await getDocs(q);
      all.push(...snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    }
    return all.sort((a, b) => {
      const aD = a.createdAt?.toDate?.() || new Date(a.createdAt);
      const bD = b.createdAt?.toDate?.() || new Date(b.createdAt);
      return bD - aD;
    });
  },

  async getTicketsByArea(area) {
    if (!area || typeof area !== 'string') return [];
    const queries = [
      query(collection(db, 'chamados'), where('area', '==', area)),
      query(collection(db, 'chamados'), where('areaGerencia', '==', `gerente_${area}`)),
    ];
    const [normal, management] = await Promise.all(queries.map((q) => getDocs(q)));
    const all = [
      ...normal.docs.map((d) => ({ id: d.id, ...d.data() })),
      ...management.docs.map((d) => ({ id: d.id, ...d.data() })),
    ];
    const unique = all.filter((t, idx, self) => idx === self.findIndex((x) => x.id === t.id));
    return unique.sort((a, b) => {
      const aD = a.createdAt?.toDate?.() || new Date(a.createdAt);
      const bD = b.createdAt?.toDate?.() || new Date(b.createdAt);
      return bD - aD;
    });
  },

  async getTicketsByStatus(status) {
    if (!status || typeof status !== 'string') return [];
    const q = query(collection(db, 'chamados'), where('status', '==', status));
    const snap = await getDocs(q);
    const tickets = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    return tickets.sort((a, b) => {
      const aD = a.createdAt?.toDate?.() || new Date(a.createdAt);
      const bD = b.createdAt?.toDate?.() || new Date(b.createdAt);
      return bD - aD;
    });
  },

  async getTicketsByUser(userId) {
    if (!userId || typeof userId !== 'string') return [];
    const q = query(collection(db, 'chamados'), where('criadoPor', '==', userId));
    const snap = await getDocs(q);
    const tickets = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    return tickets.sort((a, b) => {
      const aD = a.createdAt?.toDate?.() || new Date(a.createdAt);
      const bD = b.createdAt?.toDate?.() || new Date(b.createdAt);
      return bD - aD;
    });
  },

  async updateTicketStatus(ticketId, newStatus, userId, comment, ticket) {
    if (!ticketId || !newStatus || !userId) throw new Error('Parâmetros obrigatórios não fornecidos');
    const oldStatus = ticket?.status || 'desconhecido';
    const ref = doc(db, 'chamados', ticketId);
    const updateData = {
      status: newStatus,
      updatedAt: new Date(),
      updatedBy: userId,
    };

    const historicoEntry = {
      statusAnterior: oldStatus,
      novoStatus: newStatus,
      data: new Date(),
      responsavel: userId,
      comentario: comment || null,
    };
    updateData.historicoStatus = ticket?.historicoStatus ? [...ticket.historicoStatus, historicoEntry] : [historicoEntry];

    if (newStatus === TICKET_STATUS.EXECUTED_AWAITING_VALIDATION) {
      updateData.executadoEm = new Date();
      if (ticket?.createdAt) {
        const createdAtDate = ticket.createdAt?.toDate ? ticket.createdAt.toDate() : new Date(ticket.createdAt);
        updateData.slaOperacao = this.calculateSLA(createdAtDate, new Date());
      }
    } else if (newStatus === TICKET_STATUS.COMPLETED) {
      updateData.validadoEm = new Date();
      if (ticket?.executadoEm) {
        const execDate = ticket.executadoEm?.toDate ? ticket.executadoEm.toDate() : new Date(ticket.executadoEm);
        updateData.slaValidacao = this.calculateSLA(execDate, new Date());
      }
    }

    await updateDoc(ref, updateData);

    if (comment) {
      const { messageService } = await import('./messageService');
      await messageService.sendMessage(ticketId, {
        texto: `Status atualizado para: ${newStatus.replace(/_/g, ' ').toUpperCase()}. Comentário: ${comment}`,
        autorId: userId,
        autorNome: 'Sistema',
      });
    }

    try {
      const { projectService } = await import('./projectService');
      const { unifiedNotificationService } = await import('./unifiedNotificationService');
      let projectName = 'Projeto não identificado';
      if (ticket?.projetoId) {
        const project = await projectService.getProjectById(ticket.projetoId).catch(() => null);
        if (project) projectName = project.nome;
      }
      const ticketWithId = { ...ticket, id: ticketId, status: newStatus, projetoNome: projectName };
      if (newStatus === TICKET_STATUS.COMPLETED) {
        await unifiedNotificationService.notifyTicketCompleted(ticketWithId);
      } else {
        await unifiedNotificationService.notifyTicketUpdated(ticketWithId);
      }
    } catch (e) {
      console.warn('Notificação de atualização falhou (não crítico):', e);
    }

    return true;
  },

  async updateTicket(ticketId, ticketData) {
    const ref = doc(db, 'chamados', ticketId);
    const current = await this.getTicketById(ticketId);
    if (!current) throw new Error('Chamado não encontrado');

    if (ticketData.status && ticketData.status !== current.status) {
      const hist = {
        statusAnterior: current.status,
        novoStatus: ticketData.status,
        data: new Date(),
        responsavel: ticketData.updatedBy || 'sistema',
        comentario: ticketData.comentario || null,
      };
      ticketData.historicoStatus = current.historicoStatus ? [...current.historicoStatus, hist] : [hist];
    }

    const updatedData = await this.applyRoutingLogic(current, ticketData);
    const filtered = Object.fromEntries(Object.entries(updatedData).filter(([_, v]) => v !== undefined));

    await updateDoc(ref, { ...filtered, updatedAt: new Date() });
    await this.sendStatusUpdateNotifications(ticketId, current, updatedData);
    return true;
  },

  async applyRoutingLogic(currentTicket, updateData) {
    const { AREAS } = await import('./userService');
    const newStatus = updateData.status;
    const userRole = updateData.atualizadoPorFuncao || updateData.userRole;
    let routingData = { ...updateData };

    if (userRole === USER_ROLES.CONSULTOR) {
      if (
        currentTicket.criadoPorFuncao === 'consultor' &&
        currentTicket.status === TICKET_STATUS.EXECUTED_AWAITING_VALIDATION &&
        newStatus === TICKET_STATUS.COMPLETED
      ) {
        routingData.responsavelAtual = null;
        routingData.validadoEm = new Date().toISOString();
        routingData.validadoPor = 'consultor';
      }
    } else if (userRole === USER_ROLES.PRODUTOR) {
      switch (newStatus) {
        case TICKET_STATUS.SENT_TO_AREA:
          routingData.area = updateData.areaDestino || currentTicket.areaOriginal || currentTicket.area;
          routingData.responsavelAtual = USER_ROLES.OPERADOR;
          routingData.enviadoParaArea = true;
          break;
        case TICKET_STATUS.IN_EXECUTION:
          routingData.area = AREAS.PRODUCTION;
          routingData.responsavelAtual = USER_ROLES.PRODUTOR;
          routingData.executandoNoPavilhao = true;
          break;
        case TICKET_STATUS.EXECUTED_AWAITING_VALIDATION:
          if (currentTicket.criadoPorFuncao === 'consultor') {
            routingData.responsavelAtual = 'consultor_produtor';
            routingData.aguardandoValidacao = true;
          } else {
            routingData.status = TICKET_STATUS.COMPLETED;
            routingData.responsavelAtual = null;
            routingData.validadoEm = new Date().toISOString();
            routingData.validadoPor = 'produtor';
          }
          break;
        case TICKET_STATUS.COMPLETED:
          if (currentTicket.status === TICKET_STATUS.EXECUTED_AWAITING_VALIDATION) {
            routingData.responsavelAtual = null;
            routingData.validadoEm = new Date().toISOString();
            routingData.validadoPor = 'produtor';
          }
          break;
      }
    } else if (userRole === USER_ROLES.OPERADOR) {
      switch (newStatus) {
        case TICKET_STATUS.IN_TREATMENT:
          routingData.responsavelAtual = USER_ROLES.OPERADOR;
          routingData.inicioTratativa = new Date().toISOString();
          break;
        case TICKET_STATUS.EXECUTED_AWAITING_VALIDATION:
          if (currentTicket.criadoPorFuncao === 'consultor') {
            routingData.area = AREAS.PRODUCTION;
            routingData.responsavelAtual = 'consultor_produtor';
          } else if (currentTicket.criadoPorFuncao === 'produtor') {
            routingData.area = AREAS.PRODUCTION;
            routingData.responsavelAtual = USER_ROLES.PRODUTOR;
          } else if (currentTicket.criadoPorFuncao === 'operador') {
            routingData.area = currentTicket.areaOriginal || currentTicket.area;
            routingData.responsavelAtual = USER_ROLES.OPERADOR;
          }
          routingData.aguardandoValidacao = true;
          routingData.executadoEm = new Date().toISOString();
          break;
        case TICKET_STATUS.ESCALATED_TO_OTHER_AREA:
          routingData.area = updateData.areaDestino;
          routingData.responsavelAtual = USER_ROLES.OPERADOR;
          routingData.escalonamentos = currentTicket.escalonamentos || [];
          routingData.escalonamentos.push({
            de: currentTicket.area,
            para: updateData.areaDestino,
            motivo: updateData.motivoEscalonamento,
            data: new Date().toISOString(),
            usuario: updateData.atualizadoPor,
          });
          break;
        case TICKET_STATUS.AWAITING_APPROVAL:
          routingData.responsavelAtual = USER_ROLES.GERENTE;
          if (updateData.areaGerencia) routingData.gerenteDestino = updateData.areaGerencia;
          routingData.escalonamentos = currentTicket.escalonamentos || [];
          routingData.escalonamentos.push({
            de: currentTicket.area,
            para: 'gerencia',
            gerente: updateData.areaGerencia || updateData.gerenteDestino,
            motivo: updateData.escalationReason || updateData.motivoEscalonamento,
            data: new Date().toISOString(),
            usuario: updateData.escaladoPor || updateData.atualizadoPor,
          });
          break;
      }
    } else if (userRole === USER_ROLES.GERENTE) {
      switch (newStatus) {
        case TICKET_STATUS.APPROVED:
          routingData.area = currentTicket.areaOriginal || currentTicket.area;
          routingData.responsavelAtual = USER_ROLES.OPERADOR;
          routingData.aprovadoEm = new Date().toISOString();
          break;
        case TICKET_STATUS.REJECTED:
          routingData.responsavelAtual = null;
          routingData.rejeitadoEm = new Date().toISOString();
          routingData.status = TICKET_STATUS.CANCELLED;
          break;
      }
    }
    return routingData;
  },

  async sendStatusUpdateNotifications(ticketId, oldTicket, newData) {
    try {
      const { notificationService } = await import('./notificationService');
      const targetRole = newData.responsavelAtual;
      const targetArea = newData.area;
      if (targetRole && targetArea) {
        await notificationService.createNotification({
          tipo: 'status_update',
          titulo: `Chamado #${ticketId.slice(-8)} atualizado`,
          mensagem: `Status alterado para: ${this.getStatusText(newData.status)}`,
          ticketId,
          targetRole,
          targetArea,
          criadoEm: new Date().toISOString(),
        });
      }
    } catch (e) {
      console.warn('Erro ao enviar notificação:', e);
    }
  },

  getStatusText(status) {
    const map = {
      [TICKET_STATUS.OPEN]: 'Aberto',
      [TICKET_STATUS.IN_ANALYSIS]: 'Em Análise',
      [TICKET_STATUS.SENT_TO_AREA]: 'Enviado para Área',
      [TICKET_STATUS.IN_EXECUTION]: 'Em Execução',
      [TICKET_STATUS.AWAITING_APPROVAL]: 'Aguardando Aprovação',
      [TICKET_STATUS.APPROVED]: 'Aprovado',
      [TICKET_STATUS.REJECTED]: 'Rejeitado',
      [TICKET_STATUS.EXECUTED_AWAITING_VALIDATION]: 'Executado - Aguardando Validação',
      [TICKET_STATUS.COMPLETED]: 'Concluído',
      [TICKET_STATUS.CANCELLED]: 'Cancelado',
      [TICKET_STATUS.IN_TREATMENT]: 'Em Tratativa',
      [TICKET_STATUS.ESCALATED_TO_OTHER_AREA]: 'Escalado para outra área',
    };
    return map[status] || 'Status Desconhecido';
  },

  async escalateTicket(ticketId, targetArea, userId, comment, ticket) {
    if (!ticketId || !targetArea || !userId) throw new Error('Parâmetros obrigatórios não fornecidos para escalação');
    const ref = doc(db, 'chamados', ticketId);
    const history = ticket.escalationHistory || [];
    const newEsc = {
      fromArea: ticket.area,
      toArea: targetArea,
      escalatedBy: userId,
      escalatedAt: new Date(),
      comment: comment || '',
      status: 'escalated',
    };

    const updateData = {
      status: TICKET_STATUS.ESCALATED_TO_OTHER_AREA, // CORREÇÃO
      area: targetArea,
      escaladoPara: targetArea,
      escaladoPor: userId,
      escaladoEm: new Date(),
      escalationHistory: [...history, newEsc],
      updatedAt: new Date(),
      updatedBy: userId,
    };

    await updateDoc(ref, updateData);

    if (comment) {
      const { messageService } = await import('./messageService');
      await messageService.sendMessage(ticketId, {
        texto: `🔄 Chamado escalado de ${ticket.area.replace(/_/g, ' ').toUpperCase()} para ${targetArea.replace(/_/g, ' ').toUpperCase()}.

Motivo: ${comment}`,
        autorId: userId,
        autorNome: 'Sistema de Escalação',
      });
    }

    try {
      const { userService } = await import('./userService');
      const { projectService } = await import('./projectService');
      const { unifiedNotificationService } = await import('./unifiedNotificationService');
      let projectName = 'Projeto não identificado';
      if (ticket?.projetoId) {
        const project = await projectService.getProjectById(ticket.projetoId).catch(() => null);
        if (project) projectName = project.nome;
      }
      const areaEmails = await emailService.getEmailsByArea(targetArea, userService);
      const adminEmails = await emailService.getAdminEmails(userService);
      const all = [...new Set([...(areaEmails || []), ...(adminEmails || [])])];
      if (all.length > 0) {
        const updatedTicket = { ...ticket, area: targetArea, escaladoPara: targetArea, status: TICKET_STATUS.ESCALATED_TO_OTHER_AREA, projetoNome: projectName };
        await unifiedNotificationService.notifyTicketEscalated(updatedTicket);
      }
    } catch (e) {
      console.warn('Notificação de escalação falhou (não crítico):', e);
    }

    return true;
  },

  async deleteTicket(ticketId) {
    const ref = doc(db, 'chamados', ticketId);
    await deleteDoc(ref);
    return true;
  },

  calculateSLA(startDate, endDate) {
    const s = startDate?.toDate?.() || new Date(startDate);
    const e = endDate?.toDate?.() || new Date(endDate);
    return Math.round((e - s) / (1000 * 60 * 60));
  },

  onTicketsSnapshot(callback, filters = {}) {
    let q = collection(db, 'chamados');
    if (filters.projectId) q = query(q, where('projetoId', '==', filters.projectId));
    if (filters.area) q = query(q, where('area', '==', filters.area));
    if (filters.status) q = query(q, where('status', '==', filters.status));

    return onSnapshot(q, (snap) => {
      const tickets = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      const sorted = tickets.sort((a, b) => {
        const aD = a.createdAt?.toDate?.() || new Date(a.createdAt);
        const bD = b.createdAt?.toDate?.() || new Date(b.createdAt);
        return bD - aD;
      });
      callback(sorted);
    });
  },

  async escalateTicketToArea(ticketId, newArea, updateData = {}) {
    const ref = doc(db, 'chamados', ticketId);
    const currentDoc = await getDoc(ref);
    if (currentDoc.exists()) {
      const currentData = currentDoc.data();
      console.log('Escalação: antes', { id: ticketId, areaAtual: currentData.area, areasEnvolvidasAntes: currentData.areasEnvolvidas || [], status: currentData.status });
    }

    const escalationData = {
      ...updateData,
      area: newArea,
      areasEnvolvidas: arrayUnion(newArea),
      updatedAt: new Date(),
    };

    await updateDoc(ref, escalationData);

    const updatedDoc = await getDoc(ref);
    if (updatedDoc.exists()) {
      const data = updatedDoc.data();
      console.log('Escalação: depois', { id: ticketId, areaAtual: data.area, areasEnvolvidasDepois: data.areasEnvolvidas || [], status: data.status });
    }
  },

  async getTicketsByAreaInvolved(area) {
    try {
      const ticketsRef = collection(db, 'chamados');
      const q = query(ticketsRef, where('areasEnvolvidas', 'array-contains', area), orderBy('createdAt', 'desc'));
      const snap = await getDocs(q);
      const tickets = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      return tickets;
    } catch (e) {
      // Fallback por compatibilidade de índice
      const ticketsRef = collection(db, 'chamados');
      const q = query(ticketsRef, where('area', '==', area), orderBy('createdAt', 'desc'));
      const snap = await getDocs(q);
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    }
  },
};
