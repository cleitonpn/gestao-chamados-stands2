import { 
  collection, 
  doc, 
  getDocs, 
  getDoc, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  query, 
  orderBy,
  where 
} from 'firebase/firestore';
import { db } from '../config/firebase';

export const eventService = {
  // Criar evento
  async createEvent(eventData) {
    try {
      const docRef = await addDoc(collection(db, 'eventos'), {
        ...eventData,
        createdAt: new Date(),
        updatedAt: new Date(),
        ativo: true
      });
      return docRef.id;
    } catch (error) {
      console.error('Erro ao criar evento:', error);
      throw error;
    }
  },

  // Buscar evento por ID
  async getEventById(eventId) {
    try {
      const docRef = doc(db, 'eventos', eventId);
      const docSnap = await getDoc(docRef);
      
      if (docSnap.exists()) {
        return { id: docSnap.id, ...docSnap.data() };
      } else {
        return null;
      }
    } catch (error) {
      console.error('Erro ao buscar evento:', error);
      throw error;
    }
  },

  // Listar todos os eventos
  async getAllEvents() {
    try {
      const querySnapshot = await getDocs(
        query(
          collection(db, 'eventos'), 
          orderBy('dataInicioEvento', 'desc')
        )
      );
      
      return querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
    } catch (error) {
      console.error('Erro ao listar eventos:', error);
      throw error;
    }
  },

  // Listar eventos ativos
  async getActiveEvents() {
    try {
      const querySnapshot = await getDocs(
        query(
          collection(db, 'eventos'),
          where('ativo', '==', true),
          orderBy('dataInicioEvento', 'desc')
        )
      );
      
      return querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
    } catch (error) {
      console.error('Erro ao listar eventos ativos:', error);
      throw error;
    }
  },

  // Listar eventos futuros
  async getFutureEvents() {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const querySnapshot = await getDocs(
        query(
          collection(db, 'eventos'),
          where('ativo', '==', true),
          where('dataInicioEvento', '>=', today),
          orderBy('dataInicioEvento', 'asc')
        )
      );
      
      return querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
    } catch (error) {
      console.error('Erro ao listar eventos futuros:', error);
      throw error;
    }
  },

  // Atualizar evento
  async updateEvent(eventId, eventData) {
    try {
      const docRef = doc(db, 'eventos', eventId);
      await updateDoc(docRef, {
        ...eventData,
        updatedAt: new Date()
      });
    } catch (error) {
      console.error('Erro ao atualizar evento:', error);
      throw error;
    }
  },

  // Desativar evento (soft delete)
  async deactivateEvent(eventId) {
    try {
      const docRef = doc(db, 'eventos', eventId);
      await updateDoc(docRef, {
        ativo: false,
        updatedAt: new Date()
      });
    } catch (error) {
      console.error('Erro ao desativar evento:', error);
      throw error;
    }
  },

  // Reativar evento
  async reactivateEvent(eventId) {
    try {
      const docRef = doc(db, 'eventos', eventId);
      await updateDoc(docRef, {
        ativo: true,
        updatedAt: new Date()
      });
    } catch (error) {
      console.error('Erro ao reativar evento:', error);
      throw error;
    }
  },

  // Deletar evento permanentemente
  async deleteEvent(eventId) {
    try {
      await deleteDoc(doc(db, 'eventos', eventId));
    } catch (error) {
      console.error('Erro ao deletar evento:', error);
      throw error;
    }
  },

  // Buscar eventos por pavilhão
  async getEventsByPavilion(pavilhao) {
    try {
      const querySnapshot = await getDocs(
        query(
          collection(db, 'eventos'),
          where('pavilhao', '==', pavilhao),
          where('ativo', '==', true),
          orderBy('dataInicioEvento', 'desc')
        )
      );
      
      return querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
    } catch (error) {
      console.error('Erro ao buscar eventos por pavilhão:', error);
      throw error;
    }
  },

  // Verificar se evento está ativo
  async isEventActive(eventId) {
    try {
      const event = await this.getEventById(eventId);
      return event && event.ativo;
    } catch (error) {
      console.error('Erro ao verificar se evento está ativo:', error);
      return false;
    }
  },

  // Obter estatísticas de eventos
  async getEventStats() {
    try {
      const allEvents = await this.getAllEvents();
      const activeEvents = allEvents.filter(event => event.ativo);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const futureEvents = activeEvents.filter(event => 
        new Date(event.dataInicioEvento.seconds * 1000) >= today
      );
      
      const pastEvents = activeEvents.filter(event => 
        new Date(event.dataFimEvento.seconds * 1000) < today
      );
      
      const currentEvents = activeEvents.filter(event => {
        const startDate = new Date(event.dataInicioEvento.seconds * 1000);
        const endDate = new Date(event.dataFimEvento.seconds * 1000);
        return startDate <= today && endDate >= today;
      });

      return {
        total: allEvents.length,
        ativos: activeEvents.length,
        futuros: futureEvents.length,
        passados: pastEvents.length,
        atuais: currentEvents.length,
        inativos: allEvents.length - activeEvents.length
      };
    } catch (error) {
      console.error('Erro ao obter estatísticas de eventos:', error);
      throw error;
    }
  }
};

export default eventService;

