// src/pages/ProjectSummaryPage.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

// Services
import { projectService } from "../services/projectService";
import { ticketService } from "../services/ticketService";
import { userService } from "../services/userService";
import { diaryService } from "../services/diaryService";
import { eventService } from "../services/eventService";

/**
 * Resumo do Projeto
 * - Botões: ← Dashboard e Imprimir
 * - Eventos + datas (via eventService) e projetos por evento (respeita papel)
 * - Cards de chamados (totais) e lista detalhada:
 * título, data, descrição, status, MENSAGENS e INFORMAÇÕES ESPECÍFICAS
 * (inclui locação/compras). **Oculta** chamados financeiros sensíveis.
 * - Diários agrupados por dia + (NOVO) Links e Imagens
 * - (NOVO) Links Úteis: Manual da Feira, Planta da Feira e Pasta do Projeto (Drive)
 */

const DASHBOARD_PATH = "/dashboard"; // ajuste se sua rota for outra

const STATUS_LABELS = {
  aberto: "Aberto",
  em_tratativa: "Em Tratativa",
  executado_aguardando_validacao: "Executado (aguard. validação)",
  executado_aguardando_validacao_operador: "Exec. (aguard. val. operador)",
  concluido: "Concluído",
  arquivado: "Arquivado",
};
const KNOWN_STATUSES = Object.keys(STATUS_LABELS);

// utils
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
function projectMatchesEvent(project, eventObj) {
  if (!project || !eventObj) return false;
  const pEventId = project.eventId || project.eventoId || project.feiraId;
  if (pEventId && eventObj.id && String(pEventId) === String(eventObj.id)) return true;
  const pEventName = project.feira || project.evento || project.eventName || project.nomeEvento;
  if (pEventName && eventObj.name && norm(pEventName) === norm(eventObj.name)) return true;
  if (!pEventId && eventObj.id && norm(eventObj.id) === norm(pEventName)) return true;
  return false;
}

/* ===== Helpers novos: Links úteis (evento/projeto) ===== */
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

