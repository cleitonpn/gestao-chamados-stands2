// src/pages/TVPanel.jsx
import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, query, orderBy, limit } from 'firebase/firestore';
import { db } from '../config/firebase';
import { 
  BarChart3, Clock, Zap, CheckCircle, AlertOctagon, TrendingUp, FolderOpen,
  Activity, UserCheck, Target, Award, PlusCircle, ArrowRightCircle, 
  TrendingDown, Flag, GitPullRequest, Calendar, Users, FileText
} from 'lucide-react';

// HELPER PARA FORMATAR TEMPO RELATIVO
const formatTimeAgo = (date) => {
  if (!date) return '';
  const seconds = Math.floor((new Date() - date) / 1000);
  if (seconds < 5) return "agora";
  let interval = seconds / 31536000; if (interval > 1) return `há ${Math.floor(interval)} anos`;
  interval = seconds / 2592000; if (interval > 1) return `há ${Math.floor(interval)} meses`;
  interval = seconds / 86400; if (interval > 1) return `há ${Math.floor(interval)} dias`;
  interval = seconds / 3600; if (interval > 1) return `há ${Math.floor(interval)} horas`;
  interval = seconds / 60; if (interval > 1) return `há ${Math.floor(interval)} minutos`;
  return `há ${Math.floor(seconds)} segundos`;
};

// HELPER para pegar a data mais recente de um ticket
const getLatestTimestamp = (ticket) => {
  if (!ticket) return new Date(0);
  const dates = [ ticket.dataUltimaAtualizacao?.toDate?.(), ticket.createdAt?.toDate?.() ].filter(Boolean);
  if (dates.length === 0) return new Date(0);
  return new Date(Math.max.apply(null, dates));
};

