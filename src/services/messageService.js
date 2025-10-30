// src/services/messageService.js
// Serviço central para criar e ler mensagens de ticket.
// Garante um "schema mínimo" e usa serverTimestamp para datas,
// o que destrava a Cloud Function onMensagemCreated.

import {
  collection,
  addDoc,
  query,
  where,
  getDocs,
  onSnapshot,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../config/firebase';

// Campos obrigatórios para que o push funcione
const REQUIRED_FIELDS = ['type', 'userId', 'ticketId', 'title', 'body'];

/**
 * Normaliza/valida o payload de mensagem.
 * - userId = DESTINATÁRIO do push (não confundir com authorId)
 * - title/body = conteúdo da notificação
 */
function normalizeMessage(input) {
  const msg = {
    type: input.type,                 // "ticket_reply" | "status_update" | ...
    userId: input.userId,             // DESTINATÁRIO (quem deve receber o push)
    ticketId: input.ticketId,

    authorId: input.authorId ?? null,
    remetenteNome: input.remetenteNome ?? input.authorName ?? 'Sistema',

    title: input.title ?? 'Atualização',
    body: input.body ?? input.conteudo ?? '',

    link: input.link ?? null,         // deep-link opcional para abrir o ticket

    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),

    // Campos extras livres (se quiser enviar algo além do padrão)
    ...(input.extra || {}),
  };

  const missing = REQUIRED_FIELDS.filter((k) => !msg[k]);
  if (missing.length) {
    throw new Error(`Mensagem inválida — faltam campos: ${missing.join(', ')}`);
  }
  return msg;
}

/** Converte Timestamp ou string/Date para número pra ordenar com segurança. */
function toMillis(ts) {
  // Firestore Timestamp
  if (ts && typeof ts.toMillis === 'function') return ts.toMillis();
  // Date
  if (ts instanceof Date) return ts.getTime();
  // string ISO
  const d = new Date(ts);
  if (!isNaN(d)) return d.getTime();
  // fallback: agora
  return Date.now();
}

/** Ordena mensagens por createdAt asc. */
function sortByCreatedAtAsc(a, b) {
  return toMillis(a?.createdAt) - toMillis(b?.createdAt);
}

export const messageService = {
  /**
   * Cria uma nova mensagem na coleção `mensagens`
   * Exemplo de uso:
   * await messageService.sendMessage({
   *   type: 'ticket_reply',
   *   userId: destinatarioId,
   *   ticketId,
   *   authorId: autorId,
   *   remetenteNome: 'Fulano',
   *   title: 'Nova resposta no chamado',
   *   body: 'Clique para ver a conversa',
   *   link: `/chamado/${ticketId}`
   * });
   */
  async sendMessage(messageData) {
    const payload = normalizeMessage(messageData);
    const ref = await addDoc(collection(db, 'mensagens'), payload);
    return ref.id;
  },

  /** Busca mensagens de um ticket (snapshot único). */
  async getMessagesByTicket(ticketId) {
    const q = query(collection(db, 'mensagens'), where('ticketId', '==', ticketId));
    const snap = await getDocs(q);
    return snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .sort(sortByCreatedAtAsc);
  },

  /**
   * Escuta as mensagens de um ticket em tempo real.
   * Retorna um unsubscribe do onSnapshot.
   */
  subscribeToTicketMessages(ticketId, callback) {
    const q = query(collection(db, 'mensagens'), where('ticketId', '==', ticketId));
    return onSnapshot(
      q,
      (snap) => {
        const items = snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort(sortByCreatedAtAsc);
        callback(items);
      },
      (err) => {
        console.error('[subscribeToTicketMessages] snapshot error', err);
        callback([]);
      }
    );
  },
};

export default messageService;
