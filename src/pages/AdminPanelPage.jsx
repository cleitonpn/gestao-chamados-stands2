import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { projectService } from '../services/projectService';
import { ticketService, PRIORITIES } from '../services/ticketService';
import { userService, USER_ROLES, AREAS } from '../services/userService';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell } from 'recharts';
import Header from '../components/Header';
import * as XLSX from 'xlsx';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose, DialogDescription } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { getFunctions, httpsCallable } from 'firebase/functions';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { 
  BarChart3, Users, FolderOpen, AlertTriangle, CheckCircle, TrendingUp,
  Timer, Target, Zap, Calendar, RefreshCw, Building, UserCheck, FilePlus2, DollarSign,
  Eye, UserX, Edit, Filter, X as XIcon, Download, BellRing, Loader2, KeyRound, Plus, Shield
} from 'lucide-react';

// Componente para a Central de Chamados Aprimorada
const TicketCommandCenter = ({ tickets, users, projects, onUpdate, stalledTicketIds }) => {
    const [filters, setFilters] = useState({ status: '', area: '', priority: '', assigneeId: '' });
    const [updatingTicketId, setUpdatingTicketId] = useState(null);

    const handleUpdateTicket = async (ticketId, updateData) => {
        setUpdatingTicketId(ticketId);
        try {
            await ticketService.updateTicket(ticketId, updateData);
            onUpdate();
        } catch (error) {
            alert(`Erro ao atualizar o chamado: ${error.message}`);
        } finally {
            setUpdatingTicketId(null);
        }
    };

    const handleNotifyStalled = async (ticketId, assigneeId) => {
        if (!window.confirm("Deseja enviar uma notificação de chamado parado para o responsável?")) return;
        setUpdatingTicketId(ticketId);
        try {
            const functions = getFunctions();
            const notifyFunction = httpsCallable(functions, 'notifyStalledTickets');
            await notifyFunction({ tickets: [{ ticketId, assigneeId }] });
            alert("Notificação enviada com sucesso!");
        } catch (error) {
            alert("Erro ao enviar notificação.");
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
    const areaOptions = Object.entries(AREAS).map(([key, value]) => ({ value, label: value.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) }));
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
                    {/* ... Filtros ... */}
                </div>
                <div className="max-h-[600px] overflow-auto">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-[40%]">Chamado</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Responsável</TableHead>
                                <TableHead>Prioridade</TableHead>
                                <TableHead className="text-center">Ações</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredTickets.map(ticket => {
                                const isStalled = stalledTicketIds.has(ticket.id);
                                return (
                                <TableRow key={ticket.id}>
                                    <TableCell>
                                        <p className="font-medium truncate" title={ticket.titulo}>{ticket.titulo}</p>
                                        <div className="flex items-center gap-2">
                                            <p className="text-xs text-gray-500">{projects.find(p => p.id === ticket.projetoId)?.nome || 'Projeto não encontrado'}</p>
                                            {isStalled && <AlertTriangle className="h-4 w-4 text-red-500" title="Chamado parado há mais de 24h"/>}
                                        </div>
                                    </TableCell>
                                    <TableCell> {/* Alterar Status */} </TableCell>
                                    <TableCell> {/* Alocar Responsável */} </TableCell>
                                    <TableCell> {/* Alterar Prioridade */} </TableCell>
                                    <TableCell className="flex items-center justify-center gap-1">
                                        {updatingTicketId === ticket.id 
                                          ? <Loader2 className="h-4 w-4 animate-spin"/> 
                                          : <>
                                              <Button variant="ghost" size="icon" onClick={() => window.open(`/chamado/${ticket.id}`, '_blank')} title="Ver Detalhes"><Eye className="h-4 w-4"/></Button>
                                              <Button variant="ghost" size="icon" onClick={() => handleNotifyStalled(ticket.id, ticket.atribuidoA)} disabled={!isStalled || !ticket.atribuidoA} title="Notificar Responsável"><BellRing className="h-4 w-4"/></Button>
                                            </>
                                        }
                                    </TableCell>
                                </TableRow>
                            )})}
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
    dateRange: { from: '', to: '' }
  });
  const [stats, setStats] = useState({
    kpis: {},
    trendData: [],
    statusDistribution: [],
    workloadByArea: [],
    stalledTicketIds: new Set(),
  });
  
  // State para gerenciamento de usuários (portado de UsersPage)
  const [showUserDialog, setShowUserDialog] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [userFormData, setUserFormData] = useState({ nome: '', email: '', funcao: '', area: '', telefone: '', observacoes: '' });
  const [userFormLoading, setUserFormLoading] = useState(false);
  const [userFormError, setUserFormError] = useState('');


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
      calculateStatistics(allTickets, filters);
    }
  }, [filters, loading, allTickets]);

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

  const calculateStatistics = (ticketsData, currentFilters) => {
    let filteredTickets = [...ticketsData];
    if (currentFilters.dateRange.from) {
        filteredTickets = filteredTickets.filter(t => t.createdAt?.toDate() >= new Date(currentFilters.dateRange.from));
    }
    if (currentFilters.dateRange.to) {
        const toDate = new Date(currentFilters.dateRange.to);
        toDate.setHours(23, 59, 59, 999);
        filteredTickets = filteredTickets.filter(t => t.createdAt?.toDate() <= toDate);
    }

    const resolvedTickets = filteredTickets.filter(t => t.status === 'concluido' || t.status === 'arquivado');
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const stalledTickets = ticketsData.filter(ticket => { // Usar todos os tickets, não apenas os filtrados por data
      const lastUpdate = ticket.updatedAt?.toDate() || ticket.createdAt?.toDate();
      return lastUpdate < oneDayAgo && !['concluido', 'cancelado', 'arquivado'].includes(ticket.status);
    });

    const calcAvgTime = (tickets, startField, endField) => {
        const times = tickets.filter(t => t[startField] && t[endField]).map(t => {
            const start = t[startField].toDate();
            const end = t[endField].toDate();
            return (end - start) / (1000 * 60 * 60);
        });
        if (times.length === 0) return 'N/A';
        return `${(times.reduce((a, b) => a + b, 0) / times.length).toFixed(1)}h`;
    };

    // KPIs
    const kpis = {
        totalTickets: filteredTickets.length,
        resolvedTickets: resolvedTickets.length,
        avgFirstResponse: calcAvgTime(filteredTickets, 'createdAt', 'atribuidoEm'),
        avgResolution: calcAvgTime(resolvedTickets, 'createdAt', 'concluidoEm'),
    };
    
    // Gráfico de Tendência
    const trendData = {};
    filteredTickets.forEach(ticket => {
        const date = ticket.createdAt.toDate().toISOString().split('T')[0];
        if(!trendData[date]) trendData[date] = { date, created: 0, resolved: 0 };
        trendData[date].created++;
    });
    resolvedTickets.forEach(ticket => {
        const date = ticket.concluidoEm.toDate().toISOString().split('T')[0];
        if(trendData[date]) trendData[date].resolved++;
    });

    // Gráfico de Pizza
    const statusDistribution = ticketsData.reduce((acc, ticket) => {
        const status = ticket.status || 'indefinido';
        acc[status] = (acc[status] || 0) + 1;
        return acc;
    }, {});

    const pieData = Object.entries(statusDistribution).map(([name, value]) => ({ name: getStatusText(name), value }));
    const PIE_COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8'];

    // Carga por Área
    const workloadByArea = ticketsData.filter(t => t.status === 'em_tratativa').reduce((acc, ticket) => {
        const area = ticket.area || 'Sem Área';
        acc[area] = (acc[area] || 0) + 1;
        return acc;
    }, {});

    setStats({
        kpis,
        trendData: Object.values(trendData).sort((a,b) => new Date(a.date) - new Date(b.date)),
        statusDistribution: pieData.map((entry, index) => ({...entry, fill: PIE_COLORS[index % PIE_COLORS.length]})),
        workloadByArea: Object.entries(workloadByArea).map(([name, value]) => ({name: name.replace(/_/g, ' '), value})),
        stalledTicketIds: new Set(stalledTickets.map(t => t.id)),
    });
  };
  
  // Funções de gerenciamento de usuário
  const handleUserInputChange = (field, value) => {
    setUserFormData(prev => ({ ...prev, [field]: value }));
    if (userFormError) setUserFormError('');
  };

  const resetUserForm = () => {
    setUserFormData({ nome: '', email: '', funcao: '', area: '', telefone: '', observacoes: '' });
    setUserFormError('');
    setEditingUser(null);
  };
  
  const handleEditUser = (user) => {
    setEditingUser(user);
    setUserFormData({
        nome: user.nome || '', email: user.email || '', funcao: user.funcao || '',
        area: user.area || '', telefone: user.telefone || '', observacoes: user.observacoes || ''
    });
    setShowUserDialog(true);
  };

  const handleUserSubmit = async (e) => {
      e.preventDefault();
      setUserFormLoading(true);
      try {
          if (editingUser) {
              await userService.updateUser(editingUser.id, userFormData);
          } else {
              await userService.createUser(userFormData);
          }
          await loadAdminData();
          setShowUserDialog(false);
          resetUserForm();
      } catch (error) {
          setUserFormError('Erro ao salvar usuário.');
      } finally {
          setUserFormLoading(false);
      }
  };
  
  const handlePasswordReset = async (email) => {
      if (!window.confirm(`Deseja enviar um link de redefinição de senha para ${email}?`)) return;
      try {
          const functions = getFunctions();
          const sendReset = httpsCallable(functions, 'sendPasswordResetEmail');
          await sendReset({ email });
          alert(`E-mail de redefinição enviado para ${email}.`);
      } catch (error) {
          alert('Erro ao enviar e-mail de redefinição.');
      }
  };


  if (loading) { return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>; }

  // Funções para pegar nomes de usuário e projeto (para evitar repetição)
  const getUserName = (userId) => allUsers.find(u => u.id === userId)?.nome || 'N/A';
  const getProjectName = (projectId) => allProjects.find(p => p.id === projectId)?.nome || 'N/A';
  const getStatusText = (status) => ({ 'aberto': 'Aberto', 'em_tratativa': 'Em Tratativa', 'concluido': 'Concluído' }[status] || status);

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <div className="container mx-auto px-4 py-6">
        {/* ... Header e Filtros ... */}

        <Tabs defaultValue="geral" className="space-y-4">
          <TabsList className="grid w-full grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4">
            <TabsTrigger value="geral">📊 Visão Geral</TabsTrigger>
            <TabsTrigger value="command_center">🕹️ Central de Chamados</TabsTrigger>
            <TabsTrigger value="extras">💲 Extras</TabsTrigger>
            <TabsTrigger value="usuarios">👥 Usuários</TabsTrigger>
          </TabsList>

          <TabsContent value="geral">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <Card><CardHeader><CardTitle>Total de Chamados</CardTitle><CardDescription>No período</CardDescription></CardHeader><CardContent><p className="text-3xl font-bold">{stats.kpis.totalTickets}</p></CardContent></Card>
                <Card><CardHeader><CardTitle>Chamados Resolvidos</CardTitle><CardDescription>No período</CardDescription></CardHeader><CardContent><p className="text-3xl font-bold">{stats.kpis.resolvedTickets}</p></CardContent></Card>
                <Card><CardHeader><CardTitle>Tempo de 1ª Resposta</CardTitle><CardDescription>Médio</CardDescription></CardHeader><CardContent><p className="text-3xl font-bold">{stats.kpis.avgFirstResponse}</p></CardContent></Card>
                <Card><CardHeader><CardTitle>Tempo de Resolução</CardTitle><CardDescription>Médio</CardDescription></CardHeader><CardContent><p className="text-3xl font-bold">{stats.kpis.avgResolution}</p></CardContent></Card>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                    <CardHeader><CardTitle>Tendência: Criados vs. Resolvidos</CardTitle></CardHeader>
                    <CardContent className="h-[300px]"><ResponsiveContainer width="100%" height="100%"><LineChart data={stats.trendData}><CartesianGrid /><XAxis dataKey="date" /><YAxis /><Tooltip /><Legend /><Line type="monotone" dataKey="created" name="Criados" stroke="#8884d8" /><Line type="monotone" dataKey="resolved" name="Resolvidos" stroke="#82ca9d" /></LineChart></ResponsiveContainer></CardContent>
                </Card>
                <Card>
                    <CardHeader><CardTitle>Distribuição por Status</CardTitle></CardHeader>
                    <CardContent className="h-[300px]"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={stats.statusDistribution} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label>{stats.statusDistribution.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.fill} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer></CardContent>
                </Card>
            </div>
          </TabsContent>

          <TabsContent value="command_center">
             <TicketCommandCenter tickets={allTickets} users={allUsers} projects={allProjects} onUpdate={loadAdminData} stalledTicketIds={stats.stalledTicketIds}/>
          </TabsContent>
          
          <TabsContent value="extras">{/* ... Conteúdo dos Extras ... */}</TabsContent>
          
          <TabsContent value="usuarios">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Gerenciamento de Usuários</CardTitle>
                  <CardDescription>Adicione, edite ou desative usuários do sistema.</CardDescription>
                </div>
                <Dialog open={showUserDialog} onOpenChange={setShowUserDialog}>
                  <DialogTrigger asChild><Button onClick={resetUserForm}><Plus className="mr-2 h-4 w-4"/>Novo Usuário</Button></DialogTrigger>
                  <DialogContent>
                    <DialogHeader><DialogTitle>{editingUser ? 'Editar Usuário' : 'Novo Usuário'}</DialogTitle></DialogHeader>
                    <form onSubmit={handleUserSubmit} className="space-y-4">
                       {/* ... Formulário de Usuário (idêntico ao de UsersPage) ... */}
                    </form>
                  </DialogContent>
                </Dialog>
              </CardHeader>
              <CardContent className="space-y-2">
                {allUsers.map(u => (
                  <div key={u.id} className="flex justify-between items-center p-3 border rounded-lg">
                    <div>
                      <p className="font-medium">{u.nome} <Badge className="ml-2">{u.funcao}</Badge></p>
                      <p className="text-sm text-gray-500">{u.email}</p>
                    </div>
                    <div className="flex gap-2">
                        <Button variant="outline" size="icon" onClick={() => handlePasswordReset(u.email)} title="Enviar Reset de Senha"><KeyRound className="h-4 w-4" /></Button>
                        <Button variant="outline" size="icon" onClick={() => handleEditUser(u)} title="Editar Usuário"><Edit className="h-4 w-4" /></Button>
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
