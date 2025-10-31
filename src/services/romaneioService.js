// src/services/romaneioService.js
import { db } from "../config/firebase";
import {
  addDoc,
  collection,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";

// Coleção padrão
const COL = "romaneios";

function mapSnap(docSnap) {
  const d = docSnap.data() || {};
  return { id: docSnap.id, ...d };
}

export const romaneioService = {
  async create(payload) {
    const data = {
      ...payload,
      createdAt: serverTimestamp(),
    };
    const colRef = collection(db, COL);
    await addDoc(colRef, data);
  },

  // listener de todos os romaneios (sem filtro no server)
  listenAll(callback) {
    const colRef = collection(db, COL);
    // ordenar por createdAt quando disponível; se não houver, o onSnapshot retorna sem ordenação garantida
    let q = query(colRef);
    try {
      q = query(colRef, orderBy("createdAt", "desc"));
    } catch (_) {}
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map(mapSnap);
        callback(list);
      },
      (err) => {
        console.error("[romaneioService.listenAll] onSnapshot error:", err);
      }
    );
    return unsub;
  },

  async listOnce() {
    const snap = await getDocs(collection(db, COL));
    return snap.docs.map(mapSnap);
  },

  async marcarEntregue(id) {
    const ref = doc(db, COL, id);
    await updateDoc(ref, {
      status: "entregue",
      deliveredAt: serverTimestamp(),
    });
  },

  // Export simples para XLSX (precisa do pacote xlsx no projeto)
  async exportExcel() {
    try {
      const rows = await this.listOnce();
      const { utils, writeFile } = await import("xlsx");
      const sheet = utils.json_to_sheet(rows);
      const wb = utils.book_new();
      utils.book_append_sheet(wb, sheet, "Romaneios");
      writeFile(wb, "romaneios.xlsx");
    } catch (e) {
      console.error("[romaneioService.exportExcel] erro:", e);
      throw e;
    }
  },
};
