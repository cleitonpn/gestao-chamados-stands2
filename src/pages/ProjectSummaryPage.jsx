import React, { useEffect, useMemo, useState } from "react";
import { useAuth } from "../contexts/AuthContext";

// ✅ Use os services já existentes no projeto (mesmos paths usados na Dashboard)
import { projectService } from "../services/projectService";
import { ticketService } from "../services/ticketService";
import { userService } from "../services/userService";

/**
 * Página: Resumo do Projeto
 * - Deriva os EVENTOS a partir dos projetos acessíveis (campos: feira | evento | eventName | nomeEvento, e eventId opcional)
 * - Filtra projetos por evento respeitando a role (produtor/consultor)
 * - Mostra dados do projeto, resumo de chamados por status e (opcional) diários
 * - Botão "Imprimir" com CSS de impressão
 *
 * ❌ Sem dependência direta do Firebase/Firestore aqui (usa apenas os services).
 */

const STATUS_LABELS = {
  aberto: "Aberto",
  em_tratativa: "Em Tratativa",
  executado_aguardando_validacao: "Executado (aguard. validação)",
  executado_aguardando_validacao_operador: "Exec. (aguard. val. operador)",
  concluido: "Concluído",
  arquivado: "Arquivado",
};
const INTERESTING_STATUSES = Object.keys(STATUS_LABELS);

