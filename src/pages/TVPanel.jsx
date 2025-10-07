// src/pages/TVPanel.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { collection, onSnapshot, orderBy, query, limit } from "firebase/firestore";
import { db } from "../config/firebase";
import {
  Activity,
  AlertOctagon,
  Award,
  BarChart3,
  Calendar,
  CheckCircle,
  Clock as ClockIcon,
  FileText,
  Flag,
  FolderOpen,
  GitPullRequest,
  Target,
  TrendingDown,
  TrendingUp,
  UserCheck,
  Zap,
} from "lucide-react";

/* ============================ helpers ============================ */
const norm = (s) => (s || "").toString().trim().toLowerCase();
const isText = (v) => typeof v === "string" && v.trim().length > 0;
const pickText = (...vals) => vals.find(isText) || "";

const parseMaybeDate = (v) => {
  if (!v) return null;
  if (v instanceof Date) return v;
  if (typeof v?.toDate === "function") return v.toDate();
  if (typeof v === "number") return new Date(v);
  if (typeof v === "string") {
    const d = new Date(v);
    if (!isNaN(d.getTime())) return d;
  }
  return null;
};

const formatTimeAgo = (d) => {
  if (!d) return "";
  const date = d instanceof Date ? d : d?.toDate?.() ?? null;
  if (!date) return "";
  const sec = Math.floor((Date.now() - date.getTime()) / 1000);
  if (sec < 5) return "agora";
  const table = [
    [31536000, "ano"],
    [2592000, "mês"],
    [86400, "dia"],
    [3600, "hora"],
    [60, "minuto"],
  ];
  for (const [s, label] of table) {
    const n = Math.floor(sec / s);
    if (n >= 1) return `há ${n} ${label}${n > 1 ? "s" : ""}`;
  }
  return `há ${sec} seg`;
};

const formatClock = (now) => {
  const dd = String(now.getDate()).padStart(2, "0");
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const yyyy = now.getFullYear();
  const hh = String(now.getHours()).padStart(2, "0");
  const mi = String(now.getMinutes()).padStart(2, "0");
  const ss = String(now.getSeconds()).padStart(2, "0");
  const week = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"][now.getDay()];
  return { time: `${hh}:${mi}:${ss}`, date: `${week}, ${dd}/${mm}/${yyyy}` };
};

const SLA_HOURS = { baixa: 240, media: 24, alta: 12, urgente: 2 };

const statusColor = (st) => {
  const s = norm(st);
  if (s === "aberto") return "border-l-4 border-blue-400";
  if (s === "em_tratativa") return "border-l-4 border-cyan-400";
  if (s === "executado_aguardando_validacao" || s === "executado_aguardando_validacao_operador") return "border-l-4 border-yellow-400";
  if (s === "concluido") return "border-l-4 border-green-400";
  if (s.includes("arquiv") || s.includes("archiv") || s === "cancelado") return "border-l-4 border-zinc-500";
  return "border-l-4 border-zinc-400";
};

const isArchived = (st) => {
  const s = norm(st);
  return s.includes("arquiv") || s.includes("archiv");
};

