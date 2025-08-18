import { 
  collection, 
  doc, 
  getDocs, 
  getDoc, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  query, 
  where, 
  orderBy,
  serverTimestamp 
} from 'firebase/firestore';
import { db } from '../config/firebase';

class EventService {
  constructor() {
    this.collectionName = 'eventos';
    this.collectionRef = collection(db, this.collectionName);
  }

  // 🔧 CORREÇÃO: getAllEvents SEM CACHE
  async getAllEvents(forceRefresh = false) {
    try {
      console.log('🔧 EventService: Listando todos os eventos...');
      console.log('🔧 ForceRefresh:', forceRefresh);
      
      // 🚀 OPÇÃO 1: Forçar busca no servidor (sem cache)
      const queryOptions = forceRefresh ? { source: 'server' } : {};
      console.log('🔧 Query options:', queryOptions);
      
      const q = query(
        this.collectionRef,
        orderBy('createdAt', 'desc')
      );
      
      // 🔧 CORREÇÃO: Usar getDocs com opções de cache
      const querySnapshot = await getDocs(q, queryOptions);
      console.log('🔧 Query snapshot size:', querySnapshot.size);
      console.log('🔧 Query metadata:', querySnapshot.metadata);
      
      const events = [];
      querySnapshot.forEach((doc) => {
        const eventData = { id: doc.id, ...doc.data() };
        console.log('🔧 Evento carregado:', eventData.nome, 'ID:', doc.id);
        
        // 🔧 DEBUG: Log das datas para verificar se são as mais recentes
        if (eventData.nome === 'FENABRAVE 2025') {
          console.log('🔍 FENABRAVE 2025 - Datas carregadas:');
          console.log('  dataInicioMontagem:', eventData.dataInicioMontagem);
          console.log('  dataFimMontagem:', eventData.dataFimMontagem);
          console.log('  dataInicioEvento:', eventData.dataInicioEvento);
          console.log('  dataFimEvento:', eventData.dataFimEvento);
          console.log('  updatedAt:', eventData.updatedAt);
        }
        
        events.push(eventData);
      });
      
      console.log('✅ EventService: Eventos carregados:', events.length);
      console.log('🔧 Fonte dos dados:', querySnapshot.metadata.fromCache ? 'CACHE' : 'SERVIDOR');
      
      return events;
    } catch (error) {
      console.error('❌ EventService: Erro ao listar eventos:', error);
      throw error;
    }
  }

  // 🔧 CORREÇÃO: getEventById SEM CACHE
  async getEventById(eventId, forceRefresh = false) {
    try {
      console.log('🔧 EventService: Buscando evento por ID:', eventId);
      console.log('🔧 ForceRefresh:', forceRefresh);
      
      const docRef = doc(db, this.collectionName, eventId);
      
      // 🚀 OPÇÃO: Forçar busca no servidor
      const queryOptions = forceRefresh ? { source: 'server' } : {};
      const docSnap = await getDoc(docRef, queryOptions);
      
      if (!docSnap.exists()) {
        throw new Error(`Evento com ID ${eventId} não encontrado`);
      }
      
      const eventData = { id: docSnap.id, ...docSnap.data() };
      console.log('✅ EventService: Evento encontrado:', eventData.nome);
      console.log('🔧 Fonte dos dados:', docSnap.metadata.fromCache ? 'CACHE' : 'SERVIDOR');
      
      return eventData;
    } catch (error) {
      console.error('❌ EventService: Erro ao buscar evento:', error);
      throw error;
    }
  }

