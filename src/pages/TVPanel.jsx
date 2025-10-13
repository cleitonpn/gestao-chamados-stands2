// src/pages/TVPanel.jsx — atualização 13/10/2025
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  limit,
  getDocsFromServer,
} from "firebase/firestore";
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

const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const fmtDayKey = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

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
  if (s === "executado_aguardando_validacao" || s === "executado_aguardando_validacao_operador")
    return "border-l-4 border-yellow-400";
  if (s === "concluido") return "border-l-4 border-green-400";
  if (s.includes("arquiv") || s.includes("archiv") || s === "cancelado") return "border-l-4 border-zinc-500";
  return "border-l-4 border-zinc-400";
};

const isArchived = (st) => {
  const s = norm(st);
  return s.includes("arquiv") || s.includes("archiv");
};

const RESOLUTION_GOAL = 90; // meta 90%

// Detecta WebViews de TV/TV Box com limitações
const isTvLike = (() => {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  return /Tizen|Web0S|SmartTV|Android\s?TV|; wv;|AFT|MiBOX|HBBTV|DTV/i.test(ua);
})();

// Paleta por área
const areaHue = (area) => {
  const a = norm(area);
  if (a.includes("logist")) return "text-teal-300";
  if (a.includes("compra")) return "text-amber-300";
  if (a.includes("finance")) return "text-rose-300";
  if (a.includes("detalh")) return "text-violet-300";
  if (a.includes("projet")) return "text-cyan-300";
  if (a.includes("operac")) return "text-sky-300";
  if (a.includes("comunicacao") || a.includes("visual")) return "text-emerald-300";
  return "text-white/80";
};

