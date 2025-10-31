// src/services/romaneioService.js
// Serviço de Romaneios (Logística) – Firebase v9 modular
// — cria/edita romaneios, exporta CSV, gera token público,
//   registra saída, confirma entrega por token e busca projetos/chamados.

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
  where,
  updateDoc,
  serverTimestamp,
  limit,
  setDoc,
} from "firebase/firestore";

/* ============================
   Nomes das coleções (ajuste se necessário)
============================ */
const COL_ROMANEIOS = "romaneios";
const COL_LINKS = "romaneio_links";   // token público -> romaneioId
const COL_PROJETOS = "projetos";       // projetos vinculados a eventos
const COL_CHAMADOS = "chamados";       // chamados (para vincular no romaneio)

/* ============================
   Helpers
============================ */
function sanitizeArray(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.map((x) => (typeof x === "string" ? x.trim() : x)).filter(Boolean);
}
function randomToken() {
  return (
    Math.random().toString(36).slice(2) +
    Math.random().toString(36).slice(2) +
    Math.random().toString(36).slice(2)
  );
}

/* ============================
   API
============================ */
const romaneioService = {
  /**
   * Cria um romaneio.
   * @param {{
   *  eventId: string,
   *  eventName?: string,
   *  allProjects?: boolean,
   *  projectIds?: string[],
   *  motivo: 'montagem'|'apoio'|'extra'|'desmontagem'|'operacional',
   *  setoresResp?: string[],           // USET, SP GROUP, etc. (múltipla)
   *  veiculoTipo?: string,             // bau|carreta|hr|guincho|outros
   *  placa?: string,
   *  fornecedor?: 'interno'|'terceirizado',
   *  dataSaidaDate: string,            // 'YYYY-MM-DD' (somente data)
   *  tiposItens?: string[],            // marcenaria|tapeçaria|...
   *  itensEstruturados?: string[],     // linhas estruturadas
   *  linkedTicket?: { id: string, titulo?: string } | null
   * }} payload
   */
  async create(payload) {
    const now = serverTimestamp();

    const data = {
      // identificação
      eventId: payload.eventId || null,
      eventName: payload.eventName || null,

      // projetos
      allProjects: !!payload.allProjects,
      projectIds: sanitizeArray(payload.projectIds),

      // operação
      motivo: payload.motivo || null,
      setoresResp: sanitizeArray(payload.setoresResp),
      veiculoTipo: payload.veiculoTipo || null,
      placa: payload.placa || "",
      fornecedor: payload.fornecedor || "interno",

      // datas/horas
      dataSaidaDate: payload.dataSaidaDate || null, // somente data
      departedAt: null, // carimbo de saída (serverTimestamp)
      deliveredAt: null, // carimbo de entrega (serverTimestamp)

      // itens
      tiposItens: sanitizeArray(payload.tiposItens),
      itensEstruturados: sanitizeArray(payload.itensEstruturados),

      // vínculo de chamado opcional
      linkedTicket: payload.linkedTicket || null,

      // status
      status: "ativo", // 'ativo' | 'entregue' | 'arquivado'
      ativo: true,

      // housekeeping
      createdAt: now,
      updatedAt: now,

      // link público (preenchido via ensureDriverToken)
      driverLinkToken: null,
      driverLinkCreatedAt: null,
    };

    const ref = await addDoc(collection(db, COL_ROMANEIOS), data);
    return ref.id;
  },

  /**
   * Atualiza campos específicos do romaneio
   */
  async update(id, patch) {
    if (!id) throw new Error("romaneioService.update: id ausente.");
    const ref = doc(db, COL_ROMANEIOS, id);
    const data = { ...patch, updatedAt: serverTimestamp() };
    await updateDoc(ref, data);
  },

  /**
   * Marca como entregue (via app interno autenticado)
   */
  async marcarEntregue(id) {
    const ref = doc(db, COL_ROMANEIOS, id);
    await updateDoc(ref, {
      status: "entregue",
      deliveredAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  },

  /**
   * Registrar saída (carimbo de hora)
   */
  async registrarSaida(id) {
    const ref = doc(db, COL_ROMANEIOS, id);
    await updateDoc(ref, {
      departedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  },

  /**
   * Gera (ou garante) token público e cria o mapa romaneio_links/{token} → { romaneioId }
   * Retorna o token.
   */
  async ensureDriverToken(romaneioId) {
    if (!romaneioId) throw new Error("ensureDriverToken: romaneioId ausente.");

    const rRef = doc(db, COL_ROMANEIOS, romaneioId);
    const rSnap = await getDoc(rRef);
    if (!rSnap.exists()) throw new Error("Romaneio não encontrado.");

    const rData = rSnap.data();
    if (rData?.driverLinkToken) {
      // garante o mapa (idempotente)
      await setDoc(
        doc(db, COL_LINKS, rData.driverLinkToken),
        { romaneioId, createdAt: serverTimestamp() },
        { merge: true }
      );
      return rData.driverLinkToken;
    }

    const token = randomToken();

    await updateDoc(rRef, {
      driverLinkToken: token,
      driverLinkCreatedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    await setDoc(
      doc(db, COL_LINKS, token),
      { romaneioId, createdAt: serverTimestamp() },
      { merge: true }
    );

    return token;
  },

  /**
   * Lê romaneio por token (tela pública do motorista).
   * Requer regra permitindo GET quando existir driverLinkToken.
   */
  async getByDriverToken(token) {
    if (!token) return null;

    // 1) lê o mapa público
    const linkSnap = await getDoc(doc(db, COL_LINKS, token));
    if (!linkSnap.exists()) return null;
    const { romaneioId } = linkSnap.data() || {};
    if (!romaneioId) return null;

    // 2) lê o romaneio
    const romSnap = await getDoc(doc(db, COL_ROMANEIOS, romaneioId));
    return romSnap.exists() ? { id: romSnap.id, ...romSnap.data() } : null;
  },

  /**
   * Confirma entrega por token (público).
   * Regras devem permitir update limitado (status, deliveredAt e driverLinkToken)
   * e conferir que o token enviado confere com o salvo no documento.
   */
  async marcarEntregueByToken(token) {
    if (!token) throw new Error("Token ausente.");

    const linkSnap = await getDoc(doc(db, COL_LINKS, token));
    if (!linkSnap.exists()) return false;
    const { romaneioId } = linkSnap.data() || {};
    if (!romaneioId) return false;

    const rRef = doc(db, COL_ROMANEIOS, romaneioId);
    await updateDoc(rRef, {
      status: "entregue",
      deliveredAt: serverTimestamp(),
      driverLinkToken: token,
    });
    return true;
  },

  /**
   * Lista romaneios (snapshot em tempo real) com filtros básicos.
   * @param {{onlyActive?: boolean, eventId?: string}} filters
   * @param {(docs: Array<{id:string} & any>) => void} callback
   * @returns unsubscribe
   */
  listen(filters, callback) {
    const conds = [];
    if (filters?.onlyActive) {
      conds.push(where("status", "==", "ativo"));
    }
    if (filters?.eventId) {
      conds.push(where("eventId", "==", filters.eventId));
    }

    let q = query(collection(db, COL_ROMANEIOS), orderBy("createdAt", "desc"));
    if (conds.length) {
      // aplica os where (recria o query de forma encadeada)
      q = query(collection(db, COL_ROMANEIOS), ...conds, orderBy("createdAt", "desc"));
    }

    return onSnapshot(q, (snap) => {
      const arr = [];
      snap.forEach((d) => arr.push({ id: d.id, ...d.data() }));
      callback(arr);
    });
  },

  /**
   * Busca romaneios (one-shot).
   */
  async list(filters) {
    const conds = [];
    if (filters?.onlyActive) {
      conds.push(where("status", "==", "ativo"));
    }
    if (filters?.eventId) {
      conds.push(where("eventId", "==", filters.eventId));
    }

    let q = query(collection(db, COL_ROMANEIOS), orderBy("createdAt", "desc"));
    if (conds.length) {
      q = query(collection(db, COL_ROMANEIOS), ...conds, orderBy("createdAt", "desc"));
    }

    const snap = await getDocs(q);
    const arr = [];
    snap.forEach((d) => arr.push({ id: d.id, ...d.data() }));
    return arr;
  },

  /**
   * Exporta para CSV (compatível com Excel).
   * @param {Array<any>} rows
   * @param {string} filename
   */
  exportToCSV(rows, filename = "romaneios.csv") {
    const headers = [
      "status",
      "eventId",
      "eventName",
      "allProjects",
      "projectIds",
      "motivo",
      "setoresResp",
      "veiculoTipo",
      "placa",
      "fornecedor",
      "dataSaidaDate",
      "departedAt",
      "deliveredAt",
      "tiposItens",
      "itensEstruturados",
      "linkedTicketId",
      "linkedTicketTitulo",
      "driverLinkToken",
      "createdAt",
      "updatedAt",
    ];

    const lines = [headers.join(";")];

    rows.forEach((r) => {
      const line = [
        r.status ?? "",
        r.eventId ?? "",
        r.eventName ?? "",
        r.allProjects ? "SIM" : "NÃO",
        (r.projectIds || []).join("|"),
        r.motivo ?? "",
        (r.setoresResp || []).join("|"),
        r.veiculoTipo ?? "",
        r.placa ?? "",
        r.fornecedor ?? "",
        r.dataSaidaDate ?? "",
        r.departedAt ? new Date(r.departedAt.seconds * 1000).toISOString() : "",
        r.deliveredAt ? new Date(r.deliveredAt.seconds * 1000).toISOString() : "",
        (r.tiposItens || []).join("|"),
        (r.itensEstruturados || []).join(" | "),
        r.linkedTicket?.id ?? "",
        r.linkedTicket?.titulo ?? "",
        r.driverLinkToken ?? "",
        r.createdAt ? new Date(r.createdAt.seconds * 1000).toISOString() : "",
        r.updatedAt ? new Date(r.updatedAt.seconds * 1000).toISOString() : "",
      ];
      lines.push(line.map((v) => String(v).replace(/[\r\n;]+/g, " ")).join(";"));
    });

    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },

  /* ============================
     Auxiliares para o formulário
  ============================ */

  /**
   * Busca projetos de um evento (para o select).
   * Ajuste o campo usado para relacionar evento/projeto (eventId, eventoId, etc.)
   */
  async fetchProjectsByEvent(eventId, max = 200) {
    if (!eventId) return [];
    const qy = query(
      collection(db, COL_PROJETOS),
      where("eventId", "==", eventId),
      orderBy("createdAt", "desc"),
      limit(max)
    );
    const snap = await getDocs(qy);
    const arr = [];
    snap.forEach((d) => {
      const data = d.data();
      arr.push({
        id: d.id,
        name: data?.name || data?.titulo || data?.nome || "(sem nome)",
      });
    });
    return arr;
  },

  /**
   * Busca chamados de logística (para vincular no romaneio).
   * Ajuste os campos conforme seu schema (ex.: areaDestino, status, titulo).
   */
  async fetchLogisticaTickets(max = 200) {
    const conds = [where("areaDestino", "==", "logistica")];
    // opcional evitar cancelados:
    // conds.push(where("status", "!=", "cancelado")); (atenção a índices/limitações)

    let qy = query(collection(db, COL_CHAMADOS), ...conds, orderBy("createdAt", "desc"), limit(max));
    const snap = await getDocs(qy);

    const arr = [];
    snap.forEach((d) => {
      const data = d.data();
      arr.push({
        id: d.id,
        titulo: data?.titulo || data?.title || `(Chamado ${d.id})`,
        projectId: data?.projectId || data?.projetoId || null,
      });
    });
    return arr;
  },
};

export default romaneioService;