/* ===== Helpers novos: Links e Imagens nos diários ===== */
function isHttpUrl(u) {
  try {
    const x = new URL(String(u));
    return x.protocol === "http:" || x.protocol === "https:";
  } catch { return false; }
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

export default function ProjectSummaryPage() {
  const auth = (typeof useAuth === "function" ? useAuth() : {}) || {};
  const uid = auth?.currentUser?.uid || auth?.user?.uid || null;
  const userRoleRaw = auth?.role || auth?.userProfile?.funcao || null;
  const userRole = (userRoleRaw || "").toString().toLowerCase();

  const [loading, setLoading] = useState(false);

  const [events, setEvents] = useState([]);
  const [eventsFull, setEventsFull] = useState([]);
  const [selectedEventId, setSelectedEventId] = useState("");

  const [allAccessibleProjects, setAllAccessibleProjects] = useState([]);
  const [projectsForEvent, setProjectsForEvent] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState("");

  const [projectData, setProjectData] = useState(null);
  const [usersMap, setUsersMap] = useState({});
  const [ticketsSummary, setTicketsSummary] = useState({ total: 0, byStatus: {} });
  const [ticketsList, setTicketsList] = useState([]);
  const [diariesGrouped, setDiariesGrouped] = useState({});

  const navigate = useNavigate();
  const goDashboard = () => navigate(DASHBOARD_PATH);

  useEffect(() => { document.title = "Resumo do Projeto"; }, []);

  // Carrega projetos + usuários + eventos
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [allProjects, allUsers, evs] = await Promise.all([
          projectService.getAllProjects(),
          userService.getAllUsers(),
          eventService.getAllEvents?.().catch(() => []) || [],
        ]);

        const umap = {};
        (allUsers || []).forEach((u) => {
          const id = u.id || u.uid || u.userId;
          if (id) umap[String(id)] = u;
        });
        setUsersMap(umap);

        let accessible = [...(allProjects || [])];
        if (["produtor", "consultor"].includes(userRole) && uid) {
          accessible = accessible.filter((p) => {
            const pid = String(p?.producerId || p?.produtorId || p?.produtorUid || "");
            const cid = String(p?.consultantId || p?.consultorId || p?.consultorUid || "");
            if (userRole === "produtor") return pid === String(uid);
            if (userRole === "consultor") return cid === String(uid);
            return true;
          });
        }
        setAllAccessibleProjects(accessible);

        // eventos derivados dos projetos
        const byKey = new Map();
        accessible.forEach((p) => {
          const id = p?.eventId || p?.eventoId || p?.feiraId || null;
          const name = p?.feira || p?.evento || p?.eventName || p?.nomeEvento || null;
          if (name) {
            const k = norm(id || name);
            if (!byKey.has(k)) byKey.set(k, { id: id || name, name });
          }
        });
        setEvents(Array.from(byKey.values()).sort((a, b) => norm(a.name).localeCompare(norm(b.name))));

        // eventos (com datas)
        const mappedFull = (evs || []).map((e) => ({
          id: e.id,
          name: e.nome || e.name || e.titulo || e.id,
          pavilhao: e.pavilhao || null,
          dataInicioMontagem: e.dataInicioMontagem || e.montagemInicio,
          dataFimMontagem: e.dataFimMontagem || e.montagemFim,
          dataInicioEvento: e.dataInicioEvento || e.eventoInicio,
          dataFimEvento: e.dataFimEvento || e.eventoFim,
          dataInicioDesmontagem: e.dataInicioDesmontagem || e.desmontagemInicio,
          dataFimDesmontagem: e.dataFimDesmontagem || e.desmontagemFim,
          ...e, // <-- CORREÇÃO APLICADA AQUI
        }));
        setEventsFull(mappedFull);
      } catch (e) {
        console.error("Erro ao carregar dados iniciais:", e);
        setAllAccessibleProjects([]);
        setEvents([]);
        setEventsFull([]);
        setUsersMap({});
      } finally {
        setLoading(false);
      }
    })();
  }, [uid, userRole]);

  // Filtra projetos do evento
  useEffect(() => {
    if (!selectedEventId) {
      setProjectsForEvent([]);
      setSelectedProjectId("");
      return;
    }
    const ev = events.find((e) => String(e.id) === String(selectedEventId));
    if (!ev) {
      setProjectsForEvent([]);
      setSelectedProjectId("");
      return;
    }
    const list = allAccessibleProjects.filter((p) => projectMatchesEvent(p, ev));
    list.sort((a, b) =>
      norm(a?.name || a?.titulo || a?.nome || "").localeCompare(
        norm(b?.name || b?.titulo || b?.nome || "")
      )
    );
    setProjectsForEvent(list);
    if (selectedProjectId && !list.some((p) => p.id === selectedProjectId)) {
      setSelectedProjectId("");
      setProjectData(null);
    }
  }, [selectedEventId, events, allAccessibleProjects]);

  // Seleciona projeto -> tickets + diários
  useEffect(() => {
    if (!selectedProjectId) {
      setProjectData(null);
      setTicketsSummary({ total: 0, byStatus: {} });
      setTicketsList([]);
      setDiariesGrouped({});
      return;
    }
    (async () => {
      setLoading(true);
      try {
        const p =
          projectsForEvent.find((x) => x.id === selectedProjectId) ||
          allAccessibleProjects.find((x) => x.id === selectedProjectId) ||
          null;
        setProjectData(p || null);

        const allTickets = await ticketService.getAllTickets();
        const tickets = filterTicketsForProject(allTickets, selectedProjectId);
        setTicketsList(tickets);
        setTicketsSummary(buildTicketSummary(tickets));

        const feed = await diaryService
          .fetchFeedByProject?.({ projectId: selectedProjectId, pageSize: 500 })
          .catch(() => ({ items: [] }));
        const grouped = groupDiariesByDay(feed?.items || []);
        setDiariesGrouped(grouped);
      } catch (e) {
        console.error("Erro ao carregar dados do projeto:", e);
      } finally {
        setLoading(false);
      }
    })();
  }, [selectedProjectId]);

  const selectedEvent = useMemo(
    () => events.find((e) => String(e.id) === String(selectedEventId)) || null,
    [events, selectedEventId]
  );

  const selectedEventFull = useMemo(() => {
    if (!selectedEvent) return null;
    const byId = eventsFull.find((e) => String(e.id) === String(selectedEvent.id));
    if (byId) return byId;
    const byName = eventsFull.find((e) => norm(e.name) === norm(selectedEvent.name));
    return byName || null;
  }, [selectedEvent, eventsFull]);

  const names = useMemo(() => {
    const cId = projectData?.consultantId || projectData?.consultorId || projectData?.consultorUid;
    const pId = projectData?.producerId || projectData?.produtorId || projectData?.produtorUid;
    const c = (cId && usersMap[String(cId)]) || {};
    const p = (pId && usersMap[String(pId)]) || {};
    const display = (u) => u.displayName || u.nome || u.name || u.email || "—";
    return { consultantName: display(c), producerName: display(p) };
  }, [projectData, usersMap]);

  const handlePrint = () => window.print();

  // NOVO: Links úteis do evento e pasta do projeto
  const { manual: linkManual, planta: linkPlanta } = extractEventLinks(selectedEventFull || {});
  const linkDrive = extractProjectDriveLink(projectData);

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
            <button
              type="button"
              onClick={goDashboard}
              className="inline-flex items-center gap-2 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm hover:bg-neutral-50"
              title="Voltar para a Dashboard"
            >
              ← Dashboard
            </button>
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
                disabled={!selectedEventId || projectsForEvent.length === 0}
              >
                {!selectedEventId ? (
                  <option value="">Selecione um evento primeiro...</option>
                ) : projectsForEvent.length === 0 ? (
                  <option value="">Nenhum projeto disponível</option>
                ) : (
                  <option value="">Selecione um projeto...</option>
                )}
                {projectsForEvent.map((p) => (
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
      <div className="mx-auto max-w-7xl px-4 py-6 space-y-6">
        {!selectedProjectId ? (
          <div className="rounded-xl border border-dashed border-neutral-300 bg-white p-8 text-neutral-600">
            Selecione um evento e um projeto para visualizar o resumo.
          </div>
        ) : !projectData ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-red-700">
            Não foi possível carregar os dados do projeto selecionado.
          </div>
        ) : (
          <>
            {/* Dados + Chamados + (NOVO) Links úteis */}
            <section className="print-block grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 rounded-2xl bg-white border border-neutral-200 shadow-sm">
                <header className="border-b border-neutral-200 px-5 py-4">
                  <h2 className="text-lg font-semibold">Dados do Projeto</h2>
                  {selectedEvent && (
                    <p className="text-sm text-neutral-500">
                      Evento:{" "}
                      <span className="font-medium">
                        {selectedEvent?.name || selectedEvent?.titulo || selectedEvent?.nome}
                      </span>
                      {selectedEventFull?.pavilhao ? (
                        <span className="ml-2">• Pavilhão: {selectedEventFull.pavilhao}</span>
                      ) : null}
                    </p>
                  )}
                </header>
                <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                  <Field label="Projeto" value={projectData?.name || projectData?.titulo || projectData?.nome || "—"} />
                  <Field label="Consultor" value={names.consultantName || "—"} />
                  <Field label="Produtor" value={names.producerName || "—"} />

                  <Field
                    label="Montagem"
                    value={
                      (projectData?.montagem?.dataInicio || projectData?.montagem?.dataFim)
                        ? `${formatDateBR(projectData?.montagem?.dataInicio)} — ${formatDateBR(projectData?.montagem?.dataFim)}`
                        : (selectedEventFull ? `${formatDateBR(selectedEventFull?.dataInicioMontagem)} — ${formatDateBR(selectedEventFull?.dataFimMontagem)}` : "—")
                    }
                  />
                  <Field
                    label="Evento"
                    value={
                      (projectData?.evento?.dataInicio || projectData?.evento?.dataFim)
                        ? `${formatDateBR(projectData?.evento?.dataInicio)} — ${formatDateBR(projectData?.evento?.dataFim)}`
                        : (selectedEventFull ? `${formatDateBR(selectedEventFull?.dataInicioEvento)} — ${formatDateBR(selectedEventFull?.dataFimEvento)}` : "—")
                    }
                  />
                  <Field
                    label="Desmontagem"
                    value={
                      (projectData?.desmontagem?.dataInicio || projectData?.desmontagem?.dataFim)
                        ? `${formatDateBR(projectData?.desmontagem?.dataInicio)} — ${formatDateBR(projectData?.desmontagem?.dataFim)}`
                        : (selectedEventFull ? `${formatDateBR(selectedEventFull?.dataInicioDesmontagem)} — ${formatDateBR(selectedEventFull?.dataFimDesmontagem)}` : "—")
                    }
                  />

                  <div className="sm:col-span-2">
                    <div className="text-[13px] text-neutral-500 mb-1">Equipes terceirizadas</div>
                    {renderTeamsPills(
                      projectData?.equipesEmpreiteiras ||
                      projectData?.thirdPartyTeams ||
                      projectData?.fornecedores
                    )}
                  </div>
                </div>
              </div>

              {/* KPIs de chamados */}
              <div className="rounded-2xl bg-white border border-neutral-200 shadow-sm">
                <header className="border-b border-neutral-200 px-5 py-4">
                  <h2 className="text-lg font-semibold">Chamados</h2>
                </header>
                <div className="p-5 space-y-4">
                  <KPI label="Total" value={ticketsSummary?.total || 0} />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <KPI label={STATUS_LABELS.aberto} value={ticketsSummary?.byStatus?.aberto || 0} />
                    <KPI label={STATUS_LABELS.em_tratativa} value={ticketsSummary?.byStatus?.em_tratativa || 0} />
                    <KPI
                      label="Executado (aguard. validação)"
                      value={(ticketsSummary?.byStatus?.executado_aguardando_validacao || 0) +
                             (ticketsSummary?.byStatus?.executado_aguardando_validacao_operador || 0)}
                    />
                    <KPI label={STATUS_LABELS.concluido} value={ticketsSummary?.byStatus?.concluido || 0} />
                    <KPI label={STATUS_LABELS.arquivado} value={ticketsSummary?.byStatus?.arquivado || 0} />
                  </div>
                </div>
              </div>

              {/* (NOVO) Links úteis */}
              <div className="rounded-2xl bg-white border border-neutral-200 shadow-sm">
                <header className="border-b border-neutral-200 px-5 py-4">
                  <h2 className="text-lg font-semibold">Links Úteis</h2>
                </header>
                <div className="p-5 space-y-3 text-sm">
                  <LinkRow label="Manual da feira" href={linkManual} />
                  <LinkRow label="Planta da feira" href={linkPlanta} />
                  <LinkRow label="Pasta do projeto (Drive)" href={linkDrive} />
                </div>
              </div>
            </section>

            {/* Lista detalhada de chamados */}
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

            {/* Diários agrupados por dia (com links e imagens) */}
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
                              <p className="mt-1 text-sm text-neutral-700 whitespace-pre-wrap">{(d.text || "").trim() || "—"}</p>

                              {/* Links do diário */}
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

                              {/* Imagens do diário */}
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

/* ===== UI helpers ===== */
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
function FieldRow({ label, value }) {
  if (value === undefined || value === null || value === "") return null;
  return (
    <div className="grid grid-cols-3 gap-2 text-sm">
      <div className="col-span-1 text-neutral-500">{label}</div>
      <div className="col-span-2 font-medium">{String(value)}</div>
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

/* ===== Regra de privacidade p/ Financeiro ===== */
function isSensitiveFinanceTicket(t) {
  // área/categoria precisa ser Financeiro
  const area = norm(t.area || t.setor || t.categoria || t.areaOriginal || "");
  const isFinance = ["financeiro", "financas", "finanças"].includes(area);
  if (!isFinance) return false;

  // tipo do chamado (várias variações)
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

/* ===== Tickets helpers ===== */
function filterTicketsForProject(all, projectId) {
  const pid = String(projectId);
  // 1) pertencem ao projeto
  let list = (all || []).filter((t) => {
    if (!t) return false;
    if (String(t.projetoId || "") === pid) return true;
    if (String(t.projectId || "") === pid) return true;
    if (t.project && String(t.project.id || "") === pid) return true;
    if (Array.isArray(t.projetos) && t.projetos.map(String).includes(pid)) return true;
    if (Array.isArray(t.projectIds) && t.projectIds.map(String).includes(pid)) return true;
    return false;
  });

  // 2) remove chamados financeiros sensíveis
  list = list.filter((t) => !isSensitiveFinanceTicket(t));

  // 3) ordena por atualização/criação mais recente
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

/* ===== Locação & Compras: detecção e extras ===== */
function isLocacaoTicket(t) {
  const tipo = norm(t.tipo || t.categoria || t.setor || t.area || t.areaOriginal || "");
  if (["locacao", "locação", "locacoes", "locações", "rental"].includes(tipo)) return true;
  return has(
    t,
    "dataRetirada","dataDevolucao","retiradaData","devolucaoData",
    "locadora","empresaLocadora","fornecedorLocacao","enderecoRetirada","enderecoDevolucao",
    "valorDiaria","valorTotalLocacao","camposEspecificos"
  );
}
function isComprasTicket(t) {
  const tipo = norm(t.tipo || t.categoria || t.setor || t.area || t.areaOriginal || "");
  if (["compras","compra","purchase","suprimentos","material","materiais"].includes(tipo)) return true;
  return has(t,"produto","descricaoProduto","valorUnitario","valorTotal","quantidade","prazoEntrega","fornecedor","nfNumero","pedidoNumero","cotacoes","camposEspecificos");
}

function renderExtraSections(t) {
  if (isLocacaoTicket(t)) {
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
  if (isComprasTicket(t)) {
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

/* ===== Informações Específicas (itens) ===== */
function toArrayFromUnknown(x) {
  if (!x) return [];
  if (Array.isArray(x)) return x;
  if (typeof x === "object") return Object.keys(x).map((k) => ({ _key: k, ...x[k] }));
  return [];
}
function extractSpecificItems(t) {
  // prioridade para 'camposEspecificos' (como no seu Firestore)
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
      // Firestore: codItem, id, item, quantidade
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

/* ===== Mensagens ===== */
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

/* ===== Diários ===== */
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
