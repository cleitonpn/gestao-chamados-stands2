import { collection, onSnapshot, query, orderBy, limit } from 'firebase/firestore';
import { db } from '../config/firebase';
import { notificationService } from './notificationService';

class RealtimeNotificationService {
  constructor() {
    this.listeners = new Map();
    this.isInitialized = false;
    this.lastTicketCount = 0;
    this.audioContext = null;
    this.notificationSound = null;
    this.userRole = null;
    this.userArea = null;
    this.userId = null;
  }

  // Inicializar serviço com dados do usuário
  initialize(userId, userRole, userArea) {
    this.userId = userId;
    this.userRole = userRole;
    this.userArea = userArea;
    this.isInitialized = true;
    
    console.log('🔔 Serviço de notificações em tempo real inicializado:', {
      userId,
      userRole,
      userArea
    });

    // Inicializar áudio para notificações
    this.initializeAudio();
    
    // Iniciar monitoramento de novos chamados
    this.startTicketMonitoring();
    
    // Limpar notificações antigas
    notificationService.clearOldNotifications(7); // 7 dias
  }

  // Inicializar áudio para notificações sonoras
  initializeAudio() {
    try {
      // Criar contexto de áudio
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      
      // Criar som de notificação simples
      this.createNotificationSound();
      
      console.log('🔊 Sistema de áudio inicializado');
    } catch (error) {
      console.warn('⚠️ Não foi possível inicializar áudio:', error);
    }
  }

  // Criar som de notificação
  createNotificationSound() {
    if (!this.audioContext) return;

    try {
      // Criar um som de notificação simples usando Web Audio API
      this.notificationSound = () => {
        const oscillator = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(this.audioContext.destination);
        
        oscillator.frequency.setValueAtTime(800, this.audioContext.currentTime);
        oscillator.frequency.setValueAtTime(600, this.audioContext.currentTime + 0.1);
        
        gainNode.gain.setValueAtTime(0.3, this.audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.3);
        
        oscillator.start(this.audioContext.currentTime);
        oscillator.stop(this.audioContext.currentTime + 0.3);
      };
    } catch (error) {
      console.warn('⚠️ Não foi possível criar som de notificação:', error);
    }
  }

  // Tocar som de notificação
  playNotificationSound() {
    try {
      if (this.audioContext && this.notificationSound) {
        // Verificar se o contexto de áudio está suspenso (política do navegador)
        if (this.audioContext.state === 'suspended') {
          this.audioContext.resume().then(() => {
            this.notificationSound();
          });
        } else {
          this.notificationSound();
        }
      }
    } catch (error) {
      console.warn('⚠️ Não foi possível tocar som de notificação:', error);
    }
  }

  // Iniciar monitoramento de novos chamados
  startTicketMonitoring() {
    if (!this.isInitialized) {
      console.warn('⚠️ Serviço não inicializado');
      return;
    }

    try {
      // Query para monitorar chamados ordenados por data de criação
      const ticketsQuery = query(
        collection(db, 'chamados'),
        orderBy('createdAt', 'desc'),
        limit(50)
      );

      // Listener para mudanças na coleção de chamados
      const unsubscribe = onSnapshot(ticketsQuery, (snapshot) => {
        this.handleTicketsSnapshot(snapshot);
      }, (error) => {
        console.error('❌ Erro no listener de chamados:', error);
      });

      this.listeners.set('tickets', unsubscribe);
      console.log('👂 Monitoramento de chamados iniciado');

    } catch (error) {
      console.error('❌ Erro ao iniciar monitoramento:', error);
    }
  }

  // Processar snapshot de chamados
  handleTicketsSnapshot(snapshot) {
    try {
      const tickets = [];
      const changes = [];

      snapshot.docChanges().forEach((change) => {
        const ticketData = {
          id: change.doc.id,
          ...change.doc.data()
        };

        if (change.type === 'added') {
          changes.push({ type: 'added', ticket: ticketData });
        } else if (change.type === 'modified') {
          changes.push({ type: 'modified', ticket: ticketData });
        }

        tickets.push(ticketData);
      });

      // Processar mudanças
      changes.forEach(change => {
        if (change.type === 'added') {
          this.handleNewTicket(change.ticket);
        } else if (change.type === 'modified') {
          this.handleTicketUpdate(change.ticket);
        }
      });

      // Atualizar contagem total
      this.lastTicketCount = tickets.length;

    } catch (error) {
      console.error('❌ Erro ao processar snapshot:', error);
    }
  }

