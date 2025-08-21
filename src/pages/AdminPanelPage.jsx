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
  Eye, UserX, Edit, X as XIcon, Download, BellRing, Loader2, KeyRound, Plus, Shield, ExternalLink, ArrowLeft, Mail
} from 'lucide-react';

// NOVO COMPONENTE PARA O POPUP DE VISUALIZAÇÃO RÁPIDA
const TicketDetailView = ({ ticketId, onNavigate }) => {
    const [ticket, setTicket] = useState(null);
    const [project, setProject] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (ticketId) {
            const loadDetails = async () => {
                setLoading(true);
                try {
                    const ticketData = await ticketService.getTicketById(ticketId);
                    setTicket(ticketData);
                    if (ticketData.projetoId) {
                        const projectData = await projectService.getProjectById(ticketData.projetoId);
                        setProject(projectData);
                    }
                } catch (error) {
                    console.error("Erro ao carregar detalhes do chamado:", error);
                } finally {
                    setLoading(false);
                }
            };
            loadDetails();
        }
    }, [ticketId]);

    if (loading) {
        return <div className="flex items-center justify-center p-8"><Loader2 className="h-8 w-8 animate-spin" /></div>;
    }

    if (!ticket) {
        return <div className="p-8 text-center">Não foi possível carregar os detalhes do chamado.</div>;
    }

    return (
        <div>
            <DialogHeader>
                <DialogTitle>Detalhes do Chamado #{ticket.numero || ticketId.slice(-6)}</DialogTitle>
                <DialogDescription>{ticket.titulo}</DialogDescription>
            </DialogHeader>
            <div className="py-4 space-y-4 max-h-[70vh] overflow-y-auto pr-2">
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{ticket.descricao}</p>
                {ticket.imagens && ticket.imagens.length > 0 && (
                    <div>
                        <h4 className="font-semibold mb-2">Imagens:</h4>
                        <div className="grid grid-cols-3 gap-2">
                            {ticket.imagens.map((img, idx) => <a href={img.url} target="_blank" rel="noopener noreferrer" key={idx}><img src={img.url} className="rounded-md object-cover h-24 w-full" /></a>)}
                        </div>
                    </div>
                )}
                <div className="grid grid-cols-2 gap-4 pt-4 border-t">
                    <div><Label>Projeto</Label><p>{project?.nome || 'N/A'}</p></div>
                    <div><Label>Criado por</Label><p>{ticket.criadoPorNome}</p></div>
                    <div><Label>Status</Label><p><Badge>{ticket.status}</Badge></p></div>
                    <div><Label>Prioridade</Label><p><Badge variant="outline">{ticket.prioridade}</Badge></p></div>
                </div>
            </div>
            <DialogFooter>
                <Button variant="outline" onClick={() => onNavigate(`/chamado/${ticketId}`)}>
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Ver Detalhes Completos
                </Button>
            </DialogFooter>
        </div>
    );
};