  async createEvent(eventData) {
    try {
      console.log('🔧 EventService: Criando novo evento...');
      console.log('📊 Dados do evento:', eventData);
      
      const docRef = await addDoc(this.collectionRef, {
        ...eventData,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      
      console.log('✅ EventService: Evento criado com ID:', docRef.id);
      
      // 🔧 CORREÇÃO: Retornar dados completos após criação
      const newEvent = await this.getEventById(docRef.id, true); // Forçar refresh
      return newEvent;
    } catch (error) {
      console.error('❌ EventService: Erro ao criar evento:', error);
      throw error;
    }
  }

  // 🔧 CORREÇÃO: updateEvent ROBUSTO
  async updateEvent(eventId, eventData) {
    try {
      console.log('🔧 EventService: Atualizando evento...', { eventId, eventData });
      
      if (!eventId) {
        throw new Error('ID do evento é obrigatório');
      }

      const docRef = doc(db, this.collectionName, eventId);
      
      // 🔧 VERIFICAR SE DOCUMENTO EXISTE ANTES DE ATUALIZAR
      console.log('🔧 EventService: Verificando se documento existe...');
      const docSnap = await getDoc(docRef, { source: 'server' }); // Forçar servidor
      
      if (!docSnap.exists()) {
        throw new Error(`Evento com ID ${eventId} não encontrado`);
      }
      
      console.log('🔧 EventService: Documento existe, prosseguindo com atualização...');
      
      // 🔧 DADOS PARA ATUALIZAÇÃO COM TIMESTAMP FORÇADO
      const updateData = {
        ...eventData,
        updatedAt: serverTimestamp(),
        lastModified: Date.now(), // Timestamp adicional para forçar mudança
        version: Date.now() // Campo de versão para quebrar cache
      };
      
      console.log('🔄 EventService: Executando updateDoc...', updateData);
      
      // 🔧 EXECUTAR ATUALIZAÇÃO
      await updateDoc(docRef, updateData);
      
      console.log('✅ EventService: Evento atualizado com sucesso!');
      
      // 🔧 AGUARDAR UM POUCO PARA PROPAGAÇÃO
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // 🔧 BUSCAR DADOS ATUALIZADOS FORÇANDO SERVIDOR
      console.log('🔧 EventService: Buscando dados atualizados...');
      const updatedDoc = await getDoc(docRef, { source: 'server' });
      
      if (!updatedDoc.exists()) {
        throw new Error('Erro: documento não encontrado após atualização');
      }
      
      const updatedData = { id: updatedDoc.id, ...updatedDoc.data() };
      console.log('📊 EventService: Dados atualizados:', updatedData);
      
      // 🔧 VERIFICAR SE A ATUALIZAÇÃO FOI APLICADA
      if (updatedData.updatedAt && updatedData.lastModified) {
        console.log('✅ EventService: Atualização confirmada!');
      } else {
        console.warn('⚠️ EventService: Atualização pode não ter sido aplicada');
      }
      
      return updatedData;
    } catch (error) {
      console.error('❌ EventService: Erro ao atualizar evento:', error);
      console.error('📊 Stack trace:', error.stack);
      throw error;
    }
  }

  async deleteEvent(eventId) {
    try {
      console.log('🔧 EventService: Deletando evento:', eventId);
      
      const docRef = doc(db, this.collectionName, eventId);
      await deleteDoc(docRef);
      
      console.log('✅ EventService: Evento deletado com sucesso');
    } catch (error) {
      console.error('❌ EventService: Erro ao deletar evento:', error);
      throw error;
    }
  }

  async activateEvent(eventId) {
    try {
      console.log('🔧 EventService: Ativando evento:', eventId);
      
      await this.updateEvent(eventId, {
        ativo: true,
        updatedBy: 'system'
      });
      
      console.log('✅ EventService: Evento ativado com sucesso');
    } catch (error) {
      console.error('❌ EventService: Erro ao ativar evento:', error);
      throw error;
    }
  }

  async deactivateEvent(eventId) {
    try {
      console.log('🔧 EventService: Desativando evento:', eventId);
      
      await this.updateEvent(eventId, {
        ativo: false,
        updatedBy: 'system'
      });
      
      console.log('✅ EventService: Evento desativado com sucesso');
    } catch (error) {
      console.error('❌ EventService: Erro ao desativar evento:', error);
      throw error;
    }
  }

  async reactivateEvent(eventId) {
    try {
      console.log('🔧 EventService: Reativando evento:', eventId);
      
      await this.updateEvent(eventId, {
        ativo: true,
        updatedBy: 'system'
      });
      
      console.log('✅ EventService: Evento reativado com sucesso');
    } catch (error) {
      console.error('❌ EventService: Erro ao reativar evento:', error);
      throw error;
    }
  }

  // 🔧 ADIÇÃO: Funções de arquivamento usando updateEvent
  async archiveEvent(eventId) {
    try {
      console.log('🔧 EventService: Arquivando evento:', eventId);
      
      await this.updateEvent(eventId, {
        arquivado: true,
        updatedBy: 'system'
      });
      
      console.log('✅ EventService: Evento arquivado com sucesso');
    } catch (error) {
      console.error('❌ EventService: Erro ao arquivar evento:', error);
      throw error;
    }
  }

  async unarchiveEvent(eventId) {
    try {
      console.log('🔧 EventService: Desarquivando evento:', eventId);
      
      await this.updateEvent(eventId, {
        arquivado: false,
        updatedBy: 'system'
      });
      
      console.log('✅ EventService: Evento desarquivado com sucesso');
    } catch (error) {
      console.error('❌ EventService: Erro ao desarquivar evento:', error);
      throw error;
    }
  }

  // 🔧 CORREÇÃO: getEventStats SEM CACHE
  async getEventStats() {
    try {
      console.log('🔧 EventService: Calculando estatísticas...');
      
      // 🔧 FORÇAR RECARREGAMENTO SEM CACHE
      const events = await this.getAllEvents(true);
      
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const stats = {
        total: events.length,
        ativos: 0,
        inativos: 0,
        futuros: 0,
        passados: 0,
        atuais: 0,
        arquivados: 0
      };
      
      events.forEach(event => {
        // Status ativo/inativo
        if (event.ativo) {
          stats.ativos++;
        } else {
          stats.inativos++;
        }
        
        // Status arquivado
        if (event.arquivado) {
          stats.arquivados++;
        }
        
        // Status temporal
        if (event.dataInicioEvento && event.dataFimEvento) {
          const startDate = new Date(event.dataInicioEvento.seconds * 1000);
          const endDate = new Date(event.dataFimEvento.seconds * 1000);
          
          if (endDate < today) {
            stats.passados++;
          } else if (startDate <= today && endDate >= today) {
            stats.atuais++;
          } else {
            stats.futuros++;
          }
        }
      });
      
      console.log('✅ EventService: Estatísticas calculadas:', stats);
      return stats;
    } catch (error) {
      console.error('❌ EventService: Erro ao calcular estatísticas:', error);
      throw error;
    }
  }

  // 🔧 ADIÇÃO: Função para limpar cache manualmente
  async clearCache() {
    try {
      console.log('🔧 EventService: Limpando cache...');
      
      // Forçar recarregamento de todos os eventos do servidor
      const events = await this.getAllEvents(true);
      
      console.log('✅ EventService: Cache limpo, eventos recarregados:', events.length);
      return events;
    } catch (error) {
      console.error('❌ EventService: Erro ao limpar cache:', error);
      throw error;
    }
  }

  // 🔧 ADIÇÃO: Função para verificar conectividade
  async checkConnection() {
    try {
      console.log('🔧 EventService: Verificando conectividade...');
      
      // Tentar buscar um documento qualquer forçando servidor
      const q = query(this.collectionRef, orderBy('createdAt', 'desc'));
      const snapshot = await getDocs(q, { source: 'server' });
      
      console.log('✅ EventService: Conectividade OK, documentos:', snapshot.size);
      console.log('🔧 Fonte:', snapshot.metadata.fromCache ? 'CACHE' : 'SERVIDOR');
      
      return {
        connected: true,
        documentsCount: snapshot.size,
        fromCache: snapshot.metadata.fromCache
      };
    } catch (error) {
      console.error('❌ EventService: Erro de conectividade:', error);
      return {
        connected: false,
        error: error.message
      };
    }
  }
}

// Exportar instância única
const eventService = new EventService();
export { eventService };

