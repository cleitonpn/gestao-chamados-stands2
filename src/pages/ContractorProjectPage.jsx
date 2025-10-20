// src/pages/ContractorProjectPage.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useLocation, useParams } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

// Services (iguais aos usados no resumo)
import { projectService } from "../services/projectService";
import { ticketService } from "../services/ticketService";
import { userService } from "../services/userService";
import { diaryService } from "../services/diaryService";
import { eventService } from "../services/eventService";

// ---- Helpers (reaproveitando o padrão do ProjectSummaryPage) ----
const STATUS_LABELS = {
  aberto: "Aberto",
  em_tratativa: "Em Tratativa",
  executado_aguardando_validacao: "Executado (aguard. validação)",
  executado_aguardando_validacao_operador: "Exec. (aguard. val. operador)",
  concluido: "Concluído",
  arquivado: "Arquivado",
};
const KNOWN_STATUSES = Object.keys(STATUS_LABELS);

const norm = (s) => (s || "").toString().trim().toLowerCase();
const has = (obj, ...keys) => keys.some((k) => obj && obj[k] != null && obj[k] !== "");

function parseMillis(ts) {
  if (!ts) return 0;
  if (ts instanceof Date) return ts.getTime();
  if (typeof ts === "object" && ts.seconds) return ts.seconds * 1000;
  try { return new Date(ts).getTime() || 0; } catch { return 0; }
}
function formatDateBR(tsLike) {
  const ms = parseMillis(tsLike);
  if (!ms) return "—";
  return new Date(ms).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}
