import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { projectService } from '../services/projectService';
import { ticketService } from '../services/ticketService';
import { userService } from '../services/userService';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import Header from '../components/Header';
import { 
  BarChart3, Users, FolderOpen, AlertTriangle, Clock, CheckCircle, TrendingUp, Activity,
  Timer, Target, Zap, Calendar, RefreshCw, Building, UserCheck, FilePlus2, DollarSign,
  Eye, UserX, Edit, Filter, X as XIcon, Download
} from 'lucide-react';

const AdminPanelPage = () => {
  const { user, userProfile, authInitialized } = useAuth();
  const navigate = useNavigate();
  
  // Estados de UI
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lastUpdate, setLastUpdate] = useState(new Date());
  
  // Dados brutos
  const [allProjects, setAllProjects] = useState([]);
  const [allTickets, setAllTickets] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  
  // Dados filtrados e estatísticas
  const [filters, setFilters] = useState({ dateRange: { from: '', to: '' } });
  const [stats, setStats] = useState({
    projetos: {}, chamados: {}, performance: {}, alertas: {
      chamadosParadosDetalhes: [], semResponsavelDetalhes: []
    }
  });
  const [selectedExtraTickets, setSelectedExtraTickets] = useState(new Set());

  useEffect(() => {
    if (authInitialized && userProfile?.funcao !== 'administrador') {
      navigate('/dashboard');
    }
  }, [authInitialized, userProfile, navigate]);

  useEffect(() => {
    if (authInitialized && user && userProfile?.funcao === 'administrador') {
      loadAdminData();
    }
  }, [authInitialized, user, userProfile]);

  // Recalcula estatísticas quando os filtros mudam
  useEffect(() => {
    if (!loading) {
      calculateStatistics(allProjects, allTickets, allUsers, filters);
    }
  }, [filters, loading]);

  const loadAdminData = async () => {
    try {
      setLoading(true);
      setError('');
      const [projectsData, ticketsData, usersData] = await Promise.all([
        projectService.getAllProjects(),
        ticketService.getAllTickets(),
        userService.getAllUsers()
      ]);
      setAllProjects(projectsData);
      setAllTickets(ticketsData);
      setAllUsers(usersData);
      calculateStatistics(projectsData, ticketsData, usersData, filters);
      setLastUpdate(new Date());
    } catch (error) {
      console.error('❌ Erro ao carregar dados do painel:', error);
      setError('Erro ao carregar dados. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  const calculateStatistics = (projectsData, ticketsData, usersData, currentFilters) => {
    // Aplica filtros
    let filteredTickets = [...ticketsData];
    if (currentFilters.dateRange.from) {
        const fromDate = new Date(currentFilters.dateRange.from);
        filteredTickets = filteredTickets.filter(t => t.createdAt?.toDate() >= fromDate);
    }
    if (currentFilters.dateRange.to) {
        const toDate = new Date(currentFilters.dateRange.to);
        toDate.setHours(23, 59, 59, 999);
        filteredTickets = filteredTickets.filter(t => t.createdAt?.toDate() <= toDate);
    }
    
    // O resto das estatísticas é calculado com base nos tickets filtrados
    const produtores = usersData.filter(u => u.funcao === 'produtor');
    const consultores = usersData.filter(u => u.funcao === 'consultor');
    const operadores = usersData.filter(u => u.funcao === 'operador');
    const gerentes = usersData.filter(u => u.funcao === 'gerente');

    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    
    const chamadosParados = filteredTickets.filter(ticket => {
      const lastUpdate = ticket.updatedAt?.seconds ? new Date(ticket.updatedAt.seconds * 1000) : new Date(ticket.createdAt.seconds * 1000);
      return lastUpdate < oneDayAgo && !['concluido', 'encerrado', 'cancelado', 'arquivado'].includes(ticket.status);
    });

    const chamadosSemTratativa = filteredTickets.filter(ticket => 
      ticket.status === 'aberto' && !ticket.atribuidoA
    );

    const chamadosStats = {
        porProdutor: produtores.map(p => ({
            nome: p.nome,
            chamadosAbertos: filteredTickets.filter(t => t.criadoPor === p.id).length,
        })),
        porConsultor: consultores.map(c => ({
            nome: c.nome,
            chamadosAbertos: filteredTickets.filter(t => t.criadoPor === c.id).length,
        })),
        emTratativaPorArea: (() => {
            const map = {};
            filteredTickets.filter(t => ['em_tratativa', 'em_andamento'].includes(t.status)).forEach(t => {
                const area = t.area || 'Sem Área';
                if(!map[area]) map[area] = { name: area, value: 0 };
                map[area].value++;
            });
            return Object.values(map);
        })(),
        semTratativa: chamadosSemTratativa.length,
        aguardandoAprovacaoGerente: gerentes.map(g => ({
            nome: g.nome,
            count: filteredTickets.filter(t => t.status === 'aguardando_aprovacao' && t.gerenteResponsavelId === g.id).length
        })),
        chamadosExtras: filteredTickets.filter(t => t.isExtra === true),
    };

    setStats({
      projetos: { /* ... sua lógica de projetos ... */ },
      chamados: chamadosStats,
      performance: { /* ... sua lógica de performance ... */ },
      alertas: {
        chamadosParados: chamadosParados.length,
        chamadosParadosDetalhes: chamadosParados,
        semResponsavelDetalhes: chamadosSemTratativa
      }
    });
  };

  const handleAssignTicket = async (ticketId, operatorId) => {
    if (!operatorId) return;
    try {
        await ticketService.updateTicket(ticketId, {
            atribuidoA: operatorId,
            status: 'em_tratativa',
            atribuidoEm: new Date(),
        });
        // Recarrega os dados para refletir a mudança
        loadAdminData();
    } catch (error) {
        console.error("Erro ao atribuir chamado:", error);
        alert("Falha ao atribuir o chamado.");
    }
  };

  const handleExportExtras = () => {
    const dataToExport = stats.chamados.chamadosExtras
        .filter(ticket => selectedExtraTickets.has(ticket.id))
        .map(ticket => ({
            'ID Chamado': ticket.id,
            'Título': ticket.titulo,
            'Projeto': allProjects.find(p => p.id === ticket.projetoId)?.nome || 'N/A',
            'Motivo Extra': ticket.motivoExtra,
            'Criado Em': ticket.createdAt?.toDate().toLocaleDateString('pt-BR'),
        }));

    if (dataToExport.length === 0) {
        alert("Selecione ao menos um chamado extra para exportar.");
        return;
    }

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Chamados Extras");
    XLSX.writeFile(workbook, `Relatorio_Extras_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const handleMarkAsBilled = async () => {
    if (selectedExtraTickets.size === 0) {
        alert("Selecione ao menos um chamado para marcar como faturado.");
        return;
    }
    if (!window.confirm(`Tem certeza que deseja marcar ${selectedExtraTickets.size} chamado(s) como faturado(s)?`)) return;

    try {
        const promises = Array.from(selectedExtraTickets).map(ticketId => 
            ticketService.updateTicket(ticketId, { faturado: true })
        );
        await Promise.all(promises);
        alert("Chamados marcados como faturados com sucesso!");
        setSelectedExtraTickets(new Set());
        loadAdminData();
    } catch (error) {
        console.error("Erro ao marcar como faturado:", error);
        alert("Ocorreu um erro.");
    }
  };

  const handleToggleExtraTicket = (ticketId) => {
    const newSelection = new Set(selectedExtraTickets);
    if (newSelection.has(ticketId)) {
        newSelection.delete(ticketId);
    } else {
        newSelection.add(ticketId);
    }
    setSelectedExtraTickets(newSelection);
  };

  if (!authInitialized || loading) { /* ... */ }

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
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
                <Input type="date" value={filters.dateRange.from} onChange={e => setFilters({...filters, dateRange: {...filters.dateRange, from: e.target.value}})} />
                <Input type="date" value={filters.dateRange.to} onChange={e => setFilters({...filters, dateRange: {...filters.dateRange, to: e.target.value}})} />
            </div>
            <Button onClick={loadAdminData} variant="outline" size="sm">
              <RefreshCw className="h-4 w-4 mr-2" />
              Atualizar
            </Button>
          </div>
        </div>

        {/* Alertas Acionáveis */}
        <Card className="mb-6 bg-red-50 border-red-200">
            <CardHeader><CardTitle className="text-red-800 flex items-center gap-2"><AlertTriangle />Alertas Acionáveis</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card>
                    <CardHeader><CardTitle className="text-base">Chamados Parados (+24h)</CardTitle></CardHeader>
                    <CardContent><p className="text-3xl font-bold text-red-600">{stats.alertas.chamadosParados}</p></CardContent>
                </Card>
                <Card>
                    <CardHeader><CardTitle className="text-base">Chamados Sem Tratativa</CardTitle></CardHeader>
                    <CardContent>
                        {stats.alertas.semResponsavelDetalhes.slice(0, 3).map(ticket => (
                            <div key={ticket.id} className="flex items-center justify-between gap-2 mb-2">
                                <span className="text-sm truncate" title={ticket.titulo}>{ticket.titulo}</span>
                                <Select onValueChange={(operatorId) => handleAssignTicket(ticket.id, operatorId)}>
                                    <SelectTrigger className="w-[180px] h-8"><SelectValue placeholder="Atribuir..." /></SelectTrigger>
                                    <SelectContent>{allUsers.filter(u => u.funcao === 'operador').map(op => <SelectItem key={op.id} value={op.id}>{op.nome}</SelectItem>)}</SelectContent>
                                </Select>
                            </div>
                        ))}
                        {stats.alertas.semResponsavelDetalhes.length > 3 && <p className="text-xs text-gray-500 text-center mt-2">... e mais {stats.alertas.semResponsavelDetalhes.length - 3}</p>}
                    </CardContent>
                </Card>
            </CardContent>
        </Card>

        <Tabs defaultValue="projetos" className="space-y-4">
          <TabsList className="grid w-full grid-cols-1 sm:grid-cols-2 md:grid-cols-6">
            <TabsTrigger value="projetos">📁 Projetos</TabsTrigger>
            <TabsTrigger value="chamados">🎫 Chamados</TabsTrigger>
            <TabsTrigger value="performance">⚡ Performance</TabsTrigger>
            <TabsTrigger value="areas">🏢 Áreas</TabsTrigger>
            <TabsTrigger value="extras">💲 Extras</TabsTrigger>
            <TabsTrigger value="usuarios">👥 Usuários</TabsTrigger>
          </TabsList>

          {/* ... Conteúdo das abas existentes ... */}

          <TabsContent value="areas" className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card>
                  <CardHeader><CardTitle>Carga de Trabalho (Em Tratativa)</CardTitle></CardHeader>
                  <CardContent className="h-[300px]">
                      <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={stats.chamados.emTratativaPorArea} layout="vertical">
                              <CartesianGrid strokeDasharray="3 3" />
                              <XAxis type="number" />
                              <YAxis type="category" dataKey="name" width={120} fontSize={12} />
                              <Tooltip />
                              <Bar dataKey="value" fill="#8884d8" name="Chamados" />
                          </BarChart>
                      </ResponsiveContainer>
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
          </TabsContent>

          <TabsContent value="extras" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <DollarSign className="h-5 w-5 text-green-600"/>
                    Chamados Extras Registrados
                  </div>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="outline" onClick={handleExportExtras} disabled={selectedExtraTickets.size === 0}><Download className="h-4 w-4 mr-2" />Exportar CSV</Button>
                    <Button size="sm" onClick={handleMarkAsBilled} disabled={selectedExtraTickets.size === 0}><CheckCircle className="h-4 w-4 mr-2" />Marcar como Faturado</Button>
                  </div>
                </CardTitle>
                <CardDescription>
                  Total de {stats.chamados.chamadosExtras?.length || 0} chamados extras no período. Selecione para realizar ações.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {stats.chamados.chamadosExtras?.map(ticket => (
                    <div key={ticket.id} className={`flex justify-between items-center p-3 rounded-lg border transition-colors ${selectedExtraTickets.has(ticket.id) ? 'bg-blue-50' : 'bg-gray-50'}`}>
                      <div className="flex items-center gap-3">
                        <input type="checkbox" checked={selectedExtraTickets.has(ticket.id)} onChange={() => handleToggleExtraTicket(ticket.id)} />
                        <div>
                          <p className={`font-medium ${ticket.faturado ? 'line-through text-gray-500' : ''}`}>{ticket.titulo}</p>
                          <p className="text-sm text-gray-500">Projeto: {allProjects.find(p => p.id === ticket.projetoId)?.nome || 'N/A'}</p>
                        </div>
                      </div>
                      <Button variant="outline" size="sm" onClick={() => navigate(`/chamado/${ticket.id}`)}><Eye className="h-4 w-4" /></Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="usuarios">
            <Card>
              <CardHeader><CardTitle>Gerenciamento de Usuários</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {allUsers.map(u => (
                  <div key={u.id} className="flex justify-between items-center p-2 border rounded-lg">
                    <div>
                      <p className="font-medium">{u.nome}</p>
                      <p className="text-sm text-gray-500">{u.email} - <span className="capitalize font-semibold">{u.funcao}</span></p>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm"><Edit className="h-4 w-4 mr-2" />Editar</Button>
                      <Button variant="destructive" size="sm"><UserX className="h-4 w-4 mr-2" />Desativar</Button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>

        </Tabs>
      </div>
    </div>
  );
};

export default AdminPanelPage;
