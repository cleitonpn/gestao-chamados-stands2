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
  
  // ✅ FUNÇÕES DE ENVIO DE NOTIFICAÇÃO (TRIGGERS)

  async #sendNotificationToUsers(userIds, notificationData) {
    if (!userIds || userIds.length === 0) return;
    const uniqueUserIds = [...new Set(userIds)]; // Garante que não há duplicatas
    
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

  async #getRecipients(ticketData, initiatorId) {
    const recipients = new Set();
    if (ticketData.consultorId && ticketData.consultorId !== initiatorId) {
      recipients.add(ticketData.consultorId);
    }
    if (ticketData.produtorId && ticketData.produtorId !== initiatorId) {
      recipients.add(ticketData.produtorId);
    }
    return recipients;
  }
  
  async getUsersByArea(area) {
    const users = [];
    const q = query(collection(db, "usuarios"), where("area", "==", area));
    const querySnapshot = await getDocs(q);
    querySnapshot.forEach((doc) => {
      users.push({ id: doc.id, ...doc.data() });
    });
    return users;
  }

  async notifyNewTicket(ticketId, ticketData, creatorId) {
    try {
      const recipients = await this.#getRecipients(ticketData, creatorId);
      if (ticketData.areaAtual) {
        const areaUsers = await this.getUsersByArea(ticketData.areaAtual);
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

  async notifyNewMessage(ticketId, ticketData, messageData, senderId) {
    try {
      const recipients = await this.#getRecipients(ticketData, senderId);
       if (ticketData.areaAtual) {
        const areaUsers = await this.getUsersByArea(ticketData.areaAtual);
        areaUsers.forEach(user => {
          if (user.id !== senderId) recipients.add(user.id);
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

  // Adicione outras funções de notificação (notifyStatusChange, etc.) aqui seguindo o mesmo padrão...
  
  // ✅ FUNÇÕES DE LEITURA E MANIPULAÇÃO (PARA A UI)
  
  async getUserNotifications(userId) {
    const notifications = [];
    const q = query(collection(db, "notifications"), where("userId", "==", userId), orderBy("criadoEm", "desc"));
    const querySnapshot = await getDocs(q);
    querySnapshot.forEach((doc) => {
      notifications.push({ id: doc.id, ...doc.data() });
    });
    return notifications;
  }

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
    const batch = writeBatch(db);
    snapshot.docs.forEach(doc => {
      batch.update(doc.ref, { lida: true });
    });
    await batch.commit();
  }

  async deleteNotification(userId, notificationId) {
    await deleteDoc(doc(db, 'notifications', notificationId));
  }

  /**
   * ✅ FUNÇÃO QUE ESTAVA FALTANDO IMPLEMENTADA AQUI
   */
  async markTicketNotificationsAsRead(userId, ticketId) {
    try {
      const q = query(
        collection(db, 'notifications'),
        where('userId', '==', userId),
        where('ticketId', '==', ticketId),
        where('lida', '==', false)
      );
      
      const querySnapshot = await getDocs(q);
      if (querySnapshot.empty) return 0;

      const batch = writeBatch(db);
      querySnapshot.forEach((docSnapshot) => {
        batch.update(docSnapshot.ref, {
          lida: true,
          dataLeitura: new Date()
        });
      });
      
      await batch.commit();
      console.log(`✅ ${querySnapshot.size} notificações marcadas como lidas para o chamado ${ticketId}`);
      return querySnapshot.size;
    } catch (error) {
      console.error('❌ Erro ao marcar notificações do chamado como lidas:', error);
      throw error;
    }
  }
}

const notificationService = new NotificationService();
export default notificationService;
