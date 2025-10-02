// src/pages/TVPanel.jsx
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { collection, onSnapshot, query, orderBy, limit } from 'firebase/firestore';
import { db } from '../config/firebase';
import { 
  BarChart3, Clock, Zap, CheckCircle, AlertOctagon, TrendingUp, FolderOpen,
  Activity, UserCheck, Target, Award, PlusCircle, ArrowRightCircle, 
  TrendingDown, Flag, GitPullRequest, Calendar, Users, FileText
} from 'lucide-react';

/* ---------------- helpers ---------------- */
const formatTimeAgo = (date) => {
  if (!date) return '';
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 5) return "agora";
  const spans = [
    [31536000, "ano"],
    [2592000, "mês"],
    [86400, "dia"],
    [3600, "hora"],
    [60, "minuto"],
  ];
  for (const [sec, label] of spans) {
    const n = Math.floor(seconds / sec);
    if (n >= 1) return `há ${n} ${label}${n>1?'s':''}`;
  }
  return `há ${seconds} seg`;
};

const getLatestTimestamp = (t) => {
  const d1 = t?.dataUltimaAtualizacao?.toDate?.();
  const d2 = t?.createdAt?.toDate?.();
  const dates = [d1, d2].filter(Boolean);
  return dates.length ? new Date(Math.max(...dates.map(d => d.getTime()))) : new Date(0);
};

