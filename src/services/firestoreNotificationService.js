import { 
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  getDocs,
  updateDoc, 
  onSnapshot, 
  query, 
  where, 
  orderBy,
  serverTimestamp,
  addDoc,
  deleteDoc
} from 'firebase/firestore';
import { db } from '../config/firebase';

class FirestoreNotificationService {
  constructor() {
    this.listeners = new Map();
  }

  /**
   * Criar uma nova notificação
   */
  async createNotification(notification) {
    try {
      const notificationRef = await addDoc(collection(db, 'notifications'), {
        ...notification,
        criadoEm: serverTimestamp(),
        lida: false
      });

      console.log('✅ Notificação criada:', notificationRef.id);
      return notificationRef.id;
    } catch (error) {
      console.error('❌ Erro ao criar notificação:', error);
      throw error;
    }
  }

  /**
   * Buscar notificações de um usuário
   */
  async getUserNotifications(userId, limit = 50) {
    try {
      const q = query(
        collection(db, 'notifications'),
        where('destinatarioId', '==', userId),
        orderBy('criadoEm', 'desc')
      );

      const snapshot = await getDocs(q);
      const notifications = [];

      snapshot.forEach((doc) => {
        notifications.push({
          id: doc.id,
          ...doc.data()
        });
      });

      console.log(`📱 ${notifications.length} notificações carregadas para usuário ${userId}`);
      return notifications;
    } catch (error) {
      console.error('❌ Erro ao buscar notificações:', error);
      return [];
    }
  }

  /**
   * Marcar notificação como lida
   */
  async markAsRead(userId, notificationId) {
    try {
      const notificationRef = doc(db, 'notifications', notificationId);
      await updateDoc(notificationRef, {
        lida: true,
        lidaEm: serverTimestamp()
      });

      console.log('✅ Notificação marcada como lida:', notificationId);
    } catch (error) {
      console.error('❌ Erro ao marcar notificação como lida:', error);
      throw error;
    }
  }

  /**
   * Marcar notificação como não lida
   */
  async markAsUnread(userId, notificationId) {
    try {
      const notificationRef = doc(db, 'notifications', notificationId);
      await updateDoc(notificationRef, {
        lida: false,
        lidaEm: null
      });

      console.log('✅ Notificação marcada como não lida:', notificationId);
    } catch (error) {
      console.error('❌ Erro ao marcar notificação como não lida:', error);
      throw error;
    }
  }

  /**
   * Marcar todas as notificações como lidas
   */
  async markAllAsRead(userId) {
    try {
      const q = query(
        collection(db, 'notifications'),
        where('destinatarioId', '==', userId),
        where('lida', '==', false)
      );

      const snapshot = await getDocs(q);
      const promises = [];

      snapshot.forEach((doc) => {
        promises.push(
          updateDoc(doc.ref, {
            lida: true,
            lidaEm: serverTimestamp()
          })
        );
      });

      await Promise.all(promises);
      console.log(`✅ ${promises.length} notificações marcadas como lidas`);
    } catch (error) {
      console.error('❌ Erro ao marcar todas as notificações como lidas:', error);
      throw error;
    }
  }

  /**
   * Deletar uma notificação
   */
  async deleteNotification(userId, notificationId) {
    try {
      const notificationRef = doc(db, 'notifications', notificationId);
      await deleteDoc(notificationRef);

      console.log('✅ Notificação deletada:', notificationId);
    } catch (error) {
      console.error('❌ Erro ao deletar notificação:', error);
      throw error;
    }
  }

  /**
   * Escutar notificações em tempo real
   */
  subscribeToNotifications(userId, callback) {
    try {
      const q = query(
        collection(db, 'notifications'),
        where('destinatarioId', '==', userId),
        orderBy('criadoEm', 'desc')
      );

      const unsubscribe = onSnapshot(q, (snapshot) => {
        const notifications = [];
        
        snapshot.forEach((doc) => {
          notifications.push({
            id: doc.id,
            ...doc.data()
          });
        });

        callback(notifications);
      });

      // Armazenar listener para cleanup
      this.listeners.set(userId, unsubscribe);

      console.log('👂 Listener de notificações ativado para usuário:', userId);
      return unsubscribe;
    } catch (error) {
      console.error('❌ Erro ao configurar listener de notificações:', error);
      return () => {}; // Retorna função vazia em caso de erro
    }
  }

  /**
   * Parar de escutar notificações
   */
  unsubscribeFromNotifications(userId) {
    const unsubscribe = this.listeners.get(userId);
    if (unsubscribe) {
      unsubscribe();
      this.listeners.delete(userId);
      console.log('🔇 Listener de notificações desativado para usuário:', userId);
    }
  }

  /**
   * Enviar notificação para múltiplos usuários
   */
  async sendNotificationToUsers(userIds, notificationData) {
    try {
      const promises = userIds.map(userId => 
        this.createNotification({
          ...notificationData,
          destinatarioId: userId
        })
      );

      await Promise.all(promises);
      console.log(`✅ Notificação enviada para ${userIds.length} usuários`);
    } catch (error) {
      console.error('❌ Erro ao enviar notificação para usuários:', error);
      throw error;
    }
  }

  /**
   * Buscar usuários por função/área
   */
  async getUsersByRole(role) {
    try {
      const q = query(
        collection(db, 'users'),
        where('funcao', '==', role)
      );

      const snapshot = await getDocs(q);
      const users = [];

      snapshot.forEach((doc) => {
        users.push({
          id: doc.id,
          ...doc.data()
        });
      });

      return users;
    } catch (error) {
      console.error('❌ Erro ao buscar usuários por função:', error);
      return [];
    }
  }

  /**
   * Buscar usuários por área específica
   */
  async getUsersByArea(area) {
    try {
      const q = query(
        collection(db, 'users'),
        where('area', '==', area)
      );

      const snapshot = await getDocs(q);
      const users = [];

      snapshot.forEach((doc) => {
        users.push({
          id: doc.id,
          ...doc.data()
        });
      });

      return users;
    } catch (error) {
      console.error('❌ Erro ao buscar usuários por área:', error);
      return [];
    }
  }
}

// Criar instância única do serviço
export const firestoreNotificationService = new FirestoreNotificationService();
export default firestoreNotificationService;

