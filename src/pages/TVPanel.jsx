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
  Wifi,
  UserCheck
} from 'lucide-react';

const TVPanel = () => {
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
  
  const [periodStats, setPeriodStats] = useState({
    hoje: 0,
    semana: 0,
    mes: 0
  });
  
  const [projectsAwaitingValidation, setProjectsAwaitingValidation] = useState(0);
  const [avgResolutionTime, setAvgResolutionTime] = useState('N/A');
  
  const [currentTime, setCurrentTime] = useState(new Date());
  const [lastUpdate, setLastUpdate] = useState(new Date());
  const [isLoading, setIsLoading] = useState(true);

  // Função para carregar dados dos chamados
  const loadTickets = async () => {
    try {
      const ticketsSnapshot = await getDocs(collection(db, 'chamados'));
      const tickets = ticketsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      console.log('TVPanel - Tickets carregados:', tickets.length);
      console.log('TVPanel - Primeiro ticket:', tickets[0]);
      
      // Log adicional para debug - estrutura completa do primeiro ticket
      if (tickets.length > 0) {
        console.log('TVPanel - Estrutura completa do primeiro ticket:', JSON.stringify(tickets[0], null, 2));
        console.log('TVPanel - Status do primeiro ticket:', tickets[0].status);
        console.log('TVPanel - Campo projetoId existe?', 'projetoId' in tickets[0]);
        console.log('TVPanel - Campo createdAt existe?', 'createdAt' in tickets[0]);
        console.log('TVPanel - Valor do campo createdAt:', tickets[0].createdAt);
      }

      // Calcular estatísticas principais
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

      // Calcular projetos únicos aguardando validação
      const ticketsAwaitingValidation = tickets.filter(t => t.status === 'executado_aguardando_validacao');
      const uniqueProjectsAwaitingValidation = new Set(ticketsAwaitingValidation.map(t => t.projetoId)).size;
      setProjectsAwaitingValidation(uniqueProjectsAwaitingValidation);

      // Calcular tempo médio de resolução
      // Adicione estas linhas para depuração
      const allCompletedTickets = tickets.filter(t => t.status === 'concluido');
      console.log('DEBUG: Total de chamados com status "concluido":', allCompletedTickets.length, allCompletedTickets);

      // Verificar campos de data alternativos
      allCompletedTickets.forEach((ticket, index) => {
        console.log(`DEBUG: Ticket ${index + 1} - Campos de data disponíveis:`, {
          createdAt: ticket.createdAt,
          concluidoEm: ticket.concluidoEm,
          updatedAt: ticket.updatedAt,
          atualizadoEm: ticket.atualizadoEm,
          validadoEm: ticket.validadoEm,
          executadoEm: ticket.executadoEm
        });
      });

      // Tentar usar campos alternativos para calcular tempo médio
      const completedTickets = allCompletedTickets.filter(t => {
        const hasCreatedAt = t.createdAt;
        const hasEndDate = t.concluidoEm || t.updatedAt || t.atualizadoEm || t.validadoEm;
        return hasCreatedAt && hasEndDate;
      });

      console.log('DEBUG: Chamados que podem ser usados para cálculo:', completedTickets.length, completedTickets);
      
      if (completedTickets.length === 0) {
        setAvgResolutionTime('N/A');
      } else {
        const totalDuration = completedTickets.reduce((total, ticket) => {
          try {
            let createdAt, endDate;
            
            // Tratar diferentes formatos de data para criação
            if (ticket.createdAt?.toDate) {
              createdAt = ticket.createdAt.toDate();
            } else if (ticket.createdAt?.seconds) {
              createdAt = new Date(ticket.createdAt.seconds * 1000);
            } else if (ticket.createdAt) {
              createdAt = new Date(ticket.createdAt);
            } else {
              return total;
            }
            
            // Usar campo de data de conclusão disponível (prioridade: concluidoEm > atualizadoEm > updatedAt > validadoEm)
            const endDateField = ticket.concluidoEm || ticket.atualizadoEm || ticket.updatedAt || ticket.validadoEm;
            
            if (endDateField?.toDate) {
              endDate = endDateField.toDate();
            } else if (endDateField?.seconds) {
              endDate = new Date(endDateField.seconds * 1000);
            } else if (endDateField) {
              endDate = new Date(endDateField);
            } else {
              return total;
            }
            
            const duration = endDate - createdAt;
            console.log(`DEBUG: Duração calculada para ticket ${ticket.id}:`, {
              createdAt: createdAt.toISOString(),
              endDate: endDate.toISOString(),
              durationMs: duration,
              durationHours: duration / (1000 * 60 * 60)
            });
            
            return total + (duration > 0 ? duration : 0);
          } catch (error) {
            console.error('Erro ao calcular duração do ticket:', ticket.id, error);
            return total;
          }
        }, 0);
        
        if (totalDuration > 0) {
          const avgDurationMs = totalDuration / completedTickets.length;
          
          // Converter para formato legível
          const days = Math.floor(avgDurationMs / (1000 * 60 * 60 * 24));
          const hours = Math.floor((avgDurationMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
          const minutes = Math.floor((avgDurationMs % (1000 * 60 * 60)) / (1000 * 60));
          
          console.log('DEBUG: Tempo médio calculado:', { days, hours, minutes, avgDurationMs });
          
          if (days > 0) {
            setAvgResolutionTime(`${days}d ${hours}h`);
          } else if (hours > 0) {
            setAvgResolutionTime(`${hours}h ${minutes}m`);
          } else {
            setAvgResolutionTime(`${minutes}m`);
          }
        } else {
          setAvgResolutionTime('N/A');
        }
      }

      // Calcular estatísticas de período
      const hoje = new Date();
      const inicioHoje = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
      const inicioSemana = new Date(hoje.getTime() - (7 * 24 * 60 * 60 * 1000));
      const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);

      const newPeriodStats = {
        hoje: tickets.filter(t => {
          try {
            if (!t.createdAt) return false;
            
            let createdAt;
            if (t.createdAt?.toDate) {
              createdAt = t.createdAt.toDate();
            } else if (t.createdAt?.seconds) {
              createdAt = new Date(t.createdAt.seconds * 1000);
            } else {
              createdAt = new Date(t.createdAt);
            }
            
            return createdAt >= inicioHoje;
          } catch (error) {
            console.error('Erro ao processar data do ticket:', t.id, error);
            return false;
          }
        }).length,
        semana: tickets.filter(t => {
          try {
            if (!t.createdAt) return false;
            
            let createdAt;
            if (t.createdAt?.toDate) {
              createdAt = t.createdAt.toDate();
            } else if (t.createdAt?.seconds) {
              createdAt = new Date(t.createdAt.seconds * 1000);
            } else {
              createdAt = new Date(t.createdAt);
            }
            
            return createdAt >= inicioSemana;
          } catch (error) {
            console.error('Erro ao processar data do ticket:', t.id, error);
            return false;
          }
        }).length,
        mes: tickets.filter(t => {
          try {
            if (!t.createdAt) return false;
            
            let createdAt;
            if (t.createdAt?.toDate) {
              createdAt = t.createdAt.toDate();
            } else if (t.createdAt?.seconds) {
              createdAt = new Date(t.createdAt.seconds * 1000);
            } else {
              createdAt = new Date(t.createdAt);
            }
            
            return createdAt >= inicioMes;
          } catch (error) {
            console.error('Erro ao processar data do ticket:', t.id, error);
            return false;
          }
        }).length
      };

      setStats(newStats);
      setPeriodStats(newPeriodStats);
      setLastUpdate(new Date());
    } catch (error) {
      console.error('Erro ao carregar tickets:', error);
    }
  };

  // Função para carregar dados dos projetos
  const loadProjects = async () => {
    try {
      const projectsSnapshot = await getDocs(collection(db, 'projetos'));
      const projects = projectsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      console.log('TVPanel - Projetos carregados:', projects.length);
      console.log('TVPanel - Primeiro projeto:', projects[0]);
      
      // Log adicional para debug - estrutura completa do primeiro projeto
      if (projects.length > 0) {
        console.log('TVPanel - Estrutura completa do primeiro projeto:', JSON.stringify(projects[0], null, 2));
        console.log('TVPanel - Status do primeiro projeto:', projects[0].status);
        console.log('TVPanel - Campo arquivado existe?', 'arquivado' in projects[0]);
        console.log('TVPanel - Valor do campo arquivado:', projects[0].arquivado);
      }

      // Projetos ativos são aqueles que não estão concluídos
      const newProjectStats = {
        ativos: projects.filter(p => p.status !== 'concluido').length,
        concluidos: projects.filter(p => p.status === 'concluido').length
      };

      console.log('TVPanel - Estatísticas de projetos calculadas:', newProjectStats);

      setProjectStats(newProjectStats);
    } catch (error) {
      console.error('Erro ao carregar projetos:', error);
    }
  };

  // Carregar dados iniciais e configurar atualizações
  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      await Promise.all([loadTickets(), loadProjects()]);
      setIsLoading(false);
    };

    loadData();

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

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-white mx-auto mb-4"></div>
          <h2 className="text-2xl font-bold">Carregando Painel Operacional...</h2>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6 overflow-hidden">
      {/* Header */}
      <div className="mb-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-5xl font-bold text-white mb-2">
              📊 Painel Operacional
            </h1>
            <p className="text-2xl text-gray-300">
              Gestão de Chamados - Métricas em Tempo Real
            </p>
          </div>
          <div className="text-right">
            <div className="text-4xl font-mono text-green-400 mb-1">
              {currentTime.toLocaleTimeString('pt-BR')}
            </div>
            <div className="text-xl text-gray-300 mb-2">
              {currentTime.toLocaleDateString('pt-BR', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric'
              })}
            </div>
            <div className="flex items-center justify-end text-green-400">
              <Wifi className="h-5 w-5 mr-2" />
              <span className="text-sm">
                Última atualização: {lastUpdate.toLocaleTimeString('pt-BR')}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Métricas Principais */}
      <div className="grid grid-cols-7 gap-4 mb-6">
        {/* Total */}
        <div className="bg-gradient-to-br from-blue-600 to-blue-700 border border-blue-500 rounded-xl p-6 shadow-lg">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-white text-xl font-bold">Total</h3>
            <BarChart3 className="h-8 w-8 text-white" />
          </div>
          <div className="text-5xl font-bold text-white mb-2">{stats.total}</div>
          <p className="text-blue-100 text-lg">Chamados</p>
        </div>

        {/* Abertos */}
        <div className="bg-gradient-to-br from-orange-600 to-orange-700 border border-orange-500 rounded-xl p-6 shadow-lg">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-white text-xl font-bold">Abertos</h3>
            <Clock className="h-8 w-8 text-white" />
          </div>
          <div className="text-5xl font-bold text-white mb-2">{stats.abertos}</div>
          <p className="text-orange-100 text-lg">Aguardando</p>
        </div>

        {/* Em Andamento */}
        <div className="bg-gradient-to-br from-yellow-600 to-yellow-700 border border-yellow-500 rounded-xl p-6 shadow-lg">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-white text-xl font-bold">Em Andamento</h3>
            <Zap className="h-8 w-8 text-white" />
          </div>
          <div className="text-5xl font-bold text-white mb-2">{stats.emAndamento}</div>
          <p className="text-yellow-100 text-lg">Processando</p>
        </div>

        {/* Concluídos */}
        <div className="bg-gradient-to-br from-green-600 to-green-700 border border-green-500 rounded-xl p-6 shadow-lg">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-white text-xl font-bold">Concluídos</h3>
            <CheckCircle className="h-8 w-8 text-white" />
          </div>
          <div className="text-5xl font-bold text-white mb-2">{stats.concluidos}</div>
          <p className="text-green-100 text-lg">Finalizados</p>
        </div>

        {/* Rejeitados */}
        <div className="bg-gradient-to-br from-red-600 to-red-700 border border-red-500 rounded-xl p-6 shadow-lg">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-white text-xl font-bold">Rejeitados</h3>
            <AlertTriangle className="h-8 w-8 text-white" />
          </div>
          <div className="text-5xl font-bold text-white mb-2">{stats.rejeitados}</div>
          <p className="text-red-100 text-lg">Reprovados</p>
        </div>

        {/* Escalados */}
        <div className="bg-gradient-to-br from-purple-600 to-purple-700 border border-purple-500 rounded-xl p-6 shadow-lg">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-white text-xl font-bold">Escalados</h3>
            <TrendingUp className="h-8 w-8 text-white" />
          </div>
          <div className="text-5xl font-bold text-white mb-2">{stats.escalados}</div>
          <p className="text-purple-100 text-lg">Gerência/Áreas</p>
        </div>

        {/* Aguardando Validação */}
        <div className="bg-gradient-to-br from-cyan-600 to-cyan-700 border border-cyan-500 rounded-xl p-6 shadow-lg">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-white text-xl font-bold">Aguardando Validação</h3>
            <UserCheck className="h-8 w-8 text-white" />
          </div>
          <div className="text-5xl font-bold text-white mb-2">{stats.aguardandoValidacao}</div>
          <p className="text-cyan-100 text-lg">Validação Produtor</p>
        </div>
      </div>

      {/* Métricas Secundárias */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {/* Taxa de Resolução */}
        <div className="bg-gray-800 border border-gray-600 rounded-xl p-6 shadow-lg">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-white text-lg font-bold">Taxa de Resolução</h3>
            <BarChart3 className="h-6 w-6 text-white" />
          </div>
          <div className="text-4xl font-bold text-green-400 mb-2">
            {resolutionRate.toFixed(1)}%
          </div>
          <p className="text-gray-300">Chamados resolvidos</p>
        </div>

        {/* Tempo Médio */}
        <div className="bg-gray-800 border border-gray-600 rounded-xl p-6 shadow-lg">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-white text-lg font-bold">Tempo Médio</h3>
            <Clock className="h-6 w-6 text-white" />
          </div>
          <div className="text-4xl font-bold text-blue-400 mb-2">{avgResolutionTime}</div>
          <p className="text-gray-300">Resolução</p>
        </div>

        {/* Projetos Ativos */}
        <div className="bg-gray-800 border border-gray-600 rounded-xl p-6 shadow-lg">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-white text-lg font-bold">Projetos Ativos</h3>
            <Folder className="h-6 w-6 text-white" />
          </div>
          <div className="text-4xl font-bold text-yellow-400 mb-2">{projectStats.ativos}</div>
          <p className="text-gray-300">Em andamento</p>
        </div>

        {/* Projetos Aguardando Validação */}
        <div className="bg-gray-800 border border-gray-600 rounded-xl p-6 shadow-lg">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-white text-lg font-bold">Validação Pendente</h3>
            <UserCheck className="h-6 w-6 text-white" />
          </div>
          <div className="text-4xl font-bold text-cyan-400 mb-2">
            {projectsAwaitingValidation} 
          </div>
          <p className="text-gray-300">Projetos</p>
        </div>
      </div>

      {/* Métricas de Período */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {/* Chamados Hoje */}
        <div className="bg-gradient-to-br from-indigo-600 to-indigo-700 border border-indigo-500 rounded-xl p-6 shadow-lg">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-white text-lg font-bold">Hoje</h3>
            <Clock className="h-6 w-6 text-white" />
          </div>
          <div className="text-4xl font-bold text-white mb-2">{periodStats.hoje}</div>
          <p className="text-indigo-100">Chamados criados</p>
        </div>

        {/* Chamados Esta Semana */}
        <div className="bg-gradient-to-br from-teal-600 to-teal-700 border border-teal-500 rounded-xl p-6 shadow-lg">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-white text-lg font-bold">Esta Semana</h3>
            <BarChart3 className="h-6 w-6 text-white" />
          </div>
          <div className="text-4xl font-bold text-white mb-2">{periodStats.semana}</div>
          <p className="text-teal-100">Últimos 7 dias</p>
        </div>

        {/* Chamados Este Mês */}
        <div className="bg-gradient-to-br from-pink-600 to-pink-700 border border-pink-500 rounded-xl p-6 shadow-lg">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-white text-lg font-bold">Este Mês</h3>
            <TrendingUp className="h-6 w-6 text-white" />
          </div>
          <div className="text-4xl font-bold text-white mb-2">{periodStats.mes}</div>
          <p className="text-pink-100">Mês atual</p>
        </div>
      </div>

      {/* Footer */}
      <div className="text-center text-gray-400 text-lg">
        <p>
          🔄 Atualização automática a cada 30 segundos • 
          📊 Sistema de Gestão de Chamados • 
          🖥️ Painel Operacional TV
        </p>
      </div>
    </div>
  );
};

export default TVPanel;