/* ============================ componente ============================ */
export default function TVPanel() {
  // KPIs (Chamados)
  const [stats, setStats] = useState({ total: 0, abertos: 0, emAndamento: 0, concluidos: 0, arquivados: 0 });
  const [awaitingValidation, setAwaitingValidation] = useState(0);
  const [pendingApprovalCount, setPendingApprovalCount] = useState(0);
  const [openedToday, setOpenedToday] = useState(0);
  const [openedThisMonth, setOpenedThisMonth] = useState(0);
  const [escalatedCount, setEscalatedCount] = useState(0);
  const [untreatedByArea, setUntreatedByArea] = useState({});

  // SLA
  const [slaStats, setSlaStats] = useState({ violated: 0, risk: 0 });
  const [slaViolationsList, setSlaViolationsList] = useState([]);
  const [slaView, setSlaView] = useState("summary");

  // Projetos / Eventos
  const [projectStats, setProjectStats] = useState({ ativos: 0 });
  const [projectsMap, setProjectsMap] = useState({}); // id -> {projectName, eventId?, eventName?}
  const [eventsMap, setEventsMap] = useState({}); // id -> {name}
  const [phaseCounts, setPhaseCounts] = useState({ futuro: 0, andamento: 0, desmontagem: 0, finalizado: 0 });

  // Users map por ID e por email
  const [usersById, setUsersById] = useState({});
  const [usersByEmail, setUsersByEmail] = useState({});

  // Diário e Feed
  const [diaryFeed, setDiaryFeed] = useState([]);
  const [activityFeed, setActivityFeed] = useState([]);

  // Relógio
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  /* ===== Som para novos chamados "aberto" ===== */
  const seenOpenIds = useRef(new Set());
  const initializedOpens = useRef(false);
  const audioCtx = useRef(null);
  const ping = () => {
    try {
      if (!audioCtx.current) {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        audioCtx.current = new Ctx();
      }
      const ctx = audioCtx.current;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.value = 880;
      o.connect(g);
      g.connect(ctx.destination);
      g.gain.setValueAtTime(0.2, ctx.currentTime);
      o.start();
      g.gain.exponentialRampToValueAtTime(0.00001, ctx.currentTime + 0.6);
      o.stop(ctx.currentTime + 0.6);
    } catch {}
  };

  /* ============================ assinaturas ============================ */
  useEffect(() => {
    // Usuários
    const unsubUsers = onSnapshot(collection(db, "usuarios"), (snap) => {
      const byId = {};
      const byEmail = {};
      snap.forEach((d) => {
        const data = d.data() || {};
        const email = (data.email || data.mail || "").toLowerCase();
        byId[d.id] = { id: d.id, ...data };
        if (email) byEmail[email] = { id: d.id, ...data };
      });
      setUsersById(byId);
      setUsersByEmail(byEmail);
    });

    // Eventos (para mapear eventId -> nome)
    const unsubEvents = onSnapshot(collection(db, "eventos"), (snap) => {
      const map = {};
      snap.forEach((d) => {
        const data = d.data() || {};
        const name = pickText(data.nome, data.name, data.titulo, data.title, data.feira);
        map[d.id] = { id: d.id, name: name || d.id };
      });
      setEventsMap(map);
    });

    // Projetos (contagem + mapa para nomes e fases)
    const unsubProjects = onSnapshot(collection(db, "projetos"), (snap) => {
      let ativos = 0;
      const projMap = {};
      const counts = { futuro: 0, andamento: 0, desmontagem: 0, finalizado: 0 };
      const now = new Date();

      snap.forEach((d) => {
        const data = d.data() || {};
        const status = norm(data?.status);
        if (status !== "arquivado" && status !== "cancelado") ativos += 1;

        const projectName = pickText(data.nome, data.name, data.titulo, data.title, data.projeto, data.project) || d.id;

        const eventId = pickText(data.eventId, data.event_id, data?.evento?.eventoId, data?.event?.eventoId, data?.eventoId);
        const evLocalName = pickText(
          data.eventName,
          data.event_title,
          data.eventTitle,
          data.evento,
          data.event,
          data?.event?.name,
          data?.event?.nome,
          data?.event?.feira,
          data?.evento?.name,
          data?.evento?.nome,
          data?.evento?.feira
        );
        const eventName = evLocalName || (eventId && eventsMap[eventId]?.name) || "";
        projMap[d.id] = { projectName, eventId, eventName };

        // ===== classificação por fase =====
        const mStart = parseMaybeDate(data?.montagem?.dataInicio || data?.dataInicioMontagem);
        const mEnd = parseMaybeDate(data?.montagem?.dataFim || data?.dataFimMontagem);
        const eStart = parseMaybeDate(data?.evento?.dataInicio || data?.dataInicioEvento);
        const eEnd = parseMaybeDate(data?.evento?.dataFim || data?.dataFimEvento);
        const dStart = parseMaybeDate(data?.desmontagem?.dataInicio || data?.dataInicioDesmontagem);
        const dEnd = parseMaybeDate(data?.desmontagem?.dataFim || data?.dataFimDesmontagem);

        let fase = "futuro";
        if (dEnd && now > dEnd) {
          fase = "finalizado";
        } else if (dStart && dEnd && now >= dStart && now <= dEnd) {
          fase = "desmontagem";
        } else if (
          (mStart && mEnd && now >= mStart && now <= mEnd) ||
          (eStart && eEnd && now >= eStart && now <= eEnd) ||
          (mEnd && eStart && now > mEnd && now < eStart) // entre montagem e evento
        ) {
          fase = "andamento";
        } else if ((mStart && now < mStart) || (!mStart && eStart && now < eStart)) {
          fase = "futuro";
        } else if (eEnd && now > eEnd && (!dStart || now < dStart)) {
          // pós-evento, pré-desmontagem
          fase = "andamento";
        }
        counts[fase] += 1;
      });

      setProjectStats({ ativos });
      setProjectsMap(projMap);
      setPhaseCounts(counts);
    });

    // Chamados
    const unsubTickets = onSnapshot(
      query(collection(db, "chamados"), orderBy("createdAt", "desc")),
      (snap) => {
        const now = new Date();
        const tickets = [];
        snap.forEach((d) => tickets.push({ id: d.id, ...(d.data() || {}) }));

        // ====== KPIs ======
        const total = tickets.length;
        const abertos = tickets.filter((t) => norm(t.status) === "aberto").length;
        const emAndamento = tickets.filter((t) => norm(t.status) === "em_tratativa").length;
        const concluidos = tickets.filter((t) => norm(t.status) === "concluido").length;
        const arquivados = tickets.filter((t) => isArchived(t.status)).length;
        setStats({ total, abertos, emAndamento, concluidos, arquivados });

        setAwaitingValidation(
          tickets.filter((t) => ["executado_aguardando_validacao", "executado_aguardando_validacao_operador"].includes(norm(t.status))).length
        );

        setPendingApprovalCount(tickets.filter((t) => norm(t.status) === "aguardando_aprovacao").length);
        setEscalatedCount(tickets.filter((t) => norm(t.status) === "escalado_para_outra_area").length);

        const startDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const startMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        setOpenedToday(tickets.filter((t) => (t?.createdAt?.toDate ? t.createdAt.toDate() : null) >= startDay).length);
        setOpenedThisMonth(tickets.filter((t) => (t?.createdAt?.toDate ? t.createdAt.toDate() : null) >= startMonth).length);

        // Foco de atenção (abertos por área)
        const openTickets = tickets.filter((t) => norm(t.status) === "aberto");
        const byArea = openTickets.reduce((acc, t) => {
          const a = t?.area_atual || t?.area || t?.areaAtual || "Não definida";
          acc[a] = (acc[a] || 0) + 1;
          return acc;
        }, {});
        setUntreatedByArea(byArea);

        // SLA
        let violated = 0,
          risk = 0;
        const violatedList = [];
        tickets
          .filter((t) => !["concluido", "cancelado"].includes(norm(t.status)) && !isArchived(t.status))
          .forEach((t) => {
            const prio = SLA_HOURS[norm(t.prioridade)];
            const created = t?.createdAt?.toDate ? t.createdAt.toDate() : null;
            if (!prio || !created) return;
            const elapsed = (now - created) / (1000 * 60 * 60);
            if (elapsed > prio) {
              violated += 1;
              violatedList.push(t);
            } else if (elapsed > prio * 0.75) {
              risk += 1;
            }
          });
        setSlaStats({ violated, risk });
        setSlaViolationsList(violatedList);

        // ====== Feed de chamados (sem scroll) ======
        const FEED_LIMIT = 10; // cabe na TV sem rolagem
        const latest = tickets.slice(0, FEED_LIMIT).map((t) => {
          // ==== Quem abriu (robusto) ====
          const idCandidates = [t.createdBy, t.openedById, t.criadoPorId, t.abertoPorId, t.userId, t.solicitanteId].filter(Boolean);
          const emailCandidates = [
            t.openedByEmail,
            t.createdByEmail,
            t.criadoPorEmail,
            t.abertoPorEmail,
            t.aberto_por_email,
            t.solicitanteEmail,
            t.emailCriador,
            t.userEmail,
          ].filter(Boolean);
          const openedByFromId = idCandidates.map((id) => usersById[id]?.nome).find(isText);
          const openedByFromEmail = emailCandidates
            .map((e) => (e || "").toLowerCase())
            .map((e) => usersByEmail[e]?.nome)
            .find(isText);
          const openedBy = pickText(
            openedByFromId,
            openedByFromEmail,
            t.openedByName,
            t.criadoPorNome,
            t.aberto_por_nome,
            t.solicitanteNome,
            t?.solicitante?.nome
          ) || "—";

          // ==== Responsável atual (robusto) ====
          const respIdCandidates = [t.atribuido_a, t.assigneeId, t.responsavelId, t.responsavel_atual_id].filter(Boolean);
          const respEmailCandidates = [t.atribuido_a_email, t.responsavelEmail, t.responsavel_atual_email].filter(Boolean);
          const responsavelFromId = respIdCandidates.map((id) => usersById[id]?.nome).find(isText);
          const responsavelFromEmail = respEmailCandidates
            .map((e) => (e || "").toLowerCase())
            .map((e) => usersByEmail[e]?.nome)
            .find(isText);
          const responsavel = pickText(
            responsavelFromId,
            responsavelFromEmail,
            t.atribuido_a_nome,
            t.responsavelNome,
            t.responsavel_atual_nome
          ) || "—";

          // ==== Projeto e Evento no ticket ====
          const projId = pickText(t.projectId, t.projetoId, t.project_id, t.projeto_id, t.idProjeto, t.id_projeto);
          const projFromMap = projId ? projectsMap[projId]?.projectName : undefined;
          const projLabelFromDoc = pickText(t.projectName, t.projetoNome, t.projeto, t.project, t.project_title, t.titleProject);
          const projectLabel = pickText(projLabelFromDoc, projFromMap, projId);

          const eventIdFromTicket = pickText(t.eventId, t.event_id, t?.evento?.eventoId, t?.event?.eventoId, t?.eventoId);
          const evFromMapByProj = projId ? projectsMap[projId]?.eventName : undefined;
          const evFromEvents = pickText(
            eventsMap[eventIdFromTicket]?.name,
            eventsMap[projectsMap[projId]?.eventId || ""]?.name
          );
          const evLabelFromDoc = pickText(
            t.eventName,
            t.event_title,
            t.eventTitle,
            t.evento,
            t.event,
            t?.event?.name,
            t?.event?.nome,
            t?.event?.feira,
            t?.evento?.name,
            t?.evento?.nome,
            t?.evento?.feira
          );
          const eventLabel = pickText(evLabelFromDoc, evFromMapByProj, evFromEvents);

          const areaAtual = t?.area_atual || t?.area || t?.areaAtual || "—";
          const when = t?.createdAt?.toDate ? t.createdAt.toDate() : null;

          return {
            id: t.id,
            titulo: t.titulo || t.title || "(sem título)",
            status: norm(t.status),
            openedBy,
            responsavel,
            areaAtual,
            openedAt: when,
            projectLabel,
            eventLabel,
          };
        });
        setActivityFeed(latest);

        // Som para novos "aberto"
        const onlyOpens = tickets.filter((t) => norm(t.status) === "aberto");
        if (!initializedOpens.current) {
          onlyOpens.forEach((t) => seenOpenIds.current.add(t.id));
          initializedOpens.current = true;
        } else {
          const unseen = onlyOpens.filter((t) => !seenOpenIds.current.has(t.id));
          if (unseen.length > 0) ping();
          unseen.forEach((t) => seenOpenIds.current.add(t.id));
        }
      }
    );

    // Diário (esquerda; 10 itens)
    const unsubDiaries = onSnapshot(
      query(collection(db, "diary_feed"), orderBy("createdAt", "desc"), limit(10)),
      (snap) => {
        const list = [];
        snap.forEach((d) => list.push({ id: d.id, ...(d.data() || {}) }));
        setDiaryFeed(list);
      }
    );

    return () => {
      unsubUsers();
      unsubEvents();
      unsubProjects();
      unsubTickets();
      unsubDiaries();
      try {
        audioCtx.current && audioCtx.current.close();
      } catch {}
    };
  }, [usersById, usersByEmail, eventsMap]);

  // Rotação do card de SLA a cada 10s
  useEffect(() => {
    const id = setInterval(() => setSlaView((v) => (v === "summary" ? "areas" : "summary")), 10000);
    return () => clearInterval(id);
  }, []);

  const RESOLUTION_GOAL = 95;
  const resolutionRate = useMemo(() => {
    const { total, concluidos, arquivados } = stats;
    return total ? ((concluidos + arquivados) / total) * 100 : 0;
  }, [stats]);

  const slaByArea = useMemo(() => {
    const map = {};
    slaViolationsList.forEach((t) => {
      const a = t?.area_atual || t?.area || t?.areaAtual || "Não definida";
      map[a] = (map[a] || 0) + 1;
    });
    return Object.entries(map)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
  }, [slaViolationsList]);

  const { time, date } = formatClock(now);

  /* ============================ layout ============================ */
  return (
    <div className="w-full h-screen bg-zinc-950 text-white p-4 overflow-hidden">
      {/* Header com relógio */}
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-xl font-bold">Painel Operacional</h1>
        <div className="flex items-baseline gap-3">
          <ClockIcon className="h-5 w-5 text-cyan-300" />
          <span className="text-2xl font-bold tabular-nums">{time}</span>
          <span className="text-sm text-white/70">{date}</span>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-3 h-[calc(100%-2.5rem)]">
        {/* ESQUERDA – DIÁRIO */}
        <aside className="col-span-3 bg-black/20 border border-white/15 rounded-2xl p-3 flex flex-col overflow-hidden">
          <div className="sticky top-0 z-10 bg-transparent/40 backdrop-blur-sm -m-3 mb-2 p-3 rounded-t-2xl flex items-center justify-between">
            <h3 className="text-lg font-bold flex items-center"><FileText className="h-5 w-5 mr-2 text-cyan-300"/>Diário de Projetos</h3>
            <span className="text-xs text-white/60">10 recentes</span>
          </div>
          <div className="grid grid-cols-1 gap-2 overflow-hidden">
            {diaryFeed.map((d) => {
              const when = d?.createdAt?.toDate ? d.createdAt.toDate() : d._dt || null;
              const preview = (d.text || "").slice(0, 140) + ((d.text || "").length > 140 ? "…" : "");
              const images = Array.isArray(d.attachments)
                ? d.attachments.filter((a) => (a.type || a.contentType || "").includes("image"))
                : [];
              const thumbs = images.slice(0, 3);

              // Projeto / Evento robusto
              const projId = pickText(d.projectId, d.projetoId, d.project_id, d.projeto_id, d.idProjeto, d.id_projeto);
              const projFromMap = projId ? projectsMap[projId]?.projectName : undefined;
              const proj = pickText(d.projectName, d.project, d.projetoNome, d.projeto, projFromMap, projId) || "Projeto";

              const eventId = pickText(d.eventId, d.event_id, d?.evento?.eventoId, d?.event?.eventoId, d?.eventoId, projectsMap[projId]?.eventId);
              const evFromMap = pickText(projectsMap[projId]?.eventName, eventsMap[eventId]?.name);
              const evLocal = pickText(
                d.eventName,
                d.event_title,
                d.eventTitle,
                d.eventoName,
                d.evento_title,
                d?.event?.name,
                d?.event?.nome,
                d?.event?.feira,
                d?.evento?.name,
                d?.evento?.nome,
                d?.evento?.feira
              );
              const evt = pickText(evLocal, evFromMap);
              const header = evt ? `${proj} / ${evt}` : proj;

              return (
                <div key={d.id} className="bg-black/25 border border-white/10 rounded-xl p-2 min-h-[86px]">
                  <div className="flex items-center justify-between">
                    <div className="text-xs text-cyan-300 truncate">{header}</div>
                    <div className="text-[11px] text-white/60 ml-2 whitespace-nowrap">{when ? formatTimeAgo(when) : "—"}</div>
                  </div>
                  <div className="mt-0.5 text-sm font-medium truncate">
                    {d.authorName || "—"}
                    {d.authorRole ? <span className="text-white/60 font-normal"> · {d.authorRole}</span> : null}
                  </div>
                  <div className="text-xs text-white/80 line-clamp-2 mt-0.5">{preview}</div>
                  {thumbs.length > 0 && (
                    <div className="mt-2 grid grid-cols-3 gap-1">
                      {thumbs.map((img, i) => (
                        <div key={i} className="w-full h-14 rounded overflow-hidden bg-black/30">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={img.url} alt={`img-${i}`} className="w-full h-full object-cover" loading="lazy" />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </aside>

        {/* CENTRO – CARDS AGRUPADOS */}
        <main className="col-span-6 flex flex-col gap-3 overflow-hidden">
          {(slaStats.violated > 0 || escalatedCount > 0) && (
            <div className="bg-red-500/15 border border-red-400/40 rounded-xl px-3 py-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Flag className="h-5 w-5 text-red-300" />
                <span className="text-sm">Atenção: <strong>{slaStats.violated}</strong> chamado(s) com SLA violado e <strong>{escalatedCount}</strong> escalado(s).</span>
              </div>
              <span className="text-[11px] text-white/70">Rotação automática a cada 10s</span>
            </div>
          )}

          {/* Grupo: Chamados */}
          <section className="bg-black/20 border border-white/15 rounded-2xl p-3">
            <h2 className="text-base font-bold mb-2 flex items-center"><Activity className="h-5 w-5 mr-2 text-cyan-300"/>Chamados</h2>
            <div className="grid grid-cols-5 gap-2">
              <Kpi title="Total" value={stats.total} icon={<BarChart3 className="h-5 w-5" />} />
              <Kpi title="Abertos" value={stats.abertos} icon={<AlertOctagon className="h-5 w-5 text-orange-400" />} />
              <Kpi title="Em Tratativa" value={stats.emAndamento} icon={<Zap className="h-5 w-5 text-teal-400" />} />
              <Kpi title="Aguard. Validação" value={awaitingValidation} icon={<UserCheck className="h-5 w-5 text-yellow-400" />} />
              <Kpi title="Concluídos" value={stats.concluidos} icon={<CheckCircle className="h-5 w-5 text-green-400" />} />
            </div>

            <div className="grid grid-cols-5 gap-2 mt-2">
              <Kpi title="Projetos Ativos" value={projectStats.ativos} icon={<FolderOpen className="h-5 w-5" />} />
              <Kpi title="Escalados" value={escalatedCount} icon={<TrendingUp className="h-5 w-5 text-indigo-400" />} />
              <Kpi title="Aprov. Gerência" value={pendingApprovalCount} icon={<GitPullRequest className="h-5 w-5 text-purple-400" />} />
              <Kpi title="Abertos Hoje" value={openedToday} icon={<Calendar className="h-5 w-5" />} />
              <Kpi title="Abertos no Mês" value={openedThisMonth} icon={<Calendar className="h-5 w-5" />} />
            </div>

            <div className="grid grid-cols-4 gap-2 mt-2">
              {/* SLA – rotativo */}
              <div className="bg-black/20 border border-red-500/40 rounded-xl p-3 flex flex-col justify-center min-h-[148px]">
                {slaView === "summary" ? (
                  <>
                    <h3 className="text-md font-bold mb-1">Status do SLA</h3>
                    <div className="flex items-center mb-1">
                      <TrendingDown className="h-6 w-6 mr-2 text-red-400" />
                      <span className="text-3xl font-bold">{slaStats.violated}</span>
                      <span className="ml-2 text-sm">Violado(s)</span>
                    </div>
                    <div className="flex items-center">
                      <ClockIcon className="h-5 w-5 mr-2 text-yellow-300" />
                      <span className="text-sm">{slaStats.risk} em risco</span>
                    </div>
                  </>
                ) : (
                  <>
                    <h3 className="text-md font-bold mb-1">SLA violado por área</h3>
                    <ul className="space-y-1">
                      {slaByArea.map(([area, qtd]) => (
                        <li key={area} className="flex items-center justify-between">
                          <span className="text-sm text-white/90 truncate pr-2">{area}</span>
                          <span className="text-lg font-bold bg-red-500/80 text-black rounded px-2">{qtd}</span>
                        </li>
                      ))}
                      {slaByArea.length === 0 && <li className="text-sm text-white/60">Sem violações</li>}
                    </ul>
                  </>
                )}
                <div className="text-[11px] text-white/60 mt-2">Alterna automaticamente a cada 10s</div>
              </div>

              {/* Foco de Atenção */}
              <div className="bg-black/20 border border-white/20 rounded-xl p-3 flex flex-col min-h-[148px]">
                <h3 className="text-md font-bold mb-1 flex items-center"><Target className="h-5 w-5 mr-2 text-yellow-400"/>Foco de Atenção</h3>
                <div className="space-y-1 flex-grow flex flex-col justify-center">
                  {Object.entries(untreatedByArea)
                    .sort(([, a], [, b]) => b - a)
                    .slice(0, 3)
                    .map(([area, count]) => (
                      <div key={area} className="flex justify-between items-center bg-black/20 p-1.5 rounded-lg">
                        <span className="font-medium text-yellow-300 text-sm truncate pr-2">{area}</span>
                        <span className="font-bold text-lg text-black bg-yellow-400 rounded-md px-2">{count}</span>
                      </div>
                    ))}
                  {Object.keys(untreatedByArea).length === 0 && (
                    <p className="text-white/60 text-center text-sm py-2">Nenhum chamado aberto!</p>
                  )}
                </div>
              </div>

              {/* Taxa de Resolução (inclui arquivados) */}
              <div className="bg-black/20 border border-white/20 rounded-xl p-3 flex flex-col justify-center min-h-[148px]">
                <h3 className="text-md font-bold mb-1">Taxa de Resolução</h3>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-4xl font-bold text-green-400">{resolutionRate.toFixed(1)}%</span>
                  <span className="text-xs text-white/70">Meta: {RESOLUTION_GOAL}%</span>
                </div>
                <div className="w-full bg-black/20 rounded-full h-3">
                  <div className="bg-green-500 h-3 rounded-full" style={{ width: `${Math.min(100, resolutionRate)}%` }} />
                </div>
              </div>

              {/* Destaques placeholder */}
              <div className="bg-black/20 border border-white/20 rounded-xl p-3 flex flex-col justify-center min-h-[148px]">
                <h3 className="text-md font-bold mb-1 flex items-center"><Award className="h-5 w-5 mr-2 text-emerald-300"/>Destaques</h3>
                <p className="text-sm text-white/70">Métricas internas / ranking por área podem entrar aqui futuramente.</p>
              </div>
            </div>
          </section>

          {/* Grupo: Projetos (Resumo por Fase) */}
          <section className="bg-black/20 border border-white/15 rounded-2xl p-3">
            <h2 className="text-base font-bold mb-2 flex items-center"><FolderOpen className="h-5 w-5 mr-2"/>Projetos</h2>
            <div className="grid grid-cols-4 gap-2">
              <PhaseStat title="Futuro" value={phaseCounts.futuro} />
              <PhaseStat title="Andamento" value={phaseCounts.andamento} />
              <PhaseStat title="Desmontagem" value={phaseCounts.desmontagem} />
              <PhaseStat title="Finalizado" value={phaseCounts.finalizado} />
            </div>
          </section>
        </main>

        {/* DIREITA – FEED DE CHAMADOS com RESUMO */}
        <aside className="col-span-3 bg-black/20 border border-white/15 rounded-2xl p-3 flex flex-col overflow-hidden">
          <div className="sticky top-0 z-10 bg-transparent/40 backdrop-blur-sm -m-3 mb-2 p-3 rounded-t-2xl flex items-center justify-between">
            <h3 className="text-lg font-bold flex items-center"><Activity className="h-5 w-5 mr-2 text-cyan-300"/>Feed de Chamados</h3>
            <span className="text-xs text-white/60">últimos 10</span>
          </div>
          <div className="grid grid-cols-1 gap-2 overflow-hidden">
            {activityFeed.map((it) => (
              <div key={it.id} className={`bg-black/25 border border-white/10 rounded-xl p-2 ${statusColor(it.status)}`}>
                <div className="flex items-start justify-between">
                  <div className="min-w-0 pr-2">
                    <div className="text-sm font-semibold truncate" title={it.titulo}>{it.titulo}</div>
                    <div className="text-[11px] text-white/70 truncate">
                      Aberto por <span className="text-white">{it.openedBy}</span>
                      <span className="mx-1">·</span>
                      Área <span className="text-white">{it.areaAtual}</span>
                      <span className="mx-1">·</span>
                      Resp. <span className="text-white">{it.responsavel}</span>
                    </div>
                    {(it.projectLabel || it.eventLabel) && (
                      <div className="text-[11px] text-white/70 truncate">
                        <span className="text-white/80">{it.projectLabel || ""}</span>
                        {it.eventLabel ? <span> / {it.eventLabel}</span> : null}
                      </div>
                    )}
                  </div>
                  <div className="text-[11px] text-white/60 whitespace-nowrap ml-2">{formatTimeAgo(it.openedAt)}</div>
                </div>
                <div className="mt-1">
                  <StatusBadge status={it.status} />
                </div>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}

/* ============================ componentes menores ============================ */
function Kpi({ title, value, icon }) {
  return (
    <div className="bg-black/20 border border-white/20 rounded-xl p-2 flex flex-col justify-center">
      <div className="flex justify-between items-center mb-1">
        <h3 className="text-md font-bold">{title}</h3>
        {icon}
      </div>
      <div className="text-4xl font-bold">{value}</div>
    </div>
  );
}

function PhaseStat({ title, value }) {
  return (
    <div className="bg-black/20 border border-white/20 rounded-xl p-3 flex items-center justify-between">
      <span className="text-sm text-white/80">{title}</span>
      <span className="text-2xl font-bold tabular-nums">{value}</span>
    </div>
  );
}

function SmallStat({ title, value }) {
  return (
    <div className="bg-black/20 border border-white/20 rounded-xl p-3 flex items-center justify-between">
      <span className="text-sm text-white/80">{title}</span>
      <span className="text-2xl font-bold">{value}</span>
    </div>
  );
}

function StatusBadge({ status }) {
  const s = norm(status);
  const cfg = {
    aberto: { label: "Aberto", cls: "bg-blue-600/20 text-blue-300 border-blue-500/40" },
    em_tratativa: { label: "Em tratativa", cls: "bg-cyan-600/20 text-cyan-300 border-cyan-500/40" },
    executado_aguardando_validacao: { label: "Aguard. validação", cls: "bg-yellow-600/20 text-yellow-300 border-yellow-500/40" },
    executado_aguardando_validacao_operador: { label: "Aguard. validação (op.)", cls: "bg-yellow-600/20 text-yellow-300 border-yellow-500/40" },
    concluido: { label: "Concluído", cls: "bg-green-600/20 text-green-300 border-green-500/40" },
    cancelado: { label: "Cancelado", cls: "bg-zinc-600/20 text-zinc-300 border-zinc-500/40" },
    arquivado: { label: "Arquivado", cls: "bg-zinc-600/20 text-zinc-300 border-zinc-500/40" },
  };
  const c = cfg[s] || { label: s || "—", cls: "bg-zinc-600/20 text-zinc-200 border-zinc-500/40" };
  return <span className={`text-[11px] px-2 py-0.5 rounded border ${c.cls}`}>{c.label}</span>;
}