function formatDateTimeBR(tsLike) {
  const ms = parseMillis(tsLike);
  if (!ms) return "—";
  return new Date(ms).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

function prettyStatus(s) {
  const v = (s || "").toString().toLowerCase();
  if (STATUS_LABELS[v]) return STATUS_LABELS[v];
  const aliases = {
    aberto: "Aberto",
    aberto_aguardando: "Aberto",
    tratamento: "Em Tratativa",
    tratando: "Em Tratativa",
    em_tratativa: "Em Tratativa",
    executado: "Executado",
    executado_aguardando_validacao: "Executado (aguard. validação)",
    concluido: "Concluído",
    finalizado: "Concluído",
    arquivado: "Arquivado",
  };
  return aliases[v] || (s || "—");
}

function isSensitiveFinanceTicket(t) {
  const area = norm(t.area || t.setor || t.categoria || t.areaOriginal || "");
  const isFinance = ["financeiro", "financas", "finanças"].includes(area);
  if (!isFinance) return false;

  const rawType = norm(
    t.tipo || t.tipoChamado || t.tipoDeChamado || t.category || t.subtipo || ""
  ).replace(/[_\-]+/g, " ").replace(/\s+/g, " ").trim();

  const sensitiveTypes = new Set([
    "pagamento frete",
    "pagamento de frete",
    "pedido caixinha",
    "pedido de caixinha",
    "caixinha"
  ]);

  return sensitiveTypes.has(rawType);
}

function filterTicketsForProject(all, projectId) {
  const pid = String(projectId);
  let list = (all || []).filter((t) => {
    if (!t) return false;
    if (String(t.projetoId || "") === pid) return true;
    if (String(t.projectId || "") === pid) return true;
    if (t.project && String(t.project.id || "") === pid) return true;
    if (Array.isArray(t.projetos) && t.projetos.map(String).includes(pid)) return true;
    if (Array.isArray(t.projectIds) && t.projectIds.map(String).includes(pid)) return true;
    return false;
  });
  list = list.filter((t) => !isSensitiveFinanceTicket(t));
  list.sort((a, b) => parseMillis(b.updatedAt || b.createdAt) - parseMillis(a.updatedAt || a.createdAt));
  return list;
}
function buildTicketSummary(tickets) {
  const byStatus = {};
  let total = 0;
  for (const t of tickets) {
    total += 1;
    const s = (t.status || "").toLowerCase();
    const key = KNOWN_STATUSES.includes(s) ? s : "outros";
    byStatus[key] = (byStatus[key] || 0) + 1;
  }
  return { total, byStatus };
}

function groupDiariesByDay(feedItems) {
  const groups = {};
  for (const it of (feedItems || [])) {
    const key = formatDateBR(it.createdAt) || "Sem data";
    if (!groups[key]) groups[key] = [];
    groups[key].push(it);
  }
  const ordered = {};
  Object.entries(groups)
    .sort((a, b) => {
      const A = a[0].split("/").reverse().join("-");
      const B = b[0].split("/").reverse().join("-");
      return new Date(B) - new Date(A);
    })
    .forEach(([k, v]) => (ordered[k] = v));
  return ordered;
}

function toArrayFromUnknown(x) {
  if (!x) return [];
  if (Array.isArray(x)) return x;
  if (typeof x === "object") return Object.keys(x).map((k) => ({ _key: k, ...x[k] }));
  return [];
}
function extractSpecificItems(t) {
  const candidates = [
    t.camposEspecificos,
    t.informacoesEspecificasItens,
    t.informacoesEspecificas,
    t.itensEspecificos,
    t.itens_especificos,
    t.dadosEspecificos,
    t.itemsEspec,
    t.items,
    t.itens,
    t.lista,
  ];
  let arr = [];
  for (const src of candidates) {
    const tmp = toArrayFromUnknown(src);
    if (tmp.length) { arr = tmp; break; }
  }
  return arr
    .map((i, idx) => ({
      idx,
      codigo: i.codItem || i.codigoDoItem || i.codigo_item || i.codigo || i.cod || i.codigoItem,
      idItem: i.id || i.codigoInterno,
      item: i.item || i.nome || i.descricao || i.descricaoItem || i.produto,
      quantidade: i.quantidade || i.qtd || i.qtde,
      unidade: i.unidade || i.um,
      valorUnitario: i.valorUnitario || i.precoUnitario || i.vlrUnit,
      valorTotal: i.valorTotal || i.precoTotal || i.vlrTotal,
    }))
    .filter((it) => it.item || it.codigo || it.quantidade || it.idItem);
}

// Links: manual e planta do evento + pasta do Drive do projeto
function extractEventLinks(ev) {
  if (!ev) return {};
  const manual =
    ev.linkManual ||
    ev.manualFeiraLink ||
    ev.manualLink ||
    ev.manual ||
    ev.urlManual ||
    ev.manulFeira ||
    null;
  const planta =
    ev.linkPlanta ||
    ev.plantaFeiraLink ||
    ev.plantaLink ||
    ev.planta ||
    ev.urlPlanta ||
    null;
  return { manual, planta };
}
function extractProjectDriveLink(p) {
  if (!p) return null;
  return (
    p.driveLink ||
    p.linkDrive ||
    p.pastaDrive ||
    p.driveFolderUrl ||
    p.driveFolder ||
    p.urlDrive ||
    null
  );
}

/* ----------------- NOVOS HELPERS: links & imagens no diário ----------------- */
function isHttpUrl(u) {
  try { const x = new URL(String(u)); return x.protocol === "http:" || x.protocol === "https:"; }
  catch { return false; }
}
function isLikelyImage(att) {
  const ct = (att?.contentType || att?.type || "").toString().toLowerCase();
  if (ct.includes("image/")) return true;
  const u = (att?.downloadURL || att?.url || att?.src || att?.href || "").toString().toLowerCase();
  return /\.(png|jpe?g|gif|webp|bmp|svg)$/.test(u);
}
function extractDiaryLinks(d) {
  const links = [];
  const candidates = [
    d.linkUrl, d.link, d.url, d.href,
    ...(Array.isArray(d.links) ? d.links : []),
  ].filter(Boolean);
  for (const c of candidates) {
    if (Array.isArray(c)) {
      for (const x of c) if (isHttpUrl(x)) links.push(String(x));
    } else if (isHttpUrl(c)) {
      links.push(String(c));
    }
  }
  // remove duplicados
  return Array.from(new Set(links));
}
function extractDiaryImages(d) {
  const arrays =
    (Array.isArray(d.attachments) && d.attachments) ||
    (Array.isArray(d.anexos) && d.anexos) ||
    (Array.isArray(d.fotos) && d.fotos) ||
    (Array.isArray(d.images) && d.images) ||
    (Array.isArray(d.imagens) && d.imagens) ||
    [];
  const urls = [];
  for (const att of arrays) {
    const candidate = att?.downloadURL || att?.url || att?.src || att?.href || null;
    if (candidate && (isLikelyImage(att) || /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(String(candidate)))) {
      if (isHttpUrl(candidate)) urls.push(String(candidate));
    }
  }
  return Array.from(new Set(urls));
}

export default function ContractorProjectPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams();

  const auth = (typeof useAuth === "function" ? useAuth() : {}) || {};
  const userRoleRaw = auth?.role || auth?.userProfile?.funcao || null;
  const userRole = (userRoleRaw || "").toString().toLowerCase();
  const uid = auth?.currentUser?.uid || auth?.user?.uid || null;

  const [loading, setLoading] = useState(false);
  const [projectIdInput, setProjectIdInput] = useState("");
  const [project, setProject] = useState(null);
  const [eventFull, setEventFull] = useState(null);
  const [usersMap, setUsersMap] = useState({});
  const [ticketsSummary, setTicketsSummary] = useState({ total: 0, byStatus: {} });
  const [ticketsList, setTicketsList] = useState([]);
  const [diariesGrouped, setDiariesGrouped] = useState({});
  const [error, setError] = useState("");

  const flashError = (msg) => {
    setError(msg);
    window.clearTimeout(flashError._t);
    flashError._t = window.setTimeout(() => setError(""), 4000);
  };

  // Ler ?id= ou /empreiteiro/:projectId e localStorage
  useEffect(() => {
    document.title = "Painel do Empreiteiro";
    const sp = new URLSearchParams(location.search);
    const fromQuery = sp.get("id");
    const fromParam = params?.projectId;
    const last = localStorage.getItem("empreiteiro:lastProjectId") || "";
    const initial = fromParam || fromQuery || last;
    if (initial) {
      setProjectIdInput(initial);
      handleLoad(initial);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Carregar mapa de usuários (para exibir nomes de produtor/consultor)
  useEffect(() => {
    (async () => {
      try {
        const allUsers = await userService.getAllUsers();
        const map = {};
        (allUsers || []).forEach((u) => {
          const id = u.id || u.uid || u.userId;
          if (id) map[String(id)] = u;
        });
        setUsersMap(map);
      } catch (e) {
        console.error("Erro carregando usuários:", e);
      }
    })();
  }, []);

  // Check simples de escopo: se o usuário tiver lista de projetos permitidos, respeite
  const allowedProjects = useMemo(() => {
    // Opcional: defina um array `projectsAllowed` no perfil do empreiteiro
    const arr =
      auth?.userProfile?.projectsAllowed ||
      auth?.userProfile?.projetosPermitidos ||
      [];
    return Array.isArray(arr) ? arr.map(String) : [];
  }, [auth?.userProfile]);

  const isProjectAllowed = (pid) => {
    if (!pid) return false;
    if (!allowedProjects.length) return true; // se não houver lista, não restringe pelo app (segurança deve ficar nas rules)
    return allowedProjects.includes(String(pid));
  };

  async function handleLoad(pidRaw) {
    const pid = (pidRaw || projectIdInput || "").trim();
    if (!pid) {
      setError("Informe o ID do projeto.");
      return;
    }
    if (userRole === "empreiteiro" && !isProjectAllowed(pid)) {
      setError("Este projeto não está autorizado para o seu acesso.");
      setProject(null);
      setEventFull(null);
      setTicketsList([]);
      setDiariesGrouped({});
      setTicketsSummary({ total: 0, byStatus: {} });
      return;
    }

    setError("");
    setLoading(true);
    try {
      // Tenta buscar por ID direto; se não houver método, cai no getAll
      let p = null;
      if (typeof projectService.getProjectById === "function") {
        p = await projectService.getProjectById(pid);
      }
      if (!p) {
        const all = await projectService.getAllProjects();
        p = (all || []).find((x) => String(x?.id) === String(pid)) || null;
      }
      if (!p) {
        setError("Projeto não encontrado.");
        setProject(null);
        setEventFull(null);
        setTicketsList([]);
        setDiariesGrouped({});
        setTicketsSummary({ total: 0, byStatus: {} });
        return;
      }

      setProject(p);
      localStorage.setItem("empreiteiro:lastProjectId", String(pid));

      // Evento completo (com datas/links)
      let evs = [];
      try {
        evs = (await eventService.getAllEvents?.().catch(() => [])) || [];
      } catch {}
      const evId = p?.eventId || p?.eventoId || p?.feiraId;
      const evName = p?.feira || p?.evento || p?.eventName || p?.nomeEvento;
      const evById = evs.find((e) => String(e.id) === String(evId));
      const evByName = evs.find((e) => norm(e.nome || e.name || e.titulo) === norm(evName));
      const ev = evById || evByName || null;
      const mappedFull = ev
        ? {
            id: ev.id,
            name: ev.nome || ev.name || ev.titulo || ev.id,
            pavilhao: ev.pavilhao || null,
            dataInicioMontagem: ev.dataInicioMontagem || ev.montagemInicio,
            dataFimMontagem: ev.dataFimMontagem || ev.montagemFim,
            dataInicioEvento: ev.dataInicioEvento || ev.eventoInicio,
            dataFimEvento: ev.dataFimEvento || ev.eventoFim,
            dataInicioDesmontagem: ev.dataInicioDesmontagem || ev.desmontagemInicio,
            dataFimDesmontagem: ev.dataFimDesmontagem || ev.desmontagemFim,
            ...ev,
          }
        : null;
      setEventFull(mappedFull);

      // Chamados
      const allTickets = await ticketService.getAllTickets();
      const tickets = filterTicketsForProject(allTickets, pid);
      setTicketsList(tickets);
      setTicketsSummary(buildTicketSummary(tickets));

      // Diários
      const feed = await diaryService
        .fetchFeedByProject?.({ projectId: pid, pageSize: 500 })
        .catch(() => ({ items: [] }));
      setDiariesGrouped(groupDiariesByDay(feed?.items || []));
    } catch (e) {
      console.error("Erro ao carregar projeto para empreiteiro:", e);
      setError("Não foi possível carregar os dados. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  const names = useMemo(() => {
    const cId = project?.consultantId || project?.consultorId || project?.consultorUid;
    const pId = project?.producerId || project?.produtorId || project?.produtorUid;
    const c = (cId && usersMap[String(cId)]) || {};
    const p = (pId && usersMap[String(pId)]) || {};
    const display = (u) => u.displayName || u.nome || u.name || u.email || "—";
    return { consultantName: display(c), producerName: display(p) };
  }, [project, usersMap]);

  const { manual: linkManual, planta: linkPlanta } = extractEventLinks(eventFull || {});
  const linkDrive = extractProjectDriveLink(project);

  const lastUpdated =
    project?.updatedAt || project?.lastUpdated || project?.modificadoEm || project?.alteradoEm || null;

  const handlePrint = () => window.print();

  // NOVO: colar da área de transferência
  const handlePasteFromClipboard = async () => {
    try {
      if (!navigator?.clipboard?.readText) {
        flashError("Seu navegador não permite leitura da área de transferência aqui.");
        return;
      }
      const txt = (await navigator.clipboard.readText()) || "";
      const cleaned = txt.trim();
      if (!cleaned) {
        flashError("A área de transferência está vazia.");
        return;
      }
      setProjectIdInput(cleaned);
    } catch (e) {
      console.error("Clipboard read error:", e);
      flashError("Não consegui acessar a área de transferência.");
    }
  };
  // Unifica: colar do clipboard (se disponível) e carregar
  const handlePasteAndLoad = async () => {
    try {
      let pasted = null;
      if (navigator?.clipboard?.readText) {
        try {
          pasted = (await navigator.clipboard.readText())?.trim();
        } catch {}
      }
      if (pasted) {
        setProjectIdInput(pasted);
        await handleLoad(pasted);
      } else {
        await handleLoad();
      }
    } catch (e) {
      console.error("Erro ao colar/carregar:", e);
      flashError("Não foi possível colar/carregar. Tente novamente.");
    }
  };


  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900">
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 14mm; }
          .no-print { display: none !important; }
          .print-block { break-inside: avoid; }
          body { background: #fff !important; }
        }
      `}</style>

      {/* Header */}
      <div className="no-print sticky top-0 z-30 bg-white/80 backdrop-blur border-b border-neutral-200">
        <div className="mx-auto max-w-7xl px-4 py-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold">Painel do Empreiteiro</h1>
            {loading && (
              <span className="text-xs px-2 py-1 bg-neutral-100 rounded border border-neutral-200">
                carregando...
              </span>
            )}
          </div>

          <div className="flex flex-col md:flex-row gap-3 md:items-center">
            <div className="flex items-center gap-2">
              <label className="text-sm text-neutral-600 min-w-[90px]">ID do Projeto:</label>
              <input
                className="min-w-[220px] rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="cole aqui o ID (ex: abc123)"
                value={projectIdInput}
                onChange={(e) => setProjectIdInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleLoad(); }}
              />
            </div>

            {/* NOVO: Botão COLAR à esquerda do CARREGAR */}
            <button
              type="button"
              onClick={handlePasteAndLoad}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white shadow hover:bg-neutral-800 active:bg-neutral-900"
              title="Colar do clipboard e carregar projeto"
            >
              📋 Colar e Carregar
            </button>
<button
              type="button"
              onClick={handlePrint}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-white border border-neutral-300 px-4 py-2 text-sm font-medium hover:bg-neutral-50"
              disabled={!project}
              title={!project ? "Informe o ID do projeto" : "Imprimir"}
            >
              🖨️ Imprimir
            </button>
          </div>
        </div>
      </div>

      {/* Conteúdo */}
      <div className="mx-auto max-w-7xl px-4 py-6 space-y-6">
        {error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-red-700">{error}</div>
        ) : !project ? (
          <div className="rounded-xl border border-dashed border-neutral-300 bg-white p-8 text-neutral-600">
            Informe o <strong>ID do projeto</strong> e clique em <em>Carregar</em>.
          </div>
        ) : (
          <>
            {/* Bloco: Dados do Projeto + Links + Datas */}
            <section className="print-block grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 rounded-2xl bg-white border border-neutral-200 shadow-sm">
                <header className="border-b border-neutral-200 px-5 py-4">
                  <h2 className="text-lg font-semibold">Dados do Projeto</h2>
                  {eventFull && (
                    <p className="text-sm text-neutral-500">
                      Evento: <span className="font-medium">{eventFull?.name}</span>
                      {eventFull?.pavilhao ? <span className="ml-2">• Pavilhão: {eventFull.pavilhao}</span> : null}
                    </p>
                  )}
                </header>
                <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                  <Field label="Projeto" value={project?.name || project?.titulo || project?.nome || project?.id} />
                  <Field label="Consultor" value={names.consultantName || "—"} />
                  <Field label="Produtor" value={names.producerName || "—"} />
                  <Field
                    label="Montagem"
                    value={
                      (project?.montagem?.dataInicio || project?.montagem?.dataFim)
                        ? `${formatDateBR(project?.montagem?.dataInicio)} — ${formatDateBR(project?.montagem?.dataFim)}`
                        : (eventFull ? `${formatDateBR(eventFull?.dataInicioMontagem)} — ${formatDateBR(eventFull?.dataFimMontagem)}` : "—")
                    }
                  />
                  <Field
                    label="Evento"
                    value={
                      (project?.evento?.dataInicio || project?.evento?.dataFim)
                        ? `${formatDateBR(project?.evento?.dataInicio)} — ${formatDateBR(project?.evento?.dataFim)}`
                        : (eventFull ? `${formatDateBR(eventFull?.dataInicioEvento)} — ${formatDateBR(eventFull?.dataFimEvento)}` : "—")
                    }
                  />
                  <Field
                    label="Desmontagem"
                    value={
                      (project?.desmontagem?.dataInicio || project?.desmontagem?.dataFim)
                        ? `${formatDateBR(project?.desmontagem?.dataInicio)} — ${formatDateBR(project?.desmontagem?.dataFim)}`
                        : (eventFull ? `${formatDateBR(eventFull?.dataInicioDesmontagem)} — ${formatDateBR(eventFull?.dataFimDesmontagem)}` : "—")
                    }
                  />
                  <div className="sm:col-span-2">
                    <div className="text-[13px] text-neutral-500 mb-1">Equipes terceirizadas</div>
                    {renderTeamsPills(
                      project?.equipesEmpreiteiras ||
                      project?.thirdPartyTeams ||
                      project?.fornecedores
                    )}
                  </div>
                </div>
              </div>

              {/* Links úteis + última atualização */}
              <div className="rounded-2xl bg-white border border-neutral-200 shadow-sm">
                <header className="border-b border-neutral-200 px-5 py-4">
                  <h2 className="text-lg font-semibold">Links Úteis</h2>
                </header>
                <div className="p-5 space-y-3 text-sm">
                  <LinkRow label="Manual da feira" href={linkManual} />
                  <LinkRow label="Planta da feira" href={linkPlanta} />
                  <LinkRow label="Pasta do projeto (Drive)" href={linkDrive} />
                  <div className="mt-2 pt-3 border-t border-neutral-200">
                    <div className="text-xs text-neutral-500">Última atualização do projeto</div>
                    <div className="text-[15px] font-medium">{formatDateTimeBR(lastUpdated)}</div>
                  </div>
                </div>
              </div>
            </section>

            {/* KPIs de chamados */}
            <section className="print-block rounded-2xl bg-white border border-neutral-200 shadow-sm">
              <header className="border-b border-neutral-200 px-5 py-4">
                <h2 className="text-lg font-semibold">Chamados</h2>
              </header>
              <div className="p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                <KPI label="Total" value={ticketsSummary?.total || 0} />
                <KPI label="Aberto" value={ticketsSummary?.byStatus?.aberto || 0} />
                <KPI label="Em Tratativa" value={ticketsSummary?.byStatus?.em_tratativa || 0} />
                <KPI
                  label="Executado (aguard. validação)"
                  value={(ticketsSummary?.byStatus?.executado_aguardando_validacao || 0) +
                         (ticketsSummary?.byStatus?.executado_aguardando_validacao_operador || 0)}
                />
                <KPI label="Concluído" value={ticketsSummary?.byStatus?.concluido || 0} />
              </div>
            </section>

            {/* Resumo detalhado de chamados */}
            <section className="print-block rounded-2xl bg-white border border-neutral-200 shadow-sm">
              <header className="border-b border-neutral-200 px-5 py-4">
                <h2 className="text-lg font-semibold">Resumo dos Chamados</h2>
                <p className="text-sm text-neutral-500">
                  Título, data, descrição, <strong>Informações Específicas</strong>, mensagens, status.
                </p>
              </header>
              <div className="p-5 space-y-3">
                {ticketsList.length === 0 ? (
                  <div className="rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-neutral-500">
                    Nenhum chamado para este projeto.
                  </div>
                ) : (
                  ticketsList.map((t) => (
                    <article key={t.id || t.ticketId} className="rounded-xl border border-neutral-200 bg-neutral-50 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold">
                            {t.titulo || t.title || t.assunto || `Chamado ${t.id || ""}`}
                          </div>
                          <div className="text-xs text-neutral-500">{formatDateTimeBR(t.updatedAt || t.createdAt)}</div>
                        </div>
                        <span className="inline-flex items-center rounded-full border border-neutral-300 bg-white px-2 py-0.5 text-xs font-medium text-neutral-700">
                          {prettyStatus(t.status)}
                        </span>
                      </div>

                      {(t.descricao || t.description) && (
                        <p className="mt-2 text-sm text-neutral-700 whitespace-pre-wrap">
                          {t.descricao || t.description}
                        </p>
                      )}

                      {renderExtraSections(t)}
                      {renderSpecificInfoBlock(t)}
                      {renderMessages(t)}
                    </article>
                  ))
                )}
              </div>
            </section>

            {/* Diários agrupados por dia */}
            <section className="print-block rounded-2xl bg-white border border-neutral-200 shadow-sm">
              <header className="border-b border-neutral-200 px-5 py-4">
                <h2 className="text-lg font-semibold">Diários do Projeto</h2>
              </header>
              <div className="p-5 space-y-4">
                {Object.keys(diariesGrouped).length === 0 ? (
                  <div className="rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-neutral-500">
                    Nenhum diário encontrado para este projeto.
                  </div>
                ) : (
                  Object.entries(diariesGrouped).map(([day, items]) => (
                    <div key={day} className="rounded-xl border border-neutral-200 bg-neutral-50">
                      <div className="px-4 py-2 border-b border-neutral-200 text-sm font-medium">{day}</div>
                      <ul className="divide-y divide-neutral-200">
                        {items.map((d) => {
                          const links = extractDiaryLinks(d);
                          const images = extractDiaryImages(d);
                          return (
                            <li key={d.id} className="p-4">
                              <div className="flex items-center justify-between">
                                <div className="font-medium text-sm">{d.projectName || "Projeto"}</div>
                                <div className="text-xs text-neutral-500">{d.authorName || "—"}</div>
                              </div>
                              <p className="mt-1 text-sm text-neutral-700 whitespace-pre-wrap">
                                {(d.text || "").trim() || "—"}
                              </p>

                              {/* NOVO: Links do diário */}
                              {links.length > 0 && (
                                <div className="mt-2">
                                  <div className="text-xs text-neutral-500 mb-1">Links</div>
                                  <ul className="space-y-1">
                                    {links.map((href, i) => (
                                      <li key={i}>
                                        <a
                                          href={href}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="text-sm text-blue-700 underline-offset-2 hover:underline break-all"
                                        >
                                          {href}
                                        </a>
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}

                              {/* NOVO: Imagens do diário */}
                              {images.length > 0 && (
                                <div className="mt-3">
                                  <div className="text-xs text-neutral-500 mb-1">Imagens</div>
                                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                                    {images.map((src, i) => (
                                      <a
                                        key={i}
                                        href={src}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="block rounded-lg overflow-hidden border border-neutral-200 bg-white"
                                        title="Abrir em nova guia"
                                      >
                                        <img
                                          src={src}
                                          alt={`Anexo ${i + 1}`}
                                          className="w-full h-28 object-cover"
                                          loading="lazy"
                                        />
                                      </a>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ))
                )}
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}

// ----- UI subcomponents -----
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
function LinkRow({ label, href }) {
  if (!href) {
    return (
      <div className="flex items-center justify-between rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2">
        <span className="text-sm text-neutral-700">{label}</span>
        <span className="text-xs text-neutral-500">—</span>
      </div>
    );
  }
  const safeHref = String(href || "").startsWith("http") ? href : (href || "#");
  return (
    <a
      className="flex items-center justify-between rounded-lg border border-neutral-200 bg-white hover:bg-neutral-50 px-3 py-2"
      href={safeHref}
      target="_blank"
      rel="noopener noreferrer"
    >
      <span className="text-sm text-neutral-700 underline-offset-2 hover:underline">{label}</span>
      <span className="text-xs text-neutral-500 truncate max-w-[55%]">{safeHref}</span>
    </a>
  );
}
function FieldRow({ label, value }) {
  if (value === undefined || value === null || value === "") return null;
  return (
    <div className="grid grid-cols-3 gap-2 text-sm">
      <div className="col-span-1 text-neutral-500">{label}</div>
      <div className="col-span-2 font-medium">{String(value)}</div>
    </div>
  );
}
function renderTeamsPills(raw) {
  const list = Array.isArray(raw) ? raw : (raw && typeof raw === "object" ? Object.values(raw) : []);
  if (!list || list.length === 0) {
    return <div className="rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-neutral-500">—</div>;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {list.filter(Boolean).map((empresa, idx) => (
        <span key={idx} className="px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-800 text-xs border" title={empresa}>
          {empresa}
        </span>
      ))}
    </div>
  );
}
function renderExtraSections(t) {
  // Locação
  const tipo = norm(t.tipo || t.categoria || t.setor || t.area || t.areaOriginal || "");
  const isLocacao = ["locacao", "locação", "locacoes", "locações", "rental"].includes(tipo) || has(
    t,
    "dataRetirada","dataDevolucao","retiradaData","devolucaoData",
    "locadora","empresaLocadora","fornecedorLocacao","enderecoRetirada","enderecoDevolucao",
    "valorDiaria","valorTotalLocacao","camposEspecificos"
  );
  if (isLocacao) {
    return (
      <div className="mt-3">
        <div className="text-xs text-neutral-500 mb-1">Detalhes de Locação</div>
        <div className="rounded-lg border border-neutral-200 bg-white p-3 space-y-2">
          <FieldRow label="Fornecedor / Locadora" value={t.empresaLocadora || t.locadora || t.fornecedorLocacao || t.fornecedor} />
          <FieldRow label="Contato" value={t.contato || t.telefone || t.emailContato} />
          <FieldRow label="Retirada" value={`${formatDateBR(t.dataRetirada || t.retiradaData)}${t.enderecoRetirada ? " • " + t.enderecoRetirada : ""}`} />
          <FieldRow label="Devolução" value={`${formatDateBR(t.dataDevolucao || t.devolucaoData)}${t.enderecoDevolucao ? " • " + t.enderecoDevolucao : ""}`} />
          <FieldRow label="Valor diária" value={t.valorDiaria} />
          <FieldRow label="Valor total" value={t.valorTotalLocacao || t.valorTotal} />
        </div>
      </div>
    );
  }

  // Compras
  const isCompras = ["compras","compra","purchase","suprimentos","material","materiais"].includes(tipo) || has(
    t,"produto","descricaoProduto","valorUnitario","valorTotal","quantidade","prazoEntrega","fornecedor","nfNumero","pedidoNumero","cotacoes","camposEspecificos"
  );
  if (isCompras) {
    const cotacoes = Array.isArray(t.cotacoes) ? t.cotacoes : [];
    return (
      <div className="mt-3">
        <div className="text-xs text-neutral-500 mb-1">Detalhes de Compras</div>
        <div className="rounded-lg border border-neutral-200 bg-white p-3 space-y-2">
          <FieldRow label="Produto" value={t.produto || t.descricaoProduto || t.item || t.titulo} />
          <FieldRow label="Fornecedor" value={t.fornecedor || t.fornecedorCompra || t.empresa} />
          <FieldRow label="Quantidade" value={t.quantidade} />
          <FieldRow label="Valor unitário" value={t.valorUnitario} />
          <FieldRow label="Valor total" value={t.valorTotal} />
          <FieldRow label="Prazo de entrega" value={t.prazoEntrega && formatDateBR(t.prazoEntrega)} />
          <FieldRow label="Nº do pedido" value={t.pedidoNumero} />
          <FieldRow label="Nº da NF" value={t.nfNumero} />
          {cotacoes.length ? (
            <div className="pt-2">
              <div className="text-xs text-neutral-500 mb-1">Cotações</div>
              <ul className="space-y-1">
                {cotacoes.map((c, idx) => (
                  <li key={idx} className="text-sm">
                    • {(c.fornecedor || c.empresa || `Fornecedor ${idx + 1}`)} — {c.valor || c.preco || "—"}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </div>
    );
  }
  return null;
}
function renderSpecificInfoBlock(t) {
  const items = extractSpecificItems(t);
  if (!items.length) return null;
  return (
    <div className="mt-3">
      <div className="text-xs text-neutral-500 mb-1">Informações Específicas</div>
      <div className="rounded-lg border border-neutral-200 bg-white p-3">
        <ul className="space-y-2">
          {items.map((it, idx) => (
            <li key={it.idx ?? idx} className="text-sm">
              <div className="font-medium">Item {idx + 1}</div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div><span className="text-neutral-500">Código:</span> {it.codigo || "—"}</div>
                <div className="sm:col-span-2"><span className="text-neutral-500">Item:</span> {it.item || "—"}</div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div><span className="text-neutral-500">Quantidade:</span> {it.quantidade || "—"}</div>
                <div><span className="text-neutral-500">Unidade:</span> {it.unidade || "—"}</div>
                <div>
                  <span className="text-neutral-500">Vlr Un:</span> {it.valorUnitario || "—"}
                  {it.valorTotal ? ` | Vlr Total: ${it.valorTotal}` : ""}
                </div>
              </div>

              {it.idItem && (
                <div className="mt-1">
                  <span className="text-neutral-500">ID do item:</span> {it.idItem}
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
function renderMessages(t) {
  const candidates = [t.messages, t.mensagens, t.historico, t.comentarios, t.comments, t.updates];
  let arr = null;
  for (const c of candidates) {
    if (Array.isArray(c) && c.length) { arr = c; break; }
  }
  if (!arr) return null;

  const items = arr.map((m, idx) => {
    if (typeof m === "string") return { id: idx, text: m, authorName: null, createdAt: null };
    if (typeof m === "object") {
      return {
        id: m.id || idx,
        text: m.text || m.mensagem || m.message || m.descricao || "",
        authorName: m.authorName || m.autorNome || m.userName || m.usuario || null,
        createdAt: m.createdAt || m.data || m.timestamp || null,
      };
    }
    return { id: idx, text: String(m), authorName: null, createdAt: null };
  }).filter((x) => (x.text || "").trim().length > 0);

  if (items.length === 0) return null;

  return (
    <div className="mt-3">
      <div className="text-xs text-neutral-500 mb-1">Mensagens</div>
      <ul className="space-y-2">
        {items.map((m) => (
          <li key={m.id} className="rounded-lg border border-neutral-200 bg-white px-3 py-2">
            <div className="flex items-center justify-between">
              <div className="text-xs text-neutral-500">{m.authorName || "—"}</div>
              <div className="text-xs text-neutral-400">{formatDateTimeBR(m.createdAt)}</div>
            </div>
            <p className="text-sm text-neutral-800 whitespace-pre-wrap">{m.text}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
