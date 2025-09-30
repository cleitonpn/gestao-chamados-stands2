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
  Timestamp,
} from 'firebase/firestore';
import { db } from '../config/firebase';

// ---------------- helpers ----------------
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
const sanitize = (obj) =>
  Object.fromEntries(Object.entries(obj || {}).map(([k, v]) => [k, v === undefined ? null : v]));

// ---------------- paths ----------------
const diaryCol = (projectId) => collection(db, 'projetos', projectId, 'diary');
const feedCol  = () => collection(db, 'diary_feed');

export const diaryService = {
  // ===== subcoleção do projeto =====
  async getEntries(projectId) {
    const q = query(diaryCol(projectId), orderBy('createdAt', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  },

  async addEntry(projectId, entry) {
    const payload = sanitize({ ...entry, createdAt: serverTimestamp() });
    const ref = await addDoc(diaryCol(projectId), payload);
    return { id: ref.id, ...payload };
  },

  async deleteEntry(projectId, entryId) {
    await deleteDoc(doc(db, 'projetos', projectId, 'diary', entryId));
    return true;
  },

  // ===== feed global =====
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
    sourceDiaryId = null, // << id da subcoleção (para deletar sincronizado)
    extra = {},
  }) {
    if (!projectId || !text) throw new Error('projectId e text são obrigatórios');

    const createdAtDate = asDate(createdAtOverride);
    const createdAt = createdAtDate ? Timestamp.fromDate(createdAtDate) : serverTimestamp();

    const payload = sanitize({
      projectId,
      projectName: projectName || '',
      projectNameLower: toLower(projectName),
      authorId: authorId || null,
      authorName: authorName || 'Usuário',
      authorRole,
      text,
      area,
      atribuidoA,
      linkUrl,
      attachments,
      createdAt,
      sourceDiaryId, // << guarda vínculo com subcoleção
      ...extra,
    });

    await addDoc(feedCol(), payload);
    return true;
  },

  async addEntryWithFeed(projectId, entry, { projectName = null } = {}) {
    if (!projectId || !entry?.text) throw new Error('projectId e entry.text são obrigatórios');

    // 1) cria na subcoleção do projeto
    const created = await this.addEntry(projectId, {
      authorId: entry.authorId ?? null,
      authorName: entry.authorName ?? 'Usuário',
      authorRole: entry.authorRole ?? null,
      text: entry.text,
      area: entry.area ?? null,
      atribuidoA: entry.atribuidoA ?? null,
      linkUrl: entry.linkUrl ?? entry.driveLink ?? null,
      attachments: Array.isArray(entry.attachments) ? entry.attachments : [],
    });

    // 2) resolve nome do projeto (caso não tenha vindo)
    let effectiveProjectName = projectName;
    if (!effectiveProjectName) {
      const pSnap = await getDoc(doc(db, 'projetos', projectId));
      const pd = pSnap.exists() ? (pSnap.data() || {}) : {};
      effectiveProjectName = pd.nome || pd.name || pd.projectName || projectId;
    }

    // 3) espelha no feed e registra o id da subcoleção
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
      sourceDiaryId: created.id, // << vínculo
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

  async fetchFeedByProject({ projectId, pageSize = 50, cursor = null } = {}) {
    let qBase = query(feedCol(), where('projectId', '==', projectId), orderBy('createdAt', 'desc'), limit(pageSize));
    if (cursor) {
      qBase = query(feedCol(), where('projectId', '==', projectId), orderBy('createdAt', 'desc'), startAfter(cursor), limit(pageSize));
    }
    const snap = await getDocs(qBase);
    const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const nextCursor = snap.docs.length ? snap.docs[snap.docs.length - 1] : null;
    return { items, nextCursor };
  },

  async searchFeedByProjectName({ term = '', pageSize = 50 } = {}) {
    const normalized = toLower(term);
    if (!normalized) return { items: [], nextCursor: null };
    const qBase = query(feedCol(), orderBy('projectNameLower'), startAt(normalized), endAt(normalized + '\uf8ff'), limit(pageSize));
    const snap = await getDocs(qBase);
    let items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    items.sort((a, b) => {
      const aSec = a.createdAt?.seconds || a.createdAt?._seconds || 0;
      const bSec = b.createdAt?.seconds || b.createdAt?._seconds || 0;
      return bSec - aSec;
    });
    return { items, nextCursor: null };
  },

  // ===== exclusões =====
  async deleteFeedEntry(feedId) {
    await deleteDoc(doc(db, 'diary_feed', feedId));
    return true;
  },

  async deleteFeedAndProject({ feedId, projectId, sourceDiaryId }) {
    // apaga do feed
    await this.deleteFeedEntry(feedId);
    // tenta apagar da subcoleção, se houver vínculo
    if (projectId && sourceDiaryId) {
      try {
        await this.deleteEntry(projectId, sourceDiaryId);
      } catch (_) {
        // ok se não existir (backfill antigo não tinha subcoleção)
      }
    }
    return true;
  },

  async deleteFeedEntriesBulk(feedItems /* array de {id, projectId, sourceDiaryId} */) {
    // chunk em lotes (~400) para evitar limites
    const chunkSize = 400;
    for (let i = 0; i < feedItems.length; i += chunkSize) {
      const slice = feedItems.slice(i, i + chunkSize);
      const batch = writeBatch(db);
      for (const it of slice) {
        batch.delete(doc(db, 'diary_feed', it.id));
        if (it.projectId && it.sourceDiaryId) {
          batch.delete(doc(db, 'projetos', it.projectId, 'diary', it.sourceDiaryId));
        }
      }
      await batch.commit();
    }
    return true;
  },

  async deleteAllByProject(projectId) {
    // apaga feed do projeto
    const snapFeed = await getDocs(query(feedCol(), where('projectId', '==', projectId)));
    const feedDocs = snapFeed.docs;

    // apaga subcoleção
    const snapDiary = await getDocs(diaryCol(projectId));
    const diaryDocs = snapDiary.docs;

    // chunk em lotes
    const docs = [
      ...feedDocs.map((d) => ({ type: 'feed', ref: d.ref })),
      ...diaryDocs.map((d) => ({ type: 'sub', ref: d.ref })),
    ];
    const chunkSize = 400;
    for (let i = 0; i < docs.length; i += chunkSize) {
      const slice = docs.slice(i, i + chunkSize);
      const batch = writeBatch(db);
      slice.forEach(({ ref }) => batch.delete(ref));
      await batch.commit();
    }
    return { feed: feedDocs.length, diary: diaryDocs.length };
  },

  // ===== backfill (permanece igual — apenas sem vínculo de subcoleção) =====
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
          sourceDiaryId: null, // backfill antigo não tem subcoleção vinculada
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
