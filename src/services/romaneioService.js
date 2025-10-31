// src/services/romaneioService.js
import {
  addDoc,
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { db } from "../config/firebase";

// util simples
const nowTs = () => serverTimestamp();

// gera token curto e legível
const genToken = () =>
  Math.random().toString(36).slice(2, 10) +
  Math.random().toString(36).slice(2, 10);

/**
 * Service de Romaneios (Logística)
 * - named export e default export (para evitar problemas de bundling)
 */
export const romaneioService = {
  /**
   * Cria um novo romaneio
   * payload esperado:
   * {
   *   eventoId, eventoNome,
   *   projetoIds: string[] | "ALL",
   *   motivo, setoresResp: string[],
   *   tipoVeiculo, fornecedor, placa,
   *   dataSaidaDate: "YYYY-MM-DD",
   *   tiposDeItens: string[], itens: string[],
   *   vincularChamadoId: string|null,
   *   status: "ativo"
   * }
   */
  async create(payload) {
    const col = collection(db, "romaneios");
    await addDoc(col, {
      ...payload,
      createdAt: nowTs(),
      lastModified: nowTs(),
      departedAt: null, // ainda não saiu
      deliveredAt: null,
      status: payload?.status || "ativo",
    });
  },

  /**
   * Observa todos os romaneios (ordenados pela criação desc)
   */
  listenAll(cb) {
    const q = query(collection(db, "romaneios"), orderBy("createdAt", "desc"));
    return onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      cb(list);
    });
  },

  /**
   * Carimba a saída (em trânsito)
   */
  async registrarSaida(romaneioId) {
    const ref = doc(db, "romaneios", romaneioId);
    await updateDoc(ref, {
      departedAt: nowTs(),
      status: "em_transito",
      lastModified: nowTs(),
    });
  },

  /**
   * Marca como entregue
   */
  async marcarEntregue(romaneioId) {
    const ref = doc(db, "romaneios", romaneioId);
    await updateDoc(ref, {
      deliveredAt: nowTs(),
      status: "entregue",
      lastModified: nowTs(),
    });
  },

  /**
   * Garante um token público para o motorista acessar o romaneio
   * - tabela auxiliar: romaneio_links/{token} => { romaneioId }
   * - também salva no documento do romaneio para reuso
   */
  async ensureDriverToken(romaneioId) {
    const ref = doc(db, "romaneios", romaneioId);
    const snap = await getDoc(ref);
    if (!snap.exists()) throw new Error("Romaneio não encontrado");

    const data = snap.data();
    if (data?.driverLinkToken) return data.driverLinkToken;

    const token = genToken();
    const linkRef = doc(db, "romaneio_links", token);
    await setDoc(linkRef, {
      romaneioId,
      createdAt: nowTs(),
    });

    await updateDoc(ref, {
      driverLinkToken: token,
      lastModified: nowTs(),
    });

    return token;
  },

  /**
   * Exporta CSV simples com os principais campos
   */
  async exportExcel() {
    // usa on-demand leitura única da coleção
    return new Promise((resolve, reject) => {
      const unsubscribe = this.listenAll(async (list) => {
        try {
          unsubscribe?.();
        } catch (_) {}

        const header = [
          "id",
          "evento",
          "dataSaida",
          "status",
          "departedAt",
          "deliveredAt",
          "veiculo",
          "placa",
          "fornecedor",
          "motivo",
          "qtdProjetos",
          "qtdItens",
        ];
        const rows = list.map((r) => [
          r.id,
          r.eventoNome || r.eventoId || "",
          r.dataSaidaDate || "",
          r.status || "",
          r.departedAt?.seconds ? new Date(r.departedAt.seconds * 1000).toISOString() : "",
          r.deliveredAt?.seconds ? new Date(r.deliveredAt.seconds * 1000).toISOString() : "",
          r.tipoVeiculo || "",
          r.placa || "",
          r.fornecedor || "",
          r.motivo || "",
          Array.isArray(r.projetoIds) ? r.projetoIds.length : r.projetoIds === "ALL" ? "ALL" : "0",
          Array.isArray(r.itens) ? r.itens.length : "0",
        ]);

        const csv = [header, ...rows]
          .map((arr) =>
            arr
              .map((v) => {
                const s = String(v ?? "");
                return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
              })
              .join(";")
          )
          .join("\n");

        const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `romaneios_${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        resolve();
      });
    });
  },
};

export default romaneioService;
