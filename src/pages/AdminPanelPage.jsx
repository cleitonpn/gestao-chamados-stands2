import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { projectService } from '../services/projectService';
import { ticketService } from '../services/ticketService';
import { userService } from '../services/userService';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Progress } from '../components/ui/progress';
import Header from '../components/Header';
import { 
  BarChart3, 
  Users, 
  FolderOpen, 
  AlertTriangle, 
  Clock, 
  CheckCircle, 
  TrendingUp, 
  Activity,
  Timer,
  Target,
  Zap,
  Calendar,
  RefreshCw,
  Building,
  UserCheck,
  FilePlus2,
  DollarSign, // Ícone para a nova aba Extras
  Eye
} from 'lucide-react';

const AdminPanelPage = () => {
  const { user, userProfile, authInitialized } = useAuth();
  const navigate = useNavigate();
  
  // Estados
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lastUpdate, setLastUpdate] = useState(new Date());
  
  // Dados brutos
  const [projects, setProjects] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [users, setUsers] = useState([]);
  
  // Estatísticas calculadas
  const [stats, setStats] = useState({
    projetos: {},
    chamados: {},
    performance: {},
    alertas: {
      chamadosParadosDetalhes: [],
      semResponsavelDetalhes: []
    }
  });

  // Verificar permissão de acesso
  useEffect(() => {
    if (authInitialized && userProfile?.funcao !== 'administrador') {
      navigate('/dashboard');
    }
  }, [authInitialized, userProfile, navigate]);

  // Carregar dados
  useEffect(() => {
    if (authInitialized && user && userProfile?.funcao === 'administrador') {
      loadAdminData();
    }
  }, [authInitialized, user, userProfile]);

  const loadAdminData = async () => {
    try {
      setLoading(true);
      setError('');
      
      const [allProjects, allTickets, allUsers] = await Promise.all([
        projectService.getAllProjects(),
        ticketService.getAllTickets(),
        userService.getAllUsers()
      ]);
      
      setProjects(allProjects);
      setTickets(allTickets);
      setUsers(allUsers);
      
      calculateStatistics(allProjects, allTickets, allUsers);
      setLastUpdate(new Date());
      
    } catch (error) {
      console.error('❌ Erro ao carregar dados do painel:', error);
      setError('Erro ao carregar dados. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  const calculateStatistics = (projectsData, ticketsData, usersData) => {
    const produtores = usersData.filter(u => u.funcao === 'produtor');
    const consultores = usersData.filter(u => u.funcao === 'consultor');
    const operadores = usersData.filter(u => u.funcao === 'operador');
    const gerentes = usersData.filter(u => u.funcao === 'gerente');

    // === ALERTAS CRÍTICOS ===
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    
    const chamadosParados = ticketsData.filter(ticket => {
      const lastUpdate = ticket.updatedAt?.seconds ? new Date(ticket.updatedAt.seconds * 1000) : new Date(ticket.createdAt.seconds * 1000);
      return lastUpdate < oneDayAgo && !['concluido', 'encerrado', 'cancelado'].includes(ticket.status);
    });

    const chamadosSemTratativa = ticketsData.filter(ticket => 
      ticket.status === 'aberto' && !ticket.atribuidoA
    );

    // === ESTATÍSTICAS DE PROJETOS ===
    const projetosStats = {
      porProdutor: produtores.map(p => {
        const projetosProdutor = projectsData.filter(proj => proj.produtorId === p.id);
        const projetosAtivos = projetosProdutor.filter(proj => proj.status !== 'encerrado' && !proj.eventoArquivado);
        return {
          nome: p.nome,
          totalProjetos: projetosProdutor.length,
          eventosSimultaneos: [...new Set(projetosAtivos.map(pr => pr.feira || pr.evento))].length,
        };
      }),
      porConsultor: consultores.map(c => ({
        nome: c.nome,
        projetosAtivos: projectsData.filter(p => p.consultorId === c.id && p.status !== 'encerrado').length,
      })),
      porEmpreiteiro: (() => {
        const map = {};
        projectsData.forEach(p => {
          if (p.equipesEmpreiteiras && typeof p.equipesEmpreiteiras === 'object') {
            Object.values(p.equipesEmpreiteiras).forEach(nome => {
              if (nome && nome.trim() !== '') {
                if (!map[nome]) map[nome] = { nome: nome, totalProjetos: 0, eventos: new Set() };
                map[nome].totalProjetos++;
                if (p.status !== 'encerrado') {
                  map[nome].eventos.add(p.feira || p.evento);
                }
              }
            });
          }
        });
        return Object.values(map).map(e => ({ ...e, eventosSimultaneos: e.eventos.size }));
      })(),
    };

    // === ESTATÍSTICAS DE CHAMADOS ===
    const chamadosStats = {
        porProdutor: produtores.map(p => ({
            nome: p.nome,
            chamadosAbertos: ticketsData.filter(t => t.criadoPor === p.id).length,
        })),
        porConsultor: consultores.map(c => ({
            nome: c.nome,
            chamadosAbertos: ticketsData.filter(t => t.criadoPor === c.id).length,
        })),
        porOperador: operadores.map(o => ({
            nome: o.nome,
            area: o.area,
            chamadosAbertos: ticketsData.filter(t => t.criadoPor === o.id).length,
        })),
        emTratativaPorArea: (() => {
            const map = {};
            ticketsData.filter(t => ['em_tratativa', 'em_andamento'].includes(t.status)).forEach(t => {
                const area = t.area || 'Sem Área';
                if(!map[area]) map[area] = 0;
                map[area]++;
            });
            return map;
        })(),
        semTratativa: chamadosSemTratativa.length,
        aguardandoValidacaoProdutor: ticketsData.filter(t => t.status === 'executado_aguardando_validacao').length,
        aguardandoValidacaoOperador: ticketsData.filter(t => t.status === 'executado_aguardando_validacao_operador').length,
        aguardandoAprovacaoGerente: gerentes.map(g => ({
            nome: g.nome,
            email: g.email,
            count: ticketsData.filter(t => t.status === 'aguardando_aprovacao' && t.gerenteResponsavelId === g.id).length
        })),
        chamadosExtras: ticketsData.filter(t => t.isExtra === true),
    };

    // === PERFORMANCE ===
    const performanceStats = {
      tempoMedioTratativa: calcularTempoMedio(ticketsData, 'createdAt', 'atribuidoEm'),
      tempoMedioExecucao: calcularTempoMedio(ticketsData, 'atribuidoEm', 'executadoEm'),
      porcentagemEscalados: ticketsData.length > 0 ? Math.round((ticketsData.filter(t => t.escaladoParaGerencia === true).length / ticketsData.length) * 100) : 0,
      quantidadeExtras: ticketsData.filter(t => t.isExtra === true).length,
    };

    setStats({
      projetos: projetosStats,
      chamados: chamadosStats,
      performance: performanceStats,
      alertas: {
        chamadosParados: chamadosParados.length,
        chamadosParadosDetalhes: chamadosParados,
        semResponsavelDetalhes: chamadosSemTratativa
      }
    });
  };

  const calcularTempoMedio = (tickets, startField, endField) => {
    const tempos = tickets
      .filter(t => t[startField] && t[endField])
      .map(t => {
        const inicio = t[startField].seconds ? new Date(t[startField].seconds * 1000) : new Date(t[startField]);
        const fim = t[endField].seconds ? new Date(t[endField].seconds * 1000) : new Date(t[endField]);
        return (fim - inicio) / (1000 * 60 * 60); // em horas
      });

    if (tempos.length === 0) return 'N/A';
    const media = tempos.reduce((a, b) => a + b, 0) / tempos.length;
    return `${media.toFixed(1)}h`;
  };
  
  const navegarParaChamadosFiltrados = (filtro, dados, titulo) => {
    localStorage.setItem('chamadosFiltrados', JSON.stringify({
      chamados: dados,
      titulo: titulo,
      filtro: filtro
    }));
    navigate('/admin/chamados-filtrados');
  };

  if (!authInitialized || loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header />
        <div className="flex items-center justify-center h-96">
          <div className="text-center">
            <RefreshCw className="h-12 w-12 animate-spin text-blue-600 mx-auto mb-4" />
            <p className="text-gray-600">Carregando painel administrativo...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      
      <div className="container mx-auto px-4 py-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
              <BarChart3 className="h-8 w-8 text-blue-600" />
              Painel Administrativo
            </h1>
            <p className="text-gray-600 mt-1">Visão geral da operação</p>
          </div>
          <Button onClick={loadAdminData} variant="outline" size="sm">
            <RefreshCw className="h-4 w-4 mr-2" />
            Atualizar
          </Button>
        </div>

        {/* Alertas Críticos */}
        <Card className="mb-6 bg-red-50 border-red-200">
            <CardHeader>
                <CardTitle className="text-red-800 flex items-center gap-2">
                    <AlertTriangle />
                    Alertas Críticos
                </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card 
                  className="cursor-pointer hover:bg-red-100 transition-colors"
                  onClick={() => navegarParaChamadosFiltrados('parados', stats.alertas.chamadosParadosDetalhes, 'Chamados Parados +24h')}
                >
                  <CardContent className="p-4">
                      <p className="text-sm font-medium text-gray-600">Chamados Parados +24h</p>
                      <p className="text-3xl font-bold text-red-600">{stats.alertas.chamadosParados}</p>
                  </CardContent>
                </Card>
                <Card 
                  className="cursor-pointer hover:bg-orange-100 transition-colors"
                  onClick={() => navegarParaChamadosFiltrados('sem_tratativa', stats.alertas.semResponsavelDetalhes, 'Chamados Sem Tratativa')}
                >
                  <CardContent className="p-4">
                      <p className="text-sm font-medium text-gray-600">Sem Tratativa</p>
                      <p className="text-3xl font-bold text-orange-600">{stats.chamados.semTratativa}</p>
                  </CardContent>
                </Card>
                 <Card>
                    <CardContent className="p-4">
                      <p className="text-sm font-medium text-gray-600">% Escalados p/ Gerência</p>
                      <p className="text-3xl font-bold text-purple-600">{stats.performance.porcentagemEscalados}%</p>
                    </CardContent>
                  </Card>
                 <Card>
                    <CardContent className="p-4">
                       <p className="text-sm font-medium text-gray-600">Chamados Extras</p>
                      <p className="text-3xl font-bold text-indigo-600">{stats.performance.quantidadeExtras}</p>
                    </CardContent>
                  </Card>
            </CardContent>
        </Card>

        {/* Tabs com Estatísticas Detalhadas */}
        <Tabs defaultValue="projetos" className="space-y-4">
          <TabsList className="grid w-full grid-cols-1 sm:grid-cols-2 md:grid-cols-5">
            <TabsTrigger value="projetos">📁 Projetos</TabsTrigger>
            <TabsTrigger value="chamados">🎫 Chamados</TabsTrigger>
            <TabsTrigger value="performance">⚡ Performance</TabsTrigger>
            <TabsTrigger value="areas">🏢 Áreas</TabsTrigger>
            <TabsTrigger value="extras">💲 Extras</TabsTrigger>
          </TabsList>

          <TabsContent value="projetos" className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card>
              <CardHeader><CardTitle>Por Produtor</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {stats.projetos.porProdutor?.map((data, i) => (
                  <div key={i} className="flex justify-between items-center p-2 bg-gray-50 rounded-md">
                    <p className="font-medium text-sm">{data.nome}</p>
                    <div className="text-right">
                      <Badge>{data.totalProjetos} projetos</Badge>
                      <p className="text-xs text-gray-500 mt-1">{data.eventosSimultaneos} eventos</p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Por Consultor</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {stats.projetos.porConsultor?.map((data, i) => (
                  <div key={i} className="flex justify-between items-center p-2 bg-gray-50 rounded-md">
                    <p className="font-medium text-sm">{data.nome}</p>
                    <Badge>{data.projetosAtivos} ativos</Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Por Empreiteiro</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {stats.projetos.porEmpreiteiro?.map((data, i) => (
                   <div key={i} className="flex justify-between items-center p-2 bg-gray-50 rounded-md">
                    <p className="font-medium text-sm">{data.nome}</p>
                    <div className="text-right">
                      <Badge>{data.totalProjetos} projetos</Badge>
                      <p className="text-xs text-gray-500 mt-1">{data.eventosSimultaneos} eventos</p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="chamados" className="grid grid-cols-1 lg:grid-cols-3 gap-6">
             <Card>
                <CardHeader><CardTitle>Abertos por Produtor</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                {stats.chamados.porProdutor?.map((data, i) => (
                    <div key={i} className="flex justify-between p-2 bg-gray-50 rounded-md">
                    <span>{data.nome}</span>
                    <Badge>{data.chamadosAbertos}</Badge>
                    </div>
                ))}
                </CardContent>
            </Card>
            <Card>
                <CardHeader><CardTitle>Abertos por Consultor</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                {stats.chamados.porConsultor?.map((data, i) => (
                    <div key={i} className="flex justify-between p-2 bg-gray-50 rounded-md">
                    <span>{data.nome}</span>
                    <Badge>{data.chamadosAbertos}</Badge>
                    </div>
                ))}
                </CardContent>
            </Card>
            <Card>
                <CardHeader><CardTitle>Abertos por Operador</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                {stats.chamados.porOperador?.map((data, i) => (
                    <div key={i} className="flex justify-between p-2 bg-gray-50 rounded-md">
                    <span>{data.nome} ({data.area})</span>
                    <Badge>{data.chamadosAbertos}</Badge>
                    </div>
                ))}
                </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="performance" className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card>
                  <CardHeader><CardTitle>Tempo Médio de 1ª Resposta</CardTitle></CardHeader>
                  <CardContent>
                      <p className="text-3xl font-bold">{stats.performance.tempoMedioTratativa}</p>
                      <p className="text-sm text-gray-500">Desde a criação até o início da tratativa.</p>
                  </CardContent>
              </Card>
                <Card>
                  <CardHeader><CardTitle>Tempo Médio de Execução</CardTitle></CardHeader>
                  <CardContent>
                      <p className="text-3xl font-bold">{stats.performance.tempoMedioExecucao}</p>
                      <p className="text-sm text-gray-500">Desde o início da tratativa até a execução.</p>
                  </CardContent>
              </Card>
          </TabsContent>

          <TabsContent value="areas" className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card>
                  <CardHeader><CardTitle>Em Tratativa por Área</CardTitle></CardHeader>
                  <CardContent className="space-y-2">
                      {Object.entries(stats.chamados.emTratativaPorArea || {}).map(([area, count]) => (
                          <div key={area} className="flex justify-between p-2 bg-gray-50 rounded-md">
                              <span className="capitalize">{area.replace('_', ' ')}</span>
                              <Badge>{count}</Badge>
                          </div>
                      ))}
                  </CardContent>
              </Card>
              <Card>
                  <CardHeader><CardTitle>Aguardando Aprovação por Gerente</CardTitle></CardHeader>
                  <CardContent className="space-y-2">
                      {stats.chamados.aguardandoAprovacaoGerente?.filter(g => g.count > 0).map((data, i) => (
                          <div key={i} className="flex justify-between p-3 bg-yellow-50 rounded-lg border border-yellow-200">
                              <span>{data.nome}</span>
                              <Badge variant="destructive">{data.count}</Badge>
                          </div>
                      ))}
                  </CardContent>
              </Card>
              <Card>
                  <CardHeader><CardTitle>Aguardando Validação</CardTitle></CardHeader>
                  <CardContent className="space-y-2">
                      <div className="flex justify-between p-2 bg-gray-50 rounded-md">
                          <span>Produtores</span>
                          <Badge>{stats.chamados.aguardandoValidacaoProdutor}</Badge>
                      </div>
                      <div className="flex justify-between p-2 bg-gray-50 rounded-md">
                          <span>Operadores</span>
                          <Badge>{stats.chamados.aguardandoValidacaoOperador}</Badge>
                      </div>
                  </CardContent>
              </Card>
          </TabsContent>

          <TabsContent value="extras" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <DollarSign className="h-5 w-5 text-green-600"/>
                  Chamados Extras Registrados
                </CardTitle>
                <CardDescription>
                  Total de {stats.chamados.chamadosExtras?.length || 0} chamados marcados como extras.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {stats.chamados.chamadosExtras?.map(ticket => (
                    <div key={ticket.id} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg border">
                      <div>
                        <p className="font-medium">{ticket.titulo}</p>
                        <p className="text-sm text-gray-500">Projeto: {projects.find(p => p.id === ticket.projetoId)?.nome || 'N/A'}</p>
                      </div>
                      <Button variant="outline" size="sm" onClick={() => navigate(`/chamado/${ticket.id}`)}>
                        <Eye className="h-4 w-4 mr-2" />
                        Ver
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

        </Tabs>
      </div>
    </div>
  );
};

export default AdminPanelPage;
