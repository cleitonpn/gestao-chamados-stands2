import React, { useEffect, useMemo, useState } from "react";
import { useAuth } from "../contexts/AuthContext"; // ajuste o caminho se necessário
// Caso seu projeto não use este contexto, comente a linha acima e passe user/role por outro meio.

/**
 * 🔧 IMPORTANTE — Ajuste de Firebase
 * Troque o caminho abaixo para o local do seu arquivo que exporta `db` (Firestore).
 * Ex.: "../services/firebase" ou "../firebase"
 */
import { db } from "../config/firebase"; // ⬅️ ajuste o caminho conforme seu projeto
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  where,
} from "firebase/firestore";

/**
 * Resumo do Projeto
 *
 * Funcionalidades principais:
 * - Seletor flutuante de Evento → carrega Projetos vinculados ao evento.
 * - Respeita acesso: produtor/consultor só veem projetos vinculados a eles.
 * - Ao escolher o projeto, mostra resumo: consultor, equipes terceirizadas, produtor,
 *   datas (montagem/evento/desmontagem), resumo de chamados (por status) e resumo dos diários.
 * - Botão "Imprimir" com layout pronto para impressão.
 *
 * Requisitos esperados de estrutura no Firestore (ajuste conforme seu schema):
 * - events: { id, name }
 * - projects: { id, name, eventId, consultantId, producerId, thirdPartyTeams[], montagemDate, eventoDate, desmontagemDate }
 *   Observação: também é comum "fornecedores" ou "equipesTerceirizadas" — o componente tenta ler nomes alternativos.
 * - users: { id, displayName, role }
 * - chamados (tickets): collection "tickets" (ou "chamados") com { id, projectId, status }
 * - diários: collection "diarios" com { id, projectId, title, createdAt, authorName, ... }
 *
 * Se os nomes das coleções diferirem, ajuste as constantes abaixo.
 */

// 🔧 Coleções — ajuste aqui se seu nome de coleção for diferente
const EVENTS_COLLECTION = "events";
const PROJECTS_COLLECTION = "projects";
const TICKETS_COLLECTION = "tickets"; // "chamados" em alguns projetos
const DIARIES_COLLECTION = "diarios"; // "diaries" em alguns projetos
const USERS_COLLECTION = "users";

// Mapeamento de status para exibição
const STATUS_LABELS = {
  aberto: "Aberto",
  em_tratativa: "Em Tratativa",
  executado_aguardando_validacao: "Executado (aguard. validação)",
  executado_aguardando_validacao_operador: "Exec. (aguard. val. operador)",
  concluido: "Concluído",
  arquivado: "Arquivado",
};

const INTERESTING_STATUSES = Object.keys(STATUS_LABELS);

// Utilitário simples para data BR
function formatDateBR(tsLike) {
  if (!tsLike) return "—";
  // aceita Date, string ISO, número ou Firestore Timestamp { seconds, nanoseconds }
  let d = null;
  if (tsLike instanceof Date) d = tsLike;
  else if (typeof tsLike === "string" || typeof tsLike === "number")
    d = new Date(tsLike);
  else if (tsLike && typeof tsLike === "object" && "seconds" in tsLike)
    d = new Date(tsLike.seconds * 1000);
  if (!d || isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR", {
    timeZone: "America/Sao_Paulo",
  });
}

// Carrega documento de usuário (para exibir nomes de produtor/consultor)
async function getUserNameById(userId) {
  if (!userId) return null;
  const ref = doc(db, USERS_COLLECTION, String(userId));
  const snap = await getDoc(ref);
  return snap.exists() ? snap.data()?.displayName || snap.data()?.name || "—" : "—";
}

