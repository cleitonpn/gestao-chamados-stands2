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
  Timestamp,
} from 'firebase/firestore';

import { db } from '../config/firebase';

// ==============================
// Helpers
// ==============================
const toLower = (s) => (s || '').toString().trim().toLowerCase();
const asDate = (v) => {
  // tenta converter o createdAt antigo para Date
  // pode vir como string ISO, número (ms), ou objeto { seconds }
  if (!v) return null;
  if (v instanceof Date) return v;
  if (typeof v === 'string') {
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof v === 'number') {
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof v === 'object' && (v.seconds || v._seconds)) {
    const s = v.seconds ?? v._seconds;
    return new Date(s * 1000);
  }
  return null;
};

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

  // Migra observações antigas (se estavam inline no doc do projeto) para a subcoleção
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

  // ================== FEED GLOBAL ==================

  /**
   * Espelha uma entrada no feed global (/diary_feed)
   * @param {object} payload
   * @param {Date|number|string|null} [payload.createdAtOverride]  Data a fixar no feed (usado no backfill)
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
    createdAtOverride = null,
    extra = {},
  }) {
    if (!projectId || !text) throw new Error('projectId e text são obrigatórios para o feed');

    const createdAtDate = asDate(createdAtOverride);
    const createdAt = createdAtDate ? Timestamp.fromDate(createdAtDate) : serverTimestamp();

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
      createdAt,
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

    // 2) resolve o nome do projeto se não foi passado
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

    // filtros opcionais (exigem índices compostos se usados com orderBy)
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

  // ================== BACKFILL ==================

  /**
   * Copia diários antigos que estão dentro do documento do projeto
   * (campo `diario`, provavelmente um array) para o feed `/diary_feed`.
   *
   * @param {object} currentUser - usuário logado { uid, displayName, email }
   * @param {object} options
   * @param {boolean} [options.useCurrentUserAsAuthor=true]
   *        Se true, grava authorId = currentUser.uid (compatível com suas regras).
   *        O autor original fica em originalAuthorId / originalAuthorName.
   *        Se false, tenta usar o autor original (pode falhar nas regras).
   *
   * @returns {number} total inserido
   */
  async backfillInlineDiariesToFeedOnce(currentUser, { useCurrentUserAsAuthor = true } = {}) {
    const projsSnap = await getDocs(collection(db, 'projetos'));
    let count = 0;

    for (const proj of projsSnap.docs) {
      const data = proj.data() || {};
      const projectId = proj.id;
      const projectName = data.nome || data.name || data.projectName || projectId;

      const antigos = Array.isArray(data.diario) ? data.diario : [];
      for (const it of antigos) {
        const originalAuthorId = it.authorId || it.userId || '';
        const originalAuthorName = it.authorName || it.nome || it.userName || 'Usuário';
        const createdAtOriginal = asDate(it.createdAt);

        // Respeita as regras: por padrão usa o usuário atual como authorId
        const authorIdToWrite = useCurrentUserAsAuthor
          ? (currentUser?.uid || originalAuthorId)
          : (originalAuthorId || currentUser?.uid || '');

        const authorNameToWrite = useCurrentUserAsAuthor
          ? (currentUser?.displayName || currentUser?.email || originalAuthorName || 'Usuário')
          : (originalAuthorName || currentUser?.displayName || currentUser?.email || 'Usuário');

        await this.mirrorToFeed({
          projectId,
          projectName,
          authorId: authorIdToWrite,
          authorName: authorNameToWrite,
          authorRole: it.authorRole || it.funcao || null,
          text: it.text || it.obs || it.observacao || it.observação || '',
          area: it.area || null,
          atribuidoA: it.atribuidoA || null,
          linkUrl: it.linkUrl || it.driveLink || null,
          attachments: it.attachments || [],
          createdAtOverride: createdAtOriginal || null,
          extra: {
            originalAuthorId,
            originalAuthorName,
            createdAtOriginal: createdAtOriginal ? Timestamp.fromDate(createdAtOriginal) : null,
            backfilled: true,
          },
        });

        count++;
      }
    }

    return count;
  },
};
