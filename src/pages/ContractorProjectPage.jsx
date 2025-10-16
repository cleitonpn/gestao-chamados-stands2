// src/pages/ContractorProjectPage.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

// Services
import { projectService } from "../services/projectService";
import { ticketService } from "../services/ticketService";
import { userService } from "../services/userService";
import { diaryService } from "../services/diaryService";
import { eventService } from "../services/eventService";

// ---- Helpers ----
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
  if (typeof ts === "number") return ts;
  if (typeof ts === "string") {
    const n = Number(ts);
    if (!Number.isNaN(n) && n > 0) return n;
    const d = new Date(ts);
    if (!Number.isNaN(d.getTime())) return d.getTime();
  }
  if (typeof ts === "object") {
    // Firestore Timestamp
    if (has(ts, "toDate")) {
      try { return ts.toDate().getTime?.() || 0; } catch { /* ignore */ }
    }
    if (has(ts, "seconds")) {
      try {
        return (Number(ts.seconds) * 1000) + (ts.nanoseconds ? Math.floor(Number(ts.nanoseconds) / 1e6) : 0);
      } catch { /* ignore */ }
    }
  }
  return 0;
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
    executado_aguardando_validacao_operador: "Exec. (aguard. val. operador)",
    concluido: "Concluído",
    finalizado: "Concluído",
    arquivado: "Arquivado",
    fechado: "Arquivado",
  };
  return aliases[v] || s || "—";
}

function groupByStatus(tickets) {
  const m = {};
  (tickets || []).forEach((t) => {
    const st = norm(t?.status);
    const key = KNOWN_STATUSES.includes(st) ? st : (st || "aberto");
    m[key] = (m[key] || 0) + 1;
  });
  return m;
}
function calcSummary(tickets) {
  const byStatus = groupByStatus(tickets);
  const total = (tickets || []).length;
  return { total, byStatus };
}

function SectionCard({ title, right, children }) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-100 bg-neutral-50">
        <h3 className="text-sm font-semibold text-neutral-800">{title}</h3>
        {right}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

