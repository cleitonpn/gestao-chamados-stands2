import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { projectService } from '../services/projectService';
import { ticketService, PRIORITIES } from '../services/ticketService';
import { userService, AREAS } from '../services/userService';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import Header from '../components/Header';
import * as XLSX from 'xlsx';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { getFunctions, httpsCallable } from 'firebase/functions';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { 
  BarChart3, Users, FolderOpen, AlertTriangle, CheckCircle, TrendingUp,
  Timer, Target, Zap, Calendar, RefreshCw, Building, UserCheck, FilePlus2, DollarSign,
  Eye, UserX, Edit, Filter, X as XIcon, Download, BellRing, Loader2, ChevronsUpDown, ShieldQuestion
} from 'lucide-react';

// Componente para a nova Central de Chamados
const TicketCommandCenter = ({ tickets, users, projects, onUpdate }) => {
    const [filters, setFilters] = useState({ status: '', area: '', priority: '', assigneeId: '' });
    const [updatingTicketId, setUpdatingTicketId] = useState(null);

    const handleUpdateTicket = async (ticketId, updateData) => {
        setUpdatingTicketId(ticketId);
        try {
            await ticketService.updateTicket(ticketId, updateData);
            onUpdate(); // Recarrega todos os dados no painel principal
        } catch (error) {
            alert(`Erro ao atualizar o chamado: ${error.message}`);
        } finally {
            setUpdatingTicketId(null);
        }
    };

    const filteredTickets = useMemo(() => {
        return tickets.filter(ticket => {
            const statusMatch = filters.status ? ticket.status === filters.status : true;
            const areaMatch = filters.area ? ticket.area === filters.area : true;
            const priorityMatch = filters.priority ? ticket.prioridade === filters.priority : true;
            const assigneeMatch = filters.assigneeId ? ticket.atribuidoA === filters.assigneeId : true;
            return statusMatch && areaMatch && priorityMatch && assigneeMatch;
        });
    }, [tickets, filters]);

    const getStatusText = (status) => {
        const statusMap = { 'aberto': 'Aberto', 'em_tratativa': 'Em Tratativa', 'concluido': 'Concluído', 'cancelado': 'Cancelado', 'arquivado': 'Arquivado' };
        return statusMap[status] || status;
    };
    
    const statusOptions = [...new Set(tickets.map(t => t.status))].map(s => ({ value: s, label: getStatusText(s) }));
    const areaOptions = Object.entries(AREAS).map(([key, value]) => ({ value, label: value.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase()) }));
    const priorityOptions = Object.entries(PRIORITIES).map(([key, value]) => ({ value, label: value.charAt(0).toUpperCase() + value.slice(1) }));
    const userOptions = users.map(u => ({ value: u.id, label: u.nome }));

    return (
        <Card>
            <CardHeader>
                <CardTitle>Central de Comando de Chamados</CardTitle>
                <CardDescription>Filtre, visualize e gerencie todos os chamados em um só lugar.</CardDescription>
            </CardHeader>
            <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4 p-4 border rounded-lg">
                    <Select value={filters.status} onValueChange={v => setFilters({...filters, status: v})}>
                        <SelectTrigger><SelectValue placeholder="Filtrar por Status" /></SelectTrigger>
                        <SelectContent>{statusOptions.map(opt => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}</SelectContent>
                    </Select>
                    <Select value={filters.area} onValueChange={v => setFilters({...filters, area: v})}>
                        <SelectTrigger><SelectValue placeholder="Filtrar por Área" /></SelectTrigger>
                        <SelectContent>{areaOptions.map(opt => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}</SelectContent>
                    </Select>
                    <Select value={filters.priority} onValueChange={v => setFilters({...filters, priority: v})}>
                        <SelectTrigger><SelectValue placeholder="Filtrar por Prioridade" /></SelectTrigger>
                        <SelectContent>{priorityOptions.map(opt => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}</SelectContent>
                    </Select>
                    <Select value={filters.assigneeId} onValueChange={v => setFilters({...filters, assigneeId: v})}>
                        <SelectTrigger><SelectValue placeholder="Filtrar por Responsável" /></SelectTrigger>
                        <SelectContent>{userOptions.map(opt => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}</SelectContent>
                    </Select>
                </div>
                <div className="max-h-[600px] overflow-auto">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-[40%]">Chamado</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Responsável</TableHead>
                                <TableHead>Prioridade</TableHead>
                                <TableHead>Ações</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredTickets.map(ticket => (
                                <TableRow key={ticket.id}>
                                    <TableCell>
                                        <p className="font-medium truncate" title={ticket.titulo}>{ticket.titulo}</p>
                                        <p className="text-xs text-gray-500">{projects.find(p => p.id === ticket.projetoId)?.nome || 'Projeto não encontrado'}</p>
                                    </TableCell>
                                    <TableCell>
                                        <Select 
                                            value={ticket.status} 
                                            onValueChange={newStatus => handleUpdateTicket(ticket.id, { status: newStatus, updatedAt: new Date() })}
                                            disabled={updatingTicketId === ticket.id}
                                        >
                                            <SelectTrigger className="h-8 text-xs"/>
                                            <SelectContent>{statusOptions.map(opt => <SelectItem key={opt.value} value={opt.value} className="text-xs">{opt.label}</SelectItem>)}</SelectContent>
                                        </Select>
                                    </TableCell>
                                    <TableCell>
                                        <Select 
                                            value={ticket.atribuidoA || ''} 
                                            onValueChange={newUserId => handleUpdateTicket(ticket.id, { atribuidoA: newUserId, updatedAt: new Date() })}
                                            disabled={updatingTicketId === ticket.id}
                                        >
                                            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Atribuir..." /></SelectTrigger>
                                            <SelectContent>{userOptions.map(opt => <SelectItem key={opt.value} value={opt.value} className="text-xs">{opt.label}</SelectItem>)}</SelectContent>
                                        </Select>
                                    </TableCell>
                                    <TableCell>
                                         <Select 
                                            value={ticket.prioridade} 
                                            onValueChange={newPrio => handleUpdateTicket(ticket.id, { prioridade: newPrio, updatedAt: new Date() })}
                                            disabled={updatingTicketId === ticket.id}
                                        >
                                            <SelectTrigger className="h-8 text-xs"/>
                                            <SelectContent>{priorityOptions.map(opt => <SelectItem key={opt.value} value={opt.value} className="text-xs">{opt.label}</SelectItem>)}</SelectContent>
                                        </Select>
                                    </TableCell>
                                    <TableCell>
                                        {updatingTicketId === ticket.id 
                                          ? <Loader2 className="h-4 w-4 animate-spin"/> 
                                          : <Button variant="ghost" size="sm" onClick={() => window.open(`/chamado/${ticket.id}`, '_blank')}><Eye className="h-4 w-4"/></Button>
                                        }
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            </CardContent>
        </Card>
    );
};


const AdminPanelPage = () => {
  const { user, userProfile, authInitialized } = useAuth();
  const navigate = useNavigate();
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lastUpdate, setLastUpdate] = useState(new Date());
  
  const [allProjects, setAllProjects] = useState([]);
  const [allTickets, setAllTickets] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  
  const [filters, setFilters] = useState({ 
    dateRange: { from: '', to: '' },
    drillDownUserId: null 
  });
  const [stats, setStats] = useState({
    projetos: {}, chamados: {}, performance: {}, alertas: {
      chamadosParadosDetalhes: [], semResponsavelDetalhes: []
    }
  });
  const [selectedExtraTickets, setSelectedExtraTickets] = useState(new Set());
  const [stalledTicketsToNotify, setStalledTicketsToNotify] = useState(new Set());
  const [isNotifying, setIsNotifying] = useState(false);

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

  useEffect(() => {
    if (!loading) {
      calculateStatistics(allProjects, allTickets, allUsers, filters);
    }
  }, [filters, loading, allProjects, allTickets, allUsers]);

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
      setLastUpdate(new Date());
    } catch (error) {
      console.error('❌ Erro ao carregar dados do painel:', error);
      setError('Erro ao carregar dados. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  const calculateStatistics = (projectsData, ticketsData, usersData, currentFilters) => {
    // A lógica de cálculo de estatísticas permanece a mesma...
    let filteredTickets = [...ticketsData];
    let filteredProjects = [...projectsData];

    if (currentFilters.dateRange.from) {
        const fromDate = new Date(currentFilters.dateRange.from);
        filteredTickets = filteredTickets.filter(t => t.createdAt?.toDate() >= fromDate);
        filteredProjects = filteredProjects.filter(p => p.criadoEm?.toDate() >= fromDate);
    }
    if (currentFilters.dateRange.to) {
        const toDate = new Date(currentFilters.dateRange.to);
        toDate.setHours(23, 59, 59, 999);
        filteredTickets = filteredTickets.filter(t => t.createdAt?.toDate() <= toDate);
        filteredProjects = filteredProjects.filter(p => p.criadoEm?.toDate() <= toDate);
    }
    if (currentFilters.drillDownUserId) {
        filteredTickets = filteredTickets.filter(t => t.criadoPor === currentFilters.drillDownUserId || t.atribuidoA === currentFilters.drillDownUserId);
        filteredProjects = filteredProjects.filter(p => p.produtorId === currentFilters.drillDownUserId || p.consultorId === currentFilters.drillDownUserId);
    }
    
    const produtores = usersData.filter(u => u.funcao === 'produtor');
    const consultores = usersData.filter(u => u.funcao === 'consultor');
    const gerentes = usersData.filter(u => u.funcao === 'gerente');

    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    
    const chamadosParados = filteredTickets.filter(ticket => {
      const lastUpdate = ticket.updatedAt?.seconds ? new Date(ticket.updatedAt.seconds * 1000) : new Date(ticket.createdAt.seconds * 1000);
      return lastUpdate < oneDayAgo && !['concluido', 'encerrado', 'cancelado', 'arquivado'].includes(ticket.status);
    });

    const chamadosSemTratativa = filteredTickets.filter(ticket => ticket.status === 'aberto' && !ticket.atribuidoA);
    
    const projetosStats = {
      porProdutor: produtores.map(p => ({
        id: p.id, nome: p.nome, totalProjetos: filteredProjects.filter(proj => proj.produtorId === p.id).length,
      })),
      porConsultor: consultores.map(c => ({
        id: c.id, nome: c.nome, projetosAtivos: filteredProjects.filter(p => p.consultorId === c.id && p.status !== 'encerrado').length,
      })),
    };
    
    const chamadosStats = {
        porProdutor: produtores.map(p => ({ nome: p.nome, chamadosAbertos: filteredTickets.filter(t => t.criadoPor === p.uid).length })),
        porConsultor: consultores.map(c => ({ nome: c.nome, chamadosAbertos: filteredTickets.filter(t => t.criadoPor === c.uid).length })),
        emTratativaPorArea: (() => {
            const map = {};
            filteredTickets.filter(t => ['em_tratativa', 'em_andamento'].includes(t.status)).forEach(t => {
                const area = t.area || 'Sem Área';
                if(!map[area]) map[area] = { name: area.replace(/_/g, ' '), value: 0 };
                map[area].value++;
            });
            return Object.values(map);
        })(),
        semTratativa: chamadosSemTratativa.length,
        aguardandoAprovacaoGerente: gerentes.map(g => ({
            nome: g.nome,
            count: filteredTickets.filter(t => t.status === 'aguardando_aprovacao' && t.gerenteResponsavelId === g.uid).length
        })),
        chamadosExtras: filteredTickets.filter(t => t.isExtra === true),
    };
    
    const calcularTempoMedio = (tickets, startField, endField) => {
        const tempos = tickets.filter(t => t[startField] && t[endField]).map(t => {
            const inicio = t[startField].seconds ? new Date(t[startField].seconds * 1000) : new Date(t[startField]);
            const fim = t[endField].seconds ? new Date(t[endField].seconds * 1000) : new Date(t[endField]);
            return (fim - inicio) / (1000 * 60 * 60);
        });
        if (tempos.length === 0) return 'N/A';
        const media = tempos.reduce((a, b) => a + b, 0) / tempos.length;
        return `${media.toFixed(1)}h`;
    };
    
    const performanceStats = {
        tempoMedioTratativa: calcularTempoMedio(filteredTickets, 'createdAt', 'atribuidoEm'),
        tempoMedioExecucao: calcularTempoMedio(filteredTickets, 'atribuidoEm', 'executadoEm'),
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

  const handleAssignTicket = async (ticketId, operatorId) => {
    if (!operatorId) return;
    try {
        await ticketService.updateTicket(ticketId, {
            atribuidoA: operatorId,
            status: 'em_tratativa',
            atribuidoEm: new Date(),
        });
        loadAdminData();
    } catch (error) { alert("Falha ao atribuir o chamado."); }
  };

  const handleExportExtras = () => {
    const dataToExport = stats.chamados.chamadosExtras
        .filter(ticket => selectedExtraTickets.has(ticket.id))
        .map(ticket => ({
            'ID Chamado': ticket.id, 'Título': ticket.titulo,
            'Projeto': allProjects.find(p => p.id === ticket.projetoId)?.nome || 'N/A',
            'Motivo Extra': ticket.motivoExtra,
            'Criado Em': ticket.createdAt?.toDate().toLocaleDateString('pt-BR'),
            'Faturado': ticket.faturado ? 'Sim' : 'Não'
        }));
    if (dataToExport.length === 0) { alert("Selecione ao menos um chamado extra para exportar."); return; }
    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Chamados Extras");
    XLSX.writeFile(workbook, `Relatorio_Extras_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const handleMarkAsBilled = async () => {
    if (selectedExtraTickets.size === 0) { alert("Selecione ao menos um chamado para marcar como faturado."); return; }
    if (!window.confirm(`Tem certeza que deseja marcar ${selectedExtraTickets.size} chamado(s) como faturado(s)?`)) return;
    try {
        const promises = Array.from(selectedExtraTickets).map(ticketId => ticketService.updateTicket(ticketId, { faturado: true }));
        await Promise.all(promises);
        alert("Chamados marcados como faturados com sucesso!");
        setSelectedExtraTickets(new Set());
        loadAdminData();
    } catch (error) { alert("Ocorreu um erro."); }
  };

  const handleToggleExtraTicket = (ticketId) => {
    const newSelection = new Set(selectedExtraTickets);
    if (newSelection.has(ticketId)) { newSelection.delete(ticketId); } else { newSelection.add(ticketId); }
    setSelectedExtraTickets(newSelection);
  };
  
  const handleEditUser = (userId) => { alert(`Navegando para editar usuário: ${userId} (página a ser criada)`); };
  const handleDeactivateUser = async (userId, userName) => {
    if (!window.confirm(`Tem certeza que deseja desativar o usuário ${userName}?`)) return;
    try {
      await userService.updateUser(userId, { ativo: false });
      alert(`Usuário ${userName} desativado com sucesso.`);
      loadAdminData();
    } catch (err) { alert("Erro ao desativar usuário."); }
  };
  
  const handleToggleStalledTicket = (ticketId) => {
    const newSelection = new Set(stalledTicketsToNotify);
    if (newSelection.has(ticketId)) { newSelection.delete(ticketId); } else { newSelection.add(ticketId); }
    setStalledTicketsToNotify(newSelection);
  };

  const handleSendStalledNotifications = async () => {
    if (stalledTicketsToNotify.size === 0) { alert("Selecione ao menos um chamado para notificar."); return; }
    setIsNotifying(true);
    try {
        const ticketsToNotify = stats.alertas.chamadosParadosDetalhes
            .filter(ticket => stalledTicketsToNotify.has(ticket.id))
            .map(ticket => ({ ticketId: ticket.id, assigneeId: ticket.atribuidoA }))
            .filter(t => t.assigneeId);
        if (ticketsToNotify.length === 0) { alert("Nenhum dos chamados selecionados possui um responsável atribuído."); return; }
        const functions = getFunctions();
        const notifyFunction = httpsCallable(functions, 'notifyStalledTickets');
        const result = await notifyFunction({ tickets: ticketsToNotify });
        alert(result.data.message);
        setStalledTicketsToNotify(new Set());
    } catch (error) {
        alert("Ocorreu um erro ao enviar as notificações.");
    } finally {
        setIsNotifying(false);
    }
  };
  
  const handleDrillDown = (userId) => setFilters(prev => ({...prev, drillDownUserId: userId}));
  const clearDrillDown = () => setFilters(prev => ({...prev, drillDownUserId: null}));

  if (loading) { return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>; }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <div className="container mx-auto px-4 py-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2"><BarChart3 className="h-8 w-8 text-blue-600" />Painel Administrativo</h1>
            <p className="text-gray-600 mt-1">Visão geral da operação. Última atualização: {lastUpdate.toLocaleTimeString()}</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
                <Input type="date" value={filters.dateRange.from} onChange={e => setFilters({...filters, dateRange: {...filters.dateRange, from: e.target.value}})} />
                <Input type="date" value={filters.dateRange.to} onChange={e => setFilters({...filters, dateRange: {...filters.dateRange, to: e.target.value}})} />
            </div>
            <Button onClick={loadAdminData} variant="outline" size="sm"><RefreshCw className="h-4 w-4 mr-2" />Atualizar</Button>
          </div>
        </div>

        {filters.drillDownUserId && (
            <Alert className="mb-4 bg-blue-50 border-blue-200">
                <Filter className="h-4 w-4" />
                <AlertDescription className="flex justify-between items-center">
                    <span>
                        Visualizando dados para: <strong>{allUsers.find(u => u.id === filters.drillDownUserId)?.nome || 'Usuário'}</strong>
                    </span>
                    <Button variant="ghost" size="sm" onClick={clearDrillDown}><XIcon className="h-4 w-4 mr-2" />Limpar Filtro</Button>
                </AlertDescription>
            </Alert>
        )}

        <Card className="mb-6 bg-red-50 border-red-200">
            <CardHeader><CardTitle className="text-red-800 flex items-center gap-2"><AlertTriangle />Alertas Acionáveis</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Dialog>
                  <DialogTrigger asChild disabled={stats.alertas.chamadosParados === 0}>
                    <Card className="cursor-pointer hover:bg-red-100 transition-colors">
                        <CardHeader><CardTitle className="text-base">Chamados Parados (+24h)</CardTitle></CardHeader>
                        <CardContent><p className="text-3xl font-bold text-red-600">{stats.alertas.chamadosParados}</p></CardContent>
                    </Card>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-[625px]">
                    <DialogHeader><DialogTitle>Notificar Responsáveis por Chamados Parados</DialogTitle></DialogHeader>
                    <div className="space-y-2 max-h-96 overflow-y-auto my-4 pr-2">
                        {stats.alertas.chamadosParadosDetalhes.map(ticket => (
                            <div key={ticket.id} className="flex items-center space-x-3 p-2 border rounded-md">
                                <Checkbox id={`check-${ticket.id}`} onCheckedChange={() => handleToggleStalledTicket(ticket.id)} checked={stalledTicketsToNotify.has(ticket.id)} />
                                <label htmlFor={`check-${ticket.id}`} className="flex-1">
                                    <p className="font-medium">{ticket.titulo}</p>
                                    <p className="text-sm text-gray-500">Responsável: {allUsers.find(u => u.id === ticket.atribuidoA)?.nome || 'Não atribuído'}</p>
                                </label>
                            </div>
                        ))}
                    </div>
                    <DialogFooter>
                      <DialogClose asChild><Button type="button" variant="secondary">Cancelar</Button></DialogClose>
                      <Button onClick={handleSendStalledNotifications} disabled={isNotifying}>{isNotifying ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <BellRing className="h-4 w-4 mr-2" />}Notificar ({stalledTicketsToNotify.size})</Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>

                <Card>
                    <CardHeader><CardTitle className="text-base">Chamados Sem Tratativa</CardTitle></CardHeader>
                    <CardContent>
                        {stats.alertas.semResponsavelDetalhes?.length === 0 && <p className="text-sm text-gray-500">Nenhum chamado sem atribuição.</p>}
                        {stats.alertas.semResponsavelDetalhes?.slice(0, 3).map(ticket => (
                            <div key={ticket.id} className="flex items-center justify-between gap-2 mb-2">
                                <span className="text-sm truncate" title={ticket.titulo}>{ticket.titulo}</span>
                                <Select onValueChange={(operatorId) => handleAssignTicket(ticket.id, operatorId)}>
                                    <SelectTrigger className="w-[180px] h-8"><SelectValue placeholder="Atribuir..." /></SelectTrigger>
                                    <SelectContent>{allUsers.filter(u => u.funcao === 'operador').map(op => <SelectItem key={op.id} value={op.id}>{op.nome}</SelectItem>)}</SelectContent>
                                </Select>
                            </div>
                        ))}
                        {stats.alertas.semResponsavelDetalhes?.length > 3 && <p className="text-xs text-gray-500 text-center mt-2">... e mais {stats.alertas.semResponsavelDetalhes.length - 3}</p>}
                    </CardContent>
                </Card>
            </CardContent>
        </Card>

        <Tabs defaultValue="geral" className="space-y-4">
          <TabsList className="grid w-full grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            <TabsTrigger value="geral">📊 Visão Geral</TabsTrigger>
            <TabsTrigger value="command_center">🕹️ Central de Chamados</TabsTrigger>
            <TabsTrigger value="projetos">📁 Projetos</TabsTrigger>
            <TabsTrigger value="extras">💲 Extras</TabsTrigger>
            <TabsTrigger value="usuarios">👥 Usuários</TabsTrigger>
          </TabsList>

          <TabsContent value="geral" className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader><CardTitle>Carga de Trabalho por Área (Em Tratativa)</CardTitle></CardHeader>
              <CardContent className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={stats.chamados.emTratativaPorArea} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
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
                  {stats.chamados.aguardandoAprovacaoGerente?.filter(g => g.count > 0).length > 0 ? (
                    stats.chamados.aguardandoAprovacaoGerente?.filter(g => g.count > 0).map((data, i) => (
                        <div key={i} className="flex justify-between p-3 bg-yellow-50 rounded-lg border border-yellow-200">
                            <span>{data.nome}</span>
                            <Badge variant="destructive">{data.count}</Badge>
                        </div>
                    ))
                  ) : (<p className="text-sm text-gray-500">Nenhum chamado aguardando aprovação.</p>)}
              </CardContent>
            </Card>
             <Card>
                <CardHeader><CardTitle>Tempo Médio de 1ª Resposta</CardTitle></CardHeader>
                <CardContent><p className="text-3xl font-bold">{stats.performance.tempoMedioTratativa}</p><p className="text-sm text-gray-500">Desde a criação até o início da tratativa.</p></CardContent>
            </Card>
              <Card>
                <CardHeader><CardTitle>Tempo Médio de Execução</CardTitle></CardHeader>
                <CardContent><p className="text-3xl font-bold">{stats.performance.tempoMedioExecucao}</p><p className="text-sm text-gray-500">Desde o início da tratativa até a execução.</p></CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="command_center">
             <TicketCommandCenter tickets={allTickets} users={allUsers} projects={allProjects} onUpdate={loadAdminData} />
          </TabsContent>
            
          <TabsContent value="projetos" className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader><CardTitle>Projetos Ativos por Consultor</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {stats.projetos.porConsultor?.map((data, i) => (
                  <div key={i} className="flex justify-between items-center p-2 bg-gray-50 rounded-md">
                    <button onClick={() => handleDrillDown(data.id)} className="font-medium text-sm text-blue-600 hover:underline">{data.nome}</button>
                    <Badge>{data.projetosAtivos} ativos</Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Total de Projetos por Produtor</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {stats.projetos.porProdutor?.map((data, i) => (
                   <div key={i} className="flex justify-between items-center p-2 bg-gray-50 rounded-md">
                    <button onClick={() => handleDrillDown(data.id)} className="font-medium text-sm text-blue-600 hover:underline">{data.nome}</button>
                    <Badge>{data.totalProjetos} projetos</Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="extras" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <div className="flex items-center gap-2"><DollarSign className="h-5 w-5 text-green-600"/>Chamados Extras Registrados</div>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="outline" onClick={handleExportExtras} disabled={selectedExtraTickets.size === 0}><Download className="h-4 w-4 mr-2" />Exportar CSV</Button>
                    <Button size="sm" onClick={handleMarkAsBilled} disabled={selectedExtraTickets.size === 0}><CheckCircle className="h-4 w-4 mr-2" />Marcar como Faturado</Button>
                  </div>
                </CardTitle>
                <CardDescription>Total de {stats.chamados.chamadosExtras?.length || 0} chamados extras no período. Selecione para realizar ações.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {stats.chamados.chamadosExtras?.map(ticket => (
                    <div key={ticket.id} className={`flex justify-between items-center p-3 rounded-lg border transition-colors ${selectedExtraTickets.has(ticket.id) ? 'bg-blue-50' : 'bg-gray-50'}`}>
                      <div className="flex items-center gap-3">
                        <Checkbox id={`extra-${ticket.id}`} checked={selectedExtraTickets.has(ticket.id)} onCheckedChange={() => handleToggleExtraTicket(ticket.id)} />
                        <label htmlFor={`extra-${ticket.id}`} className="cursor-pointer">
                          <p className={`font-medium ${ticket.faturado ? 'line-through text-gray-500' : ''}`}>{ticket.titulo}</p>
                          <p className="text-sm text-gray-500">Projeto: {allProjects.find(p => p.id === ticket.projetoId)?.nome || 'N/A'}</p>
                        </label>
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
                      <Button variant="outline" size="sm" onClick={() => handleEditUser(u.id)}><Edit className="h-4 w-4 mr-2" />Editar</Button>
                      <Button variant="destructive" size="sm" onClick={() => handleDeactivateUser(u.id, u.nome)}><UserX className="h-4 w-4 mr-2" />Desativar</Button>
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
