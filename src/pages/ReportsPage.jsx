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
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  ArrowLeft, Download, FileText, BarChart3, Calendar, AlertCircle, Loader2, Eye,
  Filter, Users, PieChart as PieChartIcon, Search, X as XIcon
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell, Legend as RechartsLegend } from 'recharts';


const ReportsPage = () => {
  const { userProfile } = useAuth();
  const navigate = useNavigate();
  
  // Dados brutos
  const [projects, setProjects] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [allUsers, setAllUsers] = useState([]);

  // Estados de UI e Geração
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [reportPreview, setReportPreview] = useState('');
  
  // ✅ NOVOS ESTADOS PARA FILTROS E DADOS FILTRADOS
  const [filters, setFilters] = useState({
    dateRange: { from: '', to: '' },
    userId: 'all',
    status: 'all',
  });
  const [searchTerm, setSearchTerm] = useState('');
  const [filteredProjects, setFilteredProjects] = useState([]);
  const [filteredTickets, setFilteredTickets] = useState([]);
  const [kpiStats, setKpiStats] = useState({});
  const [chartData, setChartData] = useState({});

  useEffect(() => {
    loadData();
  }, []);

  // ✅ NOVO useEffect PARA APLICAR FILTROS QUANDO OS DADOS OU FILTROS MUDAM
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
      setProjects(projectsData);
      setTickets(ticketsData);
      setAllUsers(usersData);
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
    } finally {
      setLoading(false);
    }
  };

  const applyFilters = () => {
    let tempTickets = [...tickets];
    let tempProjects = [...projects];

    // Filtro de Data
    if (filters.dateRange.from) {
      const fromDate = new Date(filters.dateRange.from);
      tempTickets = tempTickets.filter(t => t.createdAt?.toDate() >= fromDate);
    }
    if (filters.dateRange.to) {
      const toDate = new Date(filters.dateRange.to);
      toDate.setHours(23, 59, 59, 999); // Incluir o dia todo
      tempTickets = tempTickets.filter(t => t.createdAt?.toDate() <= toDate);
    }

    // Filtro de Status
    if (filters.status !== 'all') {
      tempTickets = tempTickets.filter(t => t.status === filters.status);
    }

    // Filtro de Usuário (afeta tanto tickets quanto projetos)
    if (filters.userId !== 'all') {
      tempTickets = tempTickets.filter(t => t.criadoPor === filters.userId || t.atribuidoA === filters.userId);
      const userProjectIds = projects.filter(p => p.produtorId === filters.userId || p.consultorId === filters.userId).map(p => p.id);
      tempProjects = tempProjects.filter(p => userProjectIds.includes(p.id));
    }
    
    setFilteredTickets(tempTickets);
    setFilteredProjects(tempProjects);
    calculateKpisAndCharts(tempTickets, tempProjects);
  };

  const calculateKpisAndCharts = (currentTickets, currentProjects) => {
    // Calcular KPIs
    const completedTickets = currentTickets.filter(t => ['concluido', 'arquivado'].includes(t.status)).length;
    const openTickets = currentTickets.filter(t => !['concluido', 'arquivado', 'cancelado'].includes(t.status)).length;
    setKpiStats({
      totalProjects: currentProjects.length,
      totalTickets: currentTickets.length,
      completedTickets: completedTickets,
      openTickets: openTickets,
      resolutionRate: currentTickets.length > 0 ? (completedTickets / currentTickets.length) * 100 : 0,
    });

    // Preparar dados para gráficos
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
    if (type === 'dateFrom') {
      setFilters(prev => ({ ...prev, dateRange: { ...prev.dateRange, from: value } }));
    } else if (type === 'dateTo') {
      setFilters(prev => ({ ...prev, dateRange: { ...prev.dateRange, to: value } }));
    } else {
      setFilters(prev => ({ ...prev, [type]: value }));
    }
  };

  const handleClearFilters = () => {
    setFilters({
      dateRange: { from: '', to: '' },
      userId: 'all',
      status: 'all',
    });
  };

  const handleGenerateGeneralReport = async () => {
    // Futura implementação do PDF geral
    alert('Geração de relatório geral em PDF a ser implementada.');
  };
  
  const handleDownloadPDF = async (type, id) => {
    if (!id) return;
    setGenerating(true);
    try {
      const reportData = type === 'project'
        ? await reportService.generateProjectReport(id)
        : await reportService.generateTicketReport(id);
      
      const markdown = reportService.generateMarkdownReport(reportData, type);
      const fileName = `relatorio_${type}_${id}_${Date.now()}`;
      
      const response = await fetch('https://kkh7ikcgpp6y.manus.space/api/generate-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ markdown, fileName })
      });

      if (response.ok) {
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${fileName}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } else {
        throw new Error('Erro na conversão para PDF');
      }
    } catch (error) {
      console.error('Erro ao baixar PDF:', error);
      alert('Erro ao baixar PDF.');
    } finally {
      setGenerating(false);
    }
  };

  // Memoize para evitar re-renderizações desnecessárias da lista
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
                <h1 className="text-2xl font-bold text-gray-900">Relatórios e Análises</h1>
                <p className="text-sm text-gray-600">Explore os dados da sua operação</p>
              </div>
            </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* FILTROS */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center"><Filter className="h-5 w-5 mr-2" /> Filtros Avançados</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label>Período (De)</Label>
              <Input type="date" value={filters.dateRange.from} onChange={e => handleFilterChange('dateFrom', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Período (Até)</Label>
              <Input type="date" value={filters.dateRange.to} onChange={e => handleFilterChange('dateTo', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Usuário</Label>
              <Select value={filters.userId} onValueChange={value => handleFilterChange('userId', value)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os Usuários</SelectItem>
                  {allUsers.map(user => <SelectItem key={user.id} value={user.id}>{user.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Status do Chamado</Label>
              <Select value={filters.status} onValueChange={value => handleFilterChange('status', value)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                    <SelectItem value="all">Todos os Status</SelectItem>
                    <SelectItem value="aberto">Aberto</SelectItem>
                    <SelectItem value="em_tratativa">Em Tratativa</SelectItem>
                    <SelectItem value="concluido">Concluído</SelectItem>
                    <SelectItem value="arquivado">Arquivado</SelectItem>
                    <SelectItem value="cancelado">Cancelado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-full flex justify-end">
                <Button onClick={handleClearFilters} variant="ghost">Limpar Filtros</Button>
            </div>
          </CardContent>
        </Card>

        {/* DASHBOARD COM KPIS E GRÁFICOS */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center"><BarChart3 className="h-5 w-5 mr-2" /> Dashboard de Relatórios</CardTitle>
            <CardDescription>Resumo visual dos dados filtrados.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
              <div className="p-4 bg-gray-100 rounded-lg"><p className="text-sm text-gray-600">Total de Projetos</p><p className="text-3xl font-bold">{kpiStats.totalProjects}</p></div>
              <div className="p-4 bg-gray-100 rounded-lg"><p className="text-sm text-gray-600">Total de Chamados</p><p className="text-3xl font-bold">{kpiStats.totalTickets}</p></div>
              <div className="p-4 bg-gray-100 rounded-lg"><p className="text-sm text-gray-600">Chamados em Aberto</p><p className="text-3xl font-bold text-orange-600">{kpiStats.openTickets}</p></div>
              <div className="p-4 bg-gray-100 rounded-lg"><p className="text-sm text-gray-600">Taxa de Resolução</p><p className="text-3xl font-bold text-green-600">{kpiStats.resolutionRate?.toFixed(1)}%</p></div>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8" style={{ height: '300px' }}>
              <div>
                <h3 className="text-center font-semibold mb-2">Chamados por Status</h3>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData.ticketsByStatus}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" fontSize={12} />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="value" fill="#8884d8" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div>
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

        {/* GERAÇÃO DE RELATÓRIOS */}
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center"><Download className="h-5 w-5 mr-2" /> Geração de Relatórios</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="p-4 bg-gray-50 rounded-lg">
                    <h3 className="font-semibold">Relatório Geral por Período</h3>
                    <p className="text-sm text-gray-600 mb-2">Gera um PDF consolidado com base nos filtros aplicados acima.</p>
                    <Button onClick={handleGenerateGeneralReport} disabled={generating}>
                        {generating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
                        Gerar Relatório Geral (PDF)
                    </Button>
                </div>
                 <div className="p-4 bg-gray-50 rounded-lg">
                    <h3 className="font-semibold">Relatório Individual</h3>
                    <p className="text-sm text-gray-600 mb-2">Selecione um projeto ou chamado específico (das listas abaixo) para gerar um PDF detalhado.</p>
                     <div className="flex items-center space-x-4">
                        <p className="text-sm font-medium">Item selecionado:</p>
                        <Badge variant="secondary">Nenhum</Badge>
                     </div>
                </div>
            </CardContent>
        </Card>
        
        {/* LISTAS COM PESQUISA */}
        <div>
            <div className="relative mb-4">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                <Input 
                    placeholder="Pesquisar por nome do projeto ou título do chamado..."
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
                                <Button size="sm" variant="outline" onClick={() => handleDownloadPDF('project', project.id)}><Download className="h-4 w-4" /></Button>
                            </div>
                        ))}
                    </div>
                </div>
                <div>
                    <h3 className="font-semibold mb-2">Chamados Filtrados ({displayedTickets.length})</h3>
                    <div className="space-y-3 max-h-96 overflow-y-auto pr-2">
                        {displayedTickets.map(ticket => (
                            <div key={ticket.id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50">
                                <div>
                                    <p className="font-medium">{ticket.titulo}</p>
                                    <p className="text-sm text-gray-600">{ticket.status}</p>
                                </div>
                                <Button size="sm" variant="outline" onClick={() => handleDownloadPDF('ticket', ticket.id)}><Download className="h-4 w-4" /></Button>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
      </main>
    </div>
  );
};

export default ReportsPage;