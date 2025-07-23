import React, { useState, useEffect } from 'react';
import { ticketService } from '../services/ticketService';
import { projectService } from '../services/projectService';
import { userService } from '../services/userService';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { 
  BarChart3, 
  Clock, 
  CheckCircle, 
  AlertTriangle, 
  TrendingUp, 
  Users, 
  FolderOpen,
  Activity,
  Target,
  Calendar,
  ArrowUp,
  ArrowDown,
  Minus
} from 'lucide-react';

const OperationalDashboard = () => {
  const [tickets, setTickets] = useState([]);
  const [projects, setProjects] = useState([]);
  const [users, setUsers] = useState([]);
  const [metrics, setMetrics] = useState({});
  const [loading, setLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(new Date());

  // Atualizar dados a cada 30 segundos
  useEffect(() => {
    const loadData = async () => {
      try {
        const [allTickets, allProjects, allUsers] = await Promise.all([
          ticketService.getAllTickets(),
          projectService.getAllProjects(),
          userService.getAllUsers()
        ]);
        
        setTickets(allTickets);
        setProjects(allProjects);
        setUsers(allUsers);
        calculateMetrics(allTickets, allProjects);
        setLoading(false);
      } catch (error) {
        console.error('Erro ao carregar dados:', error);
        setLoading(false);
      }
    };

    loadData();
    const interval = setInterval(loadData, 30000); // Atualizar a cada 30 segundos

    return () => clearInterval(interval);
  }, []);

  // Atualizar relógio a cada segundo
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const calculateMetrics = (ticketsData, projectsData) => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const thisWeek = new Date(today.getTime() - (7 * 24 * 60 * 60 * 1000));
    const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // Contadores básicos
    const statusCounts = {
      abertos: ticketsData.filter(t => t.status === 'aberto').length,
      emAndamento: ticketsData.filter(t => [
        'em_analise', 'enviado_para_area', 'em_execucao', 'em_tratativa'
      ].includes(t.status)).length,
      concluidos: ticketsData.filter(t => t.status === 'concluido').length,
      rejeitados: ticketsData.filter(t => t.status === 'rejeitado').length,
      escaladosGerencia: ticketsData.filter(t => [
        'aguardando_aprovacao', 'aprovado'
      ].includes(t.status)).length,
      escaladosAreas: ticketsData.filter(t => t.status === 'escalado_para_outra_area').length
    };

    // Métricas de tempo
    const completedTickets = ticketsData.filter(t => 
      t.status === 'concluido' && t.criadoEm && t.atualizadoEm
    );

    const resolutionTimes = completedTickets.map(ticket => {
      const created = new Date(ticket.criadoEm.seconds * 1000);
      const completed = new Date(ticket.atualizadoEm.seconds * 1000);
      return (completed - created) / (1000 * 60 * 60); // em horas
    });

    const avgResolutionTime = resolutionTimes.length > 0 
      ? resolutionTimes.reduce((a, b) => a + b, 0) / resolutionTimes.length 
      : 0;

    // Métricas de projetos
    const activeProjects = projectsData.filter(p => p.status === 'ativo').length;
    const completedProjects = projectsData.filter(p => p.status === 'concluido').length;
    const avgTicketsPerProject = activeProjects > 0 
      ? ticketsData.length / activeProjects 
      : 0;

    // Métricas de período
    const todayTickets = ticketsData.filter(t => {
      if (!t.criadoEm) return false;
      const ticketDate = new Date(t.criadoEm.seconds * 1000);
      return ticketDate >= today;
    }).length;

    const weekTickets = ticketsData.filter(t => {
      if (!t.criadoEm) return false;
      const ticketDate = new Date(t.criadoEm.seconds * 1000);
      return ticketDate >= thisWeek;
    }).length;

    const monthTickets = ticketsData.filter(t => {
      if (!t.criadoEm) return false;
      const ticketDate = new Date(t.criadoEm.seconds * 1000);
      return ticketDate >= thisMonth;
    }).length;

    // Taxa de resolução
    const resolutionRate = ticketsData.length > 0 
      ? (statusCounts.concluidos / ticketsData.length * 100) 
      : 0;

    // Distribuição por área
    const areaDistribution = {};
    ticketsData.forEach(ticket => {
      const area = ticket.area || 'Não definida';
      areaDistribution[area] = (areaDistribution[area] || 0) + 1;
    });

    setMetrics({
      statusCounts,
      avgResolutionTime,
      activeProjects,
      completedProjects,
      avgTicketsPerProject,
      todayTickets,
      weekTickets,
      monthTickets,
      resolutionRate,
      areaDistribution,
      totalTickets: ticketsData.length,
      totalProjects: projectsData.length
    });
  };

  const formatTime = (date) => {
    return date.toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const formatDate = (date) => {
    return date.toLocaleDateString('pt-BR', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-white text-2xl">Carregando métricas operacionais...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6">
      {/* Header */}
      <div className="mb-8">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-4xl font-bold text-white mb-2">
              Painel Operacional - Gestão de Chamados
            </h1>
            <p className="text-xl text-gray-300">
              Métricas em Tempo Real
            </p>
          </div>
          <div className="text-right">
            <div className="text-3xl font-mono text-green-400">
              {formatTime(currentTime)}
            </div>
            <div className="text-lg text-gray-300">
              {formatDate(currentTime)}
            </div>
          </div>
        </div>
      </div>

      {/* Métricas Principais */}
      <div className="grid grid-cols-6 gap-6 mb-8">
        <Card className="bg-blue-600 border-blue-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-white text-lg flex items-center">
              <BarChart3 className="h-6 w-6 mr-2" />
              Total
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold text-white">
              {metrics.totalTickets}
            </div>
            <p className="text-blue-100 text-sm">Chamados</p>
          </CardContent>
        </Card>

        <Card className="bg-orange-600 border-orange-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-white text-lg flex items-center">
              <Clock className="h-6 w-6 mr-2" />
              Abertos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold text-white">
              {metrics.statusCounts?.abertos || 0}
            </div>
            <p className="text-orange-100 text-sm">Aguardando</p>
          </CardContent>
        </Card>

        <Card className="bg-yellow-600 border-yellow-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-white text-lg flex items-center">
              <Activity className="h-6 w-6 mr-2" />
              Em Andamento
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold text-white">
              {metrics.statusCounts?.emAndamento || 0}
            </div>
            <p className="text-yellow-100 text-sm">Processando</p>
          </CardContent>
        </Card>

        <Card className="bg-green-600 border-green-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-white text-lg flex items-center">
              <CheckCircle className="h-6 w-6 mr-2" />
              Concluídos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold text-white">
              {metrics.statusCounts?.concluidos || 0}
            </div>
            <p className="text-green-100 text-sm">Finalizados</p>
          </CardContent>
        </Card>

        <Card className="bg-red-600 border-red-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-white text-lg flex items-center">
              <AlertTriangle className="h-6 w-6 mr-2" />
              Rejeitados
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold text-white">
              {metrics.statusCounts?.rejeitados || 0}
            </div>
            <p className="text-red-100 text-sm">Reprovados</p>
          </CardContent>
        </Card>

        <Card className="bg-purple-600 border-purple-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-white text-lg flex items-center">
              <TrendingUp className="h-6 w-6 mr-2" />
              Escalados
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold text-white">
              {(metrics.statusCounts?.escaladosGerencia || 0) + (metrics.statusCounts?.escaladosAreas || 0)}
            </div>
            <p className="text-purple-100 text-sm">Gerência/Áreas</p>
          </CardContent>
        </Card>
      </div>

      {/* Métricas Secundárias */}
      <div className="grid grid-cols-4 gap-6 mb-8">
        <Card className="bg-gray-800 border-gray-700">
          <CardHeader className="pb-2">
            <CardTitle className="text-white text-lg flex items-center">
              <Target className="h-6 w-6 mr-2" />
              Taxa de Resolução
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-400">
              {metrics.resolutionRate?.toFixed(1) || 0}%
            </div>
            <p className="text-gray-300 text-sm">Chamados resolvidos</p>
          </CardContent>
        </Card>

        <Card className="bg-gray-800 border-gray-700">
          <CardHeader className="pb-2">
            <CardTitle className="text-white text-lg flex items-center">
              <Clock className="h-6 w-6 mr-2" />
              Tempo Médio
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-blue-400">
              {metrics.avgResolutionTime?.toFixed(1) || 0}h
            </div>
            <p className="text-gray-300 text-sm">Resolução média</p>
          </CardContent>
        </Card>

        <Card className="bg-gray-800 border-gray-700">
          <CardHeader className="pb-2">
            <CardTitle className="text-white text-lg flex items-center">
              <FolderOpen className="h-6 w-6 mr-2" />
              Projetos Ativos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-yellow-400">
              {metrics.activeProjects || 0}
            </div>
            <p className="text-gray-300 text-sm">Em andamento</p>
          </CardContent>
        </Card>

        <Card className="bg-gray-800 border-gray-700">
          <CardHeader className="pb-2">
            <CardTitle className="text-white text-lg flex items-center">
              <BarChart3 className="h-6 w-6 mr-2" />
              Média por Projeto
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-orange-400">
              {metrics.avgTicketsPerProject?.toFixed(1) || 0}
            </div>
            <p className="text-gray-300 text-sm">Chamados/projeto</p>
          </CardContent>
        </Card>
      </div>

      {/* Métricas de Período */}
      <div className="grid grid-cols-3 gap-6">
        <Card className="bg-gray-800 border-gray-700">
          <CardHeader className="pb-2">
            <CardTitle className="text-white text-lg flex items-center">
              <Calendar className="h-6 w-6 mr-2" />
              Hoje
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-400">
              {metrics.todayTickets || 0}
            </div>
            <p className="text-gray-300 text-sm">Chamados criados</p>
          </CardContent>
        </Card>

        <Card className="bg-gray-800 border-gray-700">
          <CardHeader className="pb-2">
            <CardTitle className="text-white text-lg flex items-center">
              <Calendar className="h-6 w-6 mr-2" />
              Esta Semana
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-blue-400">
              {metrics.weekTickets || 0}
            </div>
            <p className="text-gray-300 text-sm">Chamados criados</p>
          </CardContent>
        </Card>

        <Card className="bg-gray-800 border-gray-700">
          <CardHeader className="pb-2">
            <CardTitle className="text-white text-lg flex items-center">
              <Calendar className="h-6 w-6 mr-2" />
              Este Mês
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-purple-400">
              {metrics.monthTickets || 0}
            </div>
            <p className="text-gray-300 text-sm">Chamados criados</p>
          </CardContent>
        </Card>
      </div>

      {/* Footer */}
      <div className="mt-8 text-center text-gray-400">
        <p>Atualização automática a cada 30 segundos • Última atualização: {formatTime(currentTime)}</p>
      </div>
    </div>
  );
};

export default OperationalDashboard;

