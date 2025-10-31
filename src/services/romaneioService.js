// src/services/romaneioService.js
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
  where,
} from "firebase/firestore";
import { db } from "@/config/firebase";

const COL_ROMANEIOS = "romaneios";
const COL_LINKS = "romaneio_links";

function romaneiosRef() {
  return collection(db, COL_ROMANEIOS);
}
function linksRef() {
  return collection(db, COL_LINKS);
}

async function create(payload) {
  const data = {
    ...payload,
    createdAt: serverTimestamp(),
    status: payload?.status || "ativo", // padrão: ativo
  };
  const ref = await addDoc(romaneiosRef(), data);
  return ref.id;
}

function listenAll(cb) {
  const q = query(romaneiosRef(), orderBy("createdAt", "desc"));
  const unsub = onSnapshot(q, (snap) => {
    const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    cb(list);
  });
  return unsub;
}

async function registrarSaida(romaneioId) {
  const ref = doc(db, COL_ROMANEIOS, romaneioId);
  await updateDoc(ref, {
    departedAt: serverTimestamp(),
    status: "em_transito", // para colorir roxo/lilás
  });
}

async function marcarEntregue(romaneioId) {
  const ref = doc(db, COL_ROMANEIOS, romaneioId);
  await updateDoc(ref, {
    deliveredAt: serverTimestamp(),
    status: "entregue",
  });
}

/**
 * Garante um token público (ID) para o motorista acessar.
 * Usa ID automático do Firestore (sem nanoid).
 */
async function ensureDriverToken(romaneioId) {
  // Reutiliza se já existir
  const q = query(linksRef(), where("romaneioId", "==", romaneioId));
  const snap = await getDocs(q);
  if (!snap.empty) {
    return snap.docs[0].id; // token existente
  }

  // Cria novo token usando ID automático
  const linkDocRef = doc(linksRef()); // gera ID
  const token = linkDocRef.id;
  await setDoc(linkDocRef, {
    romaneioId,
    createdAt: serverTimestamp(),
  });
  return token;
}

/**
 * Busca romaneio via token do motorista.
 * 1) /romaneio_links/{token} => { romaneioId }
 * 2) /romaneios/{romaneioId}
 */
async function getByDriverToken(token) {
  if (!token) throw new Error("Token ausente.");
  const linkSnap = await getDoc(doc(db, COL_LINKS, token));
  if (!linkSnap.exists()) throw new Error("Link inválido ou expirado.");

  const { romaneioId } = linkSnap.data() || {};
  if (!romaneioId) throw new Error("Link inválido (sem romaneioId).");

  const romSnap = await getDoc(doc(db, COL_ROMANEIOS, romaneioId));
  if (!romSnap.exists()) throw new Error("Romaneio não encontrado.");

  return { id: romSnap.id, ...romSnap.data() };
}

/**
 * Exporta em Excel (.xlsx)
 * Necessário ter o pacote 'xlsx' instalado (pnpm add xlsx).
 */
async function exportExcel() {
  const rows = [];
  const snap = await getDocs(query(romaneiosRef(), orderBy("createdAt", "desc")));
  snap.forEach((d) => {
    const r = d.data();
    rows.push({
      ID: d.id,
      Evento: r.eventoNome || r.eventoId || "",
      "Projetos (qtd)": Array.isArray(r.projetoIds) ? r.projetoIds.length : "Todos",
      Motivo: r.motivo || "",
      Setores: (r.setoresResp || []).join(", "),
      Veiculo: r.tipoVeiculo || "",
      Placa: r.placa || "",
      Fornecedor: r.fornecedor || "",
      "Data saída (data)": r.dataSaidaDate || "",
      Status: r.status || "",
    });
  });

  const xlsx = await import("xlsx");
  const ws = xlsx.utils.json_to_sheet(rows);
  const wb = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(wb, ws, "Romaneios");
  const wbout = xlsx.write(wb, { bookType: "xlsx", type: "array" });

  const blob = new Blob([wbout], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `romaneios_${new Date().toISOString().slice(0, 10)}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}

export const romaneioService = {
  create,
  listenAll,
  registrarSaida,
  marcarEntregue,
  ensureDriverToken,
  getByDriverToken,
  exportExcel,
};
