import { collection, onSnapshot, query, orderBy, limit, where, getDocs } from 'firebase/firestore';
import { db } from '../config/firebase';
import { sendGridNotificationService } from './sendGridNotificationService';
import { notificationRulesService } from './notificationRulesService';

class UnifiedNotificationService {
  constructor() {
    this.isActive = false;
    this.unsubscribe = null;
    this.user = null;
    this.lastTicketCount = 0;
    this.notifications = [];
    this.soundEnabled = true;
    this.listeners = new Set();
    this.processedTickets = new Set(); // Para evitar duplicatas
    this.allUsers = []; // Cache de usuários para regras de notificação
  }

  // Inicializar sistema
  async initialize(user) {
    console.log('🔔 Inicializando sistema unificado de notificações para:', user?.nome || 'usuário desconhecido');
    
    if (this.isActive) {
      this.stop();
    }

    this.user = user;
    this.isActive = true;
    this.processedTickets.clear();
    
    // Carregar usuários para regras de notificação
    await this.loadAllUsers();
    
    // Solicitar permissão para notificações
    this.requestNotificationPermission();
    
    // Iniciar monitoramento
    this.startMonitoring();
  }

  // Carregar todos os usuários para aplicar regras de notificação
  async loadAllUsers() {
    try {
      console.log('👥 Carregando usuários para regras de notificação...');
      const usersSnapshot = await getDocs(collection(db, 'usuarios'));
      this.allUsers = usersSnapshot.docs.map(doc => ({
        uid: doc.id,
        ...doc.data()
      }));
      console.log(`👥 Carregados ${this.allUsers.length} usuários para regras de notificação`);
    } catch (error) {
      console.error('❌ Erro ao carregar usuários:', error);
      // Usar cache vazio em caso de erro
      this.allUsers = [];
    }
  }

  // Parar sistema
  stop() {
    console.log('🛑 Parando sistema unificado de notificações');
    
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    
    this.isActive = false;
    this.lastTicketCount = 0;
    this.notifications = [];
    this.processedTickets.clear();
  }

  // Solicitar permissão para notificações
  async requestNotificationPermission() {
    if ('Notification' in window) {
      try {
        const permission = await Notification.requestPermission();
        console.log('🔔 Permissão de notificação:', permission);
        return permission === 'granted';
      } catch (error) {
        console.warn('⚠️ Erro ao solicitar permissão:', error);
        return false;
      }
    }
    return false;
  }

  // Iniciar monitoramento
  startMonitoring() {
    if (!this.user) {
      console.error('❌ Usuário não definido para monitoramento');
      return;
    }

    try {
      console.log('👂 Iniciando monitoramento de chamados...');
      
      // Query simplificada para evitar problemas de índice
      const ticketsQuery = query(
        collection(db, 'chamados'),
        orderBy('createdAt', 'desc')
      );

      this.unsubscribe = onSnapshot(
        ticketsQuery,
        (snapshot) => {
          this.handleSnapshot(snapshot);
        },
        (error) => {
          console.error('❌ Erro no monitoramento:', error);
          // Tentar reconectar após erro
          setTimeout(() => {
            if (this.isActive) {
              console.log('🔄 Tentando reconectar...');
              this.startMonitoring();
            }
          }, 5000);
        }
      );

      console.log('✅ Monitoramento ativo');
    } catch (error) {
      console.error('❌ Erro ao iniciar monitoramento:', error);
    }
  }

  // Processar mudanças
  handleSnapshot(snapshot) {
    if (!snapshot || snapshot.empty) {
      console.log('📊 Snapshot vazio recebido');
      return;
    }

    const currentCount = snapshot.size;
    console.log(`📊 Snapshot recebido: ${currentCount} chamados`);
    
    // Primeira execução - processar todos os chamados existentes
    if (this.lastTicketCount === 0) {
      snapshot.docs.forEach(doc => {
        this.processedTickets.add(doc.id);
      });
      this.lastTicketCount = currentCount;
      console.log(`📋 Inicialização: ${currentCount} chamados processados`);
      return;
    }

    // Processar apenas novos chamados
    snapshot.docChanges().forEach((change) => {
      if (change.type === 'added') {
        const ticketId = change.doc.id;
        
        // Evitar processar o mesmo chamado duas vezes
        if (!this.processedTickets.has(ticketId)) {
          const ticketData = change.doc.data();
          const ticket = {
            id: ticketId,
            ...ticketData
          };
          
          console.log('🎫 Novo chamado detectado:', ticket.titulo || ticketId);
          this.processNewTicket(ticket);
          this.processedTickets.add(ticketId);
        }
      }
      
      if (change.type === 'modified') {
        const ticketData = change.doc.data();
        const ticket = {
          id: change.doc.id,
          ...ticketData
        };
        
        console.log('🔄 Chamado atualizado:', ticket.titulo || ticket.id);
        this.processTicketUpdate(ticket);
      }
    });

    this.lastTicketCount = currentCount;
  }