// Componente para a Central de Chamados Aprimorada com Seleção Múltipla
const TicketCommandCenter = ({ tickets, users, projects, onUpdate, stalledTicketIds, onViewTicket }) => {
    const [filters, setFilters] = useState({ status: '', area: '', priority: '', assigneeId: '', search: '' });
    const [updatingTicketId, setUpdatingTicketId] = useState(null);
    
    // Estados para seleção múltipla
    const [selectedTickets, setSelectedTickets] = useState(new Set());
    const [bulkAction, setBulkAction] = useState('');
    const [bulkValue, setBulkValue] = useState('');
    const [showBulkActions, setShowBulkActions] = useState(false);
    const [processingBulk, setProcessingBulk] = useState(false);

    const handleUpdateTicket = async (ticketId, updateData) => {
        setUpdatingTicketId(ticketId);
        try {
            await ticketService.updateTicket(ticketId, { ...updateData, updatedAt: new Date() });
            onUpdate();
        } catch (error) {
            alert(`Erro ao atualizar o chamado: ${error.message}`);
        } finally {
            setUpdatingTicketId(null);
        }
    };
    
    // CÓDIGO MODIFICADO: Função para abrir e-mail para UM chamado parado
    const handleOpenEmailForSingleTicket = (ticket) => {
        const assignee = users.find(u => u.id === ticket.atribuidoA);
        if (!assignee || !assignee.email) {
            alert("Não foi possível encontrar o e-mail do responsável.");
            return;
        }
        const projectName = projects.find(p => p.id === ticket.projetoId)?.nome || 'N/A';
        const subject = `Aviso: Pendência no Chamado #${ticket.numero || ticket.id.slice(-6)} - "${ticket.titulo}"`;
        const body = `Olá ${assignee.nome},\n\nGostaríamos de pedir sua atenção para o seguinte chamado que está sem atualização há mais de 24 horas:\n\n- Chamado: #${ticket.numero || ticket.id.slice(-6)}\n- Título: ${ticket.titulo}\n- Projeto: ${projectName}\n- Prioridade: ${ticket.prioridade}\n\nPor favor, verifique o status e forneça uma atualização assim que possível.\nVocê pode acessar o chamado aqui: ${window.location.origin}/chamado/${ticket.id}\n\nObrigado,\nEquipe de Administração`;
        const mailtoLink = `mailto:${assignee.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
        window.location.href = mailtoLink;
    };

    // NOVO CÓDIGO: Função para notificação em MASSA por e-mail
    const handleBulkNotifyStalledByEmail = () => {
        // 1. Filtrar apenas os chamados selecionados que estão parados
        const selectedStalledTickets = tickets.filter(t => 
            selectedTickets.has(t.id) && stalledTicketIds.has(t.id)
        );

        if (selectedStalledTickets.length === 0) {
            alert("Nenhum dos chamados selecionados está marcado como 'parado'. A ação não será executada.");
            return;
        }

        // 2. Coletar e-mails únicos dos responsáveis
        const recipients = new Set();
        selectedStalledTickets.forEach(ticket => {
            const assignee = users.find(u => u.id === ticket.atribuidoA);
            if (assignee?.email) {
                recipients.add(assignee.email);
            }
        });

        if (recipients.size === 0) {
            alert("Não foi possível encontrar e-mails para os responsáveis dos chamados selecionados.");
            return;
        }

        // 3. Montar o corpo do e-mail
        const subject = `Aviso: Múltiplos Chamados com Pendências`;
        let body = `Olá equipe,\n\nGostaríamos de pedir atenção para os seguintes chamados que estão sem atualização há mais de 24 horas:\n\n`;

        selectedStalledTickets.forEach(ticket => {
            const projectName = projects.find(p => p.id === ticket.projetoId)?.nome || 'N/A';
            const assigneeName = users.find(u => u.id === ticket.atribuidoA)?.nome || 'Não atribuído';
            const link = `${window.location.origin}/chamado/${ticket.id}`;
            
            body += `--------------------------------------------------\n`;
            body += `Chamado: #${ticket.numero || ticket.id.slice(-6)} - ${ticket.titulo}\n`;
            body += `Projeto: ${projectName}\n`;
            body += `Responsável: ${assigneeName}\n`;
            body += `Link: ${link}\n\n`;
        });
        
        body += `Por favor, verifiquem o status e forneçam uma atualização assim que possível.\n\nObrigado,\nEquipe de Administração`;
        
        // 4. Montar e abrir o link mailto
        const mailtoLink = `mailto:${Array.from(recipients).join(',')}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
        window.location.href = mailtoLink;
    };


    // Funções para seleção múltipla
    const handleSelectTicket = (ticketId) => {
        const newSelection = new Set(selectedTickets);
        if (newSelection.has(ticketId)) {
            newSelection.delete(ticketId);
        } else {
            newSelection.add(ticketId);
        }
        setSelectedTickets(newSelection);
        setShowBulkActions(newSelection.size > 0);
    };

    const handleSelectAll = () => {
        if (selectedTickets.size === filteredTickets.length) {
            setSelectedTickets(new Set());
            setShowBulkActions(false);
        } else {
            setSelectedTickets(new Set(filteredTickets.map(t => t.id)));
            setShowBulkActions(true);
        }
    };

    const handleBulkAction = async () => {
        if (!bulkAction || !bulkValue || selectedTickets.size === 0) {
            alert('Selecione uma ação e um valor para aplicar em massa.');
            return;
        }
        if (!window.confirm(`Tem certeza que deseja aplicar esta ação a ${selectedTickets.size} chamado(s)?`)) return;

        setProcessingBulk(true);
        try {
            const updateData = { [bulkAction]: bulkValue, updatedAt: new Date() };
            const ticketIds = Array.from(selectedTickets);
            const batchSize = 10;
            for (let i = 0; i < ticketIds.length; i += batchSize) {
                const batch = ticketIds.slice(i, i + batchSize);
                await Promise.all(batch.map(ticketId => ticketService.updateTicket(ticketId, updateData)));
            }
            alert(`${selectedTickets.size} chamado(s) atualizado(s) com sucesso!`);
            setSelectedTickets(new Set());
            setShowBulkActions(false);
            setBulkAction('');
            setBulkValue('');
            onUpdate();
        } catch (error) {
            alert(`Erro ao atualizar chamados: ${error.message}`);
        } finally {
            setProcessingBulk(false);
        }
    };

    const getStatusText = (status) => ({ 'aberto': 'Aberto', 'em_tratativa': 'Em Tratativa', 'concluido': 'Concluído', 'cancelado': 'Cancelado', 'arquivado': 'Arquivado', 'devolvido': 'Devolvido', 'aguardando_aprovacao': 'Aguardando Aprovação' }[status] || status);

    const filteredTickets = useMemo(() => {
        return tickets.filter(ticket => {
            const ticketProject = projects.find(p => p.id === ticket.projetoId);
            const searchText = filters.search.toLowerCase();
            const searchMatch = filters.search ? (ticket.titulo.toLowerCase().includes(searchText) || (ticketProject?.nome || '').toLowerCase().includes(searchText) || (ticket.numero?.toString() || '').includes(searchText)) : true;
            return searchMatch && (!filters.status || ticket.status === filters.status) && (!filters.area || ticket.area === filters.area) && (!filters.priority || ticket.prioridade === filters.priority) && (!filters.assigneeId || ticket.atribuidoA === filters.assigneeId);
        });
    }, [tickets, projects, filters]);

    const statusOptions = [...new Set(tickets.map(t => t.status))].map(s => ({ value: s, label: getStatusText(s) }));
    const areaOptions = Object.values(AREAS).map(area => ({ value: area, label: area.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) }));
    const priorityOptions = Object.values(PRIORITIES).map(prio => ({ value: prio, label: prio.charAt(0).toUpperCase() + prio.slice(1) }));
    const userOptions = users.map(u => ({ value: u.id, label: u.nome }));
    
    // NOVO CÓDIGO: Contagem de chamados parados entre os selecionados
    const selectedStalledCount = useMemo(() => (
        Array.from(selectedTickets).filter(id => stalledTicketIds.has(id)).length
    ), [selectedTickets, stalledTicketIds]);

    return (
        <Card>
            <CardHeader>
                <CardTitle>Central de Comando de Chamados</CardTitle>
                <CardDescription>Filtre, visualize e gerencie todos os chamados em um só lugar.</CardDescription>
            </CardHeader>
            <CardContent>
                {/* Filtros */}
                <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-4 p-4 border rounded-lg">
                    <Input placeholder="Buscar por título, projeto, nº..." value={filters.search} onChange={e => setFilters({...filters, search: e.target.value})} />
                    <Select value={filters.status} onValueChange={v => setFilters({...filters, status: v})}><SelectTrigger><SelectValue placeholder="Filtrar por Status" /></SelectTrigger><SelectContent>{statusOptions.map(opt => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}</SelectContent></Select>
                    <Select value={filters.area} onValueChange={v => setFilters({...filters, area: v})}><SelectTrigger><SelectValue placeholder="Filtrar por Área" /></SelectTrigger><SelectContent>{areaOptions.map(opt => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}</SelectContent></Select>
                    <Select value={filters.priority} onValueChange={v => setFilters({...filters, priority: v})}><SelectTrigger><SelectValue placeholder="Filtrar por Prioridade" /></SelectTrigger><SelectContent>{priorityOptions.map(opt => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}</SelectContent></Select>
                    <Select value={filters.assigneeId} onValueChange={v => setFilters({...filters, assigneeId: v})}><SelectTrigger><SelectValue placeholder="Filtrar por Responsável" /></SelectTrigger><SelectContent>{userOptions.map(opt => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}</SelectContent></Select>
                </div>

                {/* Ações em Massa */}
                {showBulkActions && (
                    <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg space-y-4">
                        <div className="flex items-center justify-between">
                            <h3 className="font-semibold text-blue-900">Ações em Massa ({selectedTickets.size} selecionado{selectedTickets.size !== 1 ? 's' : ''})</h3>
                            <Button variant="ghost" size="sm" onClick={() => { setSelectedTickets(new Set()); setShowBulkActions(false); }}><XIcon className="h-4 w-4" /></Button>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                            <Select value={bulkAction} onValueChange={setBulkAction}><SelectTrigger><SelectValue placeholder="Selecionar ação..." /></SelectTrigger><SelectContent><SelectItem value="status">Alterar Status</SelectItem><SelectItem value="prioridade">Alterar Prioridade</SelectItem><SelectItem value="atribuidoA">Atribuir Responsável</SelectItem></SelectContent></Select>
                            {bulkAction === 'status' && (<Select value={bulkValue} onValueChange={setBulkValue}><SelectTrigger><SelectValue placeholder="Novo status..." /></SelectTrigger><SelectContent>{statusOptions.map(opt => (<SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>))}</SelectContent></Select>)}
                            {bulkAction === 'prioridade' && (<Select value={bulkValue} onValueChange={setBulkValue}><SelectTrigger><SelectValue placeholder="Nova prioridade..." /></SelectTrigger><SelectContent>{priorityOptions.map(opt => (<SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>))}</SelectContent></Select>)}
                            {bulkAction === 'atribuidoA' && (<Select value={bulkValue} onValueChange={setBulkValue}><SelectTrigger><SelectValue placeholder="Novo responsável..." /></SelectTrigger><SelectContent>{userOptions.map(opt => (<SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>))}</SelectContent></Select>)}
                            <Button onClick={handleBulkAction} disabled={!bulkAction || !bulkValue || processingBulk} className="bg-blue-600 hover:bg-blue-700">{processingBulk ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle className="h-4 w-4 mr-2" />}Aplicar</Button>
                        </div>
                        {/* NOVO CÓDIGO: Div para o botão de notificação em massa */}
                        <div className="pt-3 border-t border-blue-200">
                             <Button 
                                onClick={handleBulkNotifyStalledByEmail} 
                                disabled={selectedStalledCount === 0 || processingBulk}
                                variant="destructive"
                                className="w-full md:w-auto"
                             >
                                <Mail className="h-4 w-4 mr-2" />
                                Notificar por E-mail ({selectedStalledCount} Parado{selectedStalledCount !== 1 ? 's' : ''})
                            </Button>
                        </div>
                    </div>
                )}

                {/* Tabela de Chamados */}
                <div className="max-h-[600px] overflow-auto">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-12"><Checkbox checked={selectedTickets.size === filteredTickets.length && filteredTickets.length > 0} onCheckedChange={handleSelectAll} title="Selecionar todos" /></TableHead>
                                <TableHead className="w-[35%]">Chamado</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Responsável</TableHead>
                                <TableHead>Prioridade</TableHead>
                                <TableHead className="text-center">Ações</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredTickets.map(ticket => {
                                const isStalled = stalledTicketIds.has(ticket.id);
                                const isSelected = selectedTickets.has(ticket.id);
                                return (
                                <TableRow key={ticket.id} className={`${isStalled ? "bg-red-50" : ""} ${isSelected ? "bg-blue-50" : ""}`}>
                                    <TableCell><Checkbox checked={isSelected} onCheckedChange={() => handleSelectTicket(ticket.id)} /></TableCell>
                                    <TableCell>
                                        <p className="font-medium truncate" title={ticket.titulo}>{ticket.titulo}</p>
                                        <div className="flex items-center gap-2">
                                            <p className="text-xs text-gray-500">{projects.find(p => p.id === ticket.projetoId)?.nome || 'N/A'}</p>
                                            {isStalled && <AlertTriangle className="h-4 w-4 text-red-500" title="Chamado parado há mais de 24h"/>}
                                        </div>
                                    </TableCell>
                                    <TableCell><Select value={ticket.status || ''} onValueChange={v => handleUpdateTicket(ticket.id, { status: v })} disabled={updatingTicketId === ticket.id}><SelectTrigger className="h-8 text-xs"/><SelectContent>{statusOptions.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent></Select></TableCell>
                                    <TableCell><Select value={ticket.atribuidoA || ''} onValueChange={v => handleUpdateTicket(ticket.id, { atribuidoA: v })} disabled={updatingTicketId === ticket.id}><SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Atribuir..."/></SelectTrigger><SelectContent>{userOptions.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent></Select></TableCell>
                                    <TableCell><Select value={ticket.prioridade || ''} onValueChange={v => handleUpdateTicket(ticket.id, { prioridade: v })} disabled={updatingTicketId === ticket.id}><SelectTrigger className="h-8 text-xs"/><SelectContent>{priorityOptions.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent></Select></TableCell>
                                    <TableCell className="flex items-center justify-center gap-1">
                                        {updatingTicketId === ticket.id ? <Loader2 className="h-4 w-4 animate-spin"/> : <>
                                            <Button variant="ghost" size="icon" onClick={() => onViewTicket(ticket.id)} title="Ver Detalhes"><Eye className="h-4 w-4"/></Button>
                                            {/* CÓDIGO MODIFICADO: Botão de sino agora abre e-mail para um único chamado */}
                                            <Button variant="ghost" size="icon" onClick={() => handleOpenEmailForSingleTicket(ticket)} disabled={!isStalled || !ticket.atribuidoA} title="Notificar Responsável por E-mail">
                                                <BellRing className={`h-4 w-4 ${isStalled && "text-red-500"}`}/>
                                            </Button>
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

// ... O RESTANTE DO COMPONENTE AdminPanelPage CONTINUA EXATAMENTE IGUAL ...
// ... NÃO HÁ MUDANÇAS DAQUI PARA BAIXO. APENAS COLE O CÓDIGO INTEIRO.
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
  const [stats, setStats] = useState({ kpis: {}, trendData: [], statusDistribution: [], stalledTicketIds: new Set(), extraTickets: [] });
  
  const [selectedExtraTickets, setSelectedExtraTickets] = useState(new Set());
  
  const [viewingTicketId, setViewingTicketId] = useState(null);
  
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
    const extraTickets = filteredTickets.filter(t => t.isExtra === true);

    setStats({
        kpis,
        trendData: Object.values(trendDataMap).sort((a,b) => new Date(a.date) - new Date(b.date)),
        statusDistribution: pieData.map((entry, index) => ({...entry, fill: PIE_COLORS[index % PIE_COLORS.length]})),
        stalledTicketIds: new Set(stalledTickets.map(t => t.id)),
        extraTickets: extraTickets,
    });
  };
  
  const handleToggleExtraTicket = (ticketId) => {
    const newSelection = new Set(selectedExtraTickets);
    if (newSelection.has(ticketId)) newSelection.delete(ticketId);
    else newSelection.add(ticketId);
    setSelectedExtraTickets(newSelection);
  };
  
  const handleExportExtras = () => {
    const dataToExport = stats.extraTickets.filter(ticket => selectedExtraTickets.has(ticket.id))
        .map(ticket => ({
            'ID Chamado': ticket.id, 'Título': ticket.titulo,
            'Projeto': allProjects.find(p => p.id === ticket.projetoId)?.nome || 'N/A',
            'Motivo Extra': ticket.motivoExtra,
            'Criado Em': ticket.createdAt?.toDate().toLocaleDateString('pt-BR'),
            'Faturado': ticket.faturado ? 'Sim' : 'Não'
        }));
    if (dataToExport.length === 0) return alert("Selecione ao menos um chamado extra para exportar.");
    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Chamados Extras");
    XLSX.writeFile(workbook, `Relatorio_Extras_${new Date().toISOString().split('T')[0]}.xlsx`);
  };
  
  const handleMarkAsBilled = async () => {
    if (selectedExtraTickets.size === 0) return alert("Selecione ao menos um chamado para marcar como faturado.");
    if (!window.confirm(`Tem certeza que deseja marcar ${selectedExtraTickets.size} chamado(s) como faturado(s)?`)) return;
    try {
        await Promise.all(Array.from(selectedExtraTickets).map(ticketId => ticketService.updateTicket(ticketId, { faturado: true })));
        alert("Chamados marcados como faturados!");
        setSelectedExtraTickets(new Set());
        loadAdminData();
    } catch (error) { alert("Ocorreu um erro.") }
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
            <div className="flex items-center gap-4">
                <Button variant="outline" onClick={() => navigate('/dashboard')} className="flex items-center gap-2"><ArrowLeft className="h-4 w-4" />Dashboard</Button>
                <div>
                    <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2"><BarChart3 className="h-8 w-8 text-blue-600" />Painel Administrativo</h1>
                    <p className="text-gray-600 mt-1">Visão geral da operação. Última atualização: {lastUpdate.toLocaleTimeString()}</p>
                </div>
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
             <TicketCommandCenter tickets={allTickets} users={allUsers} projects={allProjects} onUpdate={loadAdminData} stalledTicketIds={stats.stalledTicketIds} onViewTicket={setViewingTicketId} />
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
                <CardDescription>Total de {stats.extraTickets.length || 0} chamados extras no período. Selecione para realizar ações.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {stats.extraTickets.map(ticket => (
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
              <CardHeader className="flex flex-row items-center justify-between">
                <div><CardTitle>Gerenciamento de Usuários</CardTitle><CardDescription>Adicione, edite ou desative usuários do sistema.</CardDescription></div>
                <Dialog open={showUserDialog} onOpenChange={(isOpen) => { if(!isOpen) resetUserForm(); setShowUserDialog(isOpen); }}>
                  <DialogTrigger asChild><Button onClick={() => setShowUserDialog(true)}><Plus className="mr-2 h-4 w-4"/>Novo Usuário</Button></DialogTrigger>
                  <DialogContent className="sm:max-w-2xl">
                    <DialogHeader><DialogTitle>{editingUser ? 'Editar Usuário' : 'Novo Usuário'}</DialogTitle></DialogHeader>
                    <form onSubmit={handleUserSubmit} className="space-y-4 pt-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div><Label>Nome *</Label><Input value={userFormData.nome} onChange={e => handleUserInputChange('nome', e.target.value)} /></div>
                            <div><Label>Email *</Label><Input type="email" value={userFormData.email} onChange={e => handleUserInputChange('email', e.target.value)} /></div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                           <div><Label>Função *</Label><Select value={userFormData.funcao} onValueChange={v => handleUserInputChange('funcao', v)}><SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger><SelectContent>{roleOptions.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent></Select></div>
                           <div><Label>Área</Label><Select value={userFormData.area} onValueChange={v => handleUserInputChange('area', v)}><SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger><SelectContent>{areaOptions.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent></Select></div>
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

        <Dialog open={!!viewingTicketId} onOpenChange={(isOpen) => { if (!isOpen) setViewingTicketId(null) }}>
            <DialogContent className="sm:max-w-2xl">
                {viewingTicketId && <TicketDetailView ticketId={viewingTicketId} onNavigate={navigate}/>}
            </DialogContent>
        </Dialog>
      </div>
    </div>
  );
};

export default AdminPanelPage;