/* ---------------- componente ---------------- */
export default function TVPanel() {
  // KPIs principais
  const [stats, setStats] = useState({ total: 0, abertos: 0, emAndamento: 0, concluidos: 0 });
  const [projectStats, setProjectStats] = useState({ ativos: 0 });
  const [activityFeed, setActivityFeed] = useState([]);
  const [users, setUsers] = useState({});

  // Diário
  const [diaryFeed, setDiaryFeed] = useState([]);

  // Extras (mantidos)
  const [untreatedByArea, setUntreatedByArea] = useState({});
  const [slaStats, setSlaStats] = useState({ violated: 0, atRisk: 0 });
  const [pendingApprovalCount, setPendingApprovalCount] = useState(0);
  const [escalatedCount, setEscalatedCount] = useState(0);
  const [awaitingValidationCount, setAwaitingValidationCount] = useState(0);
  const [escalationRate, setEscalationRate] = useState(0);
  const [openedToday, setOpenedToday] = useState(0);
  const [openedThisMonth, setOpenedThisMonth] = useState(0);

  // SLA lista/rotação
  const [slaViolationsList, setSlaViolationsList] = useState([]);
  const [slaView, setSlaView] = useState('summary'); // 'summary' | 'areas'

  // UI
  const [currentTime, setCurrentTime] = useState(new Date());
  const [isLoading, setIsLoading] = useState(true);

  /* ===== Relógio ===== */
  useEffect(() => {
    const id = setInterval(() => setCurrentTime(new Date()), 1000);
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
      o.type = 'sine';
      o.frequency.value = 880; // tom
      o.connect(g);
      g.connect(ctx.destination);
      g.gain.setValueAtTime(0.2, ctx.currentTime);
      o.start();
      g.gain.exponentialRampToValueAtTime(0.00001, ctx.currentTime + 0.6);
      o.stop(ctx.currentTime + 0.6);
    } catch { /* no-op */ }
  };

  /* ===== Assinaturas ===== */
  useEffect(() => {
    // usuários
    const unsubUsers = onSnapshot(collection(db, 'usuarios'), (snap) => {
      const map = {};
      snap.forEach(d => map[d.id] = d.data());
      setUsers(map);
    });

    // projetos
    const unsubProjects = onSnapshot(collection(db, 'projetos'), (snap) => {
      const projects = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setProjectStats({
        ativos: projects.filter(p => p && p.status !== 'concluido').length
      });
    });

    // chamados
    const unsubTickets = onSnapshot(collection(db, 'chamados'), (snap) => {
      const tickets = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const now = new Date();
      const startDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const startMonth = new Date(now.getFullYear(), now.getMonth(), 1);

      const norm = (s) => (s || '').toLowerCase();

      const open = tickets.filter(t => norm(t?.status) === 'aberto');

      // Em Andamento = somente em_tratativa (e variação com espaço)
      const emAndamentoCount = tickets.filter(t => {
        const s = norm(t?.status);
        return s === 'em_tratativa' || s === 'em tratativa';
      }).length;

      setStats({
        total: tickets.length,
        abertos: open.length,
        emAndamento: emAndamentoCount,
        concluidos: tickets.filter(t => ['concluido','arquivado'].includes(norm(t?.status))).length,
      });

      setEscalatedCount(tickets.filter(t => norm(t?.status) === 'escalado_para_outra_area').length);

      // Aguardando validação = soma dos dois status
      setAwaitingValidationCount(
        tickets.filter(t => {
          const s = norm(t?.status);
          return s === 'executado_aguardando_validacao' ||
                 s === 'executado_aguardando_validacao_operador';
        }).length
      );

      setPendingApprovalCount(tickets.filter(t => norm(t?.status) === 'aguardando_aprovacao').length);

      setOpenedToday(tickets.filter(t => t?.createdAt?.toDate() >= startDay).length);
      setOpenedThisMonth(tickets.filter(t => t?.createdAt?.toDate() >= startMonth).length);

      const totalEscalated = tickets.filter(t => ['escalado_para_outra_area','aguardando_aprovacao'].includes(norm(t?.status))).length;
      setEscalationRate(tickets.length ? (totalEscalated / tickets.length) * 100 : 0);

      // Foco de atenção por área (abertos)
      setUntreatedByArea(open.reduce((acc, t) => {
        const area = t?.area || 'Não definida';
        acc[area] = (acc[area] || 0) + 1;
        return acc;
      }, {}));

      // SLA (violado/risco) + lista para rotação
      const slaCfg = { baixa: 240, media: 24, alta: 12, urgente: 2 }; // horas
      let viol = 0, risk = 0;
      const violatedList = [];
      tickets.filter(t => !['concluido','cancelado','arquivado'].includes(norm(t?.status))).forEach(t => {
        const h = slaCfg[norm(t?.prioridade)];
        const cAt = t?.createdAt?.toDate ? t.createdAt.toDate() : null;
        if (!h || !cAt) return;
        const elapsed = (now - cAt) / (1000*60*60);
        if (elapsed > h) { viol++; violatedList.push(t); }
        else if (elapsed > h*0.75) { risk++; }
      });
      setSlaStats({ violated: viol, atRisk: risk });
      setSlaViolationsList(violatedList);

      // Feed direita (20 últimos por timestamp mais recente)
      const sorted = [...tickets].sort((a,b) => getLatestTimestamp(b) - getLatestTimestamp(a));
      setActivityFeed(sorted.slice(0, 20).map(t => {
        const ts = getLatestTimestamp(t);
        const s = norm(t?.status);
        let message, icon;
        if (s === 'aberto')                                { message = `Novo: "${t.titulo}"`;       icon = PlusCircle; }
        else if (s === 'concluido' || s === 'arquivado')   { message = `Finalizado: "${t.titulo}"`; icon = CheckCircle; }
        else if (s === 'executado_aguardando_validacao' || s === 'executado_aguardando_validacao_operador') {
          message = `Executado: "${t.titulo}"`; icon = UserCheck;
        } else { message = `Atualizado: "${t.titulo}"`; icon = ArrowRightCircle; }
        return { id: t.id, status: s, message, icon, timeAgo: formatTimeAgo(ts) };
      }));

      // SOM: novos "aberto" após inicialização
      const openIdsNow = new Set(open.map(t => t.id));
      if (!initializedOpens.current) {
        seenOpenIds.current = openIdsNow; // primeira carga: não toca
        initializedOpens.current = true;
      } else {
        let hasNew = false;
        openIdsNow.forEach(id => { if (!seenOpenIds.current.has(id)) hasNew = true; });
        if (hasNew) ping();
        seenOpenIds.current = openIdsNow;
      }

      if (isLoading) setIsLoading(false);
    });

    // diários (10 últimos)
    const unsubDiaries = onSnapshot(
      query(collection(db, 'diary_feed'), orderBy('createdAt','desc'), limit(10)),
      (snap) => {
        const list = snap.docs.map(d => {
          const data = d.data() || {};
          const dt = data.createdAt?.toDate
            ? data.createdAt.toDate()
            : (data.createdAt?._seconds ? new Date(data.createdAt._seconds*1000) : null);
          return { id: d.id, ...data, _dt: dt };
        });
        setDiaryFeed(list);
      }
    );

    return () => {
      unsubUsers(); unsubProjects(); unsubTickets(); unsubDiaries();
      try { audioCtx.current && audioCtx.current.close(); } catch {}
    };
  }, [isLoading]);

  // Rotação do card de SLA
  useEffect(() => {
    const id = setInterval(() => setSlaView(v => (v === 'summary' ? 'areas' : 'summary')), 10000);
    return () => clearInterval(id);
  }, []);

  const RESOLUTION_GOAL = 95;
  const resolutionRate = stats.total ? (stats.concluidos / stats.total) * 100 : 0;

  // Agrupamento de violações de SLA por área
  const slaByArea = useMemo(() => {
    const map = {};
    slaViolationsList.forEach(t => {
      const area = t?.area || 'Não definida';
      map[area] = (map[area] || 0) + 1;
    });
    return Object.entries(map).sort((a,b) => b[1]-a[1]).slice(0,5);
  }, [slaViolationsList]);

  /* ---------------- render ---------------- */
  if (isLoading) {
    return (
      <div className="min-h-screen bg-green-900 text-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-white mx-auto mb-4"></div>
          <h2 className="text-2xl font-bold">Conectando ao Painel Operacional...</h2>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen h-screen max-h-screen bg-green-900 text-white p-2 flex flex-col gap-2 overflow-hidden">
      {/* Header */}
      <header className="flex justify-between items-center flex-shrink-0 px-2">
        <div>
          <h1 className="text-3xl font-bold text-white">Painel Operacional</h1>
          <p className="text-lg text-white/70">Uset / SP Group</p>
        </div>
        <div className="text-right">
          <div className="text-4xl font-mono text-white/90">{currentTime.toLocaleTimeString('pt-BR')}</div>
          <div className="text-md text-white/70">{currentTime.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}</div>
        </div>
      </header>

      <div className="flex flex-grow gap-2 min-h-0">
        {/* Coluna esquerda */}
        <main className="flex flex-col flex-grow gap-2 w-3/4">
          {/* KPIs linha 1 */}
          <section className="grid grid-cols-5 gap-2">
            <Kpi title="Total" value={stats.total} icon={<BarChart3 className="h-5 w-5" />} />
            <Kpi title="Abertos" value={stats.abertos} icon={<AlertOctagon className="h-5 w-5 text-orange-400" />} />
            <Kpi title="Em Andamento" value={stats.emAndamento} icon={<Zap className="h-5 w-5 text-teal-400" />} />
            <Kpi title="Aguard. Validação" value={awaitingValidationCount} icon={<UserCheck className="h-5 w-5 text-yellow-400" />} />
            <Kpi title="Concluídos" value={stats.concluidos} icon={<CheckCircle className="h-5 w-5 text-green-400" />} />
          </section>

          {/* KPIs linha 2 */}
          <section className="grid grid-cols-5 gap-2">
            <Kpi title="Projetos Ativos" value={projectStats.ativos} icon={<FolderOpen className="h-5 w-5" />} />
            <Kpi title="Escalados" value={escalatedCount} icon={<TrendingUp className="h-5 w-5 text-indigo-400" />} />
            <Kpi title="Aprov. Gerência" value={pendingApprovalCount} icon={<GitPullRequest className="h-5 w-5 text-purple-400" />} />
            <Kpi title="Abertos Hoje" value={openedToday} icon={<Calendar className="h-5 w-5" />} />
            <Kpi title="Abertos no Mês" value={openedThisMonth} icon={<Calendar className="h-5 w-5" />} />
          </section>

          {/* Blocos médios */}
          <section className="grid grid-cols-4 gap-2 flex-grow">
            {/* SLA – view rotativa */}
            <div className="bg-black/20 border border-red-500 rounded-xl p-3 flex flex-col justify-center">
              {slaView === 'summary' ? (
                <>
                  <h3 className="text-md font-bold mb-1">Status do SLA</h3>
                  <div className="flex items-center mb-1">
                    <TrendingDown className="h-6 w-6 mr-2 text-red-400" />
                    <span className="text-3xl font-bold">{slaStats.violated}</span>
                    <span className="ml-2 text-sm">Violado(s)</span>
                  </div>
                  <div className="flex items-center">
                    <Flag className="h-6 w-6 mr-2 text-yellow-400" />
                    <span className="text-3xl font-bold">{slaStats.atRisk}</span>
                    <span className="ml-2 text-sm">Em Risco</span>
                  </div>
                </>
              ) : (
                <>
                  <h3 className="text-md font-bold mb-2">SLA estourado · por área</h3>
                  {slaByArea.length === 0 ? (
                    <div className="text-white/70 text-sm">Nenhuma violação agora.</div>
                  ) : (
                    <div className="space-y-1">
                      {slaByArea.map(([area, count]) => (
                        <div key={area} className="flex justify-between items-center bg-black/30 p-1.5 rounded">
                          <span className="text-sm">{area}</span>
                          <span className="px-2 py-0.5 rounded bg-red-500 text-black font-bold">{count}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="text-[11px] text-white/60 mt-2">Alternando a cada 10s</div>
                </>
              )}
            </div>

            {/* Foco de Atenção */}
            <div className="bg-black/20 border border-white/20 rounded-xl p-3 flex flex-col">
              <h3 className="text-md font-bold mb-1 flex items-center">
                <Target className="h-5 w-5 mr-2 text-yellow-400" />Foco de Atenção
              </h3>
              <div className="space-y-1 flex-grow flex flex-col justify-center">
                {Object.entries(untreatedByArea).sort(([,a],[,b]) => b-a).slice(0,3).map(([area, count]) => (
                  <div key={area} className="flex justify-between items-center bg-black/20 p-1.5 rounded-lg">
                    <span className="font-medium text-yellow-300 text-sm">{area}</span>
                    <span className="font-bold text-lg text-black bg-yellow-400 rounded-md px-2">{count}</span>
                  </div>
                ))}
                {Object.keys(untreatedByArea).length === 0 && (
                  <p className="text-white/60 text-center text-sm py-2">Nenhum chamado aberto!</p>
                )}
              </div>
            </div>

            {/* Taxa de Resolução */}
            <div className="bg-black/20 border border-white/20 rounded-xl p-3 flex flex-col justify-center">
              <h3 className="text-md font-bold mb-1">Taxa de Resolução</h3>
              <div className="flex items-center justify-between mb-1">
                <span className="text-4xl font-bold text-green-400">{resolutionRate.toFixed(1)}%</span>
                <span className="text-xs text-white/70">Meta: {RESOLUTION_GOAL}%</span>
              </div>
              <div className="w-full bg-black/20 rounded-full h-3">
                <div className="bg-green-500 h-3 rounded-full" style={{ width: `${resolutionRate}%` }} />
              </div>
            </div>

            {/* Taxa de Escalação */}
            <div className="bg-black/20 border border-white/20 rounded-xl p-3 flex flex-col justify-center">
              <h3 className="text-md font-bold mb-1">Taxa de Escalação</h3>
              <div className="flex items-center justify-between">
                <span className="text-4xl font-bold text-indigo-400">{escalationRate.toFixed(1)}%</span>
              </div>
              <p className="text-white/70 mt-1 text-sm">Dos chamados precisam de outras áreas/gerência.</p>
            </div>
          </section>

          {/* Painel de Diários (no lugar dos 2 quadros removidos) */}
          <section className="grid grid-cols-2 gap-2 flex-grow">
            <div className="col-span-2 bg-black/20 border border-white/20 rounded-xl p-3 flex flex-col">
              <h3 className="text-md font-bold mb-2 flex items-center">
                <FileText className="h-5 w-5 mr-2 text-cyan-400" />Últimos Diários
              </h3>

              {diaryFeed.length === 0 ? (
                <p className="text-white/60 text-center text-sm py-6">Nenhum diário recente.</p>
              ) : (
                <div className="grid grid-cols-2 gap-2 overflow-y-auto">
                  {diaryFeed.map((d) => {
                    const when = d._dt || null;
                    const preview = (d.text || '').length > 200 ? d.text.slice(0,200)+'…' : (d.text || '');
                    const images = Array.isArray(d.attachments)
                      ? d.attachments.filter(a => (a.type || a.contentType || '').includes('image'))
                      : [];
                    const thumbs = images.slice(0,4);
                    const more = Math.max(0, images.length - thumbs.length);

                    return (
                      <div key={d.id} className="bg-black/20 border border-white/10 rounded-lg p-2">
                        <div className="flex items-center justify-between">
                          <div className="text-xs text-cyan-300 truncate">
                            {d.projectName || d.projectId || 'Projeto'}
                          </div>
                          <div className="text-[11px] text-white/60 ml-2 whitespace-nowrap">
                            {when ? formatTimeAgo(when) : '—'}
                          </div>
                        </div>
                        <div className="mt-1 text-sm font-medium truncate">
                          {d.authorName || '—'}{d.authorRole ? <span className="text-white/60 font-normal"> · {d.authorRole}</span> : null}
                        </div>

                        {thumbs.length > 0 && (
                          <div className="mt-2 grid grid-cols-4 gap-1">
                            {thumbs.map((img, i) => (
                              <div key={i} className="w-full h-16 rounded overflow-hidden bg-black/30">
                                <img src={img.url} alt={img.name || `img-${i}`} className="w-full h-full object-cover" loading="lazy" />
                              </div>
                            ))}
                            {more > 0 && (
                              <div className="w-full h-16 rounded bg-black/30 border border-white/10 flex items-center justify-center text-xs text-white/80">+{more}</div>
                            )}
                          </div>
                        )}

                        <p className="mt-2 text-sm text-white/80 break-words">{preview}</p>

                        {d.linkUrl && (
                          <a href={d.linkUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-cyan-300 hover:text-cyan-200 mt-1">
                            <ArrowRightCircle className="h-3 w-3" /> Abrir link
                          </a>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </section>
        </main>

        {/* Feed direita (20 últimos) */}
        <aside className="bg-black/20 border border-white/20 rounded-xl p-3 shadow-lg flex flex-col w-1/4">
          <h3 className="text-lg font-bold mb-2 flex items-center flex-shrink-0">
            <Activity className="h-5 w-5 mr-2 text-cyan-400" />Feed de Atividades
          </h3>
          <div className="text-xs text-white/70 mb-1">20 últimos</div>
          <div className="space-y-2 overflow-y-auto flex-grow pr-2">
            {activityFeed.map((item, idx) => {
              const color =
                item.status === 'aberto' ? "text-blue-400" :
                item.status === 'concluido' ? "text-green-400" :
                item.status === 'executado_aguardando_validacao' || item.status === 'executado_aguardando_validacao_operador' ? "text-yellow-400" :
                "text-gray-300";
              return (
                <div key={`${item.id}-${idx}`} className="flex items-start">
                  <item.icon className={`h-5 w-5 mt-1 mr-3 flex-shrink-0 ${color}`} />
                  <div className="min-w-0">
                    <p className="text-white text-sm truncate" title={item.message}>{item.message}</p>
                    <p className="text-xs text-white/60">{item.timeAgo}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </aside>
      </div>
    </div>
  );
}

/* --- componentes pequenos --- */
function Kpi({ title, value, icon }) {
  return (
    <div className="bg-black/20 border border-white/20 rounded-xl p-2 flex flex-col justify-center">
      <div className="flex justify-between items-center mb-1">
        <h3 className="text-md font-bold">{title}</h3>{icon}
      </div>
      <div className="text-4xl font-bold">{value}</div>
    </div>
  );
}
