// src/services/romaneioService.js
import { db } from "../config/firebase";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  where,
  Timestamp,
  limit,
  serverTimestamp,
} from "firebase/firestore";

const COL = "romaneios";

export const romaneioService = {
  async create(payload) {
    const ref = await addDoc(collection(db, COL), {
      status: payload.status ?? "agendado",
      eventIds: payload.eventIds || [],
      eventNames: payload.eventNames || [],
      projectIds: payload.projectIds || [],
      projectNames: payload.projectNames || [],
      motivo: payload.motivo || "",
      setores: payload.setores || [],
      tipoVeiculo: payload.tipoVeiculo || "",
      fornecedor: payload.fornecedor || "",
      placa: payload.placa || "",
      dataSaida: payload.dataSaida ? Timestamp.fromDate(new Date(payload.dataSaida)) : null,
      tiposItens: payload.tiposItens || [],
      itens: payload.itens || [],
      ticketId: payload.ticketId || null,
      createdBy: payload.createdBy || null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return ref.id;
  },

  async getById(id) {
    const snap = await getDoc(doc(db, COL, id));
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
  },

  async setStatus(id, status) {
    await updateDoc(doc(db, COL, id), { status, updatedAt: serverTimestamp() });
  },

  async setDelivered(id) {
    await updateDoc(doc(db, COL, id), { status: "entregue", updatedAt: serverTimestamp() });
  },

  async linkTicket(id, ticketId) {
    await updateDoc(doc(db, COL, id), { ticketId, updatedAt: serverTimestamp() });
  },

  subscribeList({ eventId, statusArr, orderDesc = true, onlyRecent = true }, cb) {
    const cons = [collection(db, COL)];
    const wh = [];
    if (eventId) wh.push(where("eventIds", "array-contains", eventId));
    if (statusArr?.length) wh.push(where("status", "in", statusArr));
    const ord = orderBy("dataSaida", orderDesc ? "desc" : "asc");
    const lim = onlyRecent ? limit(200) : undefined;
    const q = query(...cons, ...wh, ord, ...(lim ? [lim] : []));
    return onSnapshot(q, (snap) => {
      const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      cb(rows);
    });
  },
};
