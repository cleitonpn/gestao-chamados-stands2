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
  BarChart3, Users, AlertTriangle, CheckCircle, TrendingUp, RefreshCw, DollarSign,
  Eye, UserX, Edit, X as XIcon, Download, BellRing, Loader2, KeyRound, Plus, Shield
} from 'lucide-react';

// Componente para a Central de Chamados Aprimorada
const TicketCommandCenter = ({ tickets, users, projects, onUpdate, stalledTicketIds }) => {
    const [filters, setFilters] = useState({ status: '', area: '', priority: '', assigneeId: '', search: '' });
    const [updatingTicketId, setUpdatingTicketId] = useState(null);

    const handleUpdateTicket = async (ticketId, updateData) => {
        setUpdatingTicketId(ticketId);
        try {
            await ticketService.updateTicket(ticketId, { ...updateData, updatedAt: new Date() });
            onUpdate(); // Recarrega todos os dados no painel principal
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

    const getStatusText = (status) => {
        const statusMap = { 'aberto': 'Aberto', 'em_tratativa': 'Em Tratativa', 'concluido': 'Concluído', 'cancelado': 'Cancelado', 'arquivado': 'Arquivado', 'devolvido': 'Devolvido', 'aguardando_aprovacao': 'Aguardando Aprovação'};
        return statusMap[status] || status;
    };

    const filteredTickets = useMemo(() => {
        return tickets.filter(ticket => {
            const ticketProject = projects.find(p => p.id === ticket.projetoId);
            const searchText = filters.search.toLowerCase();

            const searchMatch = filters.search ? (
                ticket.titulo.toLowerCase().includes(searchText) ||
                (ticketProject?.nome || '').toLowerCase().includes(searchText) ||
                ticket.id.toLowerCase().includes(searchText)
            ) : true;
            const statusMatch = filters.status ? ticket.status === filters.status : true;
            const areaMatch = filters.area ? ticket.area === filters.area : true;
            const priorityMatch = filters.priority ? ticket.prioridade === filters.priority : true;
            const assigneeMatch = filters.assigneeId ? ticket.atribuidoA === filters.assigneeId : true;
            return searchMatch && statusMatch && areaMatch && priorityMatch && assigneeMatch;
        });
    }, [tickets, projects, filters]);

    const statusOptions = [...new Set(tickets.map(t => t.status))].map(s => ({ value: s, label: getStatusText(s) }));
    const areaOptions = Object.values(AREAS).map(area => ({ value: area, label: area.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) }));
    const priorityOptions = Object.values(PRIORITIES).map(prio => ({ value: prio, label: prio.charAt(0).toUpperCase() + prio.slice(1) }));
    const userOptions = users.map(u => ({ value: u.id, label: u.nome }));

    return (
        <Card>
            <CardHeader>
                <CardTitle>Central de Comando de Chamados</CardTitle>
                <CardDescription>Filtre, visualize e gerencie todos os chamados em um só lugar.</CardDescription>
            </CardHeader>
            <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-4 p-4 border rounded-lg">
                    <Input placeholder="Buscar por título, projeto, ID..." value={filters.search} onChange={e => setFilters({...filters, search: e.target.value})} />
                    <Select value={filters.status} onValueChange={v => setFilters({...filters, status: v})}><SelectTrigger><SelectValue placeholder="Filtrar por Status" /></SelectTrigger><SelectContent>{statusOptions.map(opt => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}</SelectContent></Select>
                    <Select value={filters.area} onValueChange={v => setFilters({...filters, area: v})}><SelectTrigger><SelectValue placeholder="Filtrar por Área" /></SelectTrigger><SelectContent>{areaOptions.map(opt => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}</SelectContent></Select>
                    <Select value={filters.priority} onValueChange={v => setFilters({...filters, priority: v})}><SelectTrigger><SelectValue placeholder="Filtrar por Prioridade" /></SelectTrigger><SelectContent>{priorityOptions.map(opt => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}</SelectContent></Select>
                    <Select value={filters.assigneeId} onValueChange={v => setFilters({...filters, assigneeId: v})}><SelectTrigger><SelectValue placeholder="Filtrar por Responsável" /></SelectTrigger><SelectContent>{userOptions.map(opt => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}</SelectContent></Select>
                </div>
                <div className="max-h-[600px] overflow-auto">
                    <Table>
                        <TableHeader><TableRow><TableHead className="w-[40%]">Chamado</TableHead><TableHead>Status</TableHead><TableHead>Responsável</TableHead><TableHead>Prioridade</TableHead><TableHead className="text-center">Ações</TableHead></TableRow></TableHeader>
                        <TableBody>
                            {filteredTickets.map(ticket => {
                                const isStalled = stalledTicketIds.has(ticket.id);
                                return (
                                <TableRow key={ticket.id} className={isStalled ? "bg-red-50" : ""}>
                                    <TableCell>
                                        <p className="font-medium truncate" title={ticket.titulo}>{ticket.titulo}</p>
                                        <p className="text-xs text-gray-500">{projects.find(p => p.id === ticket.projetoId)?.nome || 'N/A'}</p>
                                    </TableCell>
                                    <TableCell><Select value={ticket.status || ''} onValueChange={v => handleUpdateTicket(ticket.id, { status: v })} disabled={updatingTicketId === ticket.id}><SelectTrigger className="h-8 text-xs"/><SelectContent>{statusOptions.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent></Select></TableCell>
                                    <TableCell><Select value={ticket.atribuidoA || ''} onValueChange={v => handleUpdateTicket(ticket.id, { atribuidoA: v })} disabled={updatingTicketId === ticket.id}><SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Atribuir..."/></SelectTrigger><SelectContent>{userOptions.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent></Select></TableCell>
                                    <TableCell><Select value={ticket.prioridade || ''} onValueChange={v => handleUpdateTicket(ticket.id, { prioridade: v })} disabled={updatingTicketId === ticket.id}><SelectTrigger className="h-8 text-xs"/><SelectContent>{priorityOptions.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent></Select></TableCell>
                                    <TableCell className="flex items-center justify-center gap-1">
                                        {updatingTicketId === ticket.id ? <Loader2 className="h-4 w-4 animate-spin"/> : <>
                                            <Button variant="ghost" size="icon" onClick={() => navigate(`/chamado/${ticket.id}`)} title="Ver Detalhes"><Eye className="h-4 w-4"/></Button>
                                            <Button variant="ghost" size="icon" onClick={() => handleNotifyStalled(ticket.id, ticket.atribuidoA)} disabled={!isStalled || !ticket.atribuidoA} title="Notificar Responsável"><BellRing className={`h-4 w-4 ${isStalled && "text-red-500"}`}/></Button>
                                        </>}
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
  
  const [filters, setFilters] = useState({ dateRange: { from: '', to: '' } });
  const [stats, setStats] = useState({ kpis: {}, trendData: [], statusDistribution: [], workloadByArea: [], stalledTicketIds: new Set() });
  
  const [selectedExtraTickets, setSelectedExtraTickets] = useState(new Set());
  
  // State para gerenciamento de usuários (portado de UsersPage)
  const [showUserDialog, setShowUserDialog] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [userFormData, setUserFormData] = useState({ nome: '', email: '', funcao: '', area: '', telefone: '', observacoes: '' });
  const [userFormLoading, setUserFormLoading] = useState(false);
  const [userFormError, setUserFormError] = useState('');

  useEffect(() => {
    if (authInitialized && userProfile?.funcao !== 'administrador') navigate('/dashboard');
  }, [authInitialized, userProfile, navigate]);

  useEffect(() => {
    if (authInitialized && user && userProfile?.funcao === 'administrador') loadAdminData();
  }, [authInitialized, user, userProfile]);

  useEffect(() => {
    if (!loading) calculateStatistics(allTickets, filters);
  }, [filters, loading, allTickets]);

  const loadAdminData = async () => {
    setLoading(true);
    try {
      const [projectsData, ticketsData, usersData] = await Promise.all([
        projectService.getAllProjects(),
        ticketService.getAllTickets(),
        userService.getAllUsers()
      ]);
      setAllProjects(projectsData);
      setAllTickets(ticketsData.sort((a,b) => b.createdAt.seconds - a.createdAt.seconds));
      setAllUsers(usersData);
      setLastUpdate(new Date());
    } catch (err) { setError('Erro ao carregar dados.') } 
    finally { setLoading(false) }
  };

  const calculateStatistics = (ticketsData, currentFilters) => {
    let filteredTickets = [...ticketsData];
    if (currentFilters.dateRange.from) filteredTickets = filteredTickets.filter(t => t.createdAt?.toDate() >= new Date(currentFilters.dateRange.from));
    if (currentFilters.dateRange.to) {
        const toDate = new Date(currentFilters.dateRange.to);
        toDate.setHours(23, 59, 59, 999);
        filteredTickets = filteredTickets.filter(t => t.createdAt?.toDate() <= toDate);
    }

    const resolvedTickets = filteredTickets.filter(t => ['concluido', 'arquivado'].includes(t.status));
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const stalledTickets = ticketsData.filter(ticket => (ticket.updatedAt?.toDate() || ticket.createdAt?.toDate()) < oneDayAgo && !['concluido', 'cancelado', 'arquivado'].includes(ticket.status));
    
    const calcAvgTime = (tickets, startField, endField) => {
        const times = tickets.map(t => {
            const start = t[startField]?.toDate();
            const end = t[endField]?.toDate();
            if (start && end) return (end - start) / (1000 * 60 * 60);
            return null;
        }).filter(t => t !== null);
        if (times.length === 0) return 'N/A';
        return `${(times.reduce((a, b) => a + b, 0) / times.length).toFixed(1)}h`;
    };

    const kpis = {
        totalTickets: filteredTickets.length,
        resolvedTickets: resolvedTickets.length,
        avgFirstResponse: calcAvgTime(filteredTickets, 'createdAt', 'atribuidoEm'),
        avgResolution: calcAvgTime(resolvedTickets, 'createdAt', 'concluidoEm'),
    };
    
    const trendDataMap = {};
    filteredTickets.forEach(ticket => {
        const date = ticket.createdAt.toDate().toISOString().split('T')[0];
        if(!trendDataMap[date]) trendDataMap[date] = { date, created: 0, resolved: 0 };
        trendDataMap[date].created++;
    });
    resolvedTickets.forEach(ticket => {
        if(ticket.concluidoEm){
            const date = ticket.concluidoEm.toDate().toISOString().split('T')[0];
            if(trendDataMap[date]) trendDataMap[date].resolved++;
        }
    });

    const statusDistribution = ticketsData.reduce((acc, ticket) => {
        const status = ticket.status || 'indefinido';
        acc[status] = (acc[status] || 0) + 1;
        return acc;
    }, {});
    
    const getStatusText = (status) => ({ 'aberto': 'Aberto', 'em_tratativa': 'Em Tratativa', 'concluido': 'Concluído' }[status] || status);
    const pieData = Object.entries(statusDistribution).map(([name, value]) => ({ name: getStatusText(name), value }));
    const PIE_COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8'];

    setStats({
        kpis,
        trendData: Object.values(trendDataMap).sort((a,b) => new Date(a.date) - new Date(b.date)),
        statusDistribution: pieData.map((entry, index) => ({...entry, fill: PIE_COLORS[index % PIE_COLORS.length]})),
        stalledTicketIds: new Set(stalledTickets.map(t => t.id)),
    });
  };
  
  const handleUserInputChange = (field, value) => { setUserFormData(prev => ({ ...prev, [field]: value })); if (userFormError) setUserFormError(''); };
  const resetUserForm = () => { setUserFormData({ nome: '', email: '', funcao: '', area: '', telefone: '', observacoes: '' }); setUserFormError(''); setEditingUser(null); };
  const handleEditUser = (user) => { setEditingUser(user); setUserFormData({ nome: user.nome || '', email: user.email || '', funcao: user.funcao || '', area: user.area || '', telefone: user.telefone || '', observacoes: user.observacoes || '' }); setShowUserDialog(true); };
  
  const handleUserSubmit = async (e) => {
      e.preventDefault();
      setUserFormLoading(true);
      try {
          if (editingUser) await userService.updateUser(editingUser.id, userFormData);
          else await userService.createUser(userFormData);
          await loadAdminData();
          setShowUserDialog(false);
          resetUserForm();
      } catch (error) { setUserFormError('Erro ao salvar usuário.') } 
      finally { setUserFormLoading(false) }
  };
  
  const handlePasswordReset = async (email) => {
      if (!window.confirm(`Deseja enviar um link de redefinição de senha para ${email}?`)) return;
      try {
          const functions = getFunctions();
          const sendReset = httpsCallable(functions, 'sendPasswordResetEmail');
          await sendReset({ email });
          alert(`E-mail de redefinição enviado para ${email}.`);
      } catch (error) { alert('Erro ao enviar e-mail de redefinição.') }
  };

  const roleOptions = Object.entries(USER_ROLES).map(([key, value]) => ({ value, label: key.charAt(0).toUpperCase() + key.slice(1).toLowerCase() }));
  const areaOptions = Object.entries(AREAS).map(([key, value]) => ({ value, label: value.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) }));

  if (loading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>;

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <div className="container mx-auto px-4 py-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
            <div>
                <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2"><BarChart3 className="h-8 w-8 text-blue-600" />Painel Administrativo</h1>
                <p className="text-gray-600 mt-1">Visão geral da operação. Última atualização: {lastUpdate.toLocaleTimeString()}</p>
            </div>
            <div className="flex items-center gap-2">
                <Input type="date" value={filters.dateRange.from} onChange={e => setFilters({...filters, dateRange: {...filters.dateRange, from: e.target.value}})} className="w-auto"/>
                <Input type="date" value={filters.dateRange.to} onChange={e => setFilters({...filters, dateRange: {...filters.dateRange, to: e.target.value}})} className="w-auto"/>
                <Button onClick={loadAdminData} variant="outline" size="sm"><RefreshCw className="h-4 w-4 mr-2" />Atualizar</Button>
            </div>
        </div>

        <Tabs defaultValue="geral" className="space-y-4">
          <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4">
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
          
          <TabsContent value="extras">{/* ... Conteúdo dos Extras (pode ser adicionado aqui) ... */}</TabsContent>
          
          <TabsContent value="usuarios">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div><CardTitle>Gerenciamento de Usuários</CardTitle><CardDescription>Adicione, edite ou desative usuários do sistema.</CardDescription></div>
                <Dialog open={showUserDialog} onOpenChange={(isOpen) => { if(!isOpen) resetUserForm(); setShowUserDialog(isOpen); }}>
                  <DialogTrigger asChild><Button onClick={() => setShowUserDialog(true)}><Plus className="mr-2 h-4 w-4"/>Novo Usuário</Button></DialogTrigger>
                  <DialogContent>
                    <DialogHeader><DialogTitle>{editingUser ? 'Editar Usuário' : 'Novo Usuário'}</DialogTitle></DialogHeader>
                    <form onSubmit={handleUserSubmit} className="space-y-4 pt-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div><Label>Nome *</Label><Input value={userFormData.nome} onChange={e => handleUserInputChange('nome', e.target.value)} /></div>
                            <div><Label>Email *</Label><Input type="email" value={userFormData.email} onChange={e => handleUserInputChange('email', e.target.value)} /></div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                           <div><Label>Função *</Label><Select value={userFormData.funcao} onValueChange={v => handleUserInputChange('funcao', v)}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{roleOptions.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent></Select></div>
                           <div><Label>Área</Label><Select value={userFormData.area} onValueChange={v => handleUserInputChange('area', v)}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{areaOptions.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent></Select></div>
                        </div>
                         <div><Label>Telefone</Label><Input value={userFormData.telefone} onChange={e => handleUserInputChange('telefone', e.target.value)} /></div>
                         <div><Label>Observações</Label><Input value={userFormData.observacoes} onChange={e => handleUserInputChange('observacoes', e.target.value)} /></div>
                         <DialogFooter><Button type="button" variant="outline" onClick={() => setShowUserDialog(false)}>Cancelar</Button><Button type="submit" disabled={userFormLoading}>{userFormLoading ? <Loader2 className="animate-spin" /> : 'Salvar'}</Button></DialogFooter>
                    </form>
                  </DialogContent>
                </Dialog>
              </CardHeader>
              <CardContent className="space-y-2">
                {allUsers.map(u => (
                  <div key={u.id} className="flex justify-between items-center p-3 border rounded-lg">
                    <div>
                      <p className="font-medium">{u.nome} <Badge className="ml-2" variant="secondary">{u.funcao}</Badge></p>
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
