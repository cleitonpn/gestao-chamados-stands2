import {
  collection,
  doc,
  getDocs,
  updateDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  writeBatch,
  deleteDoc
} from 'firebase/firestore';
import { db } from '../config/firebase'; // Verifique se este caminho está correto

class NotificationService {

  // Envia notificações para uma lista de usuários
  async #sendNotificationToUsers(userIds, notificationData) {
    if (!userIds || userIds.length === 0) return;
    const uniqueUserIds = [...new Set(userIds)];
    
    const batch = writeBatch(db);
    uniqueUserIds.forEach(userId => {
      const notificationRef = doc(collection(db, 'notifications'));
      batch.set(notificationRef, {
        ...notificationData,
        userId: userId,
        lida: false,
        criadoEm: new Date(),
      });
    });
    
    await batch.commit();
  }

  // Obtém usuários de uma área específica
  async getUsersByArea(area) {
    const users = [];
    const q = query(collection(db, "usuarios"), where("area", "==", area));
    const querySnapshot = await getDocs(q);
    querySnapshot.forEach((doc) => {
      users.push({ id: doc.id, ...doc.data() });
    });
    return users;
  }

  // Obtém todos os usuários
  async getAllUsers() {
    const users = [];
    const q = query(collection(db, "usuarios"));
    const querySnapshot = await getDocs(q);
    querySnapshot.forEach((doc) => {
      users.push({ id: doc.id, ...doc.data() });
    });
    return users;
  }

  // Notifica sobre um novo chamado
  async notifyNewTicket(ticketId, ticketData, creatorId) {
    try {
      const recipients = new Set();
      if (ticketData.consultorId && ticketData.consultorId !== creatorId) recipients.add(ticketData.consultorId);
      if (ticketData.produtorId && ticketData.produtorId !== creatorId) recipients.add(ticketData.produtorId);
      
      if (ticketData.area) {
        const areaUsers = await this.getUsersByArea(ticketData.area);
        areaUsers.forEach(user => {
          if (user.id !== creatorId) recipients.add(user.id);
        });
      }

      await this.#sendNotificationToUsers(Array.from(recipients), {
        tipo: 'new_ticket',
        titulo: `Novo chamado: ${ticketData.titulo}`,
        mensagem: `Criado no projeto ${ticketData.projetoNome || ''}`,
        link: `/tickets/${ticketId}`,
        ticketId: ticketId,
      });
    } catch (error) {
      console.error('❌ Erro ao notificar novo chamado:', error);
    }
  }

  // Notifica sobre uma nova mensagem
  async notifyNewMessage(ticketId, ticketData, messageData, senderId) {
    try {
      const recipients = new Set();
      // Notifica o criador do chamado (se não for ele mesmo que enviou)
      if (ticketData.criadoPor && ticketData.criadoPor !== senderId) {
        recipients.add(ticketData.criadoPor);
      }
      // Notifica consultor e produtor
      if (ticketData.consultorId && ticketData.consultorId !== senderId) recipients.add(ticketData.consultorId);
      if (ticketData.produtorId && ticketData.produtorId !== senderId) recipients.add(ticketData.produtorId);
      
      // Notifica operadores da área atual
      if (ticketData.area) {
        const areaUsers = await this.getUsersByArea(ticketData.area);
        areaUsers.forEach(user => {
          if (user.id !== senderId) recipients.add(user.id);
        });
      }
        
      await this.#sendNotificationToUsers(Array.from(recipients), {
        tipo: 'new_message',
        titulo: `Nova mensagem no chamado #${ticketId.slice(-6)}`,
        mensagem: `${messageData.remetenteNome}: ${messageData.conteudo.substring(0, 50)}...`,
        link: `/tickets/${ticketId}`,
        ticketId: ticketId,
      });
    } catch (error) {
      console.error('❌ Erro ao notificar nova mensagem:', error);
    }
  }
  
  // Notifica sobre mudança de status
  async notifyStatusChange(ticketId, ticketData, statusData, changerId) {
    try {
      const recipients = new Set();
      if (ticketData.criadoPor && ticketData.criadoPor !== changerId) recipients.add(ticketData.criadoPor);
      if (ticketData.consultorId && ticketData.consultorId !== changerId) recipients.add(ticketData.consultorId);
      if (ticketData.produtorId && ticketData.produtorId !== changerId) recipients.add(ticketData.produtorId);

      await this.#sendNotificationToUsers(Array.from(recipients), {
          tipo: 'status_changed',
          titulo: `Status alterado para: ${statusData.novoStatus}`,
          mensagem: `Chamado #${ticketId.slice(-6)} foi atualizado`,
          link: `/tickets/${ticketId}`,
          ticketId: ticketId,
      });
    } catch (error) {
      console.error('❌ Erro ao notificar mudança de status:', error);
    }
  }
  
  // Notifica sobre novo evento
  async notifyNewEvent(eventId, eventData, creatorId) {
    try {
      const allUsers = await this.getAllUsers();
      const recipients = allUsers.map(user => user.id).filter(id => id !== creatorId);

      await this.#sendNotificationToUsers(recipients, {
        tipo: 'new_event',
        titulo: `Novo evento: ${eventData.nome}`,
        mensagem: `Evento "${eventData.nome}" no pavilhão ${eventData.pavilhao}`,
        link: `/events`, // ou um link específico do evento, se houver
        eventId: eventId,
      });
    } catch (error) {
      console.error('❌ Erro ao notificar novo evento:', error);
    }
  }

  // Funções de leitura e manipulação para a UI
  async getUserNotifications(userId) { /* ... implementação ... */ }
  subscribeToNotifications(userId, callback) { /* ... implementação ... */ }
  async markAsRead(userId, notificationId) { /* ... implementação ... */ }
  async markAsUnread(userId, notificationId) { /* ... implementação ... */ }
  async markAllAsRead(userId) { /* ... implementação ... */ }
  async deleteNotification(userId, notificationId) { /* ... implementação ... */ }
  async markTicketNotificationsAsRead(userId, ticketId) { /* ... implementação ... */ }
  async getUnreadNotificationsByTicket(userId, ticketId) { /* ... implementação ... */ }
}

const notificationService = new NotificationService();
export default notificationService;