  // Processar novo chamado
  handleNewTicket(ticket) {
    try {
      // Verificar se o chamado é relevante para o usuário
      if (!this.isTicketRelevantForUser(ticket)) {
        return;
      }

      console.log('🆕 Novo chamado detectado:', ticket.titulo);

      // Criar notificação in-app
      const notification = {
        type: 'new_ticket',
        title: `🆕 Novo Chamado: ${ticket.titulo}`,
        message: `Área: ${this.formatArea(ticket.area)} | Prioridade: ${this.formatPriority(ticket.prioridade)}`,
        priority: ticket.prioridade,
        area: ticket.area,
        ticketId: ticket.id,
        createdBy: ticket.criadoPorNome || 'Sistema',
        icon: '🆕',
        color: this.getPriorityColor(ticket.prioridade),
        actionUrl: `/chamado/${ticket.id}`,
        userId: this.shouldNotifyUser(ticket) ? this.userId : null,
        role: this.shouldNotifyRole(ticket) ? this.userRole : null
      };

      notificationService.addInAppNotification(notification);

      // Tocar som de notificação
      this.playNotificationSound();

      // Mostrar notificação do navegador (se permitido)
      this.showBrowserNotification(notification);

      // Disparar evento customizado para atualizar UI
      window.dispatchEvent(new CustomEvent('newTicketNotification', { 
        detail: { ticket, notification } 
      }));

    } catch (error) {
      console.error('❌ Erro ao processar novo chamado:', error);
    }
  }

  // Processar atualização de chamado
  handleTicketUpdate(ticket) {
    try {
      // Verificar se a atualização é relevante
      if (!this.isTicketRelevantForUser(ticket)) {
        return;
      }

      console.log('📝 Chamado atualizado:', ticket.titulo);

      const statusInfo = this.getStatusInfo(ticket.status);
      
      const notification = {
        type: 'ticket_updated',
        title: `${statusInfo.emoji} Chamado Atualizado: ${ticket.titulo}`,
        message: `Status: ${statusInfo.text} | Área: ${this.formatArea(ticket.area)}`,
        priority: ticket.prioridade,
        area: ticket.area,
        ticketId: ticket.id,
        status: ticket.status,
        icon: statusInfo.emoji,
        color: statusInfo.color,
        actionUrl: `/chamado/${ticket.id}`,
        userId: this.shouldNotifyUser(ticket) ? this.userId : null,
        role: this.shouldNotifyRole(ticket) ? this.userRole : null
      };

      notificationService.addInAppNotification(notification);

      // Tocar som apenas para mudanças importantes
      if (this.isImportantStatusChange(ticket.status)) {
        this.playNotificationSound();
      }

      // Disparar evento customizado
      window.dispatchEvent(new CustomEvent('ticketUpdateNotification', { 
        detail: { ticket, notification } 
      }));

    } catch (error) {
      console.error('❌ Erro ao processar atualização:', error);
    }
  }

  // Verificar se o chamado é relevante para o usuário
  isTicketRelevantForUser(ticket) {
    // Administradores veem tudo
    if (this.userRole === 'administrador') {
      return true;
    }

    // Gerentes veem tudo
    if (this.userRole === 'gerente') {
      return true;
    }

    // Operadores veem chamados da sua área
    if (this.userRole === 'operador' && ticket.area === this.userArea) {
      return true;
    }

    // Produtores veem chamados relevantes
    if (this.userRole === 'produtor') {
      return true;
    }

    // Consultores veem seus próprios chamados
    if (this.userRole === 'consultor' && ticket.criadoPor === this.userId) {
      return true;
    }

    return false;
  }

  // Verificar se deve notificar o usuário específico
  shouldNotifyUser(ticket) {
    return ticket.criadoPor === this.userId || 
           ticket.responsavel === this.userId ||
           ticket.atribuidoPara === this.userId;
  }

  // Verificar se deve notificar o papel/função
  shouldNotifyRole(ticket) {
    if (this.userRole === 'operador' && ticket.area === this.userArea) {
      return true;
    }
    
    if (this.userRole === 'produtor') {
      return true;
    }

    return false;
  }

  // Verificar se é uma mudança de status importante
  isImportantStatusChange(status) {
    const importantStatuses = [
      'aprovado',
      'rejeitado', 
      'executado_aguardando_validacao',
      'concluido',
      'cancelado'
    ];
    return importantStatuses.includes(status);
  }

