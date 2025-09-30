// src/services/diaryService.js

import {
  collection,
  doc,
  addDoc,
  getDocs,
  getDoc,
  deleteDoc,
  orderBy,
  query,
  where,
  limit,
  startAfter,
  startAt,
  endAt,
  serverTimestamp,
  writeBatch,
  updateDoc,
  arrayUnion,
} from 'firebase/firestore';

// ✅ Caminho corrigido para o seu projeto:
import { db } from '../config/firebase';

// ------------------------------
// Helpers
// ------------------------------
const toLower = (s) => (s || '').toString().trim().toLowerCase();

// Subcoleção do diário dentro do projeto (usa PT-BR: "projetos")
const diaryCol = (projectId) => collection(db, 'projetos', projectId, 'diary');

// Coleção do feed global (sem multiempresa por enquanto)
const feedCol = () => collection(db, 'diary_feed');

export const diaryService = {
  // ================== FUNÇÕES EXISTENTES / COMPAT ==================

  // Lê entradas do diário de um projeto (mais recentes primeiro)
  async getEntries(projectId) {
    const q = query(diaryCol(projectId), orderBy('createdAt', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  },

  // Cria entrada no diário do projeto
  async addEntry(projectId, entry) {
    const ref = await addDoc(diaryCol(projectId), {
      ...entry,
      createdAt: serverTimestamp(),
    });
    // retorno imediato para UI
    return { id: ref.id, ...entry, createdAt: new Date() };
  },

  // Exclui uma entrada específica do diário do projeto
  async deleteEntry(projectId, entryId) {
    if (!entryId) throw new Error('entryId é obrigatório para exclusão.');
    await deleteDoc(doc(db, 'projetos', projectId, 'diary', entryId));
    return true;
  },

  // Migra observações antigas (se estavam inline no doc do projeto)
  async migrateInlineIfNeeded(projectId, inlineEntries = []) {
    if (!Array.isArray(inlineEntries) || inlineEntries.length === 0) return 0;

    // já existe algo na subcoleção?
    const existing = await getDocs(diaryCol(projectId));
    if (!existing.empty) return 0;

    const batch = writeBatch(db);
    for (const it of inlineEntries) {
      const payload = {
        authorId: it.authorId || it.userId || '',
        authorName: it.authorName || it.nome || it.userName || 'Usuário',
        authorRole: it.authorRole || it.funcao || '',
        text: it.text || it.obs || it.observacao || it.observação || '',
        driveLink: it.driveLink || it.link || '',
        createdAt: serverTimestamp(),
      };
      const newRef = doc(diaryCol(projectId));
      batch.set(newRef, payload);
    }
    await batch.commit();
    return inlineEntries.length;
  },

  // ================== NOVO: FEED GLOBAL ==================

  /**
   * Espelha uma entrada no feed global (/diary_feed)
   */
  async mirrorToFeed({
    projectId,
    projectName,
    authorId,
    authorName,
    authorRole = null,
    text,
    area = null,
    atribuidoA = null,
    linkUrl = null,
    attachments = [],
    extra = {},
  }) {
    if (!projectId || !text) throw new Error('projectId e text são obrigatórios para o feed');

    const payload = {
      projectId,
      projectName: projectName || '',
      projectNameLower: toLower(projectName),
      authorId: authorId || '',
      authorName: authorName || 'Usuário',
      authorRole,
      text,
      area,
      atribuidoA,
      linkUrl,
      attachments,
      createdAt: serverTimestamp(),
      ...extra,
    };

    await addDoc(feedCol(), payload);
    return true;
  },

  /**
   * Cria no diário do projeto E espelha no feed global.
   */
  async addEntryWithFeed(projectId, entry, { projectName = null } = {}) {
    if (!projectId || !entry?.text) {
      throw new Error('projectId e entry.text são obrigatórios');
    }

    // 1) grava na subcoleção do projeto (compatível com telas antigas)
    const created = await this.addEntry(projectId, entry);

    // 2) tenta resolver o nome do projeto se não foi passado
    let effectiveProjectName = projectName;
    if (!effectiveProjectName) {
      const pSnap = await getDoc(doc(db, 'projetos', projectId));
      if (pSnap.exists()) {
        const pd = pSnap.data() || {};
        effectiveProjectName = pd.nome || pd.name || pd.projectName || projectId;
      } else {
        effectiveProjectName = projectId;
      }
    }

    // 3) espelha no feed
    await this.mirrorToFeed({
      projectId,
      projectName: effectiveProjectName,
      authorId: entry.authorId,
      authorName: entry.authorName,
      authorRole: entry.authorRole,
      text: entry.text,
      area: entry.area || null,
      atribuidoA: entry.atribuidoA || null,
      linkUrl: entry.linkUrl || entry.driveLink || null,
      attachments: entry.attachments || [],
    });

    return created;
  },

  /**
   * Feed recente com paginação e filtros (area, atribuidoA)
   */
  async fetchFeedRecent({ pageSize = 20, cursor = null, filters = {} } = {}) {
    let qBase = query(feedCol(), orderBy('createdAt', 'desc'), limit(pageSize));

    // filtros opcionais (exigem índices compostos se usados MUITO)
    if (filters?.area) {
      qBase = query(feedCol(), where('area', '==', filters.area), orderBy('createdAt', 'desc'), limit(pageSize));
    }
    if (filters?.atribuidoA) {
      qBase = query(feedCol(), where('atribuidoA', '==', filters.atribuidoA), orderBy('createdAt', 'desc'), limit(pageSize));
    }

    // paginação
    if (cursor) {
      qBase = query(feedCol(), orderBy('createdAt', 'desc'), startAfter(cursor), limit(pageSize));
    }

    const snap = await getDocs(qBase);
    const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const nextCursor = snap.docs.length ? snap.docs[snap.docs.length - 1] : null;

    return { items, nextCursor };
  },

  /**
   * Busca por nome de projeto (prefix match case-insensitive)
   */
  async searchFeedByProjectName({ term = '', pageSize = 50 } = {}) {
    const normalized = toLower(term);
    if (!normalized) return { items: [], nextCursor: null };

    // Busca por faixa em projectNameLower
    const qBase = query(
      feedCol(),
      orderBy('projectNameLower'),
      startAt(normalized),
      endAt(normalized + '\uf8ff'),
      limit(pageSize)
    );

    const snap = await getDocs(qBase);
    let items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

    // Ordena por data desc localmente (evita índice composto agora)
    items.sort((a, b) => {
      const aSec = a.createdAt?.seconds || a.createdAt?._seconds || 0;
      const bSec = b.createdAt?.seconds || b.createdAt?._seconds || 0;
      return bSec - aSec;
    });

    return { items, nextCursor: null };
  },

  /**
   * Lista feed por projeto específico
   */
  async fetchFeedByProject({ projectId, pageSize = 50, cursor = null } = {}) {
    if (!projectId) throw new Error('projectId é obrigatório');

    let qBase = query(
      feedCol(),
      where('projectId', '==', projectId),
      orderBy('createdAt', 'desc'),
      limit(pageSize)
    );

    if (cursor) {
      qBase = query(
        feedCol(),
        where('projectId', '==', projectId),
        orderBy('createdAt', 'desc'),
        startAfter(cursor),
        limit(pageSize)
      );
    }

    const snap = await getDocs(qBase);
    const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const nextCursor = snap.docs.length ? snap.docs[snap.docs.length - 1] : null;

    return { items, nextCursor };
  },
};