  // Processar novo chamado
  async processNewTicket(ticket) {
    // Validar se deve gerar notificação
    if (!notificationRulesService.validateNotificationEvent('new_ticket', ticket, this.user)) {
      return;
    }

    // Verificar relevância para notificação em tempo real (usuário atual)
    const userNotification = notificationRulesService.shouldNotify('new_ticket', ticket, this.user, this.user);
    
    if (userNotification.realtime) {
      console.log('✅ Chamado relevante - criando notificação em tempo real');
      this.createRealTimeNotification(ticket, 'new_ticket', userNotification.message);
    }

    // Processar notificações por e-mail usando regras específicas
    await this.processEmailNotifications('new_ticket', ticket);
  }

  // Processar atualização de chamado
  async processTicketUpdate(ticket) {
    // Validar se deve gerar notificação
    if (!notificationRulesService.validateNotificationEvent('ticket_update', ticket, this.user)) {
      return;
    }

    // Verificar se é relevante para o usuário atual
    const userNotification = notificationRulesService.shouldNotify('ticket_update', ticket, this.user, this.user);
    
    if (userNotification.realtime) {
      this.createRealTimeNotification(ticket, 'ticket_update', userNotification.message);
    }

    // Processar notificações por e-mail
    await this.processEmailNotifications('ticket_update', ticket);
  }

  // Processar notificações por e-mail usando SendGrid
  async processEmailNotifications(eventType, ticket) {
    try {
      console.log(`📧 Processando notificação SendGrid: ${eventType}`);
      
      // Usar o novo serviço SendGrid com lista de usuários reais
      const result = await sendGridNotificationService.sendNotification(eventType, ticket, this.user, this.allUsers);
      
      if (result.success) {
        console.log(`✅ Notificação SendGrid processada com sucesso - ${result.recipients} destinatário(s)`);
      } else {
        console.warn(`⚠️ Falha na notificação SendGrid: ${result.error || result.reason}`);
      }
    } catch (error) {
      console.error('❌ Erro ao processar notificações SendGrid:', error);
      
      // Fallback: tentar novamente em 5 segundos
      setTimeout(() => {
        console.log('🔄 Tentando reenviar notificação SendGrid...');
        sendGridNotificationService.sendNotification(eventType, ticket, this.user, this.allUsers);
      }, 5000);
    }
  }

  // Verificar relevância para o usuário atual (mantido para compatibilidade)
  isRelevantForUser(ticket) {
    if (!this.user || !ticket) {
      return false;
    }

    // Usar o serviço de regras para determinar relevância
    const notification = notificationRulesService.shouldNotify('new_ticket', ticket, this.user, this.user);
    return notification.realtime;
  }

  // Criar notificação em tempo real
  createRealTimeNotification(ticket, type, customMessage = null) {
    const notification = {
      id: `${type}_${ticket.id}_${Date.now()}`,
      type: type,
      title: this.getNotificationTitle(ticket, type),
      message: customMessage || this.getNotificationMessage(ticket, type),
      timestamp: new Date(),
      read: false,
      ticketId: ticket.id,
      ticket: ticket,
      priority: ticket.prioridade || 'media'
    };

    // Adicionar à lista
    this.notifications.unshift(notification);
    
    // Manter apenas 50 mais recentes
    if (this.notifications.length > 50) {
      this.notifications = this.notifications.slice(0, 50);
    }

    // Executar ações de notificação
    this.playSound();
    this.showBrowserNotification(notification);
    this.notifyListeners(notification);
  }

  // Obter título da notificação
  getNotificationTitle(ticket, type) {
    switch (type) {
      case 'new_ticket':
        return `Novo Chamado: ${ticket.titulo || 'Sem título'}`;
      case 'ticket_update':
        return `Chamado Atualizado: ${ticket.titulo || 'Sem título'}`;
      case 'ticket_escalated':
        return `Chamado Escalado: ${ticket.titulo || 'Sem título'}`;
      case 'ticket_completed':
        return `Chamado Concluído: ${ticket.titulo || 'Sem título'}`;
      default:
        return `Notificação: ${ticket.titulo || 'Sem título'}`;
    }
  }

  // Obter mensagem da notificação
  getNotificationMessage(ticket, type) {
    // Usar o serviço de regras para obter mensagem personalizada
    return notificationRulesService.getNotificationMessage(type, ticket, this.user, this.user);
  }

  // Tocar som
  playSound() {
    if (!this.soundEnabled) {
      return;
    }

    try {
      // Criar beep usando Web Audio API
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
      oscillator.type = 'sine';

      gainNode.gain.setValueAtTime(0, audioContext.currentTime);
      gainNode.gain.linearRampToValueAtTime(0.3, audioContext.currentTime + 0.1);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);

      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.5);

