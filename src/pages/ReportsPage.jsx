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
  AlertTriangle, CheckCircle, Users, Target, TrendingUp
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

  // 🔧 FUNÇÃO PARA OBTER INFORMAÇÕES DO USUÁRIO
  const getUserInfo = (userId) => {
    if (!userId) return { nome: 'Não definido', funcao: 'N/A' };
    const user = allUsers.find(u => u.id === userId || u.uid === userId);
    return user ? { nome: user.nome, funcao: user.funcao || user.papel || 'N/A' } : { nome: 'Usuário não encontrado', funcao: 'N/A' };
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
      
      return {
        id: ticket.id,
        titulo: ticket.titulo,
        status: ticket.status,
        createdBy: createdBy,
        currentArea: currentArea,
        currentUser: currentUser,
        createdAt: ticket.createdAt,
        isExtra: ticket.isExtra || false,
        projeto: projects.find(p => p.id === ticket.projetoId)?.nome || 'Projeto não encontrado'
      };
    });

    // Análise de chamados concluídos - quem executou
    const closedTicketsAnalysis = closedTickets.map(ticket => {
      const createdBy = getUserInfo(ticket.criadoPor);
      const executedBy = ticket.resolvidoPor ? getUserInfo(ticket.resolvidoPor) : 
                        ticket.atribuidoA ? getUserInfo(ticket.atribuidoA) : 
                        { nome: 'Não identificado', funcao: 'N/A' };
      
      return {
        id: ticket.id,
        titulo: ticket.titulo,
        status: ticket.status,
        createdBy: createdBy,
        executedBy: executedBy,
        createdAt: ticket.createdAt,
        resolvedAt: ticket.resolvidoEm || ticket.updatedAt,
        isExtra: ticket.isExtra || false,
        projeto: projects.find(p => p.id === ticket.projetoId)?.nome || 'Projeto não encontrado'
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

    // Análise de performance por usuário
    const performanceByUser = allUsers.map(user => {
      const userTickets = currentTickets.filter(t => 
        t.criadoPor === user.id || 
        t.atribuidoA === user.id || 
        t.resolvidoPor === user.id
      );
      
      const created = userTickets.filter(t => t.criadoPor === user.id).length;
      const assigned = userTickets.filter(t => t.atribuidoA === user.id && !['concluido', 'arquivado', 'cancelado'].includes(t.status)).length;
      const resolved = userTickets.filter(t => t.resolvidoPor === user.id).length;
      
      return {
        nome: user.nome,
        funcao: user.funcao || user.papel || 'N/A',
        created,
        assigned,
        resolved,
        total: created + assigned + resolved
      };
    }).filter(u => u.total > 0).sort((a, b) => b.total - a.total);

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

  // 🔧 FUNÇÃO MELHORADA PARA GERAR RELATÓRIO COM FLUXO
  const generateGeneralReportMarkdown = () => {
      let markdown = `# Relatório Geral com Análise de Fluxo\n\n`;
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

      // 🔧 SEÇÃO DE ANÁLISE DE FLUXO - CHAMADOS ABERTOS
      if (flowAnalysis.openTicketsAnalysis?.length > 0) {
        markdown += `\n---\n\n## 🚨 Chamados em Aberto - Análise de Gargalos\n\n`;
        markdown += `### Onde estão parados os chamados:\n\n`;
        
        flowAnalysis.openTicketsAnalysis.forEach(ticket => {
          const daysOpen = ticket.createdAt ? Math.floor((new Date() - ticket.createdAt.toDate()) / (1000 * 60 * 60 * 24)) : 0;
          markdown += `**${ticket.titulo}** ${ticket.isExtra ? '(EXTRA)' : ''}\n`;
          markdown += `- **Aberto por:** ${ticket.createdBy.nome} (${ticket.createdBy.funcao})\n`;
          markdown += `- **Parado na área:** ${ticket.currentArea}\n`;
          if (ticket.currentUser) {
            markdown += `- **Atribuído a:** ${ticket.currentUser.nome} (${ticket.currentUser.funcao})\n`;
          } else {
            markdown += `- **Atribuído a:** Nenhum usuário específico\n`;
          }
          markdown += `- **Status:** ${ticket.status}\n`;
          markdown += `- **Projeto:** ${ticket.projeto}\n`;
          markdown += `- **Dias em aberto:** ${daysOpen} dias\n`;
          markdown += `\n`;
        });

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

      // 🔧 SEÇÃO DE ANÁLISE DE FLUXO - CHAMADOS CONCLUÍDOS
      if (flowAnalysis.closedTicketsAnalysis?.length > 0) {
        markdown += `\n---\n\n## ✅ Chamados Concluídos - Quem Executou\n\n`;
        
        flowAnalysis.closedTicketsAnalysis.forEach(ticket => {
          const resolutionTime = ticket.createdAt && ticket.resolvedAt ? 
            Math.floor((ticket.resolvedAt.toDate() - ticket.createdAt.toDate()) / (1000 * 60 * 60 * 24)) : 'N/A';
          
          markdown += `**${ticket.titulo}** ${ticket.isExtra ? '(EXTRA)' : ''}\n`;
          markdown += `- **Aberto por:** ${ticket.createdBy.nome} (${ticket.createdBy.funcao})\n`;
          markdown += `- **Executado por:** ${ticket.executedBy.nome} (${ticket.executedBy.funcao})\n`;
          markdown += `- **Status:** ${ticket.status}\n`;
          markdown += `- **Projeto:** ${ticket.projeto}\n`;
          if (resolutionTime !== 'N/A') {
            markdown += `- **Tempo de resolução:** ${resolutionTime} dias\n`;
          }
          markdown += `\n`;
        });
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
      const markdown = generateGeneralReportMarkdown();
      if (isPreview) {
        setReportPreview(markdown);
      } else {
        const fileName = `relatorio_fluxo_${Date.now()}`;
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
                <h1 className="text-2xl font-bold text-gray-900">📊 Relatórios e Análise de Fluxo</h1>
                <p className="text-sm text-gray-600">Explore os dados e identifique gargalos na operação</p>
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

        {/* 🔧 NOVA SEÇÃO: ANÁLISE DE FLUXO */}
        {flowAnalysis.openTicketsAnalysis?.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <AlertTriangle className="h-5 w-5 mr-2 text-red-500" /> 
                Gargalos Identificados - Chamados Parados
              </CardTitle>
              <CardDescription>
                Chamados em aberto e onde estão parados no fluxo
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {flowAnalysis.openTicketsAnalysis.map(ticket => {
                  const daysOpen = ticket.createdAt ? Math.floor((new Date() - ticket.createdAt.toDate()) / (1000 * 60 * 60 * 24)) : 0;
                  return (
                    <div key={ticket.id} className="border rounded-lg p-4 bg-red-50">
                      <div className="flex justify-between items-start mb-2">
                        <h4 className="font-semibold text-lg">{ticket.titulo}</h4>
                        <div className="flex gap-2">
                          {ticket.isExtra && <Badge variant="secondary">EXTRA</Badge>}
                          <Badge variant="destructive">{daysOpen} dias</Badge>
                        </div>
                      </div>
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
                      <p className="text-sm text-gray-600 mt-2">Projeto: {ticket.projeto}</p>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* 🔧 NOVA SEÇÃO: PERFORMANCE POR USUÁRIO */}
        {flowAnalysis.performanceByUser?.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <TrendingUp className="h-5 w-5 mr-2 text-green-500" /> 
                Performance por Usuário
              </CardTitle>
              <CardDescription>
                Análise de produtividade e envolvimento nos chamados
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
                    {flowAnalysis.performanceByUser.map((user, index) => (
                      <tr key={index} className="border-b hover:bg-gray-50">
                        <td className="p-2 font-medium">{user.nome}</td>
                        <td className="p-2">
                          <Badge variant="outline">{user.funcao}</Badge>
                        </td>
                        <td className="p-2 text-center">{user.created}</td>
                        <td className="p-2 text-center">
                          {user.assigned > 0 && (
                            <Badge variant="destructive">{user.assigned}</Badge>
                          )}
                        </td>
                        <td className="p-2 text-center">
                          {user.resolved > 0 && (
                            <Badge variant="default">{user.resolved}</Badge>
                          )}
                        </td>
                        <td className="p-2 text-center font-bold">{user.total}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Geração de Relatórios */}
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center"><Download className="h-5 w-5 mr-2" /> Geração de Relatórios com Análise de Fluxo</CardTitle>
                <CardDescription>
                  Relatórios agora incluem análise detalhada de quem abriu, onde está parado e quem executou cada chamado
                </CardDescription>
            </CardHeader>
            <CardContent>
                <Tabs defaultValue="geral">
                    <TabsList className="grid w-full grid-cols-3">
                        <TabsTrigger value="geral">Geral com Fluxo</TabsTrigger>
                        <TabsTrigger value="projeto">Por Projeto</TabsTrigger>
                        <TabsTrigger value="chamado">Por Chamado</TabsTrigger>
                    </TabsList>
                    <TabsContent value="geral" className="pt-4">
                        <p className="text-sm text-gray-600 mb-2">
                          Gera um relatório consolidado com análise de fluxo, gargalos e performance por usuário.
                        </p>
                        <div className="flex space-x-2">
                          <Button onClick={() => handleGeneralReportAction(true)} disabled={generating} variant="outline">
                            <Eye className="h-4 w-4 mr-2" />Preview
                          </Button>
                          <Button onClick={() => handleGeneralReportAction(false)} disabled={generating}>
                            {generating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
                            Gerar PDF
                          </Button>
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

        {/* Preview do Relatório */}
        {reportPreview && (
          <Card>
            <CardHeader>
              <CardTitle>Preview do Relatório</CardTitle>
              <div className="flex justify-end">
                <Button onClick={() => setReportPreview('')} variant="ghost" size="sm">
                  <XIcon className="h-4 w-4 mr-2" /> Fechar
                </Button>
              </div>
            </CardHeader>
            <CardContent className="bg-gray-50 p-4 rounded-lg max-h-[500px] overflow-y-auto">
              <pre className="whitespace-pre-wrap text-sm">{reportPreview}</pre>
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
                  <h3 className="font-semibold mb-2">Projetos Filtrados ({displayedProjects.length})</h3>
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
                  <h3 className="font-semibold mb-2">Chamados Filtrados ({displayedTickets.length})</h3>
                  <div className="space-y-3 max-h-96 overflow-y-auto pr-2">
                    {displayedTickets.map(ticket => {
                      const createdBy = getUserInfo(ticket.criadoPor);
                      return (
                        <div key={ticket.id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50">
                          <div>
                            <p className="font-medium">{ticket.titulo}</p>
                            <div className="flex items-center gap-2 text-sm text-gray-600">
                              <Badge variant="outline">{ticket.status}</Badge>
                              <span>por {createdBy.nome}</span>
                              {ticket.isExtra && <Badge variant="secondary">EXTRA</Badge>}
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

