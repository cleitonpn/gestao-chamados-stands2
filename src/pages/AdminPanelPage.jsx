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
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import Header from '../components/Header';
import * as XLSX from 'xlsx';
// ✅ NOVAS IMPORTAÇÕES PARA O MODAL E CHECKBOX
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { getFunctions, httpsCallable } from 'firebase/functions';

import { 
  BarChart3, Users, FolderOpen, AlertTriangle, Clock, CheckCircle, TrendingUp, Activity,
  Timer, Target, Zap, Calendar, RefreshCw, Building, UserCheck, FilePlus2, DollarSign,
  Eye, UserX, Edit, Filter, X as XIcon, Download, BellRing
} from 'lucide-react';

const AdminPanelPage = () => {
  const { user, userProfile, authInitialized } = useAuth();
  const navigate = useNavigate();
  
  // ... (todos os outros 'useState' hooks permanecem os mesmos)
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lastUpdate, setLastUpdate] = useState(new Date());
  const [allProjects, setAllProjects] = useState([]);
  const [allTickets, setAllTickets] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [filters, setFilters] = useState({ dateRange: { from: '', to: '' } });
  const [stats, setStats] = useState({
    projetos: {}, chamados: {}, performance: {}, alertas: {
      chamadosParadosDetalhes: [], semResponsavelDetalhes: []
    }
  });
  const [selectedExtraTickets, setSelectedExtraTickets] = useState(new Set());

  // ✅ NOVOS ESTADOS PARA O MODAL DE NOTIFICAÇÃO
  const [stalledTicketsToNotify, setStalledTicketsToNotify] = useState(new Set());
  const [isNotifying, setIsNotifying] = useState(false);

  // ... (toda a lógica de useEffect e calculateStatistics permanece a mesma)
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
    if (allProjects.length > 0 || allTickets.length > 0 || allUsers.length > 0) {
      calculateStatistics(allProjects, allTickets, allUsers, filters);
    }
  }, [filters, allProjects, allTickets, allUsers]);

  const loadAdminData = async () => { /* ... sua função existente ... */ };
  const calculateStatistics = (projectsData, ticketsData, usersData, currentFilters) => { /* ... sua função existente ... */ };
  const handleAssignTicket = async (ticketId, operatorId) => { /* ... sua função existente ... */ };
  const handleExportExtras = () => { /* ... sua função existente ... */ };
  const handleMarkAsBilled = async () => { /* ... sua função existente ... */ };
  const handleToggleExtraTicket = (ticketId) => { /* ... sua função existente ... */ };
  const handleEditUser = (userId) => { /* ... sua função existente ... */ };
  const handleDeactivateUser = async (userId, userName) => { /* ... sua função existente ... */ };

  // ✅ NOVA FUNÇÃO PARA SELECIONAR CHAMADOS PARADOS PARA NOTIFICAR
  const handleToggleStalledTicket = (ticketId) => {
    const newSelection = new Set(stalledTicketsToNotify);
    if (newSelection.has(ticketId)) {
        newSelection.delete(ticketId);
    } else {
        newSelection.add(ticketId);
    }
    setStalledTicketsToNotify(newSelection);
  };

  // ✅ NOVA FUNÇÃO PARA ENVIAR AS NOTIFICAÇÕES
  const handleSendStalledNotifications = async () => {
    if (stalledTicketsToNotify.size === 0) {
        alert("Selecione ao menos um chamado para notificar.");
        return;
    }
    setIsNotifying(true);
    try {
        const ticketsToNotify = stats.alertas.chamadosParadosDetalhes
            .filter(ticket => stalledTicketsToNotify.has(ticket.id))
            .map(ticket => ({
                ticketId: ticket.id,
                assigneeId: ticket.atribuidoA
            }))
            .filter(t => t.assigneeId);

        if (ticketsToNotify.length === 0) {
            alert("Nenhum dos chamados selecionados possui um responsável atribuído.");
            return;
        }

        const functions = getFunctions();
        const notifyFunction = httpsCallable(functions, 'notifyStalledTickets');
        const result = await notifyFunction({ tickets: ticketsToNotify });
        
        alert(result.data.message);
        setStalledTicketsToNotify(new Set()); // Limpa a seleção
    } catch (error) {
        console.error("Erro ao notificar:", error);
        alert("Ocorreu um erro ao enviar as notificações.");
    } finally {
        setIsNotifying(false);
    }
  };


  if (loading) { /* ... seu JSX de loading ... */ }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <div className="container mx-auto px-4 py-6">
        {/* ... Header e Filtros ... */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
            {/* ... */}
        </div>
        
        <Card className="mb-6 bg-red-50 border-red-200">
            <CardHeader><CardTitle className="text-red-800 flex items-center gap-2"><AlertTriangle />Alertas Acionáveis</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                
                {/* ✅ CARD DE CHAMADOS PARADOS AGORA É CLICÁVEL E ABRE O MODAL */}
                <Dialog>
                  <DialogTrigger asChild>
                    <Card className="cursor-pointer hover:bg-red-100 transition-colors">
                        <CardHeader><CardTitle className="text-base">Chamados Parados (+24h)</CardTitle></CardHeader>
                        <CardContent><p className="text-3xl font-bold text-red-600">{stats.alertas.chamadosParados}</p></CardContent>
                    </Card>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-[625px]">
                    <DialogHeader>
                      <DialogTitle>Notificar Responsáveis por Chamados Parados</DialogTitle>
                      <CardDescription>Selecione os chamados para os quais deseja enviar um lembrete.</CardDescription>
                    </DialogHeader>
                    <div className="space-y-2 max-h-96 overflow-y-auto my-4 pr-2">
                        {stats.alertas.chamadosParadosDetalhes.map(ticket => (
                            <div key={ticket.id} className="flex items-center space-x-3 p-2 border rounded-md">
                                <Checkbox 
                                  id={`check-${ticket.id}`} 
                                  onCheckedChange={() => handleToggleStalledTicket(ticket.id)}
                                  checked={stalledTicketsToNotify.has(ticket.id)}
                                />
                                <label htmlFor={`check-${ticket.id}`} className="flex-1">
                                    <p className="font-medium">{ticket.titulo}</p>
                                    <p className="text-sm text-gray-500">
                                        Responsável: {allUsers.find(u => u.id === ticket.atribuidoA)?.nome || 'Não atribuído'}
                                    </p>
                                </label>
                            </div>
                        ))}
                    </div>
                    <DialogFooter>
                      <DialogClose asChild>
                          <Button type="button" variant="secondary">Cancelar</Button>
                      </DialogClose>
                      <Button onClick={handleSendStalledNotifications} disabled={isNotifying}>
                        {isNotifying ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <BellRing className="h-4 w-4 mr-2" />}
                        Notificar ({stalledTicketsToNotify.size})
                      </Button>
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

        <Tabs defaultValue="projetos" className="space-y-4">
          {/* ... O resto do seu arquivo, com todas as abas, permanece exatamente o mesmo ... */}
        </Tabs>
      </div>
    </div>
  );
};

export default AdminPanelPage;
