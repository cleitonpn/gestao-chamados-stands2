import { 
  collection, 
  doc, 
  getDocs, 
  addDoc, 
  query, 
  where, 
  orderBy,
  onSnapshot 
} from 'firebase/firestore';
import { db } from '../config/firebase';

export const messageService = {
  // Enviar mensagem
  async sendMessage(ticketId, messageData) {
    try {
      const docRef = await addDoc(collection(db, 'mensagens'), {
        ticketId,
        ...messageData,
        createdAt: new Date(),
        updatedAt: new Date()
      });
      return docRef.id;
    } catch (error) {
      console.error('Erro ao enviar mensagem:', error);
      throw error;
    }
  },

  // Buscar mensagens por chamado
  async getMessagesByTicket(ticketId) {
    try {
      if (!ticketId || typeof ticketId !== 'string') {
        console.warn('getMessagesByTicket: ticketId inválido:', ticketId);
        return [];
      }

      const q = query(
        collection(db, 'mensagens'), 
        where('ticketId', '==', ticketId)
      );
      const querySnapshot = await getDocs(q);
      
      const messages = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      // Ordenar por data de criação (mais antiga primeiro)
      return messages.sort((a, b) => {
        const dateA = a.createdAt?.toDate?.() || new Date(a.createdAt);
        const dateB = b.createdAt?.toDate?.() || new Date(b.createdAt);
        return dateA - dateB;
      });
    } catch (error) {
      console.error('Erro ao buscar mensagens:', error);
      throw error;
    }
  },

  // Escutar mensagens em tempo real
  subscribeToTicketMessages(ticketId, callback) {
    try {
      if (!ticketId || typeof ticketId !== 'string') {
        console.warn('subscribeToTicketMessages: ticketId inválido:', ticketId);
        callback([]);
        return () => {}; // Retorna função vazia para unsubscribe
      }

      const q = query(
        collection(db, 'mensagens'), 
        where('ticketId', '==', ticketId)
      );
      
      return onSnapshot(q, (querySnapshot) => {
        const messages = querySnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));

        // Ordenar por data de criação (mais antiga primeiro)
        const sortedMessages = messages.sort((a, b) => {
          const dateA = a.createdAt?.toDate?.() || new Date(a.createdAt);
          const dateB = b.createdAt?.toDate?.() || new Date(b.createdAt);
          return dateA - dateB;
        });

        callback(sortedMessages);
      }, (error) => {
        console.error('Erro no listener de mensagens:', error);
        callback([]);
      });
    } catch (error) {
      console.error('Erro ao configurar listener de mensagens:', error);
      callback([]);
      return () => {}; // Retorna função vazia para unsubscribe
    }
  }
};

