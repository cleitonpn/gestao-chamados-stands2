import {
  collection,
  doc,
  getDocs,
  addDoc,
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

  // Notifica sobre um novo chamado
  async notifyNewTicket(ticketId, ticketData, creatorId) {
    try {
      const recipients = new Set();
      if (ticketData.consultorId && ticketData.consultorId !== creatorId) recipients.add(ticketData.consultorId);
      if (ticketData.produtorId && ticketData.produtorId !== creatorId) recipients.add(ticketData.produtorId);
      
      if (ticketData.area) { // Corrigido para usar ticketData.area
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
        if (ticketData.criadoPor && ticketData.criadoPor !== senderId) recipients.add(ticketData.criadoPor);
        if (ticketData.consultorId && ticketData.consultorId !== senderId) recipients.add(ticketData.consultorId);
        if (ticketData.produtorId && ticketData.produtorId !== senderId) recipients.add(ticketData.produtorId);

        // Adiciona todos os usuários que já participaram da conversa
        if (messageData.allParticipantsIds) {
            messageData.allParticipantsIds.forEach(id => {
                if (id !== senderId) recipients.add(id);
            });
        }
        
        await this.#sendNotificationToUsers(Array.from(recipients), {
            tipo: 'new_message',
            titulo: `Nova mensagem no chamado #${ticketId.slice(-6)}`,
            mensagem: `${messageData.autorNome}: ${messageData.texto.substring(0, 50)}...`,
            link: `/tickets/${ticketId}`,
            ticketId: ticketId,
        });
    } catch (error) {
        console.error('❌ Erro ao notificar nova mensagem:', error);
    }
}


  // Notifica sobre mudança de status
  async notifyStatusChanged(ticketId, ticket, statusData, userId) {
    // Implementação pendente, se necessário
  }

  // Notifica sobre escalação
  async notifyTicketEscalated(ticketId, ticket, escalationData, userId) {
    // Implementação pendente, se necessário
  }

  // Notifica sobre escalação para gerente
  async notifyEscalatedToManager(ticketId, ticket, escalationData, userId) {
     // Implementação pendente, se necessário
  }

  // ✅ FUNÇÕES DE LEITURA E MANIPULAÇÃO (PARA A UI)
  
  // Função que estava faltando com o nome getInAppNotifications
  async getUserNotifications(userId) {
    const notifications = [];
    const q = query(collection(db, "notifications"), where("userId", "==", userId), orderBy("criadoEm", "desc"));
    const querySnapshot = await getDocs(q);
    querySnapshot.forEach((doc) => {
      notifications.push({ id: doc.id, ...doc.data() });
    });
    return notifications;
  }
  // Alias para garantir compatibilidade
  async getInAppNotifications(userId) {
    return this.getUserNotifications(userId);
  }

  // Listener em tempo real
  subscribeToNotifications(userId, callback) {
    const q = query(collection(db, "notifications"), where("userId", "==", userId), orderBy("criadoEm", "desc"));
    return onSnapshot(q, (querySnapshot) => {
      const notifications = [];
      querySnapshot.forEach((doc) => {
        notifications.push({ id: doc.id, ...doc.data() });
      });
      callback(notifications);
    });
  }
  
  // Funções de manipulação
  async markAsRead(userId, notificationId) {
    const notificationRef = doc(db, 'notifications', notificationId);
    await updateDoc(notificationRef, { lida: true });
  }

  async markAsUnread(userId, notificationId) {
    const notificationRef = doc(db, 'notifications', notificationId);
    await updateDoc(notificationRef, { lida: false });
  }
  
  async markAllAsRead(userId) {
    const q = query(collection(db, 'notifications'), where('userId', '==', userId), where('lida', '==', false));
    const snapshot = await getDocs(q);
    if (snapshot.empty) return;
    const batch = writeBatch(db);
    snapshot.docs.forEach(doc => batch.update(doc.ref, { lida: true }));
    await batch.commit();
  }

  async deleteNotification(userId, notificationId) {
    await deleteDoc(doc(db, 'notifications', notificationId));
  }

  // Função que estava faltando na versão anterior
  async markTicketNotificationsAsRead(userId, ticketId) {
    const q = query(
      collection(db, 'notifications'),
      where('userId', '==', userId),
      where('ticketId', '==', ticketId),
      where('lida', '==', false)
    );
    const snapshot = await getDocs(q);
    if (snapshot.empty) return;
    const batch = writeBatch(db);
    snapshot.forEach(doc => batch.update(doc.ref, { lida: true, dataLeitura: new Date() }));
    await batch.commit();
  }

  // ✅ Função que estava faltando na versão anterior
  async getUnreadNotificationsByTicket(userId, ticketId) {
    try {
      const q = query(
        collection(db, 'notifications'),
        where('userId', '==', userId),
        where('ticketId', '==', ticketId),
        where('lida', '==', false)
      );
      const querySnapshot = await getDocs(q);
      return querySnapshot.size; // Retorna a contagem de notificações não lidas
    } catch (error) {
      console.error("Erro ao buscar notificações não lidas por ticket:", error);
      return 0;
    }
  }
}

const notificationService = new NotificationService();
export default notificationService;
