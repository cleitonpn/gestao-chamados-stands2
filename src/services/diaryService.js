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

// -------- helpers --------
const toLower = (s) => (s || '').toString().trim().toLowerCase();
const asDate = (v) => {
  if (!v) return null;
  if (v instanceof Date) return v;
  if (typeof v === 'string' || typeof v === 'number') {
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof v === 'object' && (v.seconds || v._seconds)) {
    const s = v.seconds ?? v._seconds;
    return new Date(s * 1000);
  }
  return null;
};
// troca undefined -> null (Firestore não aceita undefined)
const sanitize = (obj) =>
  Object.fromEntries(
    Object.entries(obj || {}).map(([k, v]) => [k, v === undefined ? null : v])
  );

// subcoleção do diário
const diaryCol = (projectId) => collection(db, 'projetos', projectId, 'diary');
// feed global
const feedCol = () => collection(db, 'diary_feed');

export const diaryService = {
  // ======= compat com telas antigas =======
  async getEntries(projectId) {
    const q = query(diaryCol(projectId), orderBy('createdAt', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  },

  async addEntry(projectId, entry) {
    // evita undefined no Firestore
    const payload = sanitize({
      ...entry,
      createdAt: serverTimestamp(),
    });
    const ref = await addDoc(diaryCol(projectId), payload);
    return { id: ref.id, ...payload };
  },

  async deleteEntry(projectId, entryId) {
    if (!entryId) throw new Error('entryId é obrigatório para exclusão.');
    await deleteDoc(doc(db, 'projetos', projectId, 'diary', entryId));
    return true;
  },

  async migrateInlineIfNeeded(projectId, inlineEntries = []) {
    if (!Array.isArray(inlineEntries) || inlineEntries.length === 0) return 0;
    const existing = await getDocs(diaryCol(projectId));
    if (!existing.empty) return 0;

    const batch = writeBatch(db);
    for (const it of inlineEntries) {
      const payload = sanitize({
        authorId: it.authorId || it.userId || null,
        authorName: it.authorName || it.nome || it.userName || 'Usuário',
        authorRole: it.authorRole || it.funcao || null,
        text: it.text || it.obs || it.observacao || it.observação || '',
        driveLink: it.driveLink || it.link || null,
        createdAt: serverTimestamp(),
      });
      const newRef = doc(diaryCol(projectId));
      batch.set(newRef, payload);
    }
    await batch.commit();
    return inlineEntries.length;
  },

  // ======= feed =======
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

    const payload = sanitize({
      projectId,
      projectName: projectName || '',
      projectNameLower: toLower(projectName),
      authorId: authorId || null, // NUNCA undefined
      authorName: authorName || 'Usuário',
      authorRole,
      text,
      area,
      atribuidoA,
      linkUrl,
      attachments,
      createdAt,
      ...extra,
    });

    await addDoc(feedCol(), payload);
    return true;
  },

  async addEntryWithFeed(projectId, entry, { projectName = null } = {}) {
    if (!projectId || !entry?.text) throw new Error('projectId e entry.text são obrigatórios');

    // 1) salva no projeto
    const created = await this.addEntry(projectId, {
      authorId: entry.authorId ?? null,           // garante não-undefined
      authorName: entry.authorName ?? 'Usuário',
      authorRole: entry.authorRole ?? null,
      text: entry.text,
      area: entry.area ?? null,
      atribuidoA: entry.atribuidoA ?? null,
      linkUrl: entry.linkUrl ?? entry.driveLink ?? null,
      attachments: Array.isArray(entry.attachments) ? entry.attachments : [],
    });

    // 2) resolve nome do projeto
    let effectiveProjectName = projectName;
    if (!effectiveProjectName) {
      const pSnap = await getDoc(doc(db, 'projetos', projectId));
      const pd = pSnap.exists() ? (pSnap.data() || {}) : {};
      effectiveProjectName = pd.nome || pd.name || pd.projectName || projectId;
    }

    // 3) espelha no feed (regras exigem authorId == uid do usuário)
    await this.mirrorToFeed({
      projectId,
      projectName: effectiveProjectName,
      authorId: entry.authorId ?? null,
      authorName: entry.authorName ?? 'Usuário',
      authorRole: entry.authorRole ?? null,
      text: entry.text,
      area: entry.area ?? null,
      atribuidoA: entry.atribuidoA ?? null,
      linkUrl: entry.linkUrl ?? entry.driveLink ?? null,
      attachments: Array.isArray(entry.attachments) ? entry.attachments : [],
    });

    return created;
  },

  async fetchFeedRecent({ pageSize = 20, cursor = null, filters = {} } = {}) {
    let qBase = query(feedCol(), orderBy('createdAt', 'desc'), limit(pageSize));
    if (filters?.area) {
      qBase = query(feedCol(), where('area', '==', filters.area), orderBy('createdAt', 'desc'), limit(pageSize));
    }
    if (filters?.atribuidoA) {
      qBase = query(feedCol(), where('atribuidoA', '==', filters.atribuidoA), orderBy('createdAt', 'desc'), limit(pageSize));
    }
    if (cursor) {
      qBase = query(feedCol(), orderBy('createdAt', 'desc'), startAfter(cursor), limit(pageSize));
    }
    const snap = await getDocs(qBase);
    const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const nextCursor = snap.docs.length ? snap.docs[snap.docs.length - 1] : null;
    return { items, nextCursor };
  },

  async searchFeedByProjectName({ term = '', pageSize = 50 } = {}) {
    const normalized = toLower(term);
    if (!normalized) return { items: [], nextCursor: null };

    const qBase = query(
      feedCol(),
      orderBy('projectNameLower'),
      startAt(normalized),
      endAt(normalized + '\uf8ff'),
      limit(pageSize)
    );
    const snap = await getDocs(qBase);
    let items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    items.sort((a, b) => {
      const aSec = a.createdAt?.seconds || a.createdAt?._seconds || 0;
      const bSec = b.createdAt?.seconds || b.createdAt?._seconds || 0;
      return bSec - aSec;
    });
    return { items, nextCursor: null };
  },

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

  // ======= backfill =======
  async backfillInlineDiariesToFeedOnce(currentUser, { useCurrentUserAsAuthor = true } = {}) {
    const projsSnap = await getDocs(collection(db, 'projetos'));
    let count = 0;

    for (const proj of projsSnap.docs) {
      const data = proj.data() || {};
      const projectId = proj.id;
      const projectName = data.nome || data.name || data.projectName || projectId;
      const antigos = Array.isArray(data.diario) ? data.diario : [];

      for (const it of antigos) {
        const originalAuthorId = it.authorId || it.userId || null;
        const originalAuthorName = it.authorName || it.nome || it.userName || 'Usuário';
        const createdAtOriginal = asDate(it.createdAt);

        const authorIdToWrite = useCurrentUserAsAuthor
          ? (currentUser?.uid || originalAuthorId || null)
          : (originalAuthorId || currentUser?.uid || null);

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
          attachments: Array.isArray(it.attachments) ? it.attachments : [],
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
