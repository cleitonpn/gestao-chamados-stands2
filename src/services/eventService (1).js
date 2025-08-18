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
      console.log('🔧 EventService: Criando evento...', eventData);
      const docRef = await addDoc(collection(db, 'eventos'), {
        ...eventData,
        createdAt: new Date(),
        updatedAt: new Date(),
        ativo: true,
        arquivado: false // Adicionar campo arquivado por padrão
      });
      console.log('✅ EventService: Evento criado com ID:', docRef.id);
      return { id: docRef.id, ...eventData };
    } catch (error) {
      console.error('❌ EventService: Erro ao criar evento:', error);
      throw error;
    }
  },

  // Buscar evento por ID
  async getEventById(eventId) {
    try {
      console.log('🔧 EventService: Buscando evento por ID:', eventId);
      const docRef = doc(db, 'eventos', eventId);
      const docSnap = await getDoc(docRef);
      
      if (docSnap.exists()) {
        const eventData = { id: docSnap.id, ...docSnap.data() };
        console.log('✅ EventService: Evento encontrado:', eventData);
        return eventData;
      } else {
        console.log('❌ EventService: Evento não encontrado:', eventId);
        return null;
      }
    } catch (error) {
      console.error('❌ EventService: Erro ao buscar evento:', error);
      throw error;
    }
  },

  // Listar todos os eventos
  async getAllEvents() {
    try {
      console.log('🔧 EventService: Listando todos os eventos...');
      const querySnapshot = await getDocs(
        query(
          collection(db, 'eventos'), 
          orderBy('dataInicioEvento', 'desc')
        )
      );
      
      const events = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      console.log('✅ EventService: Eventos carregados:', events.length);
      return events;
    } catch (error) {
      console.error('❌ EventService: Erro ao listar eventos:', error);
      throw error;
    }
  },

  // Listar eventos ativos
  async getActiveEvents() {
    try {
      console.log('🔧 EventService: Listando eventos ativos...');
      const querySnapshot = await getDocs(
        query(
          collection(db, 'eventos'),
          where('ativo', '==', true),
          orderBy('dataInicioEvento', 'desc')
        )
      );
      
      const events = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      console.log('✅ EventService: Eventos ativos carregados:', events.length);
      return events;
    } catch (error) {
      console.error('❌ EventService: Erro ao listar eventos ativos:', error);
      throw error;
    }
  },

  // Listar eventos futuros
  async getFutureEvents() {
    try {
      console.log('🔧 EventService: Listando eventos futuros...');
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
      
      const events = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      console.log('✅ EventService: Eventos futuros carregados:', events.length);
      return events;
    } catch (error) {
      console.error('❌ EventService: Erro ao listar eventos futuros:', error);
      throw error;
    }
  },

  // 🔧 CORREÇÃO: Atualizar evento com logs e retorno
  async updateEvent(eventId, eventData) {
    try {
      console.log('🔧 EventService: Atualizando evento...', { eventId, eventData });
      
      if (!eventId) {
        throw new Error('ID do evento é obrigatório');
      }

      const docRef = doc(db, 'eventos', eventId);
      
      // Verificar se o documento existe antes de atualizar
      const docSnap = await getDoc(docRef);
      if (!docSnap.exists()) {
        throw new Error(`Evento com ID ${eventId} não encontrado`);
      }

      const updateData = {
        ...eventData,
        updatedAt: new Date()
      };

      console.log('🔄 EventService: Executando updateDoc...', updateData);
      await updateDoc(docRef, updateData);
      
      console.log('✅ EventService: Evento atualizado com sucesso!');
      
      // Retornar os dados atualizados
      const updatedDoc = await getDoc(docRef);
      const updatedData = { id: updatedDoc.id, ...updatedDoc.data() };
      
      console.log('📊 EventService: Dados atualizados:', updatedData);
      return updatedData;
      
    } catch (error) {
      console.error('❌ EventService: Erro ao atualizar evento:', error);
      console.error('📊 EventService: Detalhes do erro:', {
        eventId,
        eventData,
        errorMessage: error.message,
        errorCode: error.code
      });
      throw error;
    }
  },

  // 🔧 ADIÇÃO: Arquivar evento
  async archiveEvent(eventId) {
    try {
      console.log('🔧 EventService: Arquivando evento:', eventId);
      return await this.updateEvent(eventId, {
        arquivado: true,
        updatedAt: new Date()
      });
    } catch (error) {
      console.error('❌ EventService: Erro ao arquivar evento:', error);
      throw error;
    }
  },

  // 🔧 ADIÇÃO: Desarquivar evento
  async unarchiveEvent(eventId) {
    try {
      console.log('🔧 EventService: Desarquivando evento:', eventId);
      return await this.updateEvent(eventId, {
        arquivado: false,
        updatedAt: new Date()
      });
    } catch (error) {
      console.error('❌ EventService: Erro ao desarquivar evento:', error);
      throw error;
    }
  },

  // Desativar evento (soft delete)
  async deactivateEvent(eventId) {
    try {
      console.log('🔧 EventService: Desativando evento:', eventId);
      return await this.updateEvent(eventId, {
        ativo: false,
        updatedAt: new Date()
      });
    } catch (error) {
      console.error('❌ EventService: Erro ao desativar evento:', error);
      throw error;
    }
  },

  // Reativar evento
  async reactivateEvent(eventId) {
    try {
      console.log('🔧 EventService: Reativando evento:', eventId);
      return await this.updateEvent(eventId, {
        ativo: true,
        updatedAt: new Date()
      });
    } catch (error) {
      console.error('❌ EventService: Erro ao reativar evento:', error);
      throw error;
    }
  },

  // Deletar evento permanentemente
  async deleteEvent(eventId) {
    try {
      console.log('🔧 EventService: Deletando evento permanentemente:', eventId);
      await deleteDoc(doc(db, 'eventos', eventId));
      console.log('✅ EventService: Evento deletado com sucesso!');
    } catch (error) {
      console.error('❌ EventService: Erro ao deletar evento:', error);
      throw error;
    }
  },

  // Buscar eventos por pavilhão
  async getEventsByPavilion(pavilhao) {
    try {
      console.log('🔧 EventService: Buscando eventos por pavilhão:', pavilhao);
      const querySnapshot = await getDocs(
        query(
          collection(db, 'eventos'),
          where('pavilhao', '==', pavilhao),
          where('ativo', '==', true),
          orderBy('dataInicioEvento', 'desc')
        )
      );
      
      const events = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      console.log('✅ EventService: Eventos por pavilhão carregados:', events.length);
      return events;
    } catch (error) {
      console.error('❌ EventService: Erro ao buscar eventos por pavilhão:', error);
      throw error;
    }
  },

  // Verificar se evento está ativo
  async isEventActive(eventId) {
    try {
      console.log('🔧 EventService: Verificando se evento está ativo:', eventId);
      const event = await this.getEventById(eventId);
      const isActive = event && event.ativo;
      console.log('✅ EventService: Evento ativo?', isActive);
      return isActive;
    } catch (error) {
      console.error('❌ EventService: Erro ao verificar se evento está ativo:', error);
      return false;
    }
  },

  // 🔧 CORREÇÃO: Obter estatísticas de eventos com tratamento de erro
  async getEventStats() {
    try {
      console.log('🔧 EventService: Calculando estatísticas...');
      const allEvents = await this.getAllEvents();
      const activeEvents = allEvents.filter(event => event.ativo);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      let futureEvents = [];
      let pastEvents = [];
      let currentEvents = [];
      
      try {
        futureEvents = activeEvents.filter(event => {
          if (!event.dataInicioEvento) return false;
          const startDate = event.dataInicioEvento.seconds 
            ? new Date(event.dataInicioEvento.seconds * 1000)
            : new Date(event.dataInicioEvento);
          return startDate >= today;
        });
        
        pastEvents = activeEvents.filter(event => {
          if (!event.dataFimEvento) return false;
          const endDate = event.dataFimEvento.seconds 
            ? new Date(event.dataFimEvento.seconds * 1000)
            : new Date(event.dataFimEvento);
          return endDate < today;
        });
        
        currentEvents = activeEvents.filter(event => {
          if (!event.dataInicioEvento || !event.dataFimEvento) return false;
          const startDate = event.dataInicioEvento.seconds 
            ? new Date(event.dataInicioEvento.seconds * 1000)
            : new Date(event.dataInicioEvento);
          const endDate = event.dataFimEvento.seconds 
            ? new Date(event.dataFimEvento.seconds * 1000)
            : new Date(event.dataFimEvento);
          return startDate <= today && endDate >= today;
        });
      } catch (dateError) {
        console.error('❌ EventService: Erro ao processar datas:', dateError);
        // Continuar com arrays vazios se houver erro nas datas
      }

      const stats = {
        total: allEvents.length,
        ativos: activeEvents.length,
        futuros: futureEvents.length,
        passados: pastEvents.length,
        atuais: currentEvents.length,
        inativos: allEvents.length - activeEvents.length
      };
      
      console.log('✅ EventService: Estatísticas calculadas:', stats);
      return stats;
    } catch (error) {
      console.error('❌ EventService: Erro ao obter estatísticas de eventos:', error);
      throw error;
    }
  },

  // 🔧 ADIÇÃO: Função para forçar recarregamento de um evento específico
  async refreshEvent(eventId) {
    try {
      console.log('🔄 EventService: Forçando recarregamento do evento:', eventId);
      
      // Aguardar um pouco para garantir que a atualização foi processada
      await new Promise(resolve => setTimeout(resolve, 500));
      
      const event = await this.getEventById(eventId);
      console.log('✅ EventService: Evento recarregado:', event);
      return event;
    } catch (error) {
      console.error('❌ EventService: Erro ao recarregar evento:', error);
      throw error;
    }
  },

  // 🔧 ADIÇÃO: Função para validar dados do evento
  validateEventData(eventData) {
    const errors = [];
    
    if (!eventData.nome || !eventData.nome.trim()) {
      errors.push('Nome do evento é obrigatório');
    }
    
    if (!eventData.pavilhao || !eventData.pavilhao.trim()) {
      errors.push('Pavilhão é obrigatório');
    }
    
    // Validar datas obrigatórias
    const requiredDates = [
      'dataInicioMontagem',
      'dataFimMontagem', 
      'dataInicioEvento',
      'dataFimEvento',
      'dataInicioDesmontagem',
      'dataFimDesmontagem'
    ];
    
    requiredDates.forEach(dateField => {
      if (!eventData[dateField]) {
        errors.push(`${dateField} é obrigatório`);
      }
    });
    
    if (errors.length > 0) {
      console.error('❌ EventService: Dados inválidos:', errors);
      throw new Error(`Dados inválidos: ${errors.join(', ')}`);
    }
    
    console.log('✅ EventService: Dados válidos');
    return true;
  }
};

export default eventService;