  // Mostrar notificação do navegador
  async showBrowserNotification(notification) {
    try {
      // Verificar se as notificações são suportadas
      if (!('Notification' in window)) {
        return;
      }

      // Solicitar permissão se necessário
      if (Notification.permission === 'default') {
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
          return;
        }
      }

      // Mostrar notificação se permitido
      if (Notification.permission === 'granted') {
        const browserNotification = new Notification(notification.title, {
          body: notification.message,
          icon: '/favicon.ico',
          badge: '/favicon.ico',
          tag: `ticket-${notification.ticketId}`,
          requireInteraction: false,
          silent: false
        });

        // Auto-fechar após 5 segundos
        setTimeout(() => {
          browserNotification.close();
        }, 5000);

        // Ação ao clicar
        browserNotification.onclick = () => {
          window.focus();
          if (notification.actionUrl) {
            window.location.href = notification.actionUrl;
          }
          browserNotification.close();
        };
      }
    } catch (error) {
      console.warn('⚠️ Não foi possível mostrar notificação do navegador:', error);
    }
  }

  // Formatar área
  formatArea(area) {
    const areaMap = {
      'producao': 'Produção',
      'logistica': 'Logística',
      'operacional': 'Operacional',
      'locacao': 'Locação',
      'comunicacao_visual': 'Comunicação Visual',
      'almoxarifado': 'Almoxarifado',
      'compras': 'Compras',
      'financeiro': 'Financeiro',
      'gerencia': 'Gerência'
    };
    return areaMap[area] || area;
  }

  // Formatar prioridade
  formatPriority(priority) {
    const priorityMap = {
      'urgente': 'Urgente',
      'alta': 'Alta',
      'media': 'Média',
      'baixa': 'Baixa'
    };
    return priorityMap[priority] || priority;
  }

  // Obter cor da prioridade
  getPriorityColor(priority) {
    const colorMap = {
      'urgente': '#dc2626',
      'alta': '#f59e0b',
      'media': '#2563eb',
      'baixa': '#059669'
    };
    return colorMap[priority] || '#6b7280';
  }

  // Obter informações de status
  getStatusInfo(status) {
    const statusMap = {
      'aberto': { text: 'Aberto', emoji: '🆕', color: '#2563eb' },
      'em_analise': { text: 'Em Análise', emoji: '🔍', color: '#f59e0b' },
      'aguardando_aprovacao': { text: 'Aguardando Aprovação', emoji: '⏳', color: '#f59e0b' },
      'aprovado': { text: 'Aprovado', emoji: '✅', color: '#059669' },
      'rejeitado': { text: 'Rejeitado', emoji: '❌', color: '#dc2626' },
      'em_execucao': { text: 'Em Execução', emoji: '🔧', color: '#2563eb' },
      'executado_aguardando_validacao': { text: 'Executado - Aguardando Validação', emoji: '✅', color: '#059669' },
      'concluido': { text: 'Concluído', emoji: '🎉', color: '#059669' },
      'cancelado': { text: 'Cancelado', emoji: '🚫', color: '#6b7280' }
    };
    return statusMap[status] || { text: status, emoji: '📋', color: '#6b7280' };
  }

  // Parar monitoramento
  stopMonitoring() {
    this.listeners.forEach((unsubscribe, key) => {
      unsubscribe();
      console.log(`🛑 Listener ${key} removido`);
    });
    this.listeners.clear();
    this.isInitialized = false;
    console.log('🛑 Monitoramento de notificações parado');
  }

  // Obter estatísticas de notificações
  getNotificationStats() {
    const notifications = notificationService.getInAppNotifications();
    const unreadCount = notificationService.getUnreadCount();
    
    return {
      total: notifications.length,
      unread: unreadCount,
      byType: this.groupNotificationsByType(notifications),
      byPriority: this.groupNotificationsByPriority(notifications),
      recent: notifications.slice(0, 5)
    };
  }

  // Agrupar notificações por tipo
  groupNotificationsByType(notifications) {
    return notifications.reduce((acc, notification) => {
      acc[notification.type] = (acc[notification.type] || 0) + 1;
      return acc;
    }, {});
  }

  // Agrupar notificações por prioridade
  groupNotificationsByPriority(notifications) {
    return notifications.reduce((acc, notification) => {
      const priority = notification.priority || 'media';
      acc[priority] = (acc[priority] || 0) + 1;
      return acc;
    }, {});
  }

  // Testar sistema de notificações
  async testNotificationSystem() {
    try {
      console.log('🧪 Testando sistema de notificações...');

      // Teste de notificação in-app
      const testNotification = {
        type: 'test',
        title: '🧪 Teste do Sistema de Notificações',
        message: 'Este é um teste do sistema de notificações em tempo real.',
        priority: 'media',
        icon: '🧪',
        color: '#2563eb'
      };

      notificationService.addInAppNotification(testNotification);

      // Teste de som
      this.playNotificationSound();

      // Teste de notificação do navegador
      await this.showBrowserNotification(testNotification);

      console.log('✅ Teste do sistema de notificações concluído');
      return true;
    } catch (error) {
      console.error('❌ Erro no teste do sistema:', error);
      return false;
    }
  }
}

// Exportar instância singleton
export const realtimeNotificationService = new RealtimeNotificationService();