// Utils
const norm = (s) => (s || "").toString().trim().toLowerCase();
function formatDateBR(tsLike) {
  if (!tsLike) return "—";
  let d = null;
  if (tsLike instanceof Date) d = tsLike;
  else if (typeof tsLike === "string" || typeof tsLike === "number") d = new Date(tsLike);
  else if (tsLike && typeof tsLike === "object" && typeof tsLike.toDate === "function") d = tsLike.toDate();
  else if (tsLike && typeof tsLike === "object" && "seconds" in tsLike) d = new Date(tsLike.seconds * 1000);
  if (!d || isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

// Match de projeto x evento por id ou por nome
function projectMatchesEvent(project, eventObj) {
  if (!project || !eventObj) return false;
  const pEventId = project.eventId || project.eventoId || project.feiraId;
  if (pEventId && eventObj.id && String(pEventId) === String(eventObj.id)) return true;

  const pEventName = project.feira || project.evento || project.eventName || project.nomeEvento;
  if (pEventName && eventObj.name && norm(pEventName) === norm(eventObj.name)) return true;

  // fallback (id = nome)
  if (!pEventId && eventObj.id && norm(eventObj.id) === norm(pEventName)) return true;
  return false;
}

export default function ProjectSummaryPage() {
  // Compat: tanto {currentUser, role} quanto {user, userProfile}
  const auth = (typeof useAuth === "function" ? useAuth() : {}) || {};
  const uid = auth?.currentUser?.uid || auth?.user?.uid || null;
  const userRoleRaw = auth?.role || auth?.userProfile?.funcao || null;
  const userRole = (userRoleRaw || "").toString().toLowerCase();

  const [loading, setLoading] = useState(false);

  // Eventos & Projetos
  const [events, setEvents] = useState([]); // [{id,name}]
  const [selectedEventId, setSelectedEventId] = useState("");
  const [allAccessibleProjects, setAllAccessibleProjects] = useState([]);
  const [projectsForEvent, setProjectsForEvent] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState("");

  // Dados agregados
  const [projectData, setProjectData] = useState(null);
  const [usersMap, setUsersMap] = useState({}); // {uid: {nome, displayName, ...}}
  const [ticketsSummary, setTicketsSummary] = useState({ total: 0, byStatus: {} });
  const [diaries, setDiaries] = useState([]); // opcional

  useEffect(() => { document.title = "Resumo do Projeto"; }, []);

  // 1) Carrega todos os projetos acessíveis + deriva eventos + carrega usuários
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [allProjects, allUsers] = await Promise.all([
          projectService.getAllProjects(),
          userService.getAllUsers(),
        ]);

        // Mapa de usuários
        const umap = {};
        (allUsers || []).forEach(u => {
          const id = u.id || u.uid || u.userId;
          if (id) umap[String(id)] = u;
        });
        setUsersMap(umap);

        // Restringe projetos por role
        let accessible = [...allProjects];
        if (["produtor", "consultor"].includes(userRole) && uid) {
          accessible = accessible.filter((p) => {
            const pid = String(p?.producerId || p?.produtorId || "");
            const cid = String(p?.consultantId || p?.consultorId || "");
            if (userRole === "produtor") return pid === String(uid);
            if (userRole === "consultor") return cid === String(uid);
            return true;
          });
        }
        setAllAccessibleProjects(accessible);

        // Deriva eventos a partir dos projetos acessíveis
        const mapByKey = new Map();
        accessible.forEach((p) => {
          const id = p?.eventId || p?.eventoId || p?.feiraId || null;
          const name = p?.feira || p?.evento || p?.eventName || p?.nomeEvento || null;
          if (name) {
            const key = norm(id || name);
            if (!mapByKey.has(key)) mapByKey.set(key, { id: id || name, name });
          }
        });
        const evs = Array.from(mapByKey.values()).sort((a, b) => norm(a.name).localeCompare(norm(b.name)));
        setEvents(evs);
      } catch (e) {
        console.error("Erro ao carregar projetos/eventos/usuários:", e);
        setEvents([]);
        setAllAccessibleProjects([]);
        setUsersMap({});
      } finally {
        setLoading(false);
      }
    })();
  }, [uid, userRole]);

  // 2) Ao escolher evento, filtra projetos em memória
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
    list.sort((a, b) => norm(a?.name || a?.titulo || a?.nome || "").localeCompare(norm(b?.name || b?.titulo || b?.nome || "")));
    setProjectsForEvent(list);
    if (selectedProjectId && !list.some((p) => p.id === selectedProjectId)) {
      setSelectedProjectId("");
      setProjectData(null);
    }
  }, [selectedEventId, events, allAccessibleProjects]);

  // 3) Ao escolher projeto, carrega dados + sumariza chamados
  useEffect(() => {
    if (!selectedProjectId) {
      setProjectData(null);
      setTicketsSummary({ total: 0, byStatus: {} });
      setDiaries([]);
      return;
    }
    (async () => {
      setLoading(true);
      try {
        const p = projectsForEvent.find((x) => x.id === selectedProjectId) || allAccessibleProjects.find((x) => x.id === selectedProjectId) || null;
        setProjectData(p || null);

        // Resumo de Chamados com ticketService
        await summarizeTicketsForProject(selectedProjectId, setTicketsSummary);

        // Diários (opcional): se você tiver diaryService, podemos integrar depois
        setDiaries([]);
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

  const names = useMemo(() => {
    const cId = projectData?.consultantId || projectData?.consultorId;
    const pId = projectData?.producerId || projectData?.produtorId;
    const c = (cId && usersMap[String(cId)]) || {};
    const p = (pId && usersMap[String(pId)]) || {};
    const display = (u) => u.displayName || u.nome || u.name || u.email || "—";
    return { consultantName: display(c), producerName: display(p) };
  }, [projectData, usersMap]);

  const thirdPartyTeams = useMemo(() => {
    if (!projectData) return [];
    const raw = projectData?.thirdPartyTeams || projectData?.equipesTerceirizadas || projectData?.fornecedores || [];
    if (Array.isArray(raw)) return raw;
    if (raw && typeof raw === "object") return Object.keys(raw).map((k) => raw[k]);
    return [];
  }, [projectData]);

  const perf = useMemo(
    () => ({
      totalChamados: ticketsSummary?.total || 0,
      abertos: ticketsSummary?.byStatus?.aberto || 0,
      emTratativa: ticketsSummary?.byStatus?.em_tratativa || 0,
      executadoAguardandoValidacao:
        (ticketsSummary?.byStatus?.executado_aguardando_validacao || 0) +
        (ticketsSummary?.byStatus?.executado_aguardando_validacao_operador || 0),
      concluidos: ticketsSummary?.byStatus?.concluido || 0,
      arquivados: ticketsSummary?.byStatus?.arquivado || 0,
    }),
    [ticketsSummary]
  );

  function handlePrint() {
    window.print();
  }

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
            {/* Dados do Projeto */}
            <section className="print-block lg:col-span-2 rounded-2xl bg-white border border-neutral-200 shadow-sm">
              <header className="border-b border-neutral-200 px-5 py-4">
                <h2 className="text-lg font-semibold">Dados do Projeto</h2>
                {selectedEvent && (
                  <p className="text-sm text-neutral-500">
                    Evento:{" "}
                    <span className="font-medium">
                      {selectedEvent?.name || selectedEvent?.titulo || selectedEvent?.nome}
                    </span>
                  </p>
                )}
              </header>
              <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                <Field label="Projeto" value={projectData?.name || projectData?.titulo || projectData?.nome || "—"} />
                <Field label="Consultor" value={(usersMap[String(projectData?.consultantId || projectData?.consultorId)]?.displayName) || (usersMap[String(projectData?.consultantId || projectData?.consultorId)]?.nome) || "—"} />
                <Field label="Produtor" value={(usersMap[String(projectData?.producerId || projectData?.produtorId)]?.displayName) || (usersMap[String(projectData?.producerId || projectData?.produtorId)]?.nome) || "—"} />
                <Field label="Montagem" value={formatDateBR(projectData?.montagemDate || projectData?.dataMontagem)} />
                <Field label="Evento" value={formatDateBR(projectData?.eventoDate || projectData?.dataEvento)} />
                <Field label="Desmontagem" value={formatDateBR(projectData?.desmontagemDate || projectData?.dataDesmontagem)} />

                <div className="sm:col-span-2">
                  <div className="text-[13px] text-neutral-500 mb-1">Equipes terceirizadas</div>
                  {(() => {
                    const raw = projectData?.thirdPartyTeams || projectData?.equipesTerceirizadas || projectData?.fornecedores || [];
                    const list = Array.isArray(raw) ? raw : (raw && typeof raw === "object" ? Object.keys(raw).map((k) => raw[k]) : []);
                    return list?.length ? (
                      <ul className="space-y-2">
                        {list.map((t, idx) => (
                          <li key={idx} className="rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2">
                            {renderTeam(t)}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <div className="rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-neutral-500">—</div>
                    );
                  })()}
                </div>
              </div>
            </section>

            {/* Resumo de Chamados */}
            <section className="print-block rounded-2xl bg-white border border-neutral-200 shadow-sm">
              <header className="border-b border-neutral-200 px-5 py-4">
                <h2 className="text-lg font-semibold">Chamados</h2>
              </header>
              <div className="p-5 space-y-4">
                <KPI label="Total" value={perf.totalChamados} />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <KPI label={STATUS_LABELS.aberto} value={perf.abertos} />
                  <KPI label={STATUS_LABELS.em_tratativa} value={perf.emTratativa} />
                  <KPI label="Executado (aguard. validação)" value={perf.executadoAguardandoValidacao} />
                  <KPI label={STATUS_LABELS.concluido} value={perf.concluidos} />
                  <KPI label={STATUS_LABELS.arquivado} value={perf.arquivados} />
                </div>
              </div>
            </section>

            {/* Resumo de Diários */}
            <section className="print-block lg:col-span-3 rounded-2xl bg-white border border-neutral-200 shadow-sm">
              <header className="border-b border-neutral-200 px-5 py-4">
                <h2 className="text-lg font-semibold">Diários do Projeto</h2>
              </header>
              <div className="p-5">
                {diaries?.length ? (
                  <ul className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {diaries.map((d) => (
                      <li key={d.id} className="rounded-xl border border-neutral-200 bg-neutral-50 p-4">
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

// UI helpers
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
    const nome = item.name || item.nome || item.empresa || item.fornecedor || "—";
    const area = item.area || item.tipo || item.categoria || null;
    const contato = item.contato || item.telefone || item.email || null;
    return (
      <div className="flex flex-col">
        <span className="font-medium">{nome}</span>
        <span className="text-xs text-neutral-500">{area ? `${area}` : ""} {contato ? `· ${contato}` : ""}</span>
      </div>
    );
  }
  return "—";
}

// Data helpers (sem Firestore — usa ticketService)
async function summarizeTicketsForProject(projectId, setState) {
  const byStatus = {};
  let total = 0;

  try {
    const all = await ticketService.getAllTickets();
    // considera projectId único OU array "projetos"
    const filtered = (all || []).filter((t) => {
      if (Array.isArray(t.projetos) && t.projetos.length) return t.projetos.includes(projectId);
      return String(t.projetoId || "") === String(projectId);
    });

    filtered.forEach((t) => {
      total += 1;
      const s = (t.status || "").toLowerCase();
      const key = INTERESTING_STATUSES.includes(s) ? s : "outros";
      byStatus[key] = (byStatus[key] || 0) + 1;
    });
  } catch (e) {
    console.error("Erro ao resumir chamados:", e);
  }

  setState({ total, byStatus });
}
