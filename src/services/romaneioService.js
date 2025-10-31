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

// Se você já usa nanoid no projeto:
import { customAlphabet } from "nanoid/non-secure";
const nanoid = customAlphabet("abcdefghijklmnopqrstuvwxyz0123456789", 24);

const COL_ROMANEIOS = "romaneios";
const COL_LINKS = "romaneio_links";

function romaneiosRef() {
  return collection(db, COL_ROMANEIOS);
}
function linksRef() {
  return collection(db, COL_LINKS);
}

async function create(payload) {
  // createdAt + status padronizados
  const data = {
    ...payload,
    createdAt: serverTimestamp(),
    status: payload?.status || "ativo", // "ativo" até sair
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
    status: "em_transito", // para pintar “roxo/lilás”
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
 * Garante um token público para o motorista acessar (URL curta).
 * Se já existir token para esse romaneio, reaproveita.
 * Estrutura: /romaneio_links/{token} => { romaneioId, createdAt }
 */
async function ensureDriverToken(romaneioId) {
  // tenta reaproveitar (busca por romaneioId):
  const q = query(linksRef(), where("romaneioId", "==", romaneioId));
  const snap = await getDocs(q);
  if (!snap.empty) {
    const first = snap.docs[0];
    return first.id; // token
  }

  // cria novo token
  const token = nanoid();
  await setDoc(doc(db, COL_LINKS, token), {
    romaneioId,
    createdAt: serverTimestamp(),
  });
  return token;
}

/**
 * Lê o romaneio através do token do motorista.
 * Fluxo:
 *   1) /romaneio_links/{token} => { romaneioId }
 *   2) /romaneios/{romaneioId}
 */
async function getByDriverToken(token) {
  if (!token) throw new Error("Token ausente.");
  const linkSnap = await getDoc(doc(db, COL_LINKS, token));
  if (!linkSnap.exists()) {
    throw new Error("Link inválido ou expirado.");
  }
  const { romaneioId } = linkSnap.data() || {};
  if (!romaneioId) throw new Error("Link inválido (sem romaneioId).");

  const romSnap = await getDoc(doc(db, COL_ROMANEIOS, romaneioId));
  if (!romSnap.exists()) {
    throw new Error("Romaneio não encontrado.");
  }
  return { id: romSnap.id, ...romSnap.data() };
}

/**
 * Exporta para Excel (.xlsx) — requer 'xlsx' no projeto:
 *   pnpm add xlsx
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

  const xlsx = await import("xlsx"); // code-split se quiser
  const ws = xlsx.utils.json_to_sheet(rows);
  const wb = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(wb, ws, "Romaneios");
  const wbout = xlsx.write(wb, { bookType: "xlsx", type: "array" });

  const blob = new Blob([wbout], {
    type:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `romaneios_${new Date().toISOString().slice(0,10)}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}

export const romaneioService = {
  create,
  listenAll,
  registrarSaida,
  marcarEntregue,
  ensureDriverToken,
  getByDriverToken,      // <-- ESTE É O QUE A TELA DO MOTORISTA VAI USAR
  exportExcel,
};
