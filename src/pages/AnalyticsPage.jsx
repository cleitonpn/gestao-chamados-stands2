import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { ticketService } from '../services/ticketService';
import { projectService } from '../services/projectService';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  ArrowLeft, 
  BarChart3, 
  TrendingUp, 
  Clock, 
  CheckCircle, 
  AlertCircle,
  Download,
  Calendar,
  Filter,
  Activity,
  Target,
  Timer
} from 'lucide-react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';
import * as XLSX from 'xlsx';

const AnalyticsPage = () => {
  const { user, userProfile } = useAuth();
  const navigate = useNavigate();
  
  const [loading, setLoading] = useState(true);
  const [tickets, setTickets] = useState([]);
  const [projects, setProjects] = useState([]);
  const [dateFilter, setDateFilter] = useState('7days');
  const [filteredTickets, setFilteredTickets] = useState([]);

  // Verificar permissões de acesso
  useEffect(() => {
    if (!userProfile) return;
    
    if (userProfile.funcao !== 'administrador' && userProfile.funcao !== 'gerente') {
      navigate('/dashboard');
      return;
    }
    
    loadData();
  }, [userProfile, navigate]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [allTickets, allProjects] = await Promise.all([
        ticketService.getAllTickets(),
        projectService.getAllProjects()
      ]);
      
      setTickets(allTickets);
      setProjects(allProjects);
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
    } finally {
      setLoading(false);
    }
  };

  // Filtrar tickets por período
  useEffect(() => {
    if (!tickets.length) return;

    const now = new Date();
    let startDate = new Date();

    switch (dateFilter) {
      case '7days':
        startDate.setDate(now.getDate() - 7);
        break;
      case '30days':
        startDate.setDate(now.getDate() - 30);
        break;
      case '3months':
        startDate.setMonth(now.getMonth() - 3);
        break;
      case 'all':
        startDate = new Date(0); // Desde o início
        break;
      default:
        startDate.setDate(now.getDate() - 7);
    }

    const filtered = tickets.filter(ticket => {
      const ticketDate = ticket.createdAt?.toDate?.() || new Date(ticket.createdAt);
      return ticketDate >= startDate;
    });

    setFilteredTickets(filtered);
  }, [tickets, dateFilter]);

  // Calcular métricas básicas
  const getBasicMetrics = () => {
    const total = filteredTickets.length;
    const concluidos = filteredTickets.filter(t => t.status === 'concluido').length;
    const abertos = filteredTickets.filter(t => t.status !== 'concluido').length;
    const emAndamento = filteredTickets.filter(t => 
      t.status === 'em_tratativa' || t.status === 'em_execucao'
    ).length;

    return { total, concluidos, abertos, emAndamento };
  };

  // Calcular dados para gráfico de tendência
  const getTrendData = () => {
    const days = {};
    const now = new Date();
    
    // Inicializar últimos 30 dias
    for (let i = 29; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      days[dateStr] = { date: dateStr, criados: 0, concluidos: 0 };
    }

    // Contar chamados criados
    filteredTickets.forEach(ticket => {
      const createdDate = ticket.createdAt?.toDate?.() || new Date(ticket.createdAt);
      const dateStr = createdDate.toISOString().split('T')[0];
      if (days[dateStr]) {
        days[dateStr].criados++;
      }
    });

    // Contar chamados concluídos
    filteredTickets.filter(t => t.status === 'concluido').forEach(ticket => {
      const completedDate = ticket.validadoEm?.toDate?.() || ticket.updatedAt?.toDate?.() || new Date();
      const dateStr = completedDate.toISOString().split('T')[0];
      if (days[dateStr]) {
        days[dateStr].concluidos++;
      }
    });

    return Object.values(days).map(day => ({
      ...day,
      data: new Date(day.date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
    }));
  };

  // Calcular distribuição por tipo
  const getTypeDistribution = () => {
    const types = {};
    filteredTickets.forEach(ticket => {
      const type = ticket.tipo || 'Não especificado';
      types[type] = (types[type] || 0) + 1;
    });

    return Object.entries(types).map(([name, value]) => ({
      name: name.replace(/_/g, ' ').toUpperCase(),
      value,
      percentage: ((value / filteredTickets.length) * 100).toFixed(1)
    }));
  };

  // Calcular análise de gargalos (tempo médio por status)
  const getBottleneckAnalysis = () => {
    const statusTimes = {};
    
    filteredTickets.forEach(ticket => {
      if (!ticket.historicoStatus || ticket.historicoStatus.length === 0) return;
      
      for (let i = 0; i < ticket.historicoStatus.length; i++) {
        const current = ticket.historicoStatus[i];
        const next = ticket.historicoStatus[i + 1];
        
        const status = current.novoStatus;
        const startTime = current.data?.toDate?.() || new Date(current.data);
        const endTime = next ? (next.data?.toDate?.() || new Date(next.data)) : new Date();
        
        const timeInHours = (endTime - startTime) / (1000 * 60 * 60);
        
        if (!statusTimes[status]) {
          statusTimes[status] = { total: 0, count: 0 };
        }
        
        statusTimes[status].total += timeInHours;
        statusTimes[status].count++;
      }
    });

    return Object.entries(statusTimes).map(([status, data]) => ({
      status: status.replace(/_/g, ' ').toUpperCase(),
      tempoMedio: (data.total / data.count).toFixed(1),
      chamados: data.count
    })).sort((a, b) => parseFloat(b.tempoMedio) - parseFloat(a.tempoMedio));
  };

  // Calcular KPIs
  const getKPIs = () => {
    const completedTickets = filteredTickets.filter(t => t.status === 'concluido');
    
    // Tempo Médio de Resolução (TMR)
    let totalResolutionTime = 0;
    let resolutionCount = 0;
    
    completedTickets.forEach(ticket => {
      const created = ticket.createdAt?.toDate?.() || new Date(ticket.createdAt);
      const completed = ticket.validadoEm?.toDate?.() || ticket.updatedAt?.toDate?.() || new Date();
      const timeInHours = (completed - created) / (1000 * 60 * 60);
      totalResolutionTime += timeInHours;
      resolutionCount++;
    });

    const tmr = resolutionCount > 0 ? (totalResolutionTime / resolutionCount).toFixed(1) : 0;

    // Tempo Médio de Primeira Resposta (TMPR)
    let totalFirstResponseTime = 0;
    let responseCount = 0;

    filteredTickets.forEach(ticket => {
      if (ticket.historicoStatus && ticket.historicoStatus.length > 1) {
        const created = ticket.historicoStatus[0].data?.toDate?.() || new Date(ticket.historicoStatus[0].data);
        const firstResponse = ticket.historicoStatus[1].data?.toDate?.() || new Date(ticket.historicoStatus[1].data);
        const timeInHours = (firstResponse - created) / (1000 * 60 * 60);
        totalFirstResponseTime += timeInHours;
        responseCount++;
      }
    });

    const tmpr = responseCount > 0 ? (totalFirstResponseTime / responseCount).toFixed(1) : 0;

    // Taxa de Cumprimento de SLA (assumindo SLA de 24h para resolução)
    const slaCompliant = completedTickets.filter(ticket => {
      const created = ticket.createdAt?.toDate?.() || new Date(ticket.createdAt);
      const completed = ticket.validadoEm?.toDate?.() || ticket.updatedAt?.toDate?.() || new Date();
      const timeInHours = (completed - created) / (1000 * 60 * 60);
      return timeInHours <= 24;
    }).length;

    const slaRate = completedTickets.length > 0 ? ((slaCompliant / completedTickets.length) * 100).toFixed(1) : 0;

    return { tmr, tmpr, slaRate };
  };

  // Função para exportar dados para Excel
  const exportToExcel = () => {
    const exportData = filteredTickets.map(ticket => ({
      'ID': ticket.id.slice(-8),
      'Título': ticket.titulo,
      'Status': ticket.status,
      'Área': ticket.area,
      'Tipo': ticket.tipo,
      'Prioridade': ticket.prioridade,
      'Criado Por': ticket.criadoPorNome || 'N/A',
      'Criado Em': ticket.createdAt?.toDate?.()?.toLocaleDateString('pt-BR') || 'N/A',
      'Atualizado Em': ticket.updatedAt?.toDate?.()?.toLocaleDateString('pt-BR') || 'N/A',
      'SLA Operação (h)': ticket.slaOperacao || 'N/A',
      'SLA Validação (h)': ticket.slaValidacao || 'N/A'
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Chamados');
    
    const fileName = `analytics_chamados_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(wb, fileName);
  };

  const metrics = getBasicMetrics();
  const trendData = getTrendData();
  const typeData = getTypeDistribution();
  const bottleneckData = getBottleneckAnalysis();
  const kpis = getKPIs();

  // Cores para gráficos
  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#82CA9D'];

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Carregando dados de analytics...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div className="flex items-center space-x-4">
              <Button 
                variant="ghost" 
                onClick={() => navigate('/dashboard')}
                className="flex items-center space-x-2"
              >
                <ArrowLeft className="h-4 w-4" />
                <span>Voltar</span>
              </Button>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Métricas e Analytics</h1>
                <p className="text-sm text-gray-600">Análise de desempenho operacional</p>
              </div>
            </div>
            <Badge variant="outline" className="bg-blue-50 text-blue-700">
              {userProfile?.funcao?.toUpperCase()}
            </Badge>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Filtros Globais */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Filter className="h-5 w-5" />
              <span>Filtros</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <Calendar className="h-4 w-4 text-gray-500" />
                <span className="text-sm font-medium">Período:</span>
              </div>
              <Select value={dateFilter} onValueChange={setDateFilter}>
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7days">Últimos 7 dias</SelectItem>
                  <SelectItem value="30days">Este Mês</SelectItem>
                  <SelectItem value="3months">Últimos 3 meses</SelectItem>
                  <SelectItem value="all">Todos os períodos</SelectItem>
                </SelectContent>
              </Select>
              <Badge variant="secondary">
                {filteredTickets.length} chamados no período
              </Badge>
            </div>
          </CardContent>
        </Card>

        {/* Métricas Resumo */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Total de Chamados</p>
                  <p className="text-3xl font-bold text-gray-900">{metrics.total}</p>
                </div>
                <BarChart3 className="h-8 w-8 text-blue-600" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Concluídos</p>
                  <p className="text-3xl font-bold text-green-600">{metrics.concluidos}</p>
                </div>
                <CheckCircle className="h-8 w-8 text-green-600" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Em Andamento</p>
                  <p className="text-3xl font-bold text-orange-600">{metrics.emAndamento}</p>
                </div>
                <Clock className="h-8 w-8 text-orange-600" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Abertos</p>
                  <p className="text-3xl font-bold text-red-600">{metrics.abertos}</p>
                </div>
                <AlertCircle className="h-8 w-8 text-red-600" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">TMR - Tempo Médio de Resolução</p>
                  <p className="text-2xl font-bold text-blue-600">{kpis.tmr}h</p>
                </div>
                <Timer className="h-6 w-6 text-blue-600" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">TMPR - Tempo Médio Primeira Resposta</p>
                  <p className="text-2xl font-bold text-purple-600">{kpis.tmpr}h</p>
                </div>
                <Activity className="h-6 w-6 text-purple-600" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Taxa de Cumprimento SLA</p>
                  <p className="text-2xl font-bold text-green-600">{kpis.slaRate}%</p>
                </div>
                <Target className="h-6 w-6 text-green-600" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Placeholder para Gráficos */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
          <Card>
            <CardHeader>
              <CardTitle>Gráfico de Tendência</CardTitle>
              <CardDescription>Chamados criados vs. concluídos por dia</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="data" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="criados" stroke="#8884d8" name="Criados" />
                  <Line type="monotone" dataKey="concluidos" stroke="#82ca9d" name="Concluídos" />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Distribuição por Tipo</CardTitle>
              <CardDescription>Porcentagem de cada tipo de chamado</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={typeData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percentage }) => `${name}: ${percentage}%`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {typeData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Análise de Gargalos</CardTitle>
            <CardDescription>Tempo médio em cada status (identificação de gargalos)</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={400}>
              <BarChart data={bottleneckData} layout="horizontal">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis dataKey="status" type="category" width={150} />
                <Tooltip formatter={(value) => [`${value}h`, 'Tempo Médio']} />
                <Bar dataKey="tempoMedio" fill="#8884d8" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Tabela de Dados */}
        <Card className="mt-8">
          <CardHeader>
            <div className="flex justify-between items-center">
              <div>
                <CardTitle>Dados Detalhados</CardTitle>
                <CardDescription>Informações detalhadas dos chamados</CardDescription>
              </div>
              <Button variant="outline" className="flex items-center space-x-2" onClick={exportToExcel}>
                <Download className="h-4 w-4" />
                <span>Exportar Excel</span>
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-2">ID</th>
                    <th className="text-left p-2">Título</th>
                    <th className="text-left p-2">Status</th>
                    <th className="text-left p-2">Área</th>
                    <th className="text-left p-2">Criado em</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTickets.slice(0, 10).map((ticket) => (
                    <tr key={ticket.id} className="border-b hover:bg-gray-50">
                      <td className="p-2 font-mono text-xs">{ticket.id.slice(-8)}</td>
                      <td className="p-2">{ticket.titulo}</td>
                      <td className="p-2">
                        <Badge variant="outline">{ticket.status}</Badge>
                      </td>
                      <td className="p-2">{ticket.area}</td>
                      <td className="p-2">
                        {ticket.createdAt?.toDate?.()?.toLocaleDateString('pt-BR') || 'N/A'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {filteredTickets.length > 10 && (
              <p className="text-sm text-gray-500 mt-4">
                Mostrando 10 de {filteredTickets.length} chamados. Use a exportação para ver todos.
              </p>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default AnalyticsPage;

