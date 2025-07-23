import { collection, onSnapshot, query, orderBy, limit } from 'firebase/firestore';
import { db } from '../config/firebase';

class SimpleNotificationService {
  constructor() {
    this.isActive = false;
    this.lastTicketCount = 0;
    this.unsubscribe = null;
    this.user = null;
    this.notifications = [];
    this.soundEnabled = true;
  }

  // Inicializar monitoramento
  initialize(user) {
    if (this.isActive) {
      this.stop();
    }

    this.user = user;
    this.isActive = true;
    
    console.log('🔔 Iniciando monitoramento de notificações para:', user.nome);
    
    // Solicitar permissão para notificações do navegador
    this.requestNotificationPermission();
    
    // Iniciar monitoramento de chamados
    this.startMonitoring();
  }

  // Parar monitoramento
  stop() {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    this.isActive = false;
    this.lastTicketCount = 0;
    console.log('🛑 Monitoramento de notificações parado');
  }

  // Solicitar permissão para notificações
  async requestNotificationPermission() {
    if ('Notification' in window) {
      const permission = await Notification.requestPermission();
      console.log('🔔 Permissão de notificação:', permission);
    }
  }

  // Iniciar monitoramento de chamados
  startMonitoring() {
    try {
      const ticketsQuery = query(
        collection(db, 'chamados'),
        orderBy('createdAt', 'desc'),
        limit(20)
      );

      this.unsubscribe = onSnapshot(ticketsQuery, (snapshot) => {
        this.handleSnapshot(snapshot);
      }, (error) => {
        console.error('❌ Erro no monitoramento:', error);
      });

      console.log('👂 Monitoramento ativo');
    } catch (error) {
      console.error('❌ Erro ao iniciar monitoramento:', error);
    }
  }

  // Processar mudanças nos chamados
  handleSnapshot(snapshot) {
    const currentCount = snapshot.size;
    
    // Se é a primeira vez, apenas armazenar a contagem
    if (this.lastTicketCount === 0) {
      this.lastTicketCount = currentCount;
      console.log(`📊 Contagem inicial: ${currentCount} chamados`);
      return;
    }

    // Verificar se há novos chamados
    if (currentCount > this.lastTicketCount) {
      const newTicketsCount = currentCount - this.lastTicketCount;
      console.log(`🆕 ${newTicketsCount} novo(s) chamado(s) detectado(s)`);
      
      // Processar novos chamados
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') {
          const ticket = { id: change.doc.id, ...change.doc.data() };
          this.handleNewTicket(ticket);
        }
      });
    }

    this.lastTicketCount = currentCount;
  }

  // Processar novo chamado
  handleNewTicket(ticket) {
    // Verificar se é relevante para o usuário
    if (!this.isRelevantForUser(ticket)) {
      return;
    }

    console.log('🔔 Novo chamado relevante:', ticket.titulo);

    // Criar notificação
    const notification = {
      id: `ticket_${ticket.id}_${Date.now()}`,
      type: 'new_ticket',
      title: `Novo Chamado: ${ticket.titulo}`,
      message: `Área: ${ticket.area} | Prioridade: ${ticket.prioridade}`,
      timestamp: new Date(),
      read: false,
      ticketId: ticket.id,
      priority: ticket.prioridade,
      area: ticket.area
    };

    // Adicionar à lista de notificações
    this.notifications.unshift(notification);
    
    // Manter apenas as 50 mais recentes
    if (this.notifications.length > 50) {
      this.notifications = this.notifications.slice(0, 50);
    }

    // Tocar som
    this.playNotificationSound();

    // Mostrar notificação do navegador
    this.showBrowserNotification(notification);

    // Disparar evento para atualizar UI
    this.dispatchNotificationEvent(notification);
  }

  // Verificar se o chamado é relevante para o usuário
  isRelevantForUser(ticket) {
    if (!this.user) return false;

    // Administradores e gerentes veem tudo
    if (['administrador', 'gerente'].includes(this.user.funcao)) {
      return true;
    }

    // Operadores veem chamados da sua área
    if (this.user.funcao === 'operador' && ticket.area === this.user.area) {
      return true;
    }

    // Produtores veem todos os chamados
    if (this.user.funcao === 'produtor') {
      return true;
    }

    // Consultores veem seus próprios chamados
    if (this.user.funcao === 'consultor' && ticket.criadoPor === this.user.uid) {
      return true;
    }

    return false;
  }

  // Tocar som de notificação
  playNotificationSound() {
    if (!this.soundEnabled) return;

    try {
      // Criar um beep simples
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);

      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.5);
    } catch (error) {
      console.warn('⚠️ Não foi possível tocar som:', error);
    }
  }

  // Mostrar notificação do navegador
  showBrowserNotification(notification) {
    if ('Notification' in window && Notification.permission === 'granted') {
      try {
        const browserNotification = new Notification(notification.title, {
          body: notification.message,
          icon: '/favicon.ico',
          badge: '/favicon.ico',
          tag: notification.ticketId
        });

        // Fechar automaticamente após 5 segundos
        setTimeout(() => {
          browserNotification.close();
        }, 5000);

        // Ao clicar, focar na janela
        browserNotification.onclick = () => {
          window.focus();
          browserNotification.close();
        };
      } catch (error) {
        console.warn('⚠️ Erro ao mostrar notificação do navegador:', error);
      }
    }
  }

  // Disparar evento de notificação
  dispatchNotificationEvent(notification) {
    window.dispatchEvent(new CustomEvent('newNotification', {
      detail: notification
    }));
  }

  // Obter notificações não lidas
  getUnreadCount() {
    return this.notifications.filter(n => !n.read).length;
  }

  // Obter notificações recentes
  getRecentNotifications(limit = 10) {
    return this.notifications.slice(0, limit);
  }

  // Marcar notificação como lida
  markAsRead(notificationId) {
    const notification = this.notifications.find(n => n.id === notificationId);
    if (notification) {
      notification.read = true;
      this.dispatchNotificationEvent({ type: 'read', id: notificationId });
      return true;
    }
    return false;
  }

  // Marcar todas como lidas
  markAllAsRead() {
    this.notifications.forEach(n => n.read = true);
    this.dispatchNotificationEvent({ type: 'allRead' });
  }

  // Alternar som
  toggleSound() {
    this.soundEnabled = !this.soundEnabled;
    console.log('🔊 Som de notificações:', this.soundEnabled ? 'ativado' : 'desativado');
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
    this.playNotificationSound();
    this.showBrowserNotification(testNotification);
    this.dispatchNotificationEvent(testNotification);

    console.log('🧪 Notificação de teste enviada');
  }
}

export const simpleNotificationService = new SimpleNotificationService();

