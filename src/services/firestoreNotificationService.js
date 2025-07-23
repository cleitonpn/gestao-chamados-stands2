import { 
  collection, 
  doc, 
  getDocs, 
  addDoc, 
  updateDoc, 
  query, 
  where, 
  orderBy,
  onSnapshot 
} from 'firebase/firestore';
import { db } from '../config/firebase';

export const firestoreNotificationService = {
  // Adicionar notificação no Firestore
  async addNotification(notificationData) {
    try {
      const docRef = await addDoc(collection(db, 'notifications'), {
        ...notificationData,
        timestamp: new Date(),
        lida: false
      });
      
      console.log('📱 Notificação adicionada ao Firestore:', docRef.id);
      return docRef.id;
    } catch (error) {
      console.error('❌ Erro ao adicionar notificação:', error);
      throw error;
    }
  },

  // Buscar notificações não lidas por usuário e chamado
  async getUnreadNotificationsByTicket(userId, ticketId) {
    try {
      const q = query(
        collection(db, 'notifications'),
        where('userId', '==', userId),
        where('ticketId', '==', ticketId),
        where('lida', '==', false)
      );
      
      const querySnapshot = await getDocs(q);
      return querySnapshot.size; // Retorna a contagem
    } catch (error) {
      console.error('❌ Erro ao buscar notificações não lidas:', error);
      return 0;
    }
  },

  // Buscar todas as notificações não lidas por usuário
  async getUnreadNotificationsByUser(userId) {
    try {
      const q = query(
        collection(db, 'notifications'),
        where('userId', '==', userId),
        where('lida', '==', false),
        orderBy('timestamp', 'desc')
      );
      
      const querySnapshot = await getDocs(q);
      const notifications = [];
      querySnapshot.forEach((doc) => {
        notifications.push({
          id: doc.id,
          ...doc.data()
        });
      });
      
      return notifications;
    } catch (error) {
      console.error('❌ Erro ao buscar notificações do usuário:', error);
      return [];
    }
  },

  // Marcar notificações como lidas por chamado
  async markTicketNotificationsAsRead(userId, ticketId) {
    try {
      const q = query(
        collection(db, 'notifications'),
        where('userId', '==', userId),
        where('ticketId', '==', ticketId),
        where('lida', '==', false)
      );
      
      const querySnapshot = await getDocs(q);
      const updatePromises = [];
      
      querySnapshot.forEach((docSnapshot) => {
        updatePromises.push(
          updateDoc(doc(db, 'notifications', docSnapshot.id), {
            lida: true,
            dataLeitura: new Date()
          })
        );
      });
      
      await Promise.all(updatePromises);
      console.log(`✅ ${updatePromises.length} notificações marcadas como lidas para o chamado ${ticketId}`);
      
      return updatePromises.length;
    } catch (error) {
      console.error('❌ Erro ao marcar notificações como lidas:', error);
      throw error;
    }
  },

  // Criar notificação para mudança de status
  async notifyStatusChange(ticketId, userId, titulo, newStatus, observacao = '') {
    try {
      const notificationData = {
        userId: userId,
        ticketId: ticketId,
        tipo: 'status_change',
        titulo: `Status atualizado: ${titulo}`,
        mensagem: `Chamado alterado para: ${newStatus}${observacao ? ` - ${observacao}` : ''}`,
        status: newStatus,
        observacao: observacao
      };
      
      return await this.addNotification(notificationData);
    } catch (error) {
      console.error('❌ Erro ao criar notificação de status:', error);
      throw error;
    }
  },

  // Criar notificação para nova mensagem
  async notifyNewMessage(ticketId, userId, titulo, remetente, conteudo) {
    try {
      const notificationData = {
        userId: userId,
        ticketId: ticketId,
        tipo: 'new_message',
        titulo: `Nova mensagem: ${titulo}`,
        mensagem: `${remetente}: ${conteudo.substring(0, 100)}${conteudo.length > 100 ? '...' : ''}`,
        remetente: remetente
      };
      
      return await this.addNotification(notificationData);
    } catch (error) {
      console.error('❌ Erro ao criar notificação de mensagem:', error);
      throw error;
    }
  },

  // Escutar notificações em tempo real
  subscribeToUserNotifications(userId, callback) {
    try {
      const q = query(
        collection(db, 'notifications'),
        where('userId', '==', userId),
        where('lida', '==', false),
        orderBy('timestamp', 'desc')
      );
      
      return onSnapshot(q, (querySnapshot) => {
        const notifications = [];
        querySnapshot.forEach((doc) => {
          notifications.push({
            id: doc.id,
            ...doc.data()
          });
        });
        
        callback(notifications);
      });
    } catch (error) {
      console.error('❌ Erro ao escutar notificações:', error);
      return () => {}; // Retorna função vazia para cleanup
    }
  }
};

