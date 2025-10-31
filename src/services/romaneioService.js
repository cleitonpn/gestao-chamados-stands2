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
  where,
  limit,
} from "firebase/firestore";

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

  listenAll(callback) {
    const colRef = collection(db, COL);
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

  async registrarSaida(id) {
    const ref = doc(db, COL, id);
    await updateDoc(ref, { departedAt: serverTimestamp() });
  },

  async marcarEntregue(id) {
    const ref = doc(db, COL, id);
    await updateDoc(ref, {
      status: "entregue",
      deliveredAt: serverTimestamp(),
    });
  },

  async ensureDriverToken(id) {
    // se já existir, retorna
    try {
      const colRef = collection(db, COL);
      const snap = await getDocs(query(colRef, where("__name__", "==", id)));
      if (!snap.empty) {
        const docData = snap.docs[0];
        const data = docData.data() || {};
        if (data.driverLinkToken) return data.driverLinkToken;
      }
    } catch {}

    // cria token e salva
    const token = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
    const ref = doc(db, COL, id);
    await updateDoc(ref, {
      driverLinkToken: token,
      driverLinkCreatedAt: serverTimestamp(),
    });
    return token;
  },

  async getByDriverToken(token) {
    const colRef = collection(db, COL);
    const snap = await getDocs(query(colRef, where("driverLinkToken", "==", token), limit(1)));
    if (snap.empty) return null;
    return mapSnap(snap.docs[0]);
  },

  async marcarEntregueByToken(token) {
    const colRef = collection(db, COL);
    const snap = await getDocs(query(colRef, where("driverLinkToken", "==", token), limit(1)));
    if (snap.empty) return false;
    const ref = doc(db, COL, snap.docs[0].id);
    await updateDoc(ref, { status: "entregue", deliveredAt: serverTimestamp() });
    return true;
  },

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
