import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { reportService } from '../services/reportService';
import { projectService } from '../services/projectService';
import { ticketService } from '../services/ticketService';
import { userService } from '../services/userService';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { 
  ArrowLeft, Download, FileText, BarChart3, Calendar, Loader2, Eye,
  Filter, Search, X as XIcon, Building, PartyPopper, User, Clock,
  AlertTriangle, CheckCircle, Users, Target, TrendingUp, Copy,
  MessageSquare, Timer, History
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell, Legend as RechartsLegend } from 'recharts';

const ReportsPage = () => {
  const { userProfile } = useAuth();
  const navigate = useNavigate();
  
  // Dados brutos
  const [projects, setProjects] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [events, setEvents] = useState([]);

  // Estados de UI e Geração
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [reportPreview, setReportPreview] = useState('');
  const [copySuccess, setCopySuccess] = useState(false);
  
  // Estados para filtros e dados filtrados
  const [filters, setFilters] = useState({
    dateRange: { from: '', to: '' },
    userId: 'all',
    status: 'all',
    eventId: 'all',
    projectId: 'all',
    extras: 'all',
  });
  const [searchTerm, setSearchTerm] = useState('');
  const [filteredProjects, setFilteredProjects] = useState([]);
  const [filteredTickets, setFilteredTickets] = useState([]);
  const [kpiStats, setKpiStats] = useState({});
  const [chartData, setChartData] = useState({});
  const [flowAnalysis, setFlowAnalysis] = useState({});
  // ====== EXPORTAÇÃO: estados e listas ======
  const [exportFormat, setExportFormat] = useState('xlsx'); // 'xlsx' | 'csv'
  const [exportAreaOrigin, setExportAreaOrigin] = useState('all');
  const [exportAreaExecuted, setExportAreaExecuted] = useState('all');
  const [exportTicketType, setExportTicketType] = useState('all');

  const AREA_LIST = useMemo(() => {
    const fromUsers = Array.from(new Set((allUsers || []).map(u => u?.area).filter(Boolean)));
    const fromTickets = Array.from(new Set((tickets || []).flatMap(t => [
      t?.areaDeOrigem, t?.areaInicial, t?.area
    ]).filter(Boolean)));
    return Array.from(new Set([...fromUsers, ...fromTickets])).sort();
  }, [allUsers, tickets]);

  const TIPO_LIST = useMemo(() => {
    return Array.from(new Set((tickets || []).map(t => t?.tipo).filter(Boolean))).sort();
  }, [tickets]);


  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [projects, tickets, filters]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [projectsData, ticketsData, usersData] = await Promise.all([
        projectService.getAllProjects(),
        ticketService.getAllTickets(),
        userService.getAllUsers(),
      ]);
      
      const uniqueEvents = [...new Set(projectsData.map(p => p.feira).filter(Boolean))].sort();
      setEvents(uniqueEvents);
      setProjects(projectsData);
      setTickets(ticketsData);
      setAllUsers(usersData);
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
    } finally {
      setLoading(false);
    }
  };

  // 🔧 FUNÇÃO PARA COPIAR CONTEÚDO DO PREVIEW
  const handleCopyPreview = async () => {
    try {
      await navigator.clipboard.writeText(reportPreview);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (error) {
      console.error('Erro ao copiar:', error);
      // Fallback para navegadores mais antigos
      const textArea = document.createElement('textarea');
      textArea.value = reportPreview;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    }
  };

  // 🔧 FUNÇÃO PARA OBTER INFORMAÇÕES DO USUÁRIO
  const getUserInfo = (userId) => {
    if (!userId) return { nome: 'Não definido', funcao: 'N/A' };
    const user = allUsers.find(u => u.id === userId || u.uid === userId);
    return user ? { nome: user.nome, funcao: user.funcao || user.papel || 'N/A' } : { nome: 'Usuário não encontrado', funcao: 'N/A' };
  };

  // 🔧 FUNÇÃO PARA ANALISAR TEMPO POR STATUS
  const analyzeStatusTiming = (ticket) => {
    const statusHistory = ticket.statusHistory || [];
    const statusTiming = [];
    
    if (statusHistory.length === 0) {
      // Se não há histórico, calcular baseado na data de criação
      const createdAt = ticket.createdAt?.toDate() || new Date();
      const now = new Date();
      const daysInCurrentStatus = Math.floor((now - createdAt) / (1000 * 60 * 60 * 24));
      
      statusTiming.push({
        status: ticket.status || 'aberto',
        startDate: createdAt,
        endDate: now,
        days: daysInCurrentStatus,
        isCurrent: true
      });
    } else {
      // Analisar histórico de status
      for (let i = 0; i < statusHistory.length; i++) {
        const currentStatus = statusHistory[i];
        const nextStatus = statusHistory[i + 1];
        
        const startDate = currentStatus.timestamp?.toDate() || new Date();
        const endDate = nextStatus ? nextStatus.timestamp?.toDate() : new Date();
        const days = Math.floor((endDate - startDate) / (1000 * 60 * 60 * 24));
        
        statusTiming.push({
          status: currentStatus.status,
          startDate,
          endDate,
          days: Math.max(days, 0),
          isCurrent: !nextStatus,
          changedBy: getUserInfo(currentStatus.changedBy)
        });
      }
    }
    
    return statusTiming;
  };

  // 🔧 FUNÇÃO PARA OBTER HISTÓRICO DE MENSAGENS
  const getTicketMessages = async (ticketId) => {
    try {
      // Assumindo que existe um método para buscar mensagens
      const messages = await ticketService.getTicketMessages(ticketId);
      return messages || [];
    } catch (error) {
      console.error('Erro ao buscar mensagens:', error);
      // Fallback: tentar obter do campo messages do ticket
      const ticket = tickets.find(t => t.id === ticketId);
      return ticket?.messages || ticket?.chat || [];
    }
  };

  // 🔧 FUNÇÃO PARA ANALISAR FLUXO DOS CHAMADOS
  const analyzeTicketFlow = (currentTickets) => {
    const openTickets = currentTickets.filter(t => !['concluido', 'arquivado', 'cancelado'].includes(t.status));
    const closedTickets = currentTickets.filter(t => ['concluido', 'arquivado'].includes(t.status));
    
    // Análise de chamados abertos - onde estão parados
    const openTicketsAnalysis = openTickets.map(ticket => {
      const createdBy = getUserInfo(ticket.criadoPor);
      const currentArea = ticket.area || 'Área não definida';
      const currentUser = ticket.atribuidoA ? getUserInfo(ticket.atribuidoA) : null;
      const statusTiming = analyzeStatusTiming(ticket);
      
      return {
        id: ticket.id,
        titulo: ticket.titulo,
        status: ticket.status,
        createdBy: createdBy,
        currentArea: currentArea,
        currentUser: currentUser,
        createdAt: ticket.createdAt,
        isExtra: ticket.isExtra || false,
        projeto: projects.find(p => p.id === ticket.projetoId)?.nome || 'Projeto não encontrado',
        statusTiming: statusTiming
      };
    });

    // Análise de chamados concluídos - quem executou
    const closedTicketsAnalysis = closedTickets.map(ticket => {
      const createdBy = getUserInfo(ticket.criadoPor);
      const executedBy = ticket.resolvidoPor ? getUserInfo(ticket.resolvidoPor) : 
                        ticket.atribuidoA ? getUserInfo(ticket.atribuidoA) : 
                        { nome: 'Não identificado', funcao: 'N/A' };
      const statusTiming = analyzeStatusTiming(ticket);
      
      return {
        id: ticket.id,
        titulo: ticket.titulo,
        status: ticket.status,
        createdBy: createdBy,
        executedBy: executedBy,
        createdAt: ticket.createdAt,
        resolvedAt: ticket.resolvidoEm || ticket.updatedAt,
        isExtra: ticket.isExtra || false,
        projeto: projects.find(p => p.id === ticket.projetoId)?.nome || 'Projeto não encontrado',
        statusTiming: statusTiming
      };
    });

    // Análise de gargalos por área
    const bottlenecksByArea = openTickets.reduce((acc, ticket) => {
      const area = ticket.area || 'Área não definida';
      if (!acc[area]) {
        acc[area] = { count: 0, tickets: [] };
      }
      acc[area].count++;
      acc[area].tickets.push({
        titulo: ticket.titulo,
        createdBy: getUserInfo(ticket.criadoPor).nome,
        daysOpen: ticket.createdAt ? Math.floor((new Date() - ticket.createdAt.toDate()) / (1000 * 60 * 60 * 24)) : 0
      });
      return acc;
    }, {});

    // 🔧 ANÁLISE DE PERFORMANCE POR USUÁRIO CORRIGIDA
    const performanceByUser = allUsers.map(user => {
      const userId = user.id || user.uid;
      
      // Chamados criados por este usuário
      const created = currentTickets.filter(t => t.criadoPor === userId).length;
      
      // Chamados atualmente atribuídos a este usuário (em aberto)
      const assigned = currentTickets.filter(t => 
        t.atribuidoA === userId && 
        !['concluido', 'arquivado', 'cancelado'].includes(t.status)
      ).length;
      
      // 🔧 CORREÇÃO: Chamados resolvidos por este usuário
      // Verificar múltiplos campos onde pode estar a informação de quem resolveu
      const resolved = currentTickets.filter(t => {
        const isResolved = ['concluido', 'arquivado'].includes(t.status);
        if (!isResolved) return false;
        
        // Verificar diferentes campos onde pode estar quem resolveu
        return (
          t.resolvidoPor === userId ||           // Campo específico de quem resolveu
          t.concluídoPor === userId ||           // Campo alternativo
          t.finalizadoPor === userId ||          // Outro campo possível
          (t.atribuidoA === userId && isResolved) || // Se estava atribuído e foi resolvido
          // Verificar no histórico de status se este usuário marcou como concluído
          (t.statusHistory && t.statusHistory.some(h => 
            h.changedBy === userId && 
            ['concluido', 'arquivado'].includes(h.status)
          ))
        );
      }).length;
      
      const total = created + assigned + resolved;
      
      return {
        id: userId,
        nome: user.nome,
        funcao: user.funcao || user.papel || 'N/A',
        created,
        assigned,
        resolved,
        total
      };
    }).filter(u => u.total > 0).sort((a, b) => b.total - a.total);

    // 🔧 DEBUG: Log para verificar contagem
    console.log('🔧 DEBUG Performance por Usuário:', performanceByUser);
    
    // Verificar alguns chamados resolvidos para debug
    const resolvedTickets = currentTickets.filter(t => ['concluido', 'arquivado'].includes(t.status));
    console.log('🔧 DEBUG Chamados Resolvidos:', resolvedTickets.map(t => ({
      titulo: t.titulo,
      status: t.status,
      resolvidoPor: t.resolvidoPor,
      concluídoPor: t.concluídoPor,
      atribuidoA: t.atribuidoA,
      statusHistory: t.statusHistory
    })));

    return {
      openTicketsAnalysis,
      closedTicketsAnalysis,
      bottlenecksByArea,
      performanceByUser
    };
  };

  const applyFilters = () => {
    let tempTickets = [...tickets];
    let tempProjects = [...projects];

    if (filters.eventId !== 'all') {
      const projectIdsInEvent = projects.filter(p => p.feira === filters.eventId).map(p => p.id);
      tempProjects = tempProjects.filter(p => p.feira === filters.eventId);
      tempTickets = tempTickets.filter(t => projectIdsInEvent.includes(t.projetoId));
    }
    
    if (filters.projectId !== 'all') {
      tempProjects = tempProjects.filter(p => p.id === filters.projectId);
      tempTickets = tempTickets.filter(t => t.projetoId === filters.projectId);
    }
    
    if (filters.dateRange.from) {
      const fromDate = new Date(filters.dateRange.from);
      tempTickets = tempTickets.filter(t => t.createdAt?.toDate() >= fromDate);
    }
    if (filters.dateRange.to) {
      const toDate = new Date(filters.dateRange.to);
      toDate.setHours(23, 59, 59, 999);
      tempTickets = tempTickets.filter(t => t.createdAt?.toDate() <= toDate);
    }

    if (filters.status !== 'all') {
      tempTickets = tempTickets.filter(t => t.status === filters.status);
    }

    if (filters.userId !== 'all') {
      tempTickets = tempTickets.filter(t => t.criadoPor === filters.userId || t.atribuidoA === filters.userId);
    }

    if (filters.extras !== 'all') {
        const isExtra = filters.extras === 'yes';
        tempTickets = tempTickets.filter(t => t.isExtra === isExtra);
    }
    
    setFilteredTickets(tempTickets);
    setFilteredProjects(tempProjects);
    calculateKpisAndCharts(tempTickets, tempProjects);
    
    // 🔧 NOVA ANÁLISE DE FLUXO
    const flowData = analyzeTicketFlow(tempTickets);
    setFlowAnalysis(flowData);

  // ====== EXPORTAÇÃO: helpers ======
  const fmtDate = (d) => {
    try {
      const dt = d?.toDate ? d.toDate() : d;
      if (!dt) return '';
      return new Date(dt).toLocaleString('pt-BR');
    } catch { return ''; }
  };

  const findUser = (id) => {
    if (!id) return null;
    return (allUsers || []).find(u => u.id === id || u.uid === id);
  };

  const getExecutedArea = (ticket) => {
    const isClosed = ['concluido', 'arquivado'].includes(ticket?.status);
    const resolvedById = ticket?.resolvidoPor || ticket?.concluídoPor || ticket?.finalizadoPor || (isClosed ? ticket?.atribuidoA : null);
    const user = findUser(resolvedById);
    return user?.area || null;
  };

  const getExecutedByName = (ticket) => {
    const isClosed = ['concluido', 'arquivado'].includes(ticket?.status);
    const resolvedById = ticket?.resolvidoPor || ticket?.concluídoPor || ticket?.finalizadoPor || (isClosed ? ticket?.atribuidoA : null);
    const user = findUser(resolvedById);
    return user?.nome || '';
  };

  const flattenTicketRows = (ticket) => {
    const project = (projects || []).find(p => p.id === ticket?.projetoId);
    const base = {
      id: ticket?.id || '',
      titulo: ticket?.titulo || '',
      descricao: (ticket?.descricao || '').trim(),
      status: ticket?.status || '',
      prioridade: ticket?.prioridade || '',
      area_origem: ticket?.areaDeOrigem || ticket?.areaInicial || '',
      area_atual: ticket?.area || '',
      area_executora: getExecutedArea(ticket) || '',
      criado_por: (findUser(ticket?.criadoPor)?.nome) || '',
      atribuido_a: (findUser(ticket?.atribuidoA)?.nome) || '',
      executado_por: getExecutedByName(ticket) || '',
      criado_em: fmtDate(ticket?.createdAt),
      atualizado_em: fmtDate(ticket?.updatedAt),
      resolvido_em: fmtDate(ticket?.resolvidoEm),
      is_extra: !!ticket?.isExtra,
      projeto_id: ticket?.projetoId || '',
      projeto_nome: project?.nome || '',
      evento: project?.feira || '',
      local: project?.local || '',
      metragem: project?.metragem || '',
      tipo: ticket?.tipo || '',
    };

    const itens = Array.isArray(ticket?.camposEspecificos) ? ticket.camposEspecificos : [];
    if (itens.length === 0) {
      return [base];
    }

    return itens.map((item, idx) => {
      const itemCols = {};
      Object.entries(item || {}).forEach(([k, v]) => {
        if (k === 'id') return;
        itemCols[`item_${idx + 1}_${k}`] = (v ?? '').toString();
      });
      return { ...base, ...itemCols, itens_count: itens.length };
    });
  };

  const buildExportRows = (ticketsList) => {
    const rows = [];
    (ticketsList || []).forEach(t => {
      flattenTicketRows(t).forEach(r => rows.push(r));
    });
    return rows;
  };

  const exportAsCSV = (rows, filename = 'relatorio.csv') => {
    if (!rows.length) {
      alert('Nenhum dado para exportar.');
      return;
    }
    const headers = Array.from(new Set(rows.flatMap(r => Object.keys(r))));
    const escape = (val) => {
      const s = (val ?? '').toString();
      if (/[;\n"]/.test(s)) {
        return `"${s.replace(/"/g, '""')}"`;
      }
      return s;
    };
    const csv = [
      headers.join(';'),
      ...rows.map(r => headers.map(h => escape(r[h])).join(';'))
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const exportAsXLSX = async (rows, filename = 'relatorio.xlsx') => {
    try {
      const XLSX = await import('xlsx');
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Relatorio');
      const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.warn('xlsx não encontrado; exportando CSV.', e);
      exportAsCSV(rows, filename.replace(/\.xlsx$/i, '.csv'));
    }
  };

  const filterTicketsForExport = (list) => {
    let arr = [...(list || [])];

    if (exportAreaOrigin !== 'all') {
      arr = arr.filter(t => (t?.areaDeOrigem || t?.areaInicial) === exportAreaOrigin);
    }

    if (exportAreaExecuted !== 'all') {
      arr = arr.filter(t => ['concluido','arquivado'].includes(t?.status) && getExecutedArea(t) === exportAreaExecuted);
    }

    if (exportTicketType !== 'all') {
      arr = arr.filter(t => (t?.tipo === exportTicketType));
    }

    return arr;
  };

  async function handleExport() {
    const base = filterTicketsForExport((filteredTickets && filteredTickets.length) ? filteredTickets : tickets);
    const rows = buildExportRows(base);

    const nameParts = [];
    if (exportAreaOrigin !== 'all') nameParts.push(`origem-${exportAreaOrigin}`);
    if (exportAreaExecuted !== 'all') nameParts.push(`exec-${exportAreaExecuted}`);
    if (exportTicketType !== 'all') nameParts.push(`tipo-${exportTicketType}`);
    const fname = `relatorio_${nameParts.join('_') || 'geral'}_${Date.now()}`;

    if (exportFormat === 'xlsx') {
      await exportAsXLSX(rows, `${fname}.xlsx`);
    } else {
      exportAsCSV(rows, `${fname}.csv`);
    }
  };

  };

  const calculateKpisAndCharts = (currentTickets, currentProjects) => {
    const completedTickets = currentTickets.filter(t => ['concluido', 'arquivado'].includes(t.status)).length;
    const openTickets = currentTickets.filter(t => !['concluido', 'arquivado', 'cancelado'].includes(t.status)).length;
    const extraTickets = currentTickets.filter(t => t.isExtra).length;
    
    setKpiStats({
      totalProjects: currentProjects.length,
      totalTickets: currentTickets.length,
      completedTickets: completedTickets,
      openTickets: openTickets,
      extraTickets: extraTickets,
      resolutionRate: currentTickets.length > 0 ? (completedTickets / currentTickets.length) * 100 : 0,
    });

    const ticketsByStatus = currentTickets.reduce((acc, ticket) => {
      const status = ticket.status || 'Indefinido';
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    }, {});
    
    const ticketsByArea = currentTickets.reduce((acc, ticket) => {
      const area = ticket.area || 'Indefinida';
      acc[area] = (acc[area] || 0) + 1;
      return acc;
    }, {});

    setChartData({
      ticketsByStatus: Object.entries(ticketsByStatus).map(([name, value]) => ({ name, value })),
      ticketsByArea: Object.entries(ticketsByArea).map(([name, value]) => ({ name, value })),
    });
  };

  const handleFilterChange = (type, value) => {
    setFilters(prev => ({ ...prev, [type]: value }));
  };

  const handleClearFilters = () => {
    setFilters({
      dateRange: { from: '', to: '' },
      userId: 'all', status: 'all', eventId: 'all', projectId: 'all', extras: 'all'
    });
    setSearchTerm('');
  };

  // 🔧 FUNÇÃO MELHORADA PARA GERAR RELATÓRIO COM TODAS AS FUNCIONALIDADES
  const generateGeneralReportMarkdown = async () => {
      let markdown = `# Relatório Completo com Análise de Fluxo\n\n`;
      markdown += `**Período:** ${filters.dateRange.from || 'Início'} a ${filters.dateRange.to || 'Fim'}\n`;
      markdown += `**Gerado em:** ${new Date().toLocaleString('pt-BR')}\n\n`;
      
      markdown += `**Filtros Aplicados:**\n`;
      if (filters.eventId !== 'all') markdown += `- Evento: ${filters.eventId}\n`;
      if (filters.projectId !== 'all') markdown += `- Projeto: ${projects.find(p=>p.id === filters.projectId)?.nome}\n`;
      if (filters.status !== 'all') markdown += `- Status: ${filters.status}\n`;
      if (filters.extras !== 'all') markdown += `- Apenas Chamados Extras: ${filters.extras === 'yes' ? 'Sim' : 'Não'}\n`;
      
      markdown += `\n---\n\n## 📊 Resumo Executivo\n\n`;
      markdown += `* **Total de Projetos:** ${kpiStats.totalProjects}\n`;
      markdown += `* **Total de Chamados:** ${kpiStats.totalTickets}\n`;
      markdown += `* **Chamados Concluídos:** ${kpiStats.completedTickets}\n`;
      markdown += `* **Chamados em Aberto:** ${kpiStats.openTickets}\n`;
      markdown += `* **Chamados Extras:** ${kpiStats.extraTickets}\n`;
      markdown += `* **Taxa de Resolução:** ${kpiStats.resolutionRate?.toFixed(1)}%\n`;

      // 🔧 SEÇÃO DE ANÁLISE DE FLUXO - CHAMADOS ABERTOS COM TEMPO POR STATUS
      if (flowAnalysis.openTicketsAnalysis?.length > 0) {
        markdown += `\n---\n\n## 🚨 Chamados em Aberto - Análise Detalhada\n\n`;
        
        for (const ticket of flowAnalysis.openTicketsAnalysis) {
          const daysOpen = ticket.createdAt ? Math.floor((new Date() - ticket.createdAt.toDate()) / (1000 * 60 * 60 * 24)) : 0;
          
          markdown += `### ${ticket.titulo} ${ticket.isExtra ? '(EXTRA)' : ''}\n\n`;
          markdown += `**Informações Gerais:**\n`;
          markdown += `- **Aberto por:** ${ticket.createdBy.nome} (${ticket.createdBy.funcao})\n`;
          markdown += `- **Parado na área:** ${ticket.currentArea}\n`;
          if (ticket.currentUser) {
            markdown += `- **Atribuído a:** ${ticket.currentUser.nome} (${ticket.currentUser.funcao})\n`;
          } else {
            markdown += `- **Atribuído a:** Nenhum usuário específico\n`;
          }
          markdown += `- **Status atual:** ${ticket.status}\n`;
          markdown += `- **Projeto:** ${ticket.projeto}\n`;
          markdown += `- **Total de dias em aberto:** ${daysOpen} dias\n\n`;

          // 🔧 NOVA FUNCIONALIDADE: Tempo por Status
          if (ticket.statusTiming && ticket.statusTiming.length > 0) {
            markdown += `**⏱️ Tempo em cada Status:**\n`;
            ticket.statusTiming.forEach(timing => {
              const statusLabel = timing.isCurrent ? `${timing.status} (ATUAL)` : timing.status;
              markdown += `- **${statusLabel}:** ${timing.days} dias`;
              if (timing.changedBy) {
                markdown += ` (alterado por ${timing.changedBy.nome})`;
              }
              markdown += `\n`;
            });
            markdown += `\n`;
          }

          // 🔧 NOVA FUNCIONALIDADE: Histórico de Mensagens
          try {
            const messages = await getTicketMessages(ticket.id);
            if (messages && messages.length > 0) {
              markdown += `**💬 Histórico de Mensagens:**\n`;
              messages.forEach(msg => {
                const msgDate = msg.timestamp?.toDate ? msg.timestamp.toDate().toLocaleString('pt-BR') : 'Data não disponível';
                const sender = getUserInfo(msg.senderId || msg.userId);
                markdown += `- **${msgDate}** - ${sender.nome}: ${msg.message || msg.texto}\n`;
              });
              markdown += `\n`;
            }
          } catch (error) {
            console.error('Erro ao buscar mensagens:', error);
          }

          markdown += `---\n\n`;
        }

        // Análise de gargalos por área
        if (Object.keys(flowAnalysis.bottlenecksByArea).length > 0) {
          markdown += `### 🎯 Gargalos por Área:\n\n`;
          Object.entries(flowAnalysis.bottlenecksByArea)
            .sort(([,a], [,b]) => b.count - a.count)
            .forEach(([area, data]) => {
              markdown += `**${area}:** ${data.count} chamados parados\n`;
              data.tickets.forEach(ticket => {
                markdown += `  - ${ticket.titulo} (${ticket.daysOpen} dias, aberto por ${ticket.createdBy})\n`;
              });
              markdown += `\n`;
            });
        }
      }

      // 🔧 SEÇÃO DE ANÁLISE DE FLUXO - CHAMADOS CONCLUÍDOS COM TEMPO POR STATUS
      if (flowAnalysis.closedTicketsAnalysis?.length > 0) {
        markdown += `\n---\n\n## ✅ Chamados Concluídos - Análise Detalhada\n\n`;
        
        for (const ticket of flowAnalysis.closedTicketsAnalysis) {
          const resolutionTime = ticket.createdAt && ticket.resolvedAt ? 
            Math.floor((ticket.resolvedAt.toDate() - ticket.createdAt.toDate()) / (1000 * 60 * 60 * 24)) : 'N/A';
          
          markdown += `### ${ticket.titulo} ${ticket.isExtra ? '(EXTRA)' : ''}\n\n`;
          markdown += `**Informações Gerais:**\n`;
          markdown += `- **Aberto por:** ${ticket.createdBy.nome} (${ticket.createdBy.funcao})\n`;
          markdown += `- **Executado por:** ${ticket.executedBy.nome} (${ticket.executedBy.funcao})\n`;
          markdown += `- **Status:** ${ticket.status}\n`;
          markdown += `- **Projeto:** ${ticket.projeto}\n`;
          if (resolutionTime !== 'N/A') {
            markdown += `- **Tempo total de resolução:** ${resolutionTime} dias\n`;
          }
          markdown += `\n`;

          // 🔧 NOVA FUNCIONALIDADE: Tempo por Status
          if (ticket.statusTiming && ticket.statusTiming.length > 0) {
            markdown += `**⏱️ Tempo em cada Status:**\n`;
            ticket.statusTiming.forEach(timing => {
              markdown += `- **${timing.status}:** ${timing.days} dias`;
              if (timing.changedBy) {
                markdown += ` (alterado por ${timing.changedBy.nome})`;
              }
              markdown += `\n`;
            });
            markdown += `\n`;
          }

          // 🔧 NOVA FUNCIONALIDADE: Histórico de Mensagens
          try {
            const messages = await getTicketMessages(ticket.id);
            if (messages && messages.length > 0) {
              markdown += `**💬 Histórico de Mensagens:**\n`;
              messages.forEach(msg => {
                const msgDate = msg.timestamp?.toDate ? msg.timestamp.toDate().toLocaleString('pt-BR') : 'Data não disponível';
                const sender = getUserInfo(msg.senderId || msg.userId);
                markdown += `- **${msgDate}** - ${sender.nome}: ${msg.message || msg.texto}\n`;
              });
              markdown += `\n`;
            }
          } catch (error) {
            console.error('Erro ao buscar mensagens:', error);
          }

          markdown += `---\n\n`;
        }
      }

      // 🔧 SEÇÃO DE PERFORMANCE POR USUÁRIO
      if (flowAnalysis.performanceByUser?.length > 0) {
        markdown += `\n---\n\n## 👥 Performance por Usuário\n\n`;
        markdown += `| Usuário | Função | Criados | Atribuídos | Resolvidos | Total |\n`;
        markdown += `|---------|--------|---------|------------|------------|-------|\n`;
        
        flowAnalysis.performanceByUser.forEach(user => {
          markdown += `| ${user.nome} | ${user.funcao} | ${user.created} | ${user.assigned} | ${user.resolved} | ${user.total} |\n`;
        });
      }

      // Detalhamento de chamados por projeto (mantido da versão original)
      markdown += `\n---\n\n## 📋 Detalhamento por Projeto\n\n`;
      const ticketsByProject = filteredTickets.reduce((acc, ticket) => {
          const projectId = ticket.projetoId || 'sem-projeto';
          if (!acc[projectId]) acc[projectId] = [];
          acc[projectId].push(ticket);
          return acc;
      }, {});

      for (const projectId in ticketsByProject) {
          const projectName = projects.find(p => p.id === projectId)?.nome || 'Chamados Sem Projeto Associado';
          markdown += `### Projeto: ${projectName}\n\n`;
          ticketsByProject[projectId].forEach(ticket => {
              const createdBy = getUserInfo(ticket.criadoPor);
              markdown += `- **${ticket.titulo}** ${ticket.isExtra ? '(EXTRA)' : ''} (Status: ${ticket.status})\n`;
              markdown += `  - Aberto por: ${createdBy.nome} (${createdBy.funcao})\n`;
              if (ticket.descricao && ticket.descricao.trim()) {
                  markdown += `  - Descrição: ${ticket.descricao.trim()}\n`;
              }
              markdown += `\n`;
          });
          markdown += `\n`;
      }
      
      return markdown;
  };

  const handleGeneralReportAction = async (isPreview) => {
    setGenerating(true);
    try {
      const markdown = await generateGeneralReportMarkdown();
      if (isPreview) {
        setReportPreview(markdown);
      } else {
        const fileName = `relatorio_completo_${Date.now()}`;
        const response = await fetch('https://kkh7ikcgpp6y.manus.space/api/generate-pdf', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ markdown, fileName })
        });
        if (!response.ok) throw new Error('Erro na conversão para PDF');
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${fileName}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    } catch (e) {
      alert('Erro ao gerar relatório.');
    } finally {
      setGenerating(false);
    }
  };

  const handleIndividualReportAction = async (type, id, isPreview) => {
    if (!id) return;
    setGenerating(true);
    try {
      const reportData = type === 'project'
        ? await reportService.generateProjectReport(id)
        : await reportService.generateTicketReport(id);
      
      const markdown = reportService.generateMarkdownReport(reportData, type);
      if (isPreview) {
          setReportPreview(markdown);
      } else {
          const fileName = `relatorio_${type}_${id}_${Date.now()}`;
          const response = await fetch('https://kkh7ikcgpp6y.manus.space/api/generate-pdf', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ markdown, fileName })
          });
          if (!response.ok) throw new Error('Erro na conversão para PDF');
          const blob = await response.blob();
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `${fileName}.pdf`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
      }
    } catch (error) {
      console.error('Erro ao gerar relatório individual:', error);
      alert('Erro ao gerar relatório individual.');
    } finally {
      setGenerating(false);
    }
  };
  
  const displayedProjects = useMemo(() => 
    filteredProjects.filter(p => p.nome.toLowerCase().includes(searchTerm.toLowerCase())),
    [filteredProjects, searchTerm]
  );
  const displayedTickets = useMemo(() => 
    filteredTickets.filter(t => t.titulo.toLowerCase().includes(searchTerm.toLowerCase())),
    [filteredTickets, searchTerm]
  );

  if (loading) { 
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    ); 
  }

  const CHART_COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#AF19FF', '#FF1943'];

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
           <div className="flex items-center">
              <Button variant="ghost" onClick={() => navigate('/dashboard')} className="mr-4">
                <ArrowLeft className="h-4 w-4 mr-2" /> Voltar
              </Button>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">📊 Relatórios Completos com Análise Avançada</h1>
                <p className="text-sm text-gray-600">Análise completa de fluxo, tempo por status e histórico de mensagens</p>
              </div>
            </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Filtros */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center"><Filter className="h-5 w-5 mr-2" /> Filtros Avançados</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Período (De / Até)</Label>
              <div className="flex items-center space-x-2">
                <Input type="date" value={filters.dateRange.from} onChange={e => handleFilterChange('dateRange', {...filters.dateRange, from: e.target.value})} />
                <Input type="date" value={filters.dateRange.to} onChange={e => handleFilterChange('dateRange', {...filters.dateRange, to: e.target.value})} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Evento / Feira</Label>
              <Select value={filters.eventId} onValueChange={value => handleFilterChange('eventId', value)}>
                <SelectTrigger><SelectValue placeholder="Todos os Eventos" /></SelectTrigger>
                <SelectContent><SelectItem value="all">Todos os Eventos</SelectItem>{events.map(event => <SelectItem key={event} value={event}>{event}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Projeto</Label>
              <Select value={filters.projectId} onValueChange={value => handleFilterChange('projectId', value)} disabled={filters.eventId !== 'all'}>
                <SelectTrigger><SelectValue placeholder="Todos os Projetos" /></SelectTrigger>
                <SelectContent><SelectItem value="all">Todos os Projetos</SelectItem>{projects.map(p => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Usuário</Label>
              <Select value={filters.userId} onValueChange={value => handleFilterChange('userId', value)}>
                <SelectTrigger><SelectValue placeholder="Todos os Usuários" /></SelectTrigger>
                <SelectContent><SelectItem value="all">Todos os Usuários</SelectItem>{allUsers.map(user => <SelectItem key={user.id} value={user.id}>{user.nome}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Status do Chamado</Label>
              <Select value={filters.status} onValueChange={value => handleFilterChange('status', value)}>
                <SelectTrigger><SelectValue placeholder="Todos os Status" /></SelectTrigger>
                <SelectContent><SelectItem value="all">Todos os Status</SelectItem><SelectItem value="aberto">Aberto</SelectItem><SelectItem value="em_tratativa">Em Tratativa</SelectItem><SelectItem value="concluido">Concluído</SelectItem><SelectItem value="arquivado">Arquivado</SelectItem><SelectItem value="cancelado">Cancelado</SelectItem></SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Chamados Extras</Label>
              <Select value={filters.extras} onValueChange={value => handleFilterChange('extras', value)}>
                <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
                <SelectContent><SelectItem value="all">Todos</SelectItem><SelectItem value="yes">Apenas Extras</SelectItem><SelectItem value="no">Apenas Normais</SelectItem></SelectContent>
              </Select>
            </div>
            <div className="col-span-full flex justify-end">
                <Button onClick={handleClearFilters} variant="ghost">Limpar Filtros</Button>
            </div>
          </CardContent>
        </Card>

        {/* ===== Exportação Excel/CSV por Área & Tipo ===== */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Download className="h-5 w-5 mr-2" /> Exportação Excel/CSV (campos completos)
            </CardTitle>
            <CardDescription>
              Gere planilhas com todos os campos do chamado (inclusive Financeiro/Compras/Locação).
              Você pode filtrar por área de origem (quem abriu), área executora (quem resolveu) e por tipo de chamado.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <div className="space-y-2">
              <Label>Área que abriu (origem)</Label>
              <Select value={exportAreaOrigin} onValueChange={setExportAreaOrigin}>
                <SelectTrigger><SelectValue placeholder="Todas" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {AREA_LIST.map(a => <SelectItem key={`o-${a}`} value={a}>{a}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Área que executou (concluiu)</Label>
              <Select value={exportAreaExecuted} onValueChange={setExportAreaExecuted}>
                <SelectTrigger><SelectValue placeholder="Todas" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {AREA_LIST.map(a => <SelectItem key={`e-${a}`} value={a}>{a}</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="text-xs text-gray-500">Aplica-se a chamados concluídos/arquivados.</p>
            </div>

            <div className="space-y-2">
              <Label>Tipo de chamado</Label>
              <Select value={exportTicketType} onValueChange={setExportTicketType}>
                <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {TIPO_LIST.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="text-xs text-gray-500">Ex.: “Pagamento frete”.</p>
            </div>

            <div className="space-y-2">
              <Label>Formato</Label>
              <Select value={exportFormat} onValueChange={setExportFormat}>
                <SelectTrigger><SelectValue placeholder="Escolha o formato" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="xlsx">Excel (.xlsx)</SelectItem>
                  <SelectItem value="csv">CSV (.csv)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-end">
              <Button className="w-full" onClick={handleExport}>
                <Download className="h-4 w-4 mr-2" /> Exportar
              </Button>
            </div>

            <div className="md:col-span-5">
              <p className="text-xs text-gray-500">
                Dica: combine “Área executora = Financeiro” com “Tipo = Pagamento frete” para uma planilha com
                todas as colunas específicas (motorista, placa, datas, valores, itens de compra/locação etc.).
              </p>
            </div>
          </CardContent>
        </Card>



        {/* KPIs Melhorados */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center"><BarChart3 className="h-5 w-5 mr-2" /> Dashboard de Relatórios</CardTitle>
            <CardDescription>Resumo visual dos dados filtrados com análise de fluxo.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-center">
              <div className="p-4 bg-gray-100 rounded-lg">
                <p className="text-sm text-gray-600">Projetos</p>
                <p className="text-3xl font-bold">{kpiStats.totalProjects}</p>
              </div>
              <div className="p-4 bg-gray-100 rounded-lg">
                <p className="text-sm text-gray-600">Total Chamados</p>
                <p className="text-3xl font-bold">{kpiStats.totalTickets}</p>
              </div>
              <div className="p-4 bg-red-100 rounded-lg">
                <p className="text-sm text-red-600">Em Aberto</p>
                <p className="text-3xl font-bold text-red-600">{kpiStats.openTickets}</p>
              </div>
              <div className="p-4 bg-green-100 rounded-lg">
                <p className="text-sm text-green-600">Concluídos</p>
                <p className="text-3xl font-bold text-green-600">{kpiStats.completedTickets}</p>
              </div>
              <div className="p-4 bg-blue-100 rounded-lg">
                <p className="text-sm text-blue-600">Taxa Resolução</p>
                <p className="text-3xl font-bold text-blue-600">{kpiStats.resolutionRate?.toFixed(1)}%</p>
              </div>
            </div>
            
            {/* Gráficos */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div className="h-[300px]">
                <h3 className="text-center font-semibold mb-2">Chamados por Status</h3>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData.ticketsByStatus}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" fontSize={12} />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="value" fill="#8884d8" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="h-[300px]">
                <h3 className="text-center font-semibold mb-2">Chamados por Área</h3>
                <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                        <Pie data={chartData.ticketsByArea} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
                            {chartData.ticketsByArea?.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                            ))}
                        </Pie>
                        <Tooltip />
                        <RechartsLegend />
                    </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 🔧 SEÇÃO: ANÁLISE DE FLUXO COM TEMPO POR STATUS */}
        {flowAnalysis.openTicketsAnalysis?.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Timer className="h-5 w-5 mr-2 text-red-500" /> 
                Análise de Tempo por Status - Chamados Parados
              </CardTitle>
              <CardDescription>
                Tempo detalhado que cada chamado ficou em cada status
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {flowAnalysis.openTicketsAnalysis.slice(0, 5).map(ticket => {
                  const daysOpen = ticket.createdAt ? Math.floor((new Date() - ticket.createdAt.toDate()) / (1000 * 60 * 60 * 24)) : 0;
                  return (
                    <div key={ticket.id} className="border rounded-lg p-4 bg-red-50">
                      <div className="flex justify-between items-start mb-3">
                        <h4 className="font-semibold text-lg">{ticket.titulo}</h4>
                        <div className="flex gap-2">
                          {ticket.isExtra && <Badge variant="secondary">EXTRA</Badge>}
                          <Badge variant="destructive">{daysOpen} dias total</Badge>
                        </div>
                      </div>
                      
                      {/* Tempo por Status */}
                      {ticket.statusTiming && ticket.statusTiming.length > 0 && (
                        <div className="mb-3">
                          <h5 className="font-medium text-sm mb-2 flex items-center">
                            <Clock className="h-4 w-4 mr-1" />
                            Tempo em cada Status:
                          </h5>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                            {ticket.statusTiming.map((timing, index) => (
                              <div key={index} className={`p-2 rounded text-sm ${timing.isCurrent ? 'bg-red-200' : 'bg-gray-200'}`}>
                                <p className="font-medium">{timing.status}</p>
                                <p className="text-xs">{timing.days} dias</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                        <div>
                          <p className="font-medium text-blue-600">Aberto por:</p>
                          <p>{ticket.createdBy.nome}</p>
                          <p className="text-gray-500">({ticket.createdBy.funcao})</p>
                        </div>
                        <div>
                          <p className="font-medium text-red-600">Parado na área:</p>
                          <p>{ticket.currentArea}</p>
                          <Badge variant="outline">{ticket.status}</Badge>
                        </div>
                        <div>
                          <p className="font-medium text-orange-600">Atribuído a:</p>
                          {ticket.currentUser ? (
                            <>
                              <p>{ticket.currentUser.nome}</p>
                              <p className="text-gray-500">({ticket.currentUser.funcao})</p>
                            </>
                          ) : (
                            <p className="text-gray-500">Nenhum usuário específico</p>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
                {flowAnalysis.openTicketsAnalysis.length > 5 && (
                  <p className="text-center text-gray-500 text-sm">
                    E mais {flowAnalysis.openTicketsAnalysis.length - 5} chamados... (veja o relatório completo)
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* 🔧 SEÇÃO: PERFORMANCE POR USUÁRIO CORRIGIDA */}
        {flowAnalysis.performanceByUser?.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <TrendingUp className="h-5 w-5 mr-2 text-green-500" /> 
                Performance por Usuário
              </CardTitle>
              <CardDescription>
                Análise de produtividade e envolvimento nos chamados (contagem corrigida)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-2">Usuário</th>
                      <th className="text-left p-2">Função</th>
                      <th className="text-center p-2">Criados</th>
                      <th className="text-center p-2">Atribuídos</th>
                      <th className="text-center p-2">Resolvidos</th>
                      <th className="text-center p-2">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {flowAnalysis.performanceByUser.slice(0, 10).map((user, index) => (
                      <tr key={index} className="border-b hover:bg-gray-50">
                        <td className="p-2 font-medium">{user.nome}</td>
                        <td className="p-2">
                          <Badge variant="outline">{user.funcao}</Badge>
                        </td>
                        <td className="p-2 text-center">{user.created}</td>
                        <td className="p-2 text-center">
                          {user.assigned > 0 ? (
                            <Badge variant="destructive">{user.assigned}</Badge>
                          ) : (
                            <span className="text-gray-400">0</span>
                          )}
                        </td>
                        <td className="p-2 text-center">
                          {user.resolved > 0 ? (
                            <Badge variant="default" className="bg-green-600">{user.resolved}</Badge>
                          ) : (
                            <span className="text-gray-400">0</span>
                          )}
                        </td>
                        <td className="p-2 text-center font-bold">{user.total}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-4 text-sm text-gray-600">
                <p><strong>Legenda:</strong></p>
                <ul className="list-disc list-inside space-y-1">
                  <li><strong>Criados:</strong> Chamados abertos por este usuário</li>
                  <li><strong>Atribuídos:</strong> Chamados atualmente sob responsabilidade deste usuário (em aberto)</li>
                  <li><strong>Resolvidos:</strong> Chamados concluídos/arquivados por este usuário</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Geração de Relatórios */}
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center">
                  <Download className="h-5 w-5 mr-2" /> 
                  Geração de Relatórios Completos
                </CardTitle>
                <CardDescription>
                  Relatórios agora incluem: análise de fluxo, tempo por status, histórico de mensagens e performance detalhada
                </CardDescription>
            </CardHeader>
            <CardContent>
                <Tabs defaultValue="geral">
                    <TabsList className="grid w-full grid-cols-3">
                        <TabsTrigger value="geral">
                          <MessageSquare className="h-4 w-4 mr-2" />
                          Completo
                        </TabsTrigger>
                        <TabsTrigger value="projeto">Por Projeto</TabsTrigger>
                        <TabsTrigger value="chamado">Por Chamado</TabsTrigger>
                    </TabsList>
                    <TabsContent value="geral" className="pt-4">
                        <div className="space-y-4">
                          <p className="text-sm text-gray-600">
                            Gera um relatório completo com:
                          </p>
                          <ul className="text-sm text-gray-600 list-disc list-inside space-y-1">
                            <li>⏱️ Tempo detalhado em cada status</li>
                            <li>💬 Histórico completo de mensagens</li>
                            <li>🚨 Análise de gargalos e performance</li>
                            <li>📊 Estatísticas e métricas avançadas</li>
                          </ul>
                          <div className="flex space-x-2">
                            <Button onClick={() => handleGeneralReportAction(true)} disabled={generating} variant="outline">
                              <Eye className="h-4 w-4 mr-2" />Preview Completo
                            </Button>
                            <Button onClick={() => handleGeneralReportAction(false)} disabled={generating}>
                              {generating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
                              Gerar PDF Completo
                            </Button>
                          </div>
                        </div>
                    </TabsContent>
                    <TabsContent value="projeto" className="pt-4 space-y-2">
                        <Label>Selecione um Projeto</Label>
                        <Select onValueChange={(id) => handleIndividualReportAction('project', id, true)}>
                          <SelectTrigger><SelectValue placeholder="Selecione um projeto para preview..." /></SelectTrigger>
                          <SelectContent>
                            {displayedProjects.map(p => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
                          </SelectContent>
                        </Select>
                    </TabsContent>
                    <TabsContent value="chamado" className="pt-4 space-y-2">
                        <Label>Selecione um Chamado</Label>
                        <Select onValueChange={(id) => handleIndividualReportAction('ticket', id, true)}>
                          <SelectTrigger><SelectValue placeholder="Selecione um chamado para preview..." /></SelectTrigger>
                          <SelectContent>
                            {displayedTickets.map(t => <SelectItem key={t.id} value={t.id}>{t.titulo}</SelectItem>)}
                          </SelectContent>
                        </Select>
                    </TabsContent>
                </Tabs>
            </CardContent>
        </Card>

        {/* 🔧 PREVIEW MELHORADO COM BOTÃO DE COPIAR */}
        {reportPreview && (
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <CardTitle className="flex items-center">
                  <FileText className="h-5 w-5 mr-2" />
                  Preview do Relatório Completo
                </CardTitle>
                <div className="flex gap-2">
                  <Button 
                    onClick={handleCopyPreview} 
                    variant="outline" 
                    size="sm"
                    className={copySuccess ? 'bg-green-100 text-green-700' : ''}
                  >
                    <Copy className="h-4 w-4 mr-2" />
                    {copySuccess ? 'Copiado!' : 'Copiar Tudo'}
                  </Button>
                  <Button onClick={() => setReportPreview('')} variant="ghost" size="sm">
                    <XIcon className="h-4 w-4 mr-2" /> Fechar
                  </Button>
                </div>
              </div>
              <CardDescription>
                Conteúdo completo do relatório com análise de fluxo, tempo por status e histórico de mensagens
              </CardDescription>
            </CardHeader>
            <CardContent className="bg-gray-50 p-4 rounded-lg max-h-[500px] overflow-y-auto">
              <pre className="whitespace-pre-wrap text-sm font-mono">{reportPreview}</pre>
            </CardContent>
          </Card>
        )}
        
        {/* Listas de Projetos e Chamados */}
        <div>
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
              <Input 
                placeholder="Pesquisar nas listas abaixo..." 
                className="pl-10" 
                value={searchTerm} 
                onChange={e => setSearchTerm(e.target.value)} 
              />
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div>
                  <h3 className="font-semibold mb-2 flex items-center">
                    <Building className="h-4 w-4 mr-2" />
                    Projetos Filtrados ({displayedProjects.length})
                  </h3>
                  <div className="space-y-3 max-h-96 overflow-y-auto pr-2">
                    {displayedProjects.map(project => (
                      <div key={project.id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50">
                        <div>
                          <p className="font-medium">{project.nome}</p>
                          <p className="text-sm text-gray-600">{project.feira}</p>
                        </div>
                        <Button size="sm" variant="outline" onClick={() => handleIndividualReportAction('project', project.id, false)}>
                          <Download className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <h3 className="font-semibold mb-2 flex items-center">
                    <FileText className="h-4 w-4 mr-2" />
                    Chamados Filtrados ({displayedTickets.length})
                  </h3>
                  <div className="space-y-3 max-h-96 overflow-y-auto pr-2">
                    {displayedTickets.map(ticket => {
                      const createdBy = getUserInfo(ticket.criadoPor);
                      const daysOpen = ticket.createdAt ? Math.floor((new Date() - ticket.createdAt.toDate()) / (1000 * 60 * 60 * 24)) : 0;
                      return (
                        <div key={ticket.id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50">
                          <div>
                            <p className="font-medium">{ticket.titulo}</p>
                            <div className="flex items-center gap-2 text-sm text-gray-600">
                              <Badge variant="outline">{ticket.status}</Badge>
                              <span>por {createdBy.nome}</span>
                              {ticket.isExtra && <Badge variant="secondary">EXTRA</Badge>}
                              <Badge variant="ghost" className="text-xs">{daysOpen}d</Badge>
                            </div>
                          </div>
                          <Button size="sm" variant="outline" onClick={() => handleIndividualReportAction('ticket', ticket.id, false)}>
                            <Download className="h-4 w-4" />
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                </div>
            </div>
        </div>
      </main>
    </div>
  );
};

export default ReportsPage;

