import {
  collection,
  doc,
  addDoc,
  getDocs,
  getDoc,
  deleteDoc,
  orderBy,
  query,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore';
import { db } from './firebase'; // ajuste o caminho se seu arquivo firebase estiver em outro lugar

const diaryCol = (projectId) => collection(db, 'projects', projectId, 'diary');

export const diaryService = {
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
};
