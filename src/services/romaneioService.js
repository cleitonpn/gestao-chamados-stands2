// src/services/romaneioService.js
import { db } from "../config/firebase";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import * as XLSX from "xlsx";

const COL = "romaneios";
const LINKS_COL = "romaneio_links";

export const romaneioService = {
  listenAll(cb) {
    const q = query(collection(db, COL), orderBy("createdAt", "desc"));
    return onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      cb(list);
    });
  },

  async create(payload) {
    const data = {
      ...payload,
      createdAt: serverTimestamp(),
      status: payload.status || "ativo",
    };
    await addDoc(collection(db, COL), data);
  },

  async registrarSaida(id) {
    const ref = doc(db, COL, id);
    await updateDoc(ref, {
      departedAt: serverTimestamp(),
      status: "em_transito",
    });
  },

  async marcarEntregue(id) {
    const ref = doc(db, COL, id);
    await updateDoc(ref, {
      deliveredAt: serverTimestamp(),
      status: "entregue",
    });
  },

  async ensureDriverToken(id) {
    const ref = doc(db, COL, id);
    const snap = await getDoc(ref);
    const exists = snap.exists() ? snap.data() : null;
    if (exists?.driverLinkToken) return exists.driverLinkToken;

    const tokenRef = doc(collection(db, LINKS_COL));
    await setDoc(tokenRef, {
      romaneioId: id,
      createdAt: serverTimestamp(),
    });
    await updateDoc(ref, { driverLinkToken: tokenRef.id });
    return tokenRef.id;
  },

  async exportExcel() {
    const q = query(collection(db, COL), orderBy("createdAt", "desc"));
    const snap = await getDocs(q);
    const rows = snap.docs.map((d) => {
      const r = d.data();
      const toDate = (ts) =>
        !ts ? "" : ts?.toDate ? ts.toDate() : ts?.seconds ? new Date(ts.seconds * 1000) : "";
      const fmt = (dt) =>
        dt instanceof Date && !isNaN(dt) ? dt.toLocaleString("pt-BR") : "";

      return {
        ID: d.id,
        Evento: r.eventoNome || r.eventoId || "",
        "Projetos (qtd)": Array.isArray(r.projetoIds)
          ? r.projetoIds.length
          : r.projetoIds === "ALL"
          ? "Todos"
          : 0,
        Motivo: r.motivo || "",
        Setores: (r.setoresResp || []).join(", "),
        Veículo: r.tipoVeiculo || "",
        Placa: r.placa || "",
        Fornecedor: r.fornecedor || "",
        "Data Saída": r.dataSaidaDate || "",
        "Criado em": fmt(toDate(r.createdAt)),
        "Saiu em": fmt(toDate(r.departedAt)),
        "Entregue em": fmt(toDate(r.deliveredAt)),
        Status: r.status || "",
        "Itens (qtd)": (r.itens || []).length,
      };
    });

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Romaneios");
    XLSX.writeFile(wb, `romaneios_${new Date().toISOString().slice(0,10)}.xlsx`);
  },
};

export default romaneioService;