// Nome → “Nome S.”
const obfuscate = (nameOrEmail) => {
  const raw = (nameOrEmail || "").toString().trim();
  if (!raw) return "—";
  if (raw.includes("@")) {
    const base = raw.split("@")[0].replace(/[._]/g, " ");
    const parts = base.split(/\s+/).filter(Boolean);
    const first = parts[0] ? parts[0][0].toUpperCase() + parts[0].slice(1) : "Usuário";
    const last = parts[1] ? parts[1][0].toUpperCase() + "." : "";
    return `${first} ${last}`.trim();
  }
  const parts = raw.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[1][0].toUpperCase()}.`;
};

/* ============================ componente ============================ */
function TVPanel() {
  /* -------- estados de dados brutos -------- */
  const [tickets, setTickets] = useState([]);
  const [diaryRaw, setDiaryRaw] = useState([]);
  const [projectsMap, setProjectsMap] = useState({}); // id -> {projectName, eventId?, eventName?, status}
  const [eventsMap, setEventsMap] = useState({}); // id -> {name}
  const [usersById, setUsersById] = useState({});
  const [usersByEmail, setUsersByEmail] = useState({});

  /* -------- derivados -------- */
  const [stats, setStats] = useState({ total: 0, abertos: 0, emAndamento: 0, concluidos: 0, arquivados: 0 });
  const [awaitingValidation, setAwaitingValidation] = useState(0);
  const [pendingApprovalCount, setPendingApprovalCount] = useState(0);
  const [openedToday, setOpenedToday] = useState(0);
  const [openedThisMonth, setOpenedThisMonth] = useState(0);
  const [escalatedCount, setEscalatedCount] = useState(0);
  const [untreatedByArea, setUntreatedByArea] = useState({});
  const [slaStats, setSlaStats] = useState({ violated: 0, risk: 0 });
  const [slaViolationsList, setSlaViolationsList] = useState([]);
  const [phaseCounts, setPhaseCounts] = useState({ futuro: 0, andamento: 0, desmontagem: 0, finalizado: 0 });
  const [projectActives, setProjectActives] = useState(0);

  const [diaryError, setDiaryError] = useState(null);

  // Refs para listeners
  const usersByIdRef = useRef({});
  const usersByEmailRef = useRef({});
  const projectsMapRef = useRef({});
  const eventsMapRef = useRef({});
  useEffect(() => { usersByIdRef.current = usersById; }, [usersById]);
  useEffect(() => { usersByEmailRef.current = usersByEmail; }, [usersByEmail]);
  useEffect(() => { projectsMapRef.current = projectsMap; }, [projectsMap]);
  useEffect(() => { eventsMapRef.current = eventsMap; }, [eventsMap]);

  // Relógio + rotação (1→2→3 a cada 45s)
  const [now, setNow] = useState(new Date());
  const [screen, setScreen] = useState(0);
  useEffect(() => {
    const id1 = setInterval(() => setNow(new Date()), 1000);
    const id2 = setInterval(() => setScreen((s) => (s + 1) % 4), 45000);
    return () => { clearInterval(id1); clearInterval(id2); };
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

    // Eventos
    const unsubEvents = onSnapshot(collection(db, "eventos"), (snap) => {
      const map = {};
      snap.forEach((d) => {
        const data = d.data() || {};
        const name = pickText(data.nome, data.name, data.titulo, data.title, data.feira);
        map[d.id] = { id: d.id, name: name || d.id };
      });
      setEventsMap(map);
    });

    // Projetos (status + nomes)
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
          data.eventName, data.event_title, data.eventTitle, data.evento, data.event,
          data?.event?.name, data?.event?.nome, data?.event?.feira,
          data?.evento?.name, data?.evento?.nome, data?.evento?.feira
        );
        const fallbackEv = eventId && eventsMapRef.current[eventId]?.name;
        const eventName = evLocalName || fallbackEv || "";

        projMap[d.id] = { projectName, eventId, eventName, status: status || "" };

        // fase (para card de projetos)
        const mStart = parseMaybeDate(data?.montagem?.dataInicio || data?.dataInicioMontagem);
        const mEnd   = parseMaybeDate(data?.montagem?.dataFim    || data?.dataFimMontagem);
        const eStart = parseMaybeDate(data?.evento?.dataInicio    || data?.dataInicioEvento);
        const eEnd   = parseMaybeDate(data?.evento?.dataFim       || data?.dataFimEvento);
        const dStart = parseMaybeDate(data?.desmontagem?.dataInicio || data?.dataInicioDesmontagem);
        const dEnd   = parseMaybeDate(data?.desmontagem?.dataFim     || data?.dataFimDesmontagem);

        let fase = "futuro";
        if (dEnd && now > dEnd) {
          fase = "finalizado";
        } else if (dStart && dEnd && now >= dStart && now <= dEnd) {
          fase = "desmontagem";
        } else if (
          (mStart && mEnd && now >= mStart && now <= mEnd) ||
          (eStart && eEnd && now >= eStart && now <= eEnd) ||
          (mEnd && eStart && now > mEnd && now < eStart)
        ) {
          fase = "andamento";
        } else if ((mStart && now < mStart) || (!mStart && eStart && now < eStart)) {
          fase = "futuro";
        } else if (eEnd && now > eEnd && (!dStart || now < dStart)) {
          fase = "andamento";
        }
        counts[fase] += 1;
      });

      setProjectActives(ativos);
      setProjectsMap(projMap);
      setPhaseCounts(counts);
    });

    // Chamados (ordenados por createdAt desc para KPIs; usaremos updatedAt para feed)
    const unsubTickets = onSnapshot(
      query(collection(db, "chamados"), orderBy("createdAt", "desc")),
      (snap) => {
        const now = new Date();
        const list = [];
        snap.forEach((d) => list.push({ id: d.id, ...(d.data() || {}) }));
        setTickets(list);

        const total = list.length;
        const abertos = list.filter((t) => norm(t.status) === "aberto").length;
        const emAndamento = list.filter((t) => norm(t.status) === "em_tratativa").length;
        const concluidos = list.filter((t) => norm(t.status) === "concluido").length;
        const arquivados = list.filter((t) => isArchived(t.status)).length;
        setStats({ total, abertos, emAndamento, concluidos, arquivados });

        setAwaitingValidation(
          list.filter((t) =>
            ["executado_aguardando_validacao", "executado_aguardando_validacao_operador"].includes(norm(t.status))
          ).length
        );
        setPendingApprovalCount(list.filter((t) => norm(t.status) === "aguardando_aprovacao").length);
        setEscalatedCount(list.filter((t) => norm(t.status) === "escalado_para_outra_area").length);

        const startDay = startOfDay(now);
        const startMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        setOpenedToday(list.filter((t) => (t?.createdAt?.toDate ? t.createdAt.toDate() : null) >= startDay).length);
        setOpenedThisMonth(list.filter((t) => (t?.createdAt?.toDate ? t.createdAt.toDate() : null) >= startMonth).length);

        // foco de atenção: abertos por área
        const openTickets = list.filter((t) => norm(t.status) === "aberto");
        const byArea = openTickets.reduce((acc, t) => {
          const a = t?.area_atual || t?.area || t?.areaAtual || "Não definida";
          acc[a] = (acc[a] || 0) + 1;
          return acc;
        }, {});
        setUntreatedByArea(byArea);

        // SLA
        let violated = 0, risk = 0;
        const violatedList = [];
        list
          .filter((t) => !["concluido", "cancelado"].includes(norm(t.status)) && !isArchived(t.status))
          .forEach((t) => {
            const prio = SLA_HOURS[norm(t.prioridade)];
            const created = t?.createdAt?.toDate ? t.createdAt.toDate() : null;
            if (!prio || !created) return;
            const elapsed = (now - created) / (1000 * 60 * 60);
            if (elapsed > prio) {
              violated += 1; violatedList.push(t);
            } else if (elapsed > prio * 0.75) {
              risk += 1;
            }
          });
        setSlaStats({ violated, risk });
        setSlaViolationsList(violatedList);

        // Som para novos "aberto"
        const onlyOpens = list.filter((t) => norm(t.status) === "aberto");
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

    // Diário (TV: polling; desktop: realtime). Buscar mais do que 20 para filtrar 90d + finalizados.
    let unsubDiaries = () => {};
    if (isTvLike) {
      const fetchDiary = async () => {
        try {
          const snap = await getDocsFromServer(
            query(collection(db, "diary_feed"), orderBy("createdAt", "desc"), limit(60))
          );
          const rows = [];
          snap.forEach((d) => rows.push({ id: d.id, ...(d.data() || {}) }));
          setDiaryRaw(rows);
          setDiaryError(null);
        } catch (e) {
          console.error("[diary_feed] polling TV falhou", e);
          setDiaryError(e?.code || e?.message || "erro");
        }
      };
      fetchDiary();
      const id = setInterval(fetchDiary, 30000);
      unsubDiaries = () => clearInterval(id);
    } else {
      unsubDiaries = onSnapshot(
        query(collection(db, "diary_feed"), orderBy("createdAt", "desc"), limit(60)),
        (snap) => {
          const rows = [];
          snap.forEach((d) => rows.push({ id: d.id, ...(d.data() || {}) }));
          setDiaryRaw(rows);
          setDiaryError(null);
        },
        async (err) => {
          console.error("[diary_feed] onSnapshot error", err);
          setDiaryError(err?.code || err?.message || "erro");
        }
      );
    }

    return () => {
      unsubUsers();
      unsubEvents();
      unsubProjects();
      unsubTickets();
      unsubDiaries();
      try { audioCtx.current && audioCtx.current.close(); } catch {}
    };
  }, []);

  /* ============================ DERIVAÇÕES PARA TELAS ============================ */

  // Projetos finalizados (para filtro)
  const projectIsFinalizado = (projId) => {
    if (!projId) return false;
    const st = projectsMapRef.current[projId]?.status || "";
    return norm(st) === "finalizado" || norm(st) === "arquivado";
  };

  // Diário (últimos 90 dias, **12 cards**, exclui projetos finalizados)
  const diaryItems = useMemo(() => {
    const cutoff = addDays(startOfDay(new Date()), -90);
    const out = [];
    for (const d of diaryRaw) {
      const when = parseMaybeDate(d.createdAt);
      if (!when || when < cutoff) continue;
      const projId = pickText(d.projectId, d.projetoId, d.project_id, d.projeto_id, d.idProjeto, d.id_projeto);
      if (projId && projectIsFinalizado(projId)) continue;
      out.push(d);
      if (out.length >= 12) break; // aumentamos o tamanho do card → menos itens
    }
    return out;
  }, [diaryRaw, projectsMap]);

  // Feed de chamados (últimas 20 *atualizações*) com estados permitidos; exclui projetos finalizados
  const ticketsFeed = useMemo(() => {
    const allowed = new Set([
      "aberto",
      "em_tratativa",
      "executado_aguardando_validacao",
      "executado_aguardando_validacao_operador",
    ]);

    const getUpdatedAt = (t) =>
      parseMaybeDate(
        t.updatedAt ||
          t.resolvedAt ||
          t.concludedAt ||
          t.closedAt ||
          (["concluido"].includes(norm(t.status)) ? t.updatedAt : null) ||
          t.createdAt
      ) || new Date(0);

    const sorted = [...tickets].sort((a, b) => getUpdatedAt(b) - getUpdatedAt(a));
    const out = [];
    for (const t of sorted) {
      if (!allowed.has(norm(t.status))) continue;
      const projId = pickText(t.projectId, t.projetoId, t.project_id, t.projeto_id, t.idProjeto, t.id_projeto);
      if (projId && projectIsFinalizado(projId)) continue;
      out.push(t);
      if (out.length >= 20) break;
    }
    return out;
  }, [tickets, projectsMap]);

  // KPIs e métricas p/ Tela 2
  const resolutionRate = useMemo(() => {
    const { total, concluidos, arquivados } = stats;
    return total ? ((concluidos + arquivados) / total) * 100 : 0;
  }, [stats]);

  const activeTickets = useMemo(() => {
    return tickets.filter((t) => !["concluido", "cancelado"].includes(norm(t.status)) && !isArchived(t.status)).length;
  }, [tickets]);

  const slaByArea = useMemo(() => {
    const map = {};
    slaViolationsList.forEach((t) => {
      const a = t?.area_atual || t?.area || t?.areaAtual || "Não definida";
      map[a] = (map[a] || 0) + 1;
    });
    return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [slaViolationsList]);

  // Tendência 30d (abertos vs resolvidos)
  const trends = useMemo(() => {
    const today = startOfDay(new Date());
    const days = Array.from({ length: 30 }, (_, i) => addDays(today, -(29 - i)));
    const openMap = Object.fromEntries(days.map((d) => [fmtDayKey(d), 0]));
    const closeMap = Object.fromEntries(days.map((d) => [fmtDayKey(d), 0]));

    tickets.forEach((t) => {
      const c = parseMaybeDate(t.createdAt);
      if (c) {
        const k = fmtDayKey(startOfDay(c));
        if (k in openMap) openMap[k] += 1;
      }
      const r =
        parseMaybeDate(t.resolvedAt) ||
        parseMaybeDate(t.concludedAt) ||
        parseMaybeDate(t.closedAt) ||
        (norm(t.status) === "concluido" ? parseMaybeDate(t.updatedAt) : null);
      if (r) {
        const k2 = fmtDayKey(startOfDay(r));
        if (k2 in closeMap) closeMap[k2] += 1;
      }
    });

    const labels = days.map(fmtDayKey);
    const opens = labels.map((k) => openMap[k] || 0);
    const closes = labels.map((k) => closeMap[k] || 0);
    const backlog = [];
    let acc = 0;
    for (let i = 0; i < labels.length; i++) {
      acc += opens[i] - closes[i];
      backlog.push(Math.max(0, acc));
    }
    return { labels, opens, closes, backlog };
  }, [tickets]);

  // Idade do backlog (abertos + em tratativa)
  const backlogAging = useMemo(() => {
    const now = new Date();
    const bucket = { "≤24h": 0, "1–3d": 0, "3–7d": 0, ">7d": 0 };
    tickets
      .filter((t) => ["aberto", "em_tratativa"].includes(norm(t.status)))
      .forEach((t) => {
        const c = parseMaybeDate(t.createdAt);
        if (!c) return;
        const days = (now - c) / (1000 * 60 * 60 * 24);
        if (days <= 1) bucket["≤24h"]++;
        else if (days <= 3) bucket["1–3d"]++;
        else if (days <= 7) bucket["3–7d"]++;
        else bucket[">7d"]++;
      });
    return bucket;
  }, [tickets]);

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

      {/* Router simples de telas */}
      {screen === 0 && (
        <ScreenDiary
          diaryItems={diaryItems}
          projectsMap={projectsMap}
          eventsMap={eventsMap}
          diaryError={diaryError}
        />
      )}
      {screen === 1 && (
        <ScreenStatsTickets
          stats={stats}
          awaitingValidation={awaitingValidation}
          pendingApprovalCount={pendingApprovalCount}
          openedToday={openedToday}
          openedThisMonth={openedThisMonth}
          escalatedCount={escalatedCount}
          slaStats={slaStats}
          slaByArea={slaByArea}
          resolutionRate={resolutionRate}
          trends={trends}
          diaryCount={diaryItems.length}
          activeTickets={activeTickets}
        />
      )}
      {screen === 2 && (
        <ScreenTickets
          ticketsFeed={ticketsFeed}
          usersByIdRef={usersByIdRef}
          usersByEmailRef={usersByEmailRef}
          projectsMapRef={projectsMapRef}
          eventsMapRef={eventsMapRef}
        />
      )}
      {screen === 3 && (
        <ScreenProjects
          projectActives={projectActives}
          phaseCounts={phaseCounts}
        />
      )}
    </div>
  );
}

/* ============================ TELAS ============================ */

// TELA 1 — DIÁRIO (3×4 cards maiores)
function ScreenDiary({ diaryItems, projectsMap, eventsMap, diaryError }) {
  return (
    <div className="h-[calc(100%-0rem)] flex flex-col gap-3">
      {/* Cabeçalho explícito da tela */}
      <div className="text-lg font-bold">Diários — exibindo atualizações (últimos 90 dias)</div>

      {diaryError && (
        <div className="text-[12px] text-red-300 bg-red-500/10 border border-red-400/40 rounded-xl p-2">
          Erro ao carregar o Diário ({String(diaryError)}). Modo compatível ativado.
        </div>
      )}

      <div className="grid grid-cols-3 grid-rows-4 gap-3 flex-1">
        {Array.from({ length: 12 }).map((_, idx) => {
          const d = diaryItems[idx];
          if (!d) {
            return <div key={idx} className="rounded-2xl border border-white/10 bg-black/10" />;
          }
          const when = d?.createdAt?.toDate ? d.createdAt.toDate() : null;

          const projId = pickText(d.projectId, d.projetoId, d.project_id, d.projeto_id, d.idProjeto, d.id_projeto);
          const projFromMap = projId ? projectsMap[projId]?.projectName : undefined;
          const proj = pickText(d.projectName, d.project, d.projetoNome, d.projeto, projFromMap, projId) || "Projeto";

          const evId =
            pickText(d.eventId, d.event_id, d?.evento?.eventoId, d?.event?.eventoId, d?.eventoId) ||
            (projId ? projectsMap[projId]?.eventId : "");
          const evFromMap = pickText(projectsMap[projId]?.eventName, eventsMap[evId]?.name);
          const evLocal = pickText(
            d.eventName, d.event_title, d.eventTitle,
            d?.event?.name, d?.event?.nome, d?.event?.feira,
            d?.evento?.name, d?.evento?.nome, d?.evento?.feira
          );
          const header = pickText(evLocal, evFromMap) ? `${proj} / ${pickText(evLocal, evFromMap)}` : proj;

          const preview = (d.text || "").slice(0, 280) + ((d.text || "").length > 280 ? "…" : "");
          const imgs = Array.isArray(d.attachments)
            ? d.attachments.filter((a) => (a.type || a.contentType || "").includes("image"))
            : [];
          const thumb = imgs[0]?.url;

          return (
            <div key={d.id} className="rounded-2xl border border-white/15 bg-black/25 p-0 flex flex-col overflow-hidden">
              {thumb && (
                <div className="w-full h-40 bg-black/30">
                  <img src={thumb} alt="miniatura do diário" className="w-full h-full object-cover" loading="lazy" />
                </div>
              )}
              <div className="p-3 flex-1 flex flex-col">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-[15px] font-semibold text-cyan-300 truncate" title={header}>{header}</div>
                  <div className="text-[12px] text-white/70 whitespace-nowrap">{when ? formatTimeAgo(when) : "—"}</div>
                </div>
                <div className="mt-1 text-[15px] font-medium">{obfuscate(d.authorName) || "—"}</div>
                <div className="mt-1 text-[14px] text-white/90 line-clamp-4">{preview}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// TELA 2 — ESTATÍSTICAS (seções separadas)
function ScreenStatsTickets({
  stats,
  awaitingValidation,
  pendingApprovalCount,
  openedToday,
  openedThisMonth,
  escalatedCount,
  slaStats,
  slaByArea,
  resolutionRate,
  trends,
  diaryCount,
  activeTickets,
}) {
  const rateColor =
    resolutionRate >= RESOLUTION_GOAL ? "text-green-400" : resolutionRate >= 80 ? "text-amber-400" : "text-red-400";

  return (
    <div className="flex flex-col gap-2 h-[calc(100%-0rem)] overflow-hidden">
      {/* ===== Seção: Chamados (compacta e única tela) ===== */}
      <div>
        <div className="text-lg font-bold mb-2">Estatísticas — Chamados</div>
        <div className="grid grid-cols-6 gap-2">
          <BigKpi title="Total" value={stats.total} icon={<BarChart3 className="h-6 w-6" />} />
          <BigKpi title="Abertos" value={stats.abertos} icon={<AlertOctagon className="h-6 w-6 text-orange-300" />} />
          <BigKpi title="Em tratativa" value={stats.emAndamento} icon={<Zap className="h-6 w-6 text-cyan-300" />} />
          <BigKpi title="Aguard. validação" value={awaitingValidation} icon={<UserCheck className="h-6 w-6 text-yellow-300" />} />
          <BigKpi title="Escalados" value={escalatedCount} icon={<TrendingUp className="h-6 w-6 text-indigo-300" />} />
          <BigKpi title="Concluídos" value={stats.concluidos} icon={<CheckCircle className="h-6 w-6 text-green-300" />} />
        </div>
        <div className="grid grid-cols-6 gap-2 mt-2">
          <BigKpi title="Arquivados" value={stats.arquivados} icon={<FolderOpen className="h-6 w-6 text-zinc-300" />} />
          <BigKpi title="Aprov. Gerência" value={pendingApprovalCount} icon={<GitPullRequest className="h-6 w-6 text-purple-300" />} />
          <BigKpi title="Abertos hoje" value={openedToday} icon={<Calendar className="h-6 w-6" />} />
          <BigKpi title="Abertos no mês" value={openedThisMonth} icon={<Calendar className="h-6 w-6" />} />
          <div className="col-span-2 rounded-2xl border border-white/15 bg-black/25 p-3 flex flex-col justify-center">
            <div className="text-base font-bold">Taxa de Resolução</div>
            <div className="flex items-baseline gap-2">
              <span className={`text-4xl font-extrabold tabular-nums ${rateColor}`}>{resolutionRate.toFixed(1)}%</span>
              <span className="text-white/70 text-sm">Meta: {RESOLUTION_GOAL}%</span>
            </div>
            <div className="w-full bg-black/30 rounded-full h-3 mt-1">
              <div className={`${rateColor.replace("text-", "bg-")} h-3 rounded-full`} style={{ width: `${Math.min(100, resolutionRate)}%` }} />
            </div>
          </div>
        </div>

        {/* linha final: 3 painéis enxutos */}
        <div className="grid grid-cols-3 gap-2 mt-2">
          <Panel title="Tendência (30 dias) — Entradas x Saídas">
            <MiniLines opens={trends.opens} closes={trends.closes} height={110} />
          </Panel>
          <Panel title="SLA violado — Top 5 áreas">
            <ul className="space-y-1 mt-1">
              {slaByArea.map(([area, qtd]) => (
                <li key={area} className="flex items-center justify-between">
                  <span className={`text-sm ${areaHue(area)} truncate pr-2`}>{area}</span>
                  <span className="text-lg font-bold bg-red-500/80 text-black rounded px-2">{qtd}</span>
                </li>
              ))}
              {slaByArea.length === 0 && <li className="text-sm text-white/60">Sem violações</li>}
            </ul>
          </Panel>
          <Panel title="Diários × Chamados ativos (relação)">
            <div className="space-y-1">
              <div className="flex items-center justify-between text-sm text-white/80">
                <span>Diários (90d)</span>
                <span className="font-bold">{diaryCount}</span>
              </div>
              <div className="flex items-center justify-between text-sm text-white/80">
                <span>Chamados ativos</span>
                <span className="font-bold">{activeTickets}</span>
              </div>
              <div className="mt-1">
                <div className="w-full bg-black/30 rounded-full h-3" title="Proporção de diários / chamados">
                  <div
                    className="h-3 rounded-full bg-cyan-400"
                    style={{ width: `${Math.min(100, (diaryCount / Math.max(1, activeTickets)) * 100)}%` }}
                  />
                </div>
                <div className="text-[11px] text-white/60 mt-1">Quanto mais próximo de 100%, mais registros de diário por chamado ativo.</div>
              </div>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}

// TELA 3 — CHAMADOS

// TELA 4 — ESTATÍSTICAS DE PROJETOS
function ScreenProjects({ projectActives, phaseCounts }) {
  return (
    <div className="h-[calc(100%-0rem)] flex flex-col gap-2 overflow-hidden">
      <div className="text-lg font-bold">Estatísticas — Projetos</div>
      <div className="grid grid-cols-6 gap-2">
        <BigKpi title="Projetos ativos" value={projectActives} icon={<FolderOpen className="h-6 w-6" />} />
        <div className="rounded-2xl border border-white/15 bg-black/10" />
        <div className="rounded-2xl border border-white/15 bg-black/10" />
        <div className="rounded-2xl border border-white/15 bg-black/10" />
        <div className="rounded-2xl border border-white/15 bg-black/10" />
        <div className="rounded-2xl border border-white/15 bg-black/10" />
      </div>
      <div className="grid grid-cols-3 gap-2 mt-2">
        <Panel title="Projetos — resumo por fase">
          <div className="grid grid-cols-4 gap-2">
            <PhaseStat title="Futuro" value={phaseCounts.futuro} />
            <PhaseStat title="Andamento" value={phaseCounts.andamento} />
            <PhaseStat title="Desmontagem" value={phaseCounts.desmontagem} />
            <PhaseStat title="Finalizado" value={phaseCounts.finalizado} />
          </div>
        </Panel>
        <div className="rounded-2xl border border-white/15 bg-black/10" />
        <div className="rounded-2xl border border-white/15 bg-black/10" />
      </div>
    </div>
  );
}

// TELA 3 — CHAMADOS
function ScreenTickets({ ticketsFeed, usersByIdRef, usersByEmailRef, projectsMapRef, eventsMapRef }) {
  return (
    <div className="h-[calc(100%-0rem)] flex flex-col gap-3">
      {/* Cabeçalho explícito da tela */}
      <div className="text-lg font-bold">Chamados — últimas atualizações</div>

      <div className="grid grid-cols-4 grid-rows-5 gap-3 flex-1">
        {Array.from({ length: 20 }).map((_, idx) => {
          const t = ticketsFeed[idx];
          if (!t) return <div key={idx} className="rounded-2xl border border-white/10 bg-black/10" />;

          const idCandidates = [t.createdBy, t.openedById, t.criadoPorId, t.abertoPorId, t.userId, t.solicitanteId].filter(Boolean);
          const emailCandidates = [
            t.openedByEmail, t.createdByEmail, t.criadoPorEmail, t.abertoPorEmail, t.solicitanteEmail, t.userEmail
          ].filter(Boolean);

          const openedByFromId = idCandidates.map((id) => usersByIdRef.current[id]?.nome).find(isText);
          const openedByFromEmail = emailCandidates
            .map((e) => (e || "").toLowerCase())
            .map((e) => usersByEmailRef.current[e]?.nome)
            .find(isText);
          const openedBy = obfuscate(
            pickText(openedByFromId, openedByFromEmail, t.openedByName, t.criadoPorNome, t.aberto_por_nome, t.solicitanteNome, t?.solicitante?.nome)
          );

          const respIdCandidates = [t.atribuido_a, t.assigneeId, t.responsavelId, t.responsavel_atual_id].filter(Boolean);
          const respEmailCandidates = [t.atribuido_a_email, t.responsavelEmail, t.responsavel_atual_email].filter(Boolean);
          const responsavelFromId = respIdCandidates.map((id) => usersByIdRef.current[id]?.nome).find(isText);
          const responsavelFromEmail = respEmailCandidates
            .map((e) => (e || "").toLowerCase())
            .map((e) => usersByEmailRef.current[e]?.nome)
            .find(isText);
          const responsavel = obfuscate(
            pickText(responsavelFromId, responsavelFromEmail, t.atribuido_a_nome, t.responsavelNome, t.responsavel_atual_nome)
          );

          const projId = pickText(t.projectId, t.projetoId, t.project_id, t.projeto_id, t.idProjeto, t.id_projeto);
          const projFromMap = projId ? projectsMapRef.current[projId]?.projectName : undefined;
          const projLabelFromDoc = pickText(t.projectName, t.projetoNome, t.projeto, t.project, t.project_title, t.titleProject);
          const projectLabel = pickText(projLabelFromDoc, projFromMap, projId);

          const eventIdFromTicket = pickText(t.eventId, t.event_id, t?.evento?.eventoId, t?.event?.eventoId, t?.eventoId);
          const evFromMapByProj = projId ? projectsMapRef.current[projId]?.eventName : undefined;
          const evFromEvents = pickText(
            eventsMapRef.current[eventIdFromTicket]?.name,
            eventsMapRef.current[projectsMapRef.current[projId]?.eventId || ""]?.name
          );
          const evLabelFromDoc = pickText(
            t.eventName, t.event_title, t.eventTitle,
            t?.event?.name, t?.event?.nome, t?.event?.feira,
            t?.evento?.name, t?.evento?.nome, t?.evento?.feira
          );
          const eventLabel = pickText(evLabelFromDoc, evFromMapByProj, evFromEvents);

          const areaAtual = t?.area_atual || t?.area || t?.areaAtual || "—";
          const when = t?.updatedAt?.toDate ? t.updatedAt.toDate()
            : t?.createdAt?.toDate ? t.createdAt.toDate() : null;

          return (
            <div key={t.id} className={`rounded-2xl border border-white/15 bg-black/25 p-3 ${statusColor(t.status)}`}>
              <div className="flex items-start justify-between">
                <div className="min-w-0 pr-2">
                  <div className="text-[16px] font-semibold truncate" title={t.titulo || t.title}>
                    {t.titulo || t.title || "(sem título)"}
                  </div>
                  <div className="text-[13px] text-white/80 truncate">
                    Aberto por <span className="text-white">{openedBy}</span>
                    <span className="mx-1">·</span>
                    Área <span className={`text-white ${areaHue(areaAtual)}`}>{areaAtual}</span>
                    <span className="mx-1">·</span>
                    Resp. <span className="text-white">{responsavel}</span>
                  </div>
                  {(projectLabel || eventLabel) && (
                    <div className="text-[13px] text-white/70 truncate">
                      <span className="text-white/80">{projectLabel || ""}</span>
                      {eventLabel ? <span> / {eventLabel}</span> : null}
                    </div>
                  )}
                </div>
                <div className="text-[12px] text-white/60 whitespace-nowrap ml-2">{formatTimeAgo(when)}</div>
              </div>
              <div className="mt-2">
                <StatusBadge status={t.status} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ============================ componentes auxiliares ============================ */
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

function BigKpi({ title, value, icon }) {
  return (
    <div className="rounded-2xl border border-white/15 bg-black/25 p-3">
      <div className="flex items-center justify-between">
        <div className="text-base font-bold">{title}</div>
        {icon}
      </div>
      <div className="text-5xl font-extrabold mt-0.5">{value}</div>
    </div>
  );
}

function PhaseStat({ title, value }) {({ title, value }) {
  return (
    <div className="bg-black/20 border border-white/20 rounded-xl p-3 flex items-center justify-between">
      <span className="text-sm text-white/80">{title}</span>
      <span className="text-2xl font-bold tabular-nums">{value}</span>
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

function Panel({ title, children }) {
  return (
    <div className="rounded-2xl border border-white/15 bg-black/25 p-3">
      <div className="text-base font-bold mb-1">{title}</div>
      {children}
    </div>
  );
}

/* Mini gráficos SVG sem dependências */ SVG sem dependências */
function MiniLines({ opens, closes, width = 520, height = 140, padding = 10 }) {
  const w = width, h = height, p = padding;
  const max = Math.max(1, ...opens, ...closes);
  const toXY = (arr, idx) => {
    const x = p + (idx * (w - 2 * p)) / (arr.length - 1 || 1);
    const y = h - p - (arr[idx] / max) * (h - 2 * p);
    return `${idx === 0 ? "M" : "L"}${x},${y}`;
  };
  const path = (arr) => arr.map((_, i) => toXY(arr, i)).join(" ");
  return (
    <svg width={w} height={h} className="block">
      <rect x="0" y="0" width={w} height={h} fill="none" className="stroke-white/10" />
      <path d={path(opens)} fill="none" className="stroke-cyan-300" strokeWidth="2" />
      <path d={path(closes)} fill="none" className="stroke-emerald-300" strokeWidth="2" />
    </svg>
  );
}
function MiniArea({ series, width = 520, height = 140, padding = 10 }) {
  const w = width, h = height, p = padding;
  const max = Math.max(1, ...series);
  const points = series.map((v, i) => {
    const x = p + (i * (w - 2 * p)) / (series.length - 1 || 1);
    const y = h - p - (v / max) * (h - 2 * p);
    return `${x},${y}`;
  });
  const d = `M ${p},${h - p} L ${points.join(" L ")} L ${w - p},${h - p} Z`;
  return (
    <svg width={w} height={h} className="block">
      <rect x="0" y="0" width={w} height={h} fill="none" className="stroke-white/10" />
      <path d={d} className="fill-cyan-300/20 stroke-cyan-300" strokeWidth="2" />
    </svg>
  );
}
  const w = 520, h = 140, p = 10;
  const max = Math.max(1, ...series);
  const points = series.map((v, i) => {
    const x = p + (i * (w - 2 * p)) / (series.length - 1 || 1);
    const y = h - p - (v / max) * (h - 2 * p);
    return `${x},${y}`;
  });
  const d = `M ${p},${h - p} L ${points.join(" L ")} L ${w - p},${h - p} Z`;
  return (
    <svg width={w} height={h} className="block">
      <rect x="0" y="0" width={w} height={h} fill="none" className="stroke-white/10" />
      <path d={d} className="fill-cyan-300/20 stroke-cyan-300" strokeWidth="2" />
    </svg>
  );
}

export { TVPanel };
export default TVPanel;