export default function ContractorProjectPage() {
  const navigate = useNavigate();
  const { role: userRole, allowedProjects = [] } = useAuth() || {};

  const [projectIdInput, setProjectIdInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [project, setProject] = useState(null);
  const [eventFull, setEventFull] = useState(null);
  const [ticketsList, setTicketsList] = useState([]);
  const [diariesGrouped, setDiariesGrouped] = useState({});
  const [ticketsSummary, setTicketsSummary] = useState({ total: 0, byStatus: {} });
  const [usersMap, setUsersMap] = useState({});
  const [error, setError] = useState("");
  const [debug, setDebug] = useState(null);

  // Sempre iniciar limpo
  useEffect(() => {
    document.title = "Painel do Empreiteiro";
    setProjectIdInput("");
    setProject(null);
    setEventFull(null);
    setTicketsList([]);
    setDiariesGrouped({});
    setTicketsSummary({ total: 0, byStatus: {} });
    setError("");
    setDebug(null);
    try { localStorage.removeItem("empreiteiro:lastProjectId"); } catch {}
  }, []);

  // Carrega usuários (opcional)
  useEffect(() => {
    (async () => {
      try {
        const getAllUsers = userService?.getAllUsers;
        if (typeof getAllUsers !== "function") return;
        const allUsers = await getAllUsers();
        const map = {};
        (allUsers || []).forEach((u) => {
          const id = u?.id || u?.uid || u?.userId;
          if (id) map[String(id)] = u;
        });
        setUsersMap(map);
      } catch (e) {
        console.error("Erro carregando usuários:", e);
      }
    })();
  }, []);

  const isProjectAllowed = (pid) => {
    if (!allowedProjects || !allowedProjects.length) return true;
    return allowedProjects.map(String).includes(String(pid));
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
      // ---- Projeto ----
      let p = null;
      try {
        if (typeof projectService?.getProjectById === "function") {
          p = await projectService.getProjectById(pid);
        }
      } catch (e) {
        console.warn("getProjectById falhou:", e);
      }

      if (!p) {
        try {
          if (typeof projectService?.getAllProjects === "function") {
            const all = await projectService.getAllProjects();
            p = (Array.isArray(all) ? all : []).find((x) => String(x?.id) === String(pid)) || null;
          }
        } catch (e) {
          console.warn("getAllProjects falhou:", e);
        }
      }

      if (!p) {
        setError("Projeto não encontrado.");
        setProject(null);
        setEventFull(null);
        setTicketsList([]);
        setDiariesGrouped({});
        setTicketsSummary({ total: 0, byStatus: {} });
        setDebug({ step: "no_project", pid });
        return;
      }

      setProject(p);

      // ---- Evento ----
      let evFull = null;
      try {
        const getAllEvents = eventService?.getAllEvents;
        const evsRaw = typeof getAllEvents === "function" ? await getAllEvents() : [];
        const evs = Array.isArray(evsRaw) ? evsRaw : [];
        const evId = p?.eventId || p?.eventoId || p?.feiraId;
        const evName = p?.feira || p?.evento || p?.eventName || p?.nomeEvento;
        const evById = evs.find((e) => String(e?.id) === String(evId));
        const evByName = evs.find((e) => norm(e?.nome || e?.name || e?.titulo) === norm(evName));
        const ev = evById || evByName || null;
        evFull = ev
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
              manualFeiraUrl: ev.manualFeiraUrl || ev.linkManual || null,
              plantaFeiraUrl: ev.plantaFeiraUrl || ev.linkPlanta || null,
            }
          : null;
      } catch (e) {
        console.warn("Falha ao carregar evento completo:", e);
      }
      setEventFull(evFull);

      // ---- Tickets ----
      let tickets = [];
      try {
        if (typeof ticketService?.getTicketsByProjectId === "function") {
          tickets = (await ticketService.getTicketsByProjectId(p?.id)) || [];
        }
      } catch (e) {
        console.warn("getTicketsByProjectId falhou:", e);
      }
      setTicketsList(Array.isArray(tickets) ? tickets : []);
      setTicketsSummary(calcSummary(Array.isArray(tickets) ? tickets : []));

      // ---- Diários ----
      let diaries = [];
      try {
        if (typeof diaryService?.getDiariesByProjectId === "function") {
          diaries = (await diaryService.getDiariesByProjectId(p?.id)) || [];
        }
      } catch (e) {
        console.warn("getDiariesByProjectId falhou:", e);
      }
      const grouped = {};
      (Array.isArray(diaries) ? diaries : []).forEach((d) => {
        const key = formatDateBR(d?.createdAt || d?.data || d?.date || d?.dt);
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(d);
      });
      setDiariesGrouped(grouped);

      setDebug({ step: "done", pid, projectId: p?.id, ticketsCount: tickets?.length || 0, diariesCount: diaries?.length || 0 });
    } catch (e) {
      console.error(e);
      setError("Erro ao carregar dados do projeto.");
      setDebug({ step: "catch", message: String(e?.message || e) });
    } finally {
      setLoading(false);
    }
  }

  const ticketsByStatus = useMemo(() => {
    const g = {};
    (ticketsList || []).forEach((t) => {
      const st = norm(t?.status);
      const key = KNOWN_STATUSES.includes(st) ? st : (st || "aberto");
      if (!g[key]) g[key] = [];
      g[key].push(t);
    });
    return g;
  }, [ticketsList]);

  const projectInfo = useMemo(() => {
    if (!project) return [];
    const consultant = usersMap?.[project?.consultorId]?.displayName || project?.consultor || "—";
    const producer = usersMap?.[project?.produtorId]?.displayName || project?.produtor || "—";
    const terceirizadas = Array.isArray(project?.equipesTerceirizadas)
      ? project.equipesTerceirizadas.join(", ")
      : (project?.marceneiro || project?.terceirizados || "—");

    const evName = eventFull?.name || project?.evento || project?.feira || "—";
    const montagem = `${formatDateBR(eventFull?.dataInicioMontagem)} → ${formatDateBR(eventFull?.dataFimMontagem)}`;
    const evento = `${formatDateBR(eventFull?.dataInicioEvento)} → ${formatDateBR(eventFull?.dataFimEvento)}`;
    const desmontagem = `${formatDateBR(eventFull?.dataInicioDesmontagem)} → ${formatDateBR(eventFull?.dataFimDesmontagem)}`;
    const pavilhao = eventFull?.pavilhao || "—";

    return [
      { k: "Projeto", v: project?.nome || project?.cliente || project?.id || "—" },
      { k: "Consultor(a)", v: consultant },
      { k: "Produtor(a)", v: producer },
      { k: "Equipes terceirizadas", v: terceirizadas || "—" },
      { k: "Evento", v: evName },
      { k: "Pavilhão", v: pavilhao },
      { k: "Montagem", v: montagem },
      { k: "Evento", v: evento },
      { k: "Desmontagem", v: desmontagem },
    ];
  }, [project, eventFull, usersMap]);

  return (
    <div className="w-full min-h-[100dvh] bg-neutral-50">
      <div className="mx-auto max-w-7xl px-4 py-6">
        {/* Cabeçalho */}
        <div className="flex items-start justify-between gap-3 pb-4">
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
                autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false}
              />
            </div>
            <button
              type="button"
              onClick={() => handleLoad()}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 active:bg-blue-800 disabled:opacity-60"
              disabled={loading}
              title="Carregar dados"
            >
              Carregar
            </button>
          </div>
        </div>

        {/* Alertas */}
        {!!error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Debug opcional (só em caso de problema) */}
        {debug && (
          <pre className="mb-4 overflow-auto rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
            {JSON.stringify(debug, null, 2)}
          </pre>
        )}

        {/* Corpo */}
        {!project ? (
          <div className="rounded-xl border border-dashed border-neutral-300 bg-white p-10 text-center text-neutral-500">
            Cole o ID do projeto acima e clique em <b>Carregar</b>.
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            {/* Coluna 1: Info do projeto */}
            <div className="xl:col-span-1 space-y-6">
              <SectionCard title="Informações do Projeto">
                <dl className="grid grid-cols-1 gap-y-3">
                  {projectInfo.map(({ k, v }) => (
                    <div key={k} className="flex items-start justify-between gap-3">
                      <dt className="text-sm text-neutral-500">{k}</dt>
                      <dd className="text-sm font-medium text-neutral-800 text-right">{v || "—"}</dd>
                    </div>
                  ))}
                </dl>
                {(eventFull?.manualFeiraUrl || eventFull?.plantaFeiraUrl) && (
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    {eventFull?.manualFeiraUrl && (
                      <a
                        href={eventFull.manualFeiraUrl}
                        target="_blank" rel="noreferrer"
                        className="rounded-md border border-neutral-200 px-3 py-1.5 text-xs hover:bg-neutral-50"
                      >
                        Manual da feira
                      </a>
                    )}
                    {eventFull?.plantaFeiraUrl && (
                      <a
                        href={eventFull.plantaFeiraUrl}
                        target="_blank" rel="noreferrer"
                        className="rounded-md border border-neutral-200 px-3 py-1.5 text-xs hover:bg-neutral-50"
                      >
                        Planta da feira
                      </a>
                    )}
                  </div>
                )}
              </SectionCard>

              <SectionCard
                title="Resumo de Chamados"
                right={
                  <div className="text-xs text-neutral-500">
                    Total: <b>{ticketsSummary.total}</b>
                  </div>
                }
              >
                <div className="grid grid-cols-2 gap-2">
                  {KNOWN_STATUSES.map((s) => (
                    <div
                      key={s}
                      className="flex items-center justify-between rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm"
                    >
                      <span className="text-neutral-600">{prettyStatus(s)}</span>
                      <span className="font-semibold text-neutral-900">{ticketsSummary.byStatus[s] || 0}</span>
                    </div>
                  ))}
                </div>
              </SectionCard>
            </div>

            {/* Coluna 2: Tickets do projeto */}
            <div className="xl:col-span-2 space-y-6">
              <SectionCard
                title="Chamados do Projeto"
                right={<div className="text-xs text-neutral-500">{ticketsList.length} itens</div>}
              >
                {KNOWN_STATUSES.map((s) => {
                  const list = ticketsByStatus[s] || [];
                  if (!list.length) return null;
                  return (
                    <div key={s} className="mb-4">
                      <div className="mb-2 text-xs font-semibold text-neutral-700 uppercase tracking-wide">
                        {prettyStatus(s)} — {list.length}
                      </div>
                      <ul className="space-y-2">
                        {list.map((t) => (
                          <li key={t?.id || `${s}-${Math.random()}`} className="rounded-lg border border-neutral-200 bg-white p-3">
                            <div className="flex items-center justify-between text-sm">
                              <div className="font-medium text-neutral-900">{t?.titulo || t?.title || `#${t?.id || "—"}`}</div>
                              <div className="text-xs text-neutral-500">{formatDateTimeBR(t?.createdAt)}</div>
                            </div>
                            <div className="mt-1 grid grid-cols-2 md:grid-cols-4 gap-2 text-xs text-neutral-600">
                              <div><span className="text-neutral-500">Área:</span> {t?.areaAtual || t?.area || "—"}</div>
                              <div><span className="text-neutral-500">Atribuído a:</span> {t?.atribuido_a || t?.assignee || "—"}</div>
                              <div><span className="text-neutral-500">Prioridade:</span> {t?.prioridade || "—"}</div>
                              <div><span className="text-neutral-500">Status:</span> {prettyStatus(t?.status)}</div>
                            </div>
                            {t?.descricao && (
                              <p className="mt-2 text-sm text-neutral-800 whitespace-pre-wrap">
                                {t.descricao}
                              </p>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
                {!ticketsList.length && (
                  <div className="text-sm text-neutral-500">Nenhum chamado encontrado para este projeto.</div>
                )}
              </SectionCard>

              <SectionCard title="Diários do Projeto">
                {Object.keys(diariesGrouped).length === 0 ? (
                  <div className="text-sm text-neutral-500">Nenhum diário encontrado.</div>
                ) : (
                  <div className="space-y-4">
                    {Object.entries(diariesGrouped).map(([day, items]) => (
                      <div key={day} className="border border-neutral-200 rounded-lg">
                        <div className="bg-neutral-50 px-3 py-2 text-xs font-semibold text-neutral-700">{day}</div>
                        <ul className="divide-y divide-neutral-100">
                          {items.map((d) => (
                            <li key={d?.id || `${day}-${Math.random()}`} className="p-3 text-sm">
                              <div className="flex items-center justify-between">
                                <div className="text-neutral-800">{d?.titulo || d?.title || `Diário ${d?.id || "—"}`}</div>
                                <div className="text-xs text-neutral-500">{formatDateTimeBR(d?.createdAt)}</div>
                              </div>
                              {d?.texto && (
                                <p className="mt-1 text-neutral-700 whitespace-pre-wrap">{d.texto}</p>
                              )}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                )}
              </SectionCard>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