      console.log('🔊 Som de notificação tocado');
    } catch (error) {
      console.warn('⚠️ Erro ao tocar som:', error);
    }
  }

  // Mostrar notificação do navegador
  showBrowserNotification(notification) {
    if ('Notification' in window && Notification.permission === 'granted') {
      try {
        const browserNotification = new Notification(notification.title, {
          body: notification.message,
          icon: '/favicon.ico',
          tag: notification.ticketId,
          requireInteraction: false
        });

        // Fechar automaticamente
        setTimeout(() => {
          browserNotification.close();
        }, 5000);

        // Ao clicar, focar janela
        browserNotification.onclick = () => {
          window.focus();
          browserNotification.close();
        };

        console.log('📱 Notificação do navegador exibida');
      } catch (error) {
        console.warn('⚠️ Erro ao exibir notificação:', error);
      }
    }
  }

  // Notificar listeners
  notifyListeners(notification) {
    this.listeners.forEach(callback => {
      try {
        callback(notification);
      } catch (error) {
        console.warn('⚠️ Erro ao notificar listener:', error);
      }
    });
  }

  // Adicionar listener
  addListener(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  // Obter notificações
  getNotifications() {
    return [...this.notifications];
  }

  // Obter contagem não lidas
  getUnreadCount() {
    return this.notifications.filter(n => !n.read).length;
  }

  // Marcar como lida
  markAsRead(notificationId) {
    const notification = this.notifications.find(n => n.id === notificationId);
    if (notification) {
      notification.read = true;
      this.notifyListeners({ type: 'read', id: notificationId });
      return true;
    }
    return false;
  }

  // Marcar todas como lidas
  markAllAsRead() {
    this.notifications.forEach(n => n.read = true);
    this.notifyListeners({ type: 'allRead' });
  }

  // Alternar som
  toggleSound() {
    this.soundEnabled = !this.soundEnabled;
    console.log('🔊 Som:', this.soundEnabled ? 'ativado' : 'desativado');
    return this.soundEnabled;
  }

  // Testar notificação
  testNotification() {
    const testNotification = {
      id: `test_${Date.now()}`,
      type: 'test',
      title: 'Teste de Notificação',
      message: 'Esta é uma notificação de teste do sistema.',
      timestamp: new Date(),
      read: false,
      priority: 'media'
    };

    this.notifications.unshift(testNotification);
    this.playSound();
    this.showBrowserNotification(testNotification);
    this.notifyListeners(testNotification);

    console.log('🧪 Notificação de teste enviada');
  }

  // Obter status
  getStatus() {
    return {
      isActive: this.isActive,
      user: this.user?.nome || null,
      soundEnabled: this.soundEnabled,
      notificationCount: this.notifications.length,
      unreadCount: this.getUnreadCount(),
      lastTicketCount: this.lastTicketCount,
      processedTickets: this.processedTickets.size,
      loadedUsers: this.allUsers.length,
      emailService: sendGridNotificationService.getStatus(),
      rulesStats: notificationRulesService.getRulesStats()
    };
  }

  // Métodos para eventos específicos (para uso manual)
  async notifyTicketEscalated(ticket, escalatedTo, reason = '') {
    // Validar evento
    if (!notificationRulesService.validateNotificationEvent('ticket_escalated', ticket, this.user)) {
      return;
    }

    // Notificação em tempo real para usuário atual
    const userNotification = notificationRulesService.shouldNotify('ticket_escalated', ticket, this.user, this.user);
    if (userNotification.realtime) {
      this.createRealTimeNotification(ticket, 'ticket_escalated', userNotification.message);
    }

    // Notificações por e-mail usando SendGrid
    await this.processEmailNotifications('ticket_escalated', ticket);
  }

  async notifyTicketCompleted(ticket, resolution = '', totalTime = '') {
    // Validar evento
    if (!notificationRulesService.validateNotificationEvent('ticket_completed', ticket, this.user)) {
      return;
    }

    // Notificação em tempo real para usuário atual
    const userNotification = notificationRulesService.shouldNotify('ticket_completed', ticket, this.user, this.user);
    if (userNotification.realtime) {
      this.createRealTimeNotification(ticket, 'ticket_completed', userNotification.message);
    }

    // Notificações por e-mail usando SendGrid
    await this.processEmailNotifications('ticket_completed', ticket);
  }

  // Recarregar usuários (útil quando há mudanças)
  async reloadUsers() {
    await this.loadAllUsers();
    console.log('🔄 Lista de usuários recarregada');
  }

  // Obter regras para o usuário atual
  getCurrentUserRules() {
    return notificationRulesService.getRulesForRole(this.user?.funcao);
  }
}

// Exportar instância única
export const unifiedNotificationService = new UnifiedNotificationService();