const TVPanel = () => {
  // --- Estados de Dados ---
  const [stats, setStats] = useState({ total: 0, abertos: 0, emAndamento: 0, concluidos: 0 });
  const [projectStats, setProjectStats] = useState({ ativos: 0 });
  const [activityFeed, setActivityFeed] = useState([]);
  const [users, setUsers] = useState({});

  // --- Novos: feed de DIÁRIOS (10 últimos)
  const [diaryFeed, setDiaryFeed] = useState([]);

  // --- Estados para Novos Cards e Correções (originais do seu painel) ---
  const [untreatedByArea, setUntreatedByArea] = useState({});
  const [topExecutors, setTopExecutors] = useState([]); // (mantido, mas não exibido mais)
  const [slaStats, setSlaStats] = useState({ violated: 0, atRisk: 0 });
  const [pendingApprovalCount, setPendingApprovalCount] = useState(0);
  const [escalatedCount, setEscalatedCount] = useState(0);
  const [awaitingValidationCount, setAwaitingValidationCount] = useState(0);
  const [escalationRate, setEscalationRate] = useState(0);
  const [topAreaCreators, setTopAreaCreators] = useState([]); // (mantido, mas não exibido mais)
  const [openedToday, setOpenedToday] = useState(0);
  const [openedThisMonth, setOpenedThisMonth] = useState(0);
  
  // --- Estados de UI ---
  const [currentTime, setCurrentTime] = useState(new Date());
  const [isLoading, setIsLoading] = useState(true);

  const RESOLUTION_GOAL = 95;

  // Relógio
  useEffect(() => {
    const clockInterval = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(clockInterval);
  }, []);

  // Assinaturas principais (iguais ao seu arquivo)
  useEffect(() => {
    const unsubscribeUsers = onSnapshot(query(collection(db, 'usuarios')), (snapshot) => {
      const usersData = snapshot.docs.reduce((acc, doc) => {
        if(doc.id) acc[doc.id] = doc.data();
        return acc;
      }, {});
      setUsers(usersData);
    });

    const unsubscribeProjects = onSnapshot(query(collection(db, 'projetos')), (snapshot) => {
      const projectsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setProjectStats({ ativos: projectsData.filter(p => p && p.status !== 'concluido').length });
    });

    const unsubscribeTickets = onSnapshot(query(collection(db, 'chamados')), (snapshot) => {
      const tickets = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      const agora = new Date();
      const inicioDia = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
      const inicioMes = new Date(agora.getFullYear(), agora.getMonth(), 1);

      const openTickets = tickets.filter(t => t && t.status === 'aberto');
      
      setStats({
        total: tickets.length,
        abertos: openTickets.length,
        emAndamento: tickets.filter(t => t && ['em tratativa', 'tratativa', 'escalado_para_outra_area', 'aguardando_aprovacao'].includes(t.status)).length,
        // Concluídos = concluido + arquivado (mantida sua alteração)
        concluidos: tickets.filter(t => t && ['concluido', 'arquivado'].includes(t.status)).length,
      });

      setEscalatedCount(tickets.filter(t => t && t.status === 'escalado_para_outra_area').length);
      setAwaitingValidationCount(tickets.filter(t => t && t.status === 'executado_aguardando_validacao').length);
      setPendingApprovalCount(tickets.filter(t => t && t.status === 'aguardando_aprovacao').length);

      setOpenedToday(tickets.filter(t => t && t.createdAt?.toDate() >= inicioDia).length);
      setOpenedThisMonth(tickets.filter(t => t && t.createdAt?.toDate() >= inicioMes).length);

      const totalEscalated = tickets.filter(t => t && ['escalado_para_outra_area', 'aguardando_aprovacao'].includes(t.status)).length;
      setEscalationRate(tickets.length > 0 ? (totalEscalated / tickets.length) * 100 : 0);

      // (mantidos, ainda que não exibidos agora)
      const executedThisMonth = tickets.filter(t => {
        if (!t) return false;
        const lastUpdate = getLatestTimestamp(t);
        return t.status === 'executado_aguardando_validacao' && lastUpdate >= inicioMes;
      });
      const executorsCount = executedThisMonth.reduce((acc, ticket) => {
        const executor = ticket.responsavelNome || ticket.area || 'Não identificado';
        acc[executor] = (acc[executor] || 0) + 1;
        return acc;
      }, {});
      setTopExecutors(Object.entries(executorsCount).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 3));

      if (Object.keys(users).length > 0) {
        const creatorAreasCount = tickets.reduce((acc, ticket) => {
          if (!ticket || !ticket.criadoPor) return acc;
          const creatorId = ticket.criadoPor;
          const creatorArea = users[creatorId]?.area || 'Não definida';
          acc[creatorArea] = (acc[creatorArea] || 0) + 1;
          return acc;
        }, {});
        setTopAreaCreators(Object.entries(creatorAreasCount).map(([area, count]) => ({ area, count })).sort((a, b) => b.count - a.count).slice(0, 3));
      }

      setUntreatedByArea(openTickets.reduce((acc, ticket) => {
        const area = ticket.area || 'Não definida';
        acc[area] = (acc[area] || 0) + 1;
        return acc;
      }, {}));
      
      const slaConfig = { baixa: 240, media: 24, alta: 12, urgente: 2 };
      let violatedCount = 0; let atRiskCount = 0;
      tickets.filter(t => t && !['concluido', 'cancelado', 'arquivado'].includes(t.status)).forEach(ticket => {
        const slaHours = slaConfig[ticket.prioridade];
        if (slaHours && ticket.createdAt?.toDate) {
          const elapsedHours = (agora - ticket.createdAt.toDate()) / (1000 * 60 * 60);
          if (elapsedHours > slaHours) violatedCount++;
          else if (elapsedHours > slaHours * 0.75) atRiskCount++;
        }
      });
      setSlaStats({ violated: violatedCount, atRisk: atRiskCount });
      
      const sortedTickets = [...tickets].sort((a, b) => getLatestTimestamp(b) - getLatestTimestamp(a));
      setActivityFeed(sortedTickets.slice(0, 10).map(ticket => {
        if (!ticket) return null;
        const timestamp = getLatestTimestamp(ticket);
        let message, icon;
        if(ticket.status === 'aberto') { [message, icon] = [`Novo: "${ticket.titulo}"`, PlusCircle]; }
        else if(ticket.status === 'concluido' || ticket.status === 'arquivado') { [message, icon] = [`Finalizado: "${ticket.titulo}"`, CheckCircle]; }
        else if(ticket.status === 'executado_aguardando_validacao') { [message, icon] = [`Executado: "${ticket.titulo}"`, UserCheck]; }
        else { [message, icon] = [`Atualizado: "${ticket.titulo}"`, ArrowRightCircle]; }
        return { id: ticket.id, message, icon, timeAgo: formatTimeAgo(timestamp), status: ticket.status };
      }).filter(Boolean));
      
      if (isLoading) setIsLoading(false);
    });

    // NOVO: feed de diários (10 últimos)
    const unsubscribeDiaries = onSnapshot(
      query(collection(db, 'diary_feed'), orderBy('createdAt', 'desc'), limit(10)),
      (snap) => {
        const list = snap.docs.map(d => {
          const data = d.data() || {};
          const dt = data.createdAt?.toDate
            ? data.createdAt.toDate()
            : (data.createdAt?._seconds ? new Date(data.createdAt._seconds * 1000) : null);
        return { id: d.id, ...data, _dt: dt };
        });
        setDiaryFeed(list);
      }
    );

    return () => {
      unsubscribeTickets();
      unsubscribeProjects();
      unsubscribeUsers();
      unsubscribeDiaries();
    };
  }, [isLoading, users]);

  const resolutionRate = stats.total > 0 ? (stats.concluidos / stats.total * 100) : 0;

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
        <main className="flex flex-col flex-grow gap-2 w-3/4">
          
          {/* KPIs linha 1 */}
          <section className="grid grid-cols-5 gap-2">
            <div className="bg-black/20 border border-white/20 rounded-xl p-2 flex flex-col justify-center">
              <div className="flex justify-between items-center mb-1">
                <h3 className="text-md font-bold">Total</h3><BarChart3 className="h-5 w-5" />
              </div>
              <div className="text-4xl font-bold">{stats.total}</div>
            </div>
            <div className="bg-black/20 border border-white/20 rounded-xl p-2 flex flex-col justify-center">
              <div className="flex justify-between items-center mb-1">
                <h3 className="text-md font-bold">Abertos</h3><AlertOctagon className="h-5 w-5 text-orange-400" />
              </div>
              <div className="text-4xl font-bold">{stats.abertos}</div>
            </div>
            <div className="bg-black/20 border border-white/20 rounded-xl p-2 flex flex-col justify-center">
              <div className="flex justify-between items-center mb-1">
                <h3 className="text-md font-bold">Em Andamento</h3><Zap className="h-5 w-5 text-teal-400" />
              </div>
              <div className="text-4xl font-bold">{stats.emAndamento}</div>
            </div>
            <div className="bg-black/20 border border-white/20 rounded-xl p-2 flex flex-col justify-center">
              <div className="flex justify-between items-center mb-1">
                <h3 className="text-md font-bold">Aguard. Validação</h3><UserCheck className="h-5 w-5 text-yellow-400" />
              </div>
              <div className="text-4xl font-bold">{awaitingValidationCount}</div>
            </div>
            <div className="bg-black/20 border border-white/20 rounded-xl p-2 flex flex-col justify-center">
              <div className="flex justify-between items-center mb-1">
                <h3 className="text-md font-bold">Concluídos</h3><CheckCircle className="h-5 w-5 text-green-400" />
              </div>
              <div className="text-4xl font-bold">{stats.concluidos}</div>
            </div>
          </section>

          {/* KPIs linha 2 */}
          <section className="grid grid-cols-5 gap-2">
            <div className="bg-black/20 border border-white/20 rounded-xl p-2 flex flex-col justify-center">
              <div className="flex justify-between items-center mb-1">
                <h3 className="text-md font-bold">Projetos Ativos</h3><FolderOpen className="h-5 w-5" />
              </div>
              <div className="text-4xl font-bold">{projectStats.ativos}</div>
            </div>
            <div className="bg-black/20 border border-white/20 rounded-xl p-2 flex flex-col justify-center">
              <div className="flex justify-between items-center mb-1">
                <h3 className="text-md font-bold">Escalados</h3><TrendingUp className="h-5 w-5 text-indigo-400" />
              </div>
              <div className="text-4xl font-bold">{escalatedCount}</div>
            </div>
            <div className="bg-black/20 border border-white/20 rounded-xl p-2 flex flex-col justify-center">
              <div className="flex justify-between items-center mb-1">
                <h3 className="text-md font-bold">Aprov. Gerência</h3><GitPullRequest className="h-5 w-5 text-purple-400" />
              </div>
              <div className="text-4xl font-bold">{pendingApprovalCount}</div>
            </div>
            <div className="bg-black/20 border border-white/20 rounded-xl p-2 flex flex-col justify-center">
              <div className="flex justify-between items-center mb-1">
                <h3 className="text-md font-bold">Abertos Hoje</h3><Calendar className="h-5 w-5" />
              </div>
              <div className="text-4xl font-bold">{openedToday}</div>
            </div>
            <div className="bg-black/20 border border-white/20 rounded-xl p-2 flex flex-col justify-center">
              <div className="flex justify-between items-center mb-1">
                <h3 className="text-md font-bold">Abertos no Mês</h3><Calendar className="h-5 w-5" />
              </div>
              <div className="text-4xl font-bold">{openedThisMonth}</div>
            </div>
          </section>

          {/* Blocos médios */}
          <section className="grid grid-cols-4 gap-2 flex-grow">
            <div className="bg-black/20 border border-red-500 rounded-xl p-3 flex flex-col justify-center">
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
            </div>

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

            <div className="bg-black/20 border border-white/20 rounded-xl p-3 flex flex-col justify-center">
              <h3 className="text-md font-bold mb-1">Taxa de Resolução</h3>
              <div className="flex items-center justify-between mb-1">
                <span className="text-4xl font-bold text-green-400">{resolutionRate.toFixed(1)}%</span>
                <span className="text-xs text-white/70">Meta: {RESOLUTION_GOAL}%</span>
              </div>
              <div className="w-full bg-black/20 rounded-full h-3">
                <div className="bg-green-500 h-3 rounded-full progress-bar" style={{width: `${resolutionRate}%`}} />
              </div>
            </div>

            <div className="bg-black/20 border border-white/20 rounded-xl p-3 flex flex-col justify-center">
              <h3 className="text-md font-bold mb-1">Taxa de Escalação</h3>
              <div className="flex items-center justify-between">
                <span className="text-4xl font-bold text-indigo-400">{escalationRate.toFixed(1)}%</span>
              </div>
              <p className="text-white/70 mt-1 text-sm">Dos chamados precisam de outras áreas/gerência.</p>
            </div>
          </section>
          
          {/* >>> AQUI trocamos os dois quadros por UM painel de DIÁRIOS <<< */}
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
                    const preview = (d.text || "").length > 200 ? (d.text || "").slice(0, 200) + "…" : (d.text || "");
                    return (
                      <div key={d.id} className="bg-black/20 border border-white/10 rounded-lg p-2">
                        <div className="flex items-center justify-between">
                          <div className="text-xs text-cyan-300 truncate">
                            {d.projectName || d.projectId || "Projeto"}
                          </div>
                          <div className="text-[11px] text-white/60 ml-2 whitespace-nowrap">
                            {when ? formatTimeAgo(when) : "—"}
                          </div>
                        </div>
                        <div className="mt-1 text-sm font-medium truncate">
                          {d.authorName || "—"}{d.authorRole ? <span className="text-white/60 font-normal"> · {d.authorRole}</span> : null}
                        </div>
                        <p className="mt-1 text-sm text-white/80 break-words">
                          {preview}
                        </p>
                        {d.linkUrl && (
                          <a
                            href={d.linkUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-cyan-300 hover:text-cyan-200 mt-1"
                          >
                            <ArrowRightCircle className="h-3 w-3" />
                            Abrir link
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

        {/* Lateral direita: Feed de atividades (igual) */}
        <aside className="bg-black/20 border border-white/20 rounded-xl p-3 shadow-lg flex flex-col w-1/4">
          <h3 className="text-lg font-bold mb-2 flex items-center flex-shrink-0">
            <Activity className="h-5 w-5 mr-2 text-cyan-400" />Feed de Atividades
          </h3>
          <div className="space-y-2 overflow-y-auto flex-grow custom-scrollbar pr-2">
            {activityFeed.map((item, index) => {
              if (!item) return null;
              const iconColor =
                item.status === 'aberto' ? "text-blue-400" :
                item.status === 'concluido' ? "text-green-400" :
                item.status === 'executado_aguardando_validacao' ? "text-yellow-400" :
                "text-gray-400";
              return (
                <div key={`${item.id}-${index}`} className="flex items-start animate-fade-in">
                  <item.icon className={`h-5 w-5 mt-1 mr-3 flex-shrink-0 ${iconColor}`} />
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
};

export default TVPanel;
