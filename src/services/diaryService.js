// src/services/diaryService.js
// Mantém compatibilidade com o serviço existente e adiciona:
// - addEntryWithFeed (grava no diário do projeto E no feed global)
// - mirrorToFeed (espelhamento)
// - fetchFeedRecent / searchFeedByProjectName / fetchFeedByProject (consultas do feed)
// O feed pode ficar em: companies/{companyId}/diary_feed (se companyId for passado)
// ou, se você ainda não usa multiempresa, em: /diary_feed (raiz)

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
} from 'firebase/firestore';
import { db } from './firebase'; // ajuste o caminho se seu arquivo firebase estiver em outro lugar

// ------------------------------
// Utilidades de caminho
// ------------------------------
const diaryCol = (projectId) => collection(db, 'projects', projectId, 'diary');

// Feed: se companyId vier, usa companies/{companyId}/diary_feed.
// Caso contrário, usa uma coleção raiz /diary_feed (compatível com seu estado atual).
const feedCol = (companyId) =>
  companyId
    ? collection(db, 'companies', companyId, 'diary_feed')
    : collection(db, 'diary_feed');

// ------------------------------
// Normalização
// ------------------------------
const toLower = (s) => (s || '').toString().trim().toLowerCase();

// ------------------------------
// Serviço (mantém API anterior e adiciona novas funções)
// ------------------------------
export const diaryService = {
  // === EXISTENTES (mantidos) ===

  // Lê as entradas do diário (mais recentes primeiro)
  async getEntries(projectId) {
    const q = query(diaryCol(projectId), orderBy('createdAt', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  },

  // Cria uma entrada no diário (usa serverTimestamp)
  async addEntry(projectId, entry) {
    const ref = await addDoc(diaryCol(projectId), {
      ...entry,
      createdAt: serverTimestamp(),
    });
    // Retorna algo imediato com createdAt local para já aparecer na UI
    return { id: ref.id, ...entry, createdAt: new Date() };
  },

  // Exclui UMA entrada (individual)
  async deleteEntry(projectId, entryId) {
    if (!entryId) throw new Error('entryId é obrigatório para exclusão.');
    await deleteDoc(doc(db, 'projects', projectId, 'diary', entryId));
    return true;
  },

  // Migra observações antigas (ex.: armazenadas dentro do doc do projeto)
  // Só executa se a subcoleção ainda estiver vazia.
  async migrateInlineIfNeeded(projectId, inlineEntries = []) {
    if (!Array.isArray(inlineEntries) || inlineEntries.length === 0) return 0;

    // Verifica se já existe algo na subcoleção
    const existing = await getDocs(diaryCol(projectId));
    if (!existing.empty) return 0;

    const batch = writeBatch(db);
    for (const it of inlineEntries) {
      // valores padrão + campos mais comuns
      const payload = {
        authorId: it.authorId || it.userId || '',
        authorName: it.authorName || it.nome || it.userName || 'Usuário',
        authorRole: it.authorRole || it.funcao || '',
        text: it.text || it.obs || it.observacao || it.observação || '',
        driveLink: it.driveLink || it.link || '',
        createdAt: it.createdAt || serverTimestamp(),
      };
      const newRef = doc(diaryCol(projectId)); // gera ID
      batch.set(newRef, payload);
    }
    await batch.commit();
    return inlineEntries.length;
  },

  // === NOVAS FUNÇÕES (feed global) ===

  /**
   * Espelha uma entrada para o feed global.
   * Se companyId for informado, usa companies/{companyId}/diary_feed; senão usa /diary_feed.
   */
  async mirrorToFeed({
    companyId = null,
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
    extra = {}, // qualquer outro campo que queira incluir
  }) {
    if (!projectId || !text) throw new Error('projectId e text são obrigatórios para o feed');

    const payload = {
      companyId: companyId || null,
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

    await addDoc(feedCol(companyId), payload);
    return true;
  },

  /**
   * Cria a entrada no diário do projeto E espelha no feed global.
   *
   * @param {string} projectId
   * @param {object} entry - { text, area?, atribuidoA?, linkUrl?/driveLink?, attachments?, authorId, authorName, authorRole }
   * @param {object} options - { companyId?: string|null, projectName?: string|null }
   */
  async addEntryWithFeed(projectId, entry, options = {}) {
    const { companyId = null, projectName = null } = options;

    if (!projectId || !entry?.text) {
      throw new Error('projectId e entry.text são obrigatórios');
    }

    // 1) Grava na subcoleção do projeto (compatibilidade)
    const created = await this.addEntry(projectId, entry);

    // 2) Garante projectName (se não veio, tenta buscar do projeto)
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

    // 3) Espelha no feed
    await this.mirrorToFeed({
      companyId,
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
      extra: {}, // se quiser carimbar mais dados
    });

    return created;
  },

  /**
   * Lista o feed recente com paginação.
   * Filtros aceitos: { area?: string, atribuidoA?: string }
   * Obs.: pode exigir índices compostos (companyId+createdAt, area/atribuidoA+createdAt).
   */
  async fetchFeedRecent({ companyId = null, pageSize = 20, cursor = null, filters = {} } = {}) {
    let qBase = query(
      feedCol(companyId),
      orderBy('createdAt', 'desc'),
      limit(pageSize)
    );

    // Se multiempresa, é recomendável filtrar por companyId (quando armazenado)
    if (companyId) {
      qBase = query(feedCol(companyId), orderBy('createdAt', 'desc'), limit(pageSize));
      // companyId é implícito no caminho quando usamos companies/{companyId}/diary_feed
      // Se você optou por guardar também o campo companyId dentro do doc, pode adicionar:
      // qBase = query(feedCol(companyId), where('companyId','==',companyId), orderBy('createdAt','desc'), limit(pageSize));
    }

    // Filtros opcionais
    if (filters?.area) {
      // Para combinar com createdAt, pode precisar de índice composto
      qBase = query(feedCol(companyId), where('area', '==', filters.area), orderBy('createdAt', 'desc'), limit(pageSize));
    }
    if (filters?.atribuidoA) {
      qBase = query(feedCol(companyId), where('atribuidoA', '==', filters.atribuidoA), orderBy('createdAt', 'desc'), limit(pageSize));
    }

    // Paginação por cursor
    if (cursor) {
      qBase = query(feedCol(companyId), orderBy('createdAt', 'desc'), startAfter(cursor), limit(pageSize));
    }

    const snap = await getDocs(qBase);
    const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const nextCursor = snap.docs.length ? snap.docs[snap.docs.length - 1] : null;

    return { items, nextCursor };
  },

  /**
   * Busca por nome do projeto (prefix match, case-insensitive).
   * Requer que o doc no feed tenha 'projectNameLower'.
   * Pode exigir índice composto (projectNameLower + createdAt).
   */
  async searchFeedByProjectName({ companyId = null, term = '', pageSize = 50, cursor = null } = {}) {
    const normalized = toLower(term);
    if (!normalized) return { items: [], nextCursor: null };

    // Para prefix match correto sem filtrar muito na aplicação, usamos range em projectNameLower.
    // (companyId fica implícito no caminho quando usamos companies/{companyId}/diary_feed)
    let qBase = query(
      feedCol(companyId),
      orderBy('projectNameLower'),
      startAt(normalized),
      endAt(normalized + '\uf8ff'),
      limit(pageSize)
    );

    // Se quiser ordenar por data também, precisará de índice composto; você pode ordenar localmente após o fetch.
    const snap = await getDocs(qBase);
    let items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

    // Ordena por createdAt desc localmente (caso não tenha índice para ordenar por data no servidor)
    items.sort((a, b) => {
      const aSec = a.createdAt?.seconds || a.createdAt?._seconds || 0;
      const bSec = b.createdAt?.seconds || b.createdAt?._seconds || 0;
      return bSec - aSec;
    });

    // Paginação baseada em nome (se quiser avançar usando último nome)
    const nextCursor = null; // manter simples; se precisar, podemos implementar paginação por nome

    return { items, nextCursor };
  },

  /**
   * Lista o feed filtrando por um projeto específico.
   */
  async fetchFeedByProject({ companyId = null, projectId, pageSize = 50, cursor = null } = {}) {
    if (!projectId) throw new Error('projectId é obrigatório');

    let qBase = query(
      feedCol(companyId),
      where('projectId', '==', projectId),
      orderBy('createdAt', 'desc'),
      limit(pageSize)
    );

    if (cursor) {
      qBase = query(
        feedCol(companyId),
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
