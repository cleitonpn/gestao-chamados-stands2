import { collection, onSnapshot, query, orderBy, limit } from 'firebase/firestore';
import { db } from '../config/firebase';

class RealTimeNotifications {
  constructor() {
    this.isActive = false;
    this.unsubscribe = null;
    this.user = null;
    this.lastTicketCount = 0;
    this.notifications = [];
    this.soundEnabled = true;
    this.listeners = new Set();
  }

  // Inicializar sistema
  initialize(user) {
    console.log('🔔 Inicializando notificações para:', user?.nome || 'usuário desconhecido');
    
    if (this.isActive) {
      this.stop();
    }

    this.user = user;
    this.isActive = true;
    
    // Solicitar permissão para notificações
    this.requestNotificationPermission();
    
    // Iniciar monitoramento
    this.startMonitoring();
  }

  // Parar sistema
  stop() {
    console.log('🛑 Parando notificações');
    
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    
    this.isActive = false;
    this.lastTicketCount = 0;
    this.notifications = [];
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
      
      const ticketsQuery = query(
        collection(db, 'chamados'),
        orderBy('createdAt', 'desc'),
        limit(50)
      );

      this.unsubscribe = onSnapshot(
        ticketsQuery,
        (snapshot) => {
          this.handleSnapshot(snapshot);
        },
        (error) => {
          console.error('❌ Erro no monitoramento:', error);
        }
      );

      console.log('✅ Monitoramento ativo');
    } catch (error) {
      console.error('❌ Erro ao iniciar monitoramento:', error);
    }
  }

  // Processar mudanças
  handleSnapshot(snapshot) {
    const currentCount = snapshot.size;
    
    console.log(`📊 Snapshot recebido: ${currentCount} chamados`);
    
    // Primeira execução - apenas armazenar contagem
    if (this.lastTicketCount === 0) {
      this.lastTicketCount = currentCount;
      console.log(`📋 Contagem inicial: ${currentCount} chamados`);
      return;
    }

    // Verificar novos chamados
    if (currentCount > this.lastTicketCount) {
      const newCount = currentCount - this.lastTicketCount;
      console.log(`🆕 ${newCount} novo(s) chamado(s) detectado(s)`);
      
      // Processar apenas documentos adicionados
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') {
          const ticketData = change.doc.data();
          const ticket = {
            id: change.doc.id,
            ...ticketData
          };
          
          console.log('🎫 Novo chamado:', ticket.titulo || ticket.id);
          this.processNewTicket(ticket);
        }
      });
    }

    this.lastTicketCount = currentCount;
  }

  // Processar novo chamado
  processNewTicket(ticket) {
    // Verificar relevância
    if (!this.isRelevantForUser(ticket)) {
      console.log('⏭️ Chamado não relevante para o usuário');
      return;
    }

    console.log('✅ Chamado relevante - criando notificação');

    // Criar notificação
    const notification = {
      id: `ticket_${ticket.id}_${Date.now()}`,
      type: 'new_ticket',
      title: `Novo Chamado: ${ticket.titulo || 'Sem título'}`,
      message: `Área: ${ticket.area || 'N/A'} | Prioridade: ${ticket.prioridade || 'N/A'}`,
      timestamp: new Date(),
      read: false,
      ticketId: ticket.id,
      ticket: ticket
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

  // Verificar relevância
  isRelevantForUser(ticket) {
    if (!this.user || !ticket) {
      return false;
    }

    const userRole = this.user.funcao?.toLowerCase();
    
    // Administradores veem tudo
    if (userRole === 'administrador' || userRole === 'gerente') {
      return true;
    }

    // Operadores veem da sua área
    if (userRole === 'operador') {
      return ticket.area === this.user.area;
    }

    // Produtores veem tudo
    if (userRole === 'produtor') {
      return true;
    }

    // Consultores veem seus próprios
    if (userRole === 'consultor') {
      return ticket.criadoPor === this.user.uid;
    }

    return false;
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
      read: false
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
      lastTicketCount: this.lastTicketCount
    };
  }
}

// Exportar instância única
export const realTimeNotifications = new RealTimeNotifications();