export default function ProjectSummaryPage() {
  const { currentUser, role: userRole } = useAuth?.() || {
    currentUser: null,
    role: null,
  };

  const [loading, setLoading] = useState(false);
  const [events, setEvents] = useState([]);
  const [selectedEventId, setSelectedEventId] = useState("");
  const [projects, setProjects] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState("");

  const [projectData, setProjectData] = useState(null);
  const [names, setNames] = useState({
    consultantName: "—",
    producerName: "—",
  });
  const [ticketsSummary, setTicketsSummary] = useState({
    total: 0,
    byStatus: {},
  });
  const [diaries, setDiaries] = useState([]);

  // Sticky header offset (para não cobrir conteúdo)
  useEffect(() => {
    document.title = "Resumo do Projeto";
  }, []);

  // Carrega eventos acessíveis
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const q = query(collection(db, EVENTS_COLLECTION), orderBy("name", "asc"));
        const snap = await getDocs(q);
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setEvents(list);
      } catch (e) {
        console.error("Erro ao carregar eventos:", e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Carrega projetos do evento selecionado, respeitando acesso
  useEffect(() => {
    if (!selectedEventId) {
      setProjects([]);
      setSelectedProjectId("");
      return;
    }
    (async () => {
      setLoading(true);
      try {
        // base: por evento
        let q = query(
          collection(db, PROJECTS_COLLECTION),
          where("eventId", "==", selectedEventId),
          orderBy("name", "asc")
        );
        const snap = await getDocs(q);
        let list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

        // filtro por acesso (produtor/consultor)
        // Obs.: ajuste os campos conforme seu schema (producerId/consultantId ou arrays)
        const isRestricted =
          ["produtor", "consultor"].includes((userRole || "").toLowerCase()) &&
          currentUser?.uid;

        if (isRestricted) {
          list = list.filter((p) => {
            const pid = String(p?.producerId || p?.produtorId || "");
            const cid = String(p?.consultantId || p?.consultorId || "");
            const uid = String(currentUser.uid);
            if ((userRole || "").toLowerCase() === "produtor") return pid === uid;
            if ((userRole || "").toLowerCase() === "consultor") return cid === uid;
            return true;
          });
        }

        setProjects(list);
        // reseta projeto se ele não pertencer mais
        if (selectedProjectId && !list.some((p) => p.id === selectedProjectId)) {
          setSelectedProjectId("");
          setProjectData(null);
        }
      } catch (e) {
        console.error("Erro ao carregar projetos:", e);
      } finally {
        setLoading(false);
      }
    })();
  }, [selectedEventId, currentUser?.uid, userRole]);

  // Carrega resumo do projeto selecionado
  useEffect(() => {
    if (!selectedProjectId) {
      setProjectData(null);
      setTicketsSummary({ total: 0, byStatus: {} });
      setDiaries([]);
      setNames({ consultantName: "—", producerName: "—" });
      return;
    }
    (async () => {
      setLoading(true);
      try {
        const pref = doc(db, PROJECTS_COLLECTION, selectedProjectId);
        const psnap = await getDoc(pref);
        if (!psnap.exists()) {
          setProjectData(null);
          return;
        }
        const p = { id: psnap.id, ...psnap.data() };
        setProjectData(p);

        // Nomes (produtor/consultor)
        const [consultantName, producerName] = await Promise.all([
          getUserNameById(p?.consultantId || p?.consultorId),
          getUserNameById(p?.producerId || p?.produtorId),
        ]);
        setNames({ consultantName, producerName });

        // Resumo de chamados
        await loadTicketsSummary(selectedProjectId, setTicketsSummary);

        // Resumo de diários (últimos 5)
        await loadDiaries(selectedProjectId, setDiaries);
      } catch (e) {
        console.error("Erro ao carregar dados do projeto:", e);
      } finally {
        setLoading(false);
      }
    })();
  }, [selectedProjectId]);

  const selectedEvent = useMemo(
    () => events.find((e) => e.id === selectedEventId) || null,
    [events, selectedEventId]
  );
  const selectedProject = useMemo(
    () => projects.find((p) => p.id === selectedProjectId) || null,
    [projects, selectedProjectId]
  );

  function handlePrint() {
    window.print();
  }

  // Deriva equipes terceirizadas
  const thirdPartyTeams = useMemo(() => {
    if (!projectData) return [];
    // Tenta ler vários campos possíveis
    const raw =
      projectData?.thirdPartyTeams ||
      projectData?.equipesTerceirizadas ||
      projectData?.fornecedores ||
      [];
    if (Array.isArray(raw)) return raw;
    // se for objeto/record, converte para lista
    if (raw && typeof raw === "object") {
      return Object.keys(raw).map((k) => raw[k]);
    }
    return [];
  }, [projectData]);

  const perf = useMemo(() => ({
    totalChamados: ticketsSummary?.total || 0,
    abertos: ticketsSummary?.byStatus?.aberto || 0,
    emTratativa: ticketsSummary?.byStatus?.em_tratativa || 0,
    executadoAguardandoValidacao:
      (ticketsSummary?.byStatus?.executado_aguardando_validacao || 0) +
      (ticketsSummary?.byStatus?.executado_aguardando_validacao_operador || 0),
    concluidos: ticketsSummary?.byStatus?.concluido || 0,
    arquivados: ticketsSummary?.byStatus?.arquivado || 0,
  }), [ticketsSummary]);

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900">
      {/* Estilos de impressão */}
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 14mm; }
          .no-print { display: none !important; }
          .print-block { break-inside: avoid; }
          body { background: #fff !important; }
        }
      `}</style>

      {/* Header flutuante com selects */}
      <div className="no-print sticky top-0 z-30 bg-white/80 backdrop-blur border-b border-neutral-200">
        <div className="mx-auto max-w-7xl px-4 py-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold">Resumo do Projeto</h1>
            {loading && (
              <span className="text-xs px-2 py-1 bg-neutral-100 rounded border border-neutral-200">
                carregando...
              </span>
            )}
          </div>
          <div className="flex flex-col md:flex-row gap-3 md:items-center">
            <div className="flex items-center gap-2">
              <label className="text-sm text-neutral-600 min-w-[64px]">Evento:</label>
              <select
                className="min-w-[220px] rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={selectedEventId}
                onChange={(e) => setSelectedEventId(e.target.value)}
              >
                <option value="">Selecione um evento...</option>
                {events.map((ev) => (
                  <option key={ev.id} value={ev.id}>
                    {ev.name || ev.titulo || ev.nome || ev.id}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm text-neutral-600 min-w-[64px]">Projeto:</label>
              <select
                className="min-w-[260px] rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60"
                value={selectedProjectId}
                onChange={(e) => setSelectedProjectId(e.target.value)}
                disabled={!selectedEventId || projects.length === 0}
              >
                {!selectedEventId ? (
                  <option value="">Selecione um evento primeiro...</option>
                ) : projects.length === 0 ? (
                  <option value="">Nenhum projeto disponível</option>
                ) : (
                  <option value="">Selecione um projeto...</option>
                )}
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name || p.titulo || p.nome || p.id}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              onClick={handlePrint}
              className="ml-0 md:ml-2 inline-flex items-center justify-center gap-2 rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white shadow hover:bg-neutral-800 active:bg-neutral-900"
              disabled={!selectedProjectId}
              title={!selectedProjectId ? "Selecione um projeto" : "Imprimir"}
            >
              🖨️ Imprimir
            </button>
          </div>
        </div>
      </div>

      {/* Conteúdo */}
      <div className="mx-auto max-w-7xl px-4 py-6">
        {!selectedProjectId ? (
          <div className="rounded-xl border border-dashed border-neutral-300 bg-white p-8 text-neutral-600">
            Selecione um evento e um projeto para visualizar o resumo.
          </div>
        ) : !projectData ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-red-700">
            Não foi possível carregar os dados do projeto selecionado.
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Bloco: Dados do Projeto */}
            <section className="print-block lg:col-span-2 rounded-2xl bg-white border border-neutral-200 shadow-sm">
              <header className="border-b border-neutral-200 px-5 py-4">
                <h2 className="text-lg font-semibold">Dados do Projeto</h2>
                {selectedEvent && (
                  <p className="text-sm text-neutral-500">
                    Evento: <span className="font-medium">{selectedEvent?.name || selectedEvent?.titulo || selectedEvent?.nome}</span>
                  </p>
                )}
              </header>
              <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                <Field label="Projeto" value={projectData?.name || projectData?.titulo || projectData?.nome || "—"} />
                <Field label="Consultor" value={names.consultantName} />
                <Field label="Produtor" value={names.producerName} />
                <Field
                  label="Montagem"
                  value={formatDateBR(projectData?.montagemDate || projectData?.dataMontagem)}
                />
                <Field
                  label="Evento"
                  value={formatDateBR(projectData?.eventoDate || projectData?.dataEvento)}
                />
                <Field
                  label="Desmontagem"
                  value={formatDateBR(projectData?.desmontagemDate || projectData?.dataDesmontagem)}
                />

                <div className="sm:col-span-2">
                  <div className="text-[13px] text-neutral-500 mb-1">Equipes terceirizadas</div>
                  {thirdPartyTeams?.length ? (
                    <ul className="space-y-2">
                      {thirdPartyTeams.map((t, idx) => (
                        <li
                          key={idx}
                          className="rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2"
                        >
                          {renderTeam(t)}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-neutral-500">
                      —
                    </div>
                  )}
                </div>
              </div>
            </section>

            {/* Bloco: Resumo de Chamados */}
            <section className="print-block rounded-2xl bg-white border border-neutral-200 shadow-sm">
              <header className="border-b border-neutral-200 px-5 py-4">
                <h2 className="text-lg font-semibold">Chamados</h2>
              </header>
              <div className="p-5 space-y-4">
                <KPI label="Total" value={perf.totalChamados} />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <KPI label={STATUS_LABELS.aberto} value={perf.abertos} />
                  <KPI label={STATUS_LABELS.em_tratativa} value={perf.emTratativa} />
                  <KPI
                    label="Executado (aguard. validação)"
                    value={perf.executadoAguardandoValidacao}
                  />
                  <KPI label={STATUS_LABELS.concluido} value={perf.concluidos} />
                  <KPI label={STATUS_LABELS.arquivado} value={perf.arquivados} />
                </div>
              </div>
            </section>

            {/* Bloco: Resumo de Diários */}
            <section className="print-block lg:col-span-3 rounded-2xl bg-white border border-neutral-200 shadow-sm">
              <header className="border-b border-neutral-200 px-5 py-4">
                <h2 className="text-lg font-semibold">Diários do Projeto</h2>
              </header>
              <div className="p-5">
                {diaries?.length ? (
                  <ul className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {diaries.map((d) => (
                      <li
                        key={d.id}
                        className="rounded-xl border border-neutral-200 bg-neutral-50 p-4"
                      >
                        <div className="text-sm font-medium">{d.title || d.titulo || "Sem título"}</div>
                        <div className="mt-1 text-xs text-neutral-500">
                          {formatDateBR(d.createdAt)} {d?.authorName ? `· ${d.authorName}` : ""}
                        </div>
                        {d?.summary || d?.resumo ? (
                          <p className="mt-2 text-sm text-neutral-700 line-clamp-3">
                            {d.summary || d.resumo}
                          </p>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-neutral-500">
                    Nenhum diário encontrado para este projeto.
                  </div>
                )}
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}

/** Componentes de UI simples (sem dependências externas) */
function Field({ label, value }) {
  return (
    <div className="flex flex-col">
      <span className="text-[13px] text-neutral-500">{label}</span>
      <span className="text-[15px] font-medium text-neutral-900">{value ?? "—"}</span>
    </div>
  );
}

function KPI({ label, value }) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3">
      <div className="text-xs text-neutral-500">{label}</div>
      <div className="text-2xl font-semibold">{value ?? 0}</div>
    </div>
  );
}

function renderTeam(item) {
  if (typeof item === "string") return item;
  if (item && typeof item === "object") {
    const nome =
      item.name || item.nome || item.empresa || item.fornecedor || "—";
    const area = item.area || item.tipo || item.categoria || null;
    const contato = item.contato || item.telefone || item.email || null;
    return (
      <div className="flex flex-col">
        <span className="font-medium">{nome}</span>
        <span className="text-xs text-neutral-500">
          {area ? `${area}` : ""} {contato ? `· ${contato}` : ""}
        </span>
      </div>
    );
  }
  return "—";
}

/** ===========================
 *   Data Loaders (Firestore)
 *  ===========================
 */

async function loadTicketsSummary(projectId, setState) {
  const byStatus = {};
  let total = 0;

  // Busca todos os chamados do projeto
  // Obs.: ajuste o nome da coleção (TICKETS_COLLECTION) se usar "chamados"
  const q = query(
    collection(db, TICKETS_COLLECTION),
    where("projectId", "==", projectId)
  );
  const snap = await getDocs(q);
  snap.forEach((doc) => {
    const s = (doc.data()?.status || "").toLowerCase();
    total += 1;
    const key = INTERESTING_STATUSES.includes(s) ? s : "outros";
    byStatus[key] = (byStatus[key] || 0) + 1;
  });

  setState({ total, byStatus });
}

async function loadDiaries(projectId, setState) {
  const q = query(
    collection(db, DIARIES_COLLECTION),
    where("projectId", "==", projectId),
    orderBy("createdAt", "desc"),
    limit(5)
  );
  const snap = await getDocs(q);
  const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  setState(list);
}
