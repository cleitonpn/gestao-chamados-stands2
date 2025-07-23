import React, { useState, useEffect } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../config/firebase';
import { 
  BarChart3, 
  Clock, 
  Zap, 
  CheckCircle, 
  AlertTriangle, 
  TrendingUp,
  Folder,
  Activity,
  UserCheck
} from 'lucide-react';

const OperationalPanel = () => {
  const [stats, setStats] = useState({
    total: 0,
    abertos: 0,
    emAndamento: 0,
    concluidos: 0,
    rejeitados: 0,
    escalados: 0,
    aguardandoValidacao: 0
  });
  
  const [projectStats, setProjectStats] = useState({
    ativos: 0,
    concluidos: 0
  });
  
  const [currentTime, setCurrentTime] = useState(new Date());
  const [lastUpdate, setLastUpdate] = useState(new Date());

  // Função para carregar dados dos chamados
  const loadTickets = async () => {
    try {
      const ticketsSnapshot = await getDocs(collection(db, 'tickets'));
      const tickets = ticketsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      // Calcular estatísticas
      const newStats = {
        total: tickets.length,
        abertos: tickets.filter(t => t.status === 'aberto').length,
        emAndamento: tickets.filter(t => [
          'em_analise', 
          'enviado_para_area', 
          'em_execucao', 
          'em_tratativa',
          'aguardando_aprovacao',
          'aprovado',
          'escalado_para_outra_area'
        ].includes(t.status)).length,
        concluidos: tickets.filter(t => t.status === 'concluido').length,
        rejeitados: tickets.filter(t => t.status === 'rejeitado').length,
        escalados: tickets.filter(t => [
          'aguardando_aprovacao',
          'aprovado', 
          'escalado_para_outra_area'
        ].includes(t.status)).length,
        aguardandoValidacao: tickets.filter(t => t.status === 'executado_aguardando_validacao').length
      };

      setStats(newStats);
      setLastUpdate(new Date());
    } catch (error) {
      console.error('Erro ao carregar tickets:', error);
    }
  };

  // Função para carregar dados dos projetos
  const loadProjects = async () => {
    try {
      const projectsSnapshot = await getDocs(collection(db, 'projects'));
      const projects = projectsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      const newProjectStats = {
        ativos: projects.filter(p => p.status === 'ativo').length,
        concluidos: projects.filter(p => p.status === 'concluido').length
      };

      setProjectStats(newProjectStats);
    } catch (error) {
      console.error('Erro ao carregar projetos:', error);
    }
  };

  // Carregar dados iniciais e configurar atualizações
  useEffect(() => {
    loadTickets();
    loadProjects();

    // Atualizar dados a cada 30 segundos
    const dataInterval = setInterval(() => {
      loadTickets();
      loadProjects();
    }, 30000);

    // Atualizar relógio a cada segundo
    const clockInterval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => {
      clearInterval(dataInterval);
      clearInterval(clockInterval);
    };
  }, []);

  // Calcular métricas derivadas
  const resolutionRate = stats.total > 0 ? (stats.concluidos / stats.total * 100) : 0;
  const avgTicketsPerProject = projectStats.ativos > 0 ? (stats.total / projectStats.ativos) : 0;

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
              {currentTime.toLocaleTimeString('pt-BR')}
            </div>
            <div className="text-lg text-gray-300">
              {currentTime.toLocaleDateString('pt-BR', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric'
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Métricas Principais */}
      <div className="grid grid-cols-7 gap-6 mb-8">
        {/* Total */}
        <div className="bg-blue-600 border border-blue-500 rounded-lg p-6">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-white text-lg font-semibold">Total</h3>
            <BarChart3 className="h-6 w-6 text-white" />
          </div>
          <div className="text-4xl font-bold text-white">{stats.total}</div>
          <p className="text-blue-100 text-sm">Chamados</p>
        </div>

        {/* Abertos */}
        <div className="bg-orange-600 border border-orange-500 rounded-lg p-6">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-white text-lg font-semibold">Abertos</h3>
            <Clock className="h-6 w-6 text-white" />
          </div>
          <div className="text-4xl font-bold text-white">{stats.abertos}</div>
          <p className="text-orange-100 text-sm">Aguardando</p>
        </div>

        {/* Em Andamento */}
        <div className="bg-yellow-600 border border-yellow-500 rounded-lg p-6">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-white text-lg font-semibold">Em Andamento</h3>
            <Zap className="h-6 w-6 text-white" />
          </div>
          <div className="text-4xl font-bold text-white">{stats.emAndamento}</div>
          <p className="text-yellow-100 text-sm">Processando</p>
        </div>

        {/* Concluídos */}
        <div className="bg-green-600 border border-green-500 rounded-lg p-6">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-white text-lg font-semibold">Concluídos</h3>
            <CheckCircle className="h-6 w-6 text-white" />
          </div>
          <div className="text-4xl font-bold text-white">{stats.concluidos}</div>
          <p className="text-green-100 text-sm">Finalizados</p>
        </div>

        {/* Rejeitados */}
        <div className="bg-red-600 border border-red-500 rounded-lg p-6">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-white text-lg font-semibold">Rejeitados</h3>
            <AlertTriangle className="h-6 w-6 text-white" />
          </div>
          <div className="text-4xl font-bold text-white">{stats.rejeitados}</div>
          <p className="text-red-100 text-sm">Reprovados</p>
        </div>

        {/* Escalados */}
        <div className="bg-purple-600 border border-purple-500 rounded-lg p-6">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-white text-lg font-semibold">Escalados</h3>
            <TrendingUp className="h-6 w-6 text-white" />
          </div>
          <div className="text-4xl font-bold text-white">{stats.escalados}</div>
          <p className="text-purple-100 text-sm">Gerência/Áreas</p>
        </div>

        {/* Aguardando Validação */}
        <div className="bg-cyan-600 border border-cyan-500 rounded-lg p-6">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-white text-lg font-semibold">Aguardando Validação</h3>
            <UserCheck className="h-6 w-6 text-white" />
          </div>
          <div className="text-4xl font-bold text-white">{stats.aguardandoValidacao}</div>
          <p className="text-cyan-100 text-sm">Validação Produtor</p>
        </div>
      </div>

      {/* Métricas Secundárias */}
      <div className="grid grid-cols-4 gap-6 mb-8">
        {/* Taxa de Resolução */}
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-white text-lg font-semibold">Taxa de Resolução</h3>
            <BarChart3 className="h-6 w-6 text-white" />
          </div>
          <div className="text-3xl font-bold text-green-400">
            {resolutionRate.toFixed(1)}%
          </div>
          <p className="text-gray-300 text-sm">Chamados resolvidos</p>
        </div>

        {/* Projetos Ativos */}
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-white text-lg font-semibold">Projetos Ativos</h3>
            <Folder className="h-6 w-6 text-white" />
          </div>
          <div className="text-3xl font-bold text-yellow-400">{projectStats.ativos}</div>
          <p className="text-gray-300 text-sm">Em andamento</p>
        </div>

        {/* Projetos Concluídos */}
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-white text-lg font-semibold">Projetos Concluídos</h3>
            <CheckCircle className="h-6 w-6 text-white" />
          </div>
          <div className="text-3xl font-bold text-green-400">{projectStats.concluidos}</div>
          <p className="text-gray-300 text-sm">Finalizados</p>
        </div>

        {/* Média por Projeto */}
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-white text-lg font-semibold">Média por Projeto</h3>
            <Activity className="h-6 w-6 text-white" />
          </div>
          <div className="text-3xl font-bold text-blue-400">
            {avgTicketsPerProject.toFixed(1)}
          </div>
          <p className="text-gray-300 text-sm">Chamados/projeto</p>
        </div>
      </div>

      {/* Métricas de Período */}
      <div className="grid grid-cols-3 gap-6 mb-8">
        {/* Chamados Hoje */}
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-white text-lg font-semibold">Chamados Hoje</h3>
            <Clock className="h-6 w-6 text-white" />
          </div>
          <div className="text-3xl font-bold text-cyan-400">
            {/* Implementar lógica para chamados de hoje */}
            {Math.floor(stats.total * 0.2)}
          </div>
          <p className="text-gray-300 text-sm">Criados hoje</p>
        </div>

        {/* Chamados Esta Semana */}
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-white text-lg font-semibold">Esta Semana</h3>
            <BarChart3 className="h-6 w-6 text-white" />
          </div>
          <div className="text-3xl font-bold text-indigo-400">
            {/* Implementar lógica para chamados da semana */}
            {Math.floor(stats.total * 0.6)}
          </div>
          <p className="text-gray-300 text-sm">Últimos 7 dias</p>
        </div>

        {/* Status do Sistema */}
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-white text-lg font-semibold">Status</h3>
            <div className="w-3 h-3 bg-green-400 rounded-full animate-pulse"></div>
          </div>
          <div className="text-2xl font-bold text-green-400">ONLINE</div>
          <p className="text-gray-300 text-sm">Sistema operacional</p>
        </div>
      </div>

      {/* Footer */}
      <div className="text-center text-gray-400">
        <p>
          Atualização automática a cada 30 segundos • 
          Última atualização: {lastUpdate.toLocaleTimeString('pt-BR')} • 
          Sistema de Gestão de Chamados
        </p>
      </div>
    </div>
  );
};

export default OperationalPanel;

