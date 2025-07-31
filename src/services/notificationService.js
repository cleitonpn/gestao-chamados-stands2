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
  deleteDoc,
  addDoc
} from 'firebase/firestore';
import { db } from '../config/firebase';

class NotificationService {
  // Busca usuários por ID para garantir que ele existe
  async #getUserById(userId) {
    if (!userId) return null;
    const userRef = doc(db, "usuarios", userId);
    const userSnap = await getDoc(userRef);
    return userSnap.exists() ? { id: userSnap.id, ...userSnap.data() } : null;
  }
  
  // Busca usuários por área
  async #getUsersByArea(area) {
    const users = [];
    if (!area) return users;
    const q = query(collection(db, "usuarios"), where("area", "==", area));
    const querySnapshot = await getDocs(q);
    querySnapshot.forEach((doc) => {
      // Usar o uid do documento 'usuarios' que é o mesmo que o auth.uid
      users.push(doc.id); 
    });
    return users;
  }

  // Método privado para enviar notificações
  async #sendNotificationToUsers(userIds, notificationData) {
    if (!userIds || userIds.length === 0) return;
    const uniqueUserIds = [...new Set(userIds)];
    
    const batch = writeBatch(db);
    uniqueUserIds.forEach(userId => {
      const userNotificationsRef = collection(db, 'notifications', userId, 'notifications');
      const newNotificationRef = doc(userNotificationsRef);
      batch.set(newNotificationRef, {
        ...notificationData,
        lida: false,
        criadoEm: new Date(),
      });
    });
    
    await batch.commit();
    console.log(`🔔 Notificação do tipo "${notificationData.tipo}" enviada para ${uniqueUserIds.length} usuários.`);
  }

  // Notifica sobre nova mensagem
  async notifyNewMessage(ticketId, ticketData, messageData, senderId) {
    try {
      const recipients = new Set();
      // Notifica o criador do chamado (se não for quem enviou a msg)
      if (ticketData.criadoPor && ticketData.criadoPor !== senderId) {
        recipients.add(ticketData.criadoPor);
      }
      // Notifica operadores da área atual do chamado
      if (ticketData.area) {
        const areaUsersIds = await this.#getUsersByArea(ticketData.area);
        areaUsersIds.forEach(userId => {
          if (userId !== senderId) recipients.add(userId);
        });
      }
        
      await this.#sendNotificationToUsers(Array.from(recipients), {
        tipo: 'new_message',
        titulo: `Nova mensagem no chamado #${ticketId.slice(-6)}`,
        mensagem: `${messageData.remetenteNome}: ${messageData.conteudo.substring(0, 50)}...`,
        link: `/chamado/${ticketId}`,
        ticketId: ticketId,
      });
    } catch (error) {
      console.error('❌ Erro ao notificar nova mensagem:', error);
    }
  }

  // Notifica sobre mudança de status
  async notifyStatusChange(ticketId, ticketData, newStatus, changerId) {
     try {
        const recipients = new Set();
        if (ticketData.criadoPor && ticketData.criadoPor !== changerId) {
            recipients.add(ticketData.criadoPor);
        }
        if (ticketData.area) {
            const areaUsersIds = await this.#getUsersByArea(ticketData.area);
            areaUsersIds.forEach(userId => {
                if (userId !== changerId) recipients.add(userId);
            });
        }
        await this.#sendNotificationToUsers(Array.from(recipients), {
            tipo: 'status_changed',
            titulo: `Status alterado para: ${newStatus.replace('_', ' ')}`,
            mensagem: `Chamado "${ticketData.titulo.substring(0, 20)}..." foi atualizado.`,
            link: `/chamado/${ticketId}`,
            ticketId: ticketId,
        });
    } catch (error) {
        console.error('❌ Erro ao notificar mudança de status:', error);
    }
  }

  // Listener em tempo real para as notificações de um usuário
  subscribeToNotifications(userId, callback) {
    const userNotificationsRef = collection(db, 'notifications', userId, 'notifications');
    const q = query(userNotificationsRef, orderBy("criadoEm", "desc"));
    return onSnapshot(q, (querySnapshot) => {
      const notifications = [];
      querySnapshot.forEach((doc) => {
        notifications.push({ id: doc.id, ...doc.data() });
      });
      callback(notifications);
    });
  }

  // Marca uma notificação como lida
  async markAsRead(userId, notificationId) {
    const notificationRef = doc(db, 'notifications', userId, 'notifications', notificationId);
    await updateDoc(notificationRef, { lida: true });
  }

  // Marca todas as notificações como lidas
  async markAllAsRead(userId) {
    const userNotificationsRef = collection(db, 'notifications', userId, 'notifications');
    const q = query(userNotificationsRef, where('lida', '==', false));
    const snapshot = await getDocs(q);
    if (snapshot.empty) return;
    const batch = writeBatch(db);
    snapshot.docs.forEach(doc => batch.update(doc.ref, { lida: true }));
    await batch.commit();
  }
  
  // Deleta uma notificação
  async deleteNotification(userId, notificationId) {
    const notificationRef = doc(db, 'notifications', userId, 'notifications', notificationId);
    await deleteDoc(notificationRef);
  }

  // Marca como lidas as notificações de um chamado específico
  async markTicketNotificationsAsRead(userId, ticketId) {
    const userNotificationsRef = collection(db, 'notifications', userId, 'notifications');
    const q = query(userNotificationsRef, where('ticketId', '==', ticketId), where('lida', '==', false));
    const snapshot = await getDocs(q);
    if (snapshot.empty) return;
    const batch = writeBatch(db);
    snapshot.forEach(doc => batch.update(doc.ref, { lida: true, dataLeitura: new Date() }));
    await batch.commit();
  }

  // Retorna a contagem de notificações não lidas para um chamado específico
  async getUnreadNotificationsByTicket(userId, ticketId) {
    const userNotificationsRef = collection(db, 'notifications', userId, 'notifications');
    const q = query(userNotificationsRef, where('ticketId', '==', ticketId), where('lida', '==', false));
    const querySnapshot = await getDocs(q);
    return querySnapshot.size;
  }
}

const notificationService = new NotificationService();
export default notificationService;
