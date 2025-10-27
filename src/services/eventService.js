// src/services/eventService.js
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
  serverTimestamp,
  // Preferir chamadas explícitas para evitar cache quando necessário
  getDocsFromServer,
  getDocFromServer,
} from 'firebase/firestore';
import { db } from '../config/firebase';

class EventService {
  constructor() {
    this.collectionName = 'eventos';
    this.collectionRef = collection(db, this.collectionName);
  }

  // Lista todos os eventos (com opção de ignorar cache)
  async getAllEvents(forceRefresh = false) {
    const q = query(this.collectionRef, orderBy('createdAt', 'desc'));
    const snapshot = forceRefresh ? await getDocsFromServer(q) : await getDocs(q);

    const events = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    return events;
  }

  // Busca evento por ID (com opção de ignorar cache)
  async getEventById(eventId, forceRefresh = false) {
    const ref = doc(db, this.collectionName, eventId);
    const snap = forceRefresh ? await getDocFromServer(ref) : await getDoc(ref);
    if (!snap.exists()) throw new Error(`Evento com ID ${eventId} não encontrado`);
    return { id: snap.id, ...snap.data() };
  }

  async createEvent(eventData) {
    const ref = await addDoc(this.collectionRef, {
      ...eventData,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    // Recarrega do servidor para garantir dados frescos
    return this.getEventById(ref.id, true);
  }

  async updateEvent(eventId, eventData) {
    if (!eventId) throw new Error('ID do evento é obrigatório');
    const ref = doc(db, this.collectionName, eventId);

    // Garante que o doc existe e puxa do servidor
    const existsSnap = await getDocFromServer(ref);
    if (!existsSnap.exists()) throw new Error(`Evento com ID ${eventId} não encontrado`);

    const updateData = {
      ...eventData,
      updatedAt: serverTimestamp(),
      lastModified: Date.now(),
      version: Date.now(),
    };

    await updateDoc(ref, updateData);
    // Dá um pequeno respiro e busca novamente do servidor
    await new Promise((r) => setTimeout(r, 500));
    const fresh = await getDocFromServer(ref);
    return { id: fresh.id, ...fresh.data() };
  }

  async deleteEvent(eventId) {
    const ref = doc(db, this.collectionName, eventId);
    await deleteDoc(ref);
  }

  async activateEvent(eventId) {
    return this.updateEvent(eventId, { ativo: true, updatedBy: 'system' });
  }

  async deactivateEvent(eventId) {
    return this.updateEvent(eventId, { ativo: false, updatedBy: 'system' });
  }

  async reactivateEvent(eventId) {
    return this.updateEvent(eventId, { ativo: true, updatedBy: 'system' });
  }

  async archiveEvent(eventId) {
    return this.updateEvent(eventId, { arquivado: true, updatedBy: 'system' });
  }

  async unarchiveEvent(eventId) {
    return this.updateEvent(eventId, { arquivado: false, updatedBy: 'system' });
  }

  // Estatísticas simples (força leitura do servidor para evitar números desatualizados)
  async getEventStats() {
    const events = await this.getAllEvents(true);
    const today = new Date(); today.setHours(0,0,0,0);

    const stats = { total: events.length, ativos: 0, inativos: 0, futuros: 0, passados: 0, atuais: 0, arquivados: 0 };

    for (const ev of events) {
      if (ev.ativo) stats.ativos++; else stats.inativos++;
      if (ev.arquivado) stats.arquivados++;

      if (ev.dataInicioEvento && ev.dataFimEvento) {
        const start = ev.dataInicioEvento?.seconds ? new Date(ev.dataInicioEvento.seconds * 1000) : new Date(ev.dataInicioEvento);
        const end = ev.dataFimEvento?.seconds ? new Date(ev.dataFimEvento.seconds * 1000) : new Date(ev.dataFimEvento);
        if (end < today) stats.passados++;
        else if (start <= today && end >= today) stats.atuais++;
        else stats.futuros++;
      }
    }
    return stats;
  }

  async clearCache() {
    // Não há cache manual aqui; apenas força leitura do servidor
    return this.getAllEvents(true);
  }

  async checkConnection() {
    try {
      const q = query(this.collectionRef, orderBy('createdAt', 'desc'));
      const snap = await getDocsFromServer(q);
      return { connected: true, documentsCount: snap.size, fromCache: snap.metadata.fromCache };
    } catch (e) {
      return { connected: false, error: e.message };
    }
  }
}

const eventService = new EventService();
export { eventService };
