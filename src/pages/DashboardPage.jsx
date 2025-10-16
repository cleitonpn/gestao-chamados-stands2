import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate, useLocation } from 'react-router-dom';
import { projectService } from '../services/projectService';
import { ticketService } from '../services/ticketService';
import { userService } from '../services/userService';
import notificationService from '../services/notificationService';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

import NotificationCenter from '../components/NotificationCenter';

import {
  LogOut, Plus, AlertCircle, Clock, CheckCircle, Users, FolderOpen, BarChart3,
  Menu, X, Calendar, ChevronDown, ChevronRight, BellRing, ArrowUp, Hourglass,
  User as UserIcon, FileText, Eye, Filter, Archive, List as ListIcon, LayoutGrid, Lock,
  SlidersHorizontal, Trophy, BookOpen
} from 'lucide-react';

const LOCAL_STORAGE_FILTERS_KEY = 'dashboard_saved_filters_v2';

const DashboardPage = () => {
  const { user, userProfile, logout, authInitialized } = useAuth();
  // ---- Papel do usuário / função/área ----
  const _roleRaw = (userProfile?.funcao || userProfile?.role || userProfile?.area || '').toString();
  const _role = _roleRaw.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const isEmpreiteiro = _role === 'empreiteiro' || _role === 'empreiteira' || _role === 'contractor';
  const isGerente = _role === 'gerente' || _role === 'manager';
  const isAdmin = _role === 'administrador' || _role === 'admin';

  const navigate = useNavigate();

  // --------- Estado base (regras de negócio intactas) ---------
  const [tickets, setTickets] = useState([]);
  const [projects, setProjects] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [expandedProjects, setExpandedProjects] = useState({});
  const [ticketNotifications, setTicketNotifications] = useState({});
  const [selectedTickets, setSelectedTickets] = useState(new Set());
  const [bulkActionMode, setBulkActionMode] = useState(false);
  const [bulkActionLoading, setBulkActionLoading] = useState(false);
  const [activeFilter, setActiveFilter] = useState('todos');

  // --------- Novos estados de UI ---------
  const [projectMeta, setProjectMeta] = useState({}); // { [id]: {nome, feira} }
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedEvent, setSelectedEvent] = useState('todos');
  const [sortBy, setSortBy] = useState('updatedAtDesc'); // updatedAtDesc | priority | status
  const [selectedStatuses, setSelectedStatuses] = useState(new Set());
  const [selectedAreas, setSelectedAreas] = useState(new Set());
  const [selectedPriorities, setSelectedPriorities] = useState(new Set());
  const [viewMode, setViewMode] = useState('list'); // mobile = list; desktop pode alternar
  const [savedFilters, setSavedFilters] = useState([]);
  const [selectedProjectIds, setSelectedProjectIds] = useState([]);
  const clearAllFilters = () => {
    setActiveFilter('todos');
    setSelectedEvent('todos');
    setSelectedStatuses(new Set());
    setSelectedAreas(new Set());
    setSelectedPriorities(new Set());
    setSearchTerm('');
    setSelectedProjectIds([]);
    try { navigate({ pathname: location.pathname, search: '' }, { replace: true }); } catch {}
  };

  // controle de filtros: no desktop é Dialog; no mobile é painel expansível
  const [filtersOpen, setFiltersOpen] = useState(false);            // desktop Dialog
  const [showMobileFilters, setShowMobileFilters] = useState(false); // mobile painel

  // breakpoint
  const [isMobile, setIsMobile] = useState(false);
  const location = useLocation();
  useEffect(() => {
    const apply = () => {
      const m = window.innerWidth < 1024; // <lg
      setIsMobile(m);
      if (m) setViewMode('cards'); // mobile começa em CARDS
    };
    apply();
    window.addEventListener('resize', apply);
    return () => window.removeEventListener('resize', apply);
  }, []);

  // Aplicar filtros vindos por parâmetros da URL (ex.: ?projectId=123&projectName=ABC)
  useEffect(() => {
    const params = new URLSearchParams(location.search || '');
    const pid = params.get('projectId') || params.get('projetoId') || params.get('project') || params.get('projeto');
    const pname = params.get('projectName') || params.get('nome') || params.get('name');
    if (pid) {
      setSelectedProjectIds([pid]);
    } else {
      setSelectedProjectIds([]);
    }
    if (pname && !pid) {
      setSearchTerm(pname);
    }
  }, [location.search]);

  // --------- Utilidades (regras de negócio intactas) ---------
  const isActiveTicket = (t) => !['concluido','cancelado','arquivado'].includes(t.status);
  const ticketHasAnyProject = (t, ids) => {
    if (!ids || ids.length === 0) return false;
    if (Array.isArray(t.projetos) && t.projetos.length) return t.projetos.some(id => ids.includes(id));
    if (t.projetoId) return ids.includes(t.projetoId);
    return false;
  };
  const getProjectLabel = (projetoId) => {
    const meta = projectMeta[projetoId];
    if (!meta) return 'Projeto não encontrado – Sem Evento';
    const evento = meta.feira || 'Sem Evento';
    return `${meta.nome} – ${evento}`;
  };

  // --------- Listas derivadas ---------
  const allEvents = useMemo(() => {
    const names = new Set();
    projects.forEach(p => p?.feira && names.add(p.feira));
    return Array.from(names).sort();
  }, [projects]);

  const allStatuses = useMemo(() => {
    const st = new Set();
    tickets.forEach(t => t?.status && st.add(t.status));
    return Array.from(st).sort();
  }, [tickets]);

  const allAreas = useMemo(() => {
    const ar = new Set();
    tickets.forEach(t => t?.area && ar.add(t.area));
    return Array.from(ar).sort();
  }, [tickets]);

  const allPriorities = ['alta', 'media', 'baixa'];

  // --------- Notificações (mantido) ---------
  const loadTicketNotifications = async () => {
    if (!user?.uid || !tickets.length) return;
    try {
      const notificationCounts = {};
      for (const ticket of tickets) {
        try {
          const count = await notificationService.getUnreadNotificationsByTicket(user.uid, ticket.id);
          if (count > 0) notificationCounts[ticket.id] = count;
        } catch (e) {
          console.warn(`Erro ao carregar notificações do chamado ${ticket.id}`, e);
        }
      }
      setTicketNotifications(notificationCounts);
    } catch (error) {
      console.error('Erro ao carregar notificações:', error);
      setTicketNotifications({});
    }
  };

  useEffect(() => {
    if (tickets.length > 0 && user?.uid) {
      const unsubscribe = notificationService.subscribeToNotifications(user.uid, (allNotifications) => {
        const counts = {};
        allNotifications.forEach(notification => {
          if (notification.ticketId && !notification.lida) {
            counts[notification.ticketId] = (counts[notification.ticketId] || 0) + 1;
          }
        });
        setTicketNotifications(counts);
      });
      return () => unsubscribe && unsubscribe();
    }
  }, [tickets, user?.uid]);

  // --------- Carregamento de dados (regras intactas) ---------
  useEffect(() => {
    if (authInitialized && user && userProfile && user.uid) {
      loadDashboardData();
      const intervalId = setInterval(loadDashboardData, 3 * 60 * 1000);
      return () => clearInterval(intervalId);
    } else if (authInitialized && !user) {
      navigate('/login');
    } else if (authInitialized && user && !userProfile) {
      setLoading(false);
    }
  }, [user, userProfile, authInitialized, navigate]);

  const loadDashboardData = async () => {
    try {
      setLoading(true);

      const filterConfidential = (ticket) => {
        const isConfidential = ticket.isConfidential || ticket.confidencial;
        if (!isConfidential) return true;
        const isCreator = ticket.criadoPor === user.uid;
        the: {
        }
        const isAdmin = userProfile?.funcao === 'administrador';
        const isOperatorOfArea =
          userProfile?.funcao === 'operador' && (
            ticket.area === userProfile?.area ||
            ticket.areaDeOrigem === userProfile?.area ||
            ticket.areaInicial === userProfile?.area ||
            ticket.areaOriginal === userProfile?.area
          );
        const isManager = userProfile?.funcao === 'gerente';
        return isCreator || isAdmin || isOperatorOfArea || isManager;
      };

      if (userProfile?.funcao === 'administrador') {
        const [allProjects, allTickets, allUsers] = await Promise.all([
          projectService.getAllProjects(),
          ticketService.getAllTickets(),
          userService.getAllUsers()
        ]);
        setProjects(allProjects); setTickets(allTickets); setUsers(allUsers);
        const meta = {}; allProjects.forEach(p => { meta[p.id] = { nome: p.nome, feira: p.feira || '' }; });
        setProjectMeta(meta);

      } else if (userProfile?.funcao === 'produtor') {
        const [allProjects, allTickets, allUsers] = await Promise.all([
          projectService.getAllProjects(),
          ticketService.getAllTickets(),
          userService.getAllUsers()
        ]);
        const myProjects = allProjects.filter(p => p.produtorId === user.uid);
        const ids = myProjects.map(p => p.id);
        const myTickets = allTickets.filter(t => ticketHasAnyProject(t, ids) && isActiveTicket(t) && filterConfidential(t));
        setProjects(myProjects); setTickets(myTickets); setUsers(allUsers);
        const meta = {}; myProjects.forEach(p => { meta[p.id] = { nome: p.nome, feira: p.feira || '' }; }); setProjectMeta(meta);

      } else if (userProfile?.funcao === 'consultor') {
        const [allProjects, allTickets, allUsers] = await Promise.all([
          projectService.getAllProjects(),
          ticketService.getAllTickets(),
          userService.getAllUsers()
        ]);
        const myProjects = allProjects.filter(p => p.consultorId === user.uid);
        const ids = myProjects.map(p => p.id);
        const myTickets = allTickets.filter(t => ticketHasAnyProject(t, ids) && isActiveTicket(t) && filterConfidential(t));
        setProjects(myProjects); setTickets(myTickets); setUsers(allUsers);
        const meta = {}; allProjects.forEach(p => { meta[p.id] = { nome: p.nome, feira: p.feira || '' }; }); setProjectMeta(meta);

      } else if (userProfile?.funcao === 'operador') {
        const [allProjects, allTickets, allUsers] = await Promise.all([
          projectService.getAllProjects(),
          ticketService.getAllTickets(),
          userService.getAllUsers()
        ]);
        const areaOp = userProfile.area;
        const operatorTickets = allTickets.filter(t => {
          const atual = t.area === areaOp;
          const origem = t.areaDeOrigem === areaOp || t.areaInicial === areaOp || t.areaOriginal === areaOp;
          const destino = t.areaDestino === areaOp;
          const devolvido = t.status === 'enviado_para_area' && (t.area === areaOp || t.areaDeOrigem === areaOp);
          const rejeitou = t.areaQueRejeitou === areaOp;
          const envolvido = Array.isArray(t.areasEnvolvidas) && t.areasEnvolvidas.includes(areaOp);
          const atribuido = t.atribuidoA === user.uid;
          const abertoPeloUsuario = t.criadoPor === user.uid;
          const escaladoParaArea = t.status === 'escalado_para_outra_area' && t.areaEscalada === areaOp;
          const transferidoParaArea = t.status === 'transferido_para_area' && t.areaDestino === areaOp;
          const precisaFinanceiro = areaOp === 'financeiro' && (
            t.tipo === 'despesas_programada' || t.tipo === 'despesas_nao_programadas' ||
            t.area === 'financeiro' || t.areaDeOrigem === 'financeiro' || t.gerenciaDestino === 'gerente_financeiro'
          );
          return (atual || origem || destino || devolvido || rejeitou || envolvido ||
            atribuido || abertoPeloUsuario || escaladoParaArea ||
            transferidoParaArea || precisaFinanceiro) && filterConfidential(t);
        });
        setProjects(allProjects); setTickets(operatorTickets); setUsers(allUsers);
        const meta = {}; allProjects.forEach(p => { meta[p.id] = { nome: p.nome, feira: p.feira || '' }; }); setProjectMeta(meta);

      } else if (userProfile?.funcao === 'gerente') {
        const [allProjects, allTickets, allUsers] = await Promise.all([
          projectService.getAllProjects(),
          ticketService.getAllTickets(),
          userService.getAllUsers()
        ]);
        setProjects(allProjects); setTickets(allTickets); setUsers(allUsers);
        const meta = {}; allProjects.forEach(p => { meta[p.id] = { nome: p.nome, feira: p.feira || '' }; }); setProjectMeta(meta);

      } else {
        const [allProjects, userTickets, allUsers] = await Promise.all([
          projectService.getAllProjects(),
          ticketService.getTicketsByUser(user.uid),
          userService.getAllUsers()
        ]);
        setProjects(allProjects); setTickets(userTickets); setUsers(allUsers);
        const meta = {}; allProjects.forEach(p => { meta[p.id] = { nome: p.nome, feira: p.feira || '' }; }); setProjectMeta(meta);
      }
    } catch (error) {
      console.error('Erro ao carregar dados do dashboard:', error);
      setProjects([]); setTickets([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadTicketNotifications(); }, [tickets]);

  // --------- Filtros salvos ---------
  useEffect(() => {
    try {
      const stored = localStorage.getItem(LOCAL_STORAGE_FILTERS_KEY);
      if (stored) setSavedFilters(JSON.parse(stored));
    } catch {}
  }, []);
  const persistSavedFilters = (list) => {
    setSavedFilters(list);
    try { localStorage.setItem(LOCAL_STORAGE_FILTERS_KEY, JSON.stringify(list)); } catch {}
  };
  const saveCurrentFilterCombination = () => {
    const name = window.prompt('Nome para este filtro:');
    if (!name) return;
    const data = {
      activeFilter, selectedEvent, searchTerm, sortBy,
      selectedStatuses: Array.from(selectedStatuses),
      selectedAreas: Array.from(selectedAreas),
      selectedPriorities: Array.from(selectedPriorities),
    };
    const next = [...savedFilters.filter(f => f.name !== name), { name, data }];
    persistSavedFilters(next);
  };
  const applySavedFilterByName = (name) => {
    const item = savedFilters.find(f => f.name === name);
    if (!item) return;
    const d = item.data || {};
    setActiveFilter(d.activeFilter ?? 'todos');
    setSelectedEvent(d.selectedEvent ?? 'todos');
    setSearchTerm(d.searchTerm ?? '');
    setSortBy(d.sortBy ?? 'updatedAtDesc');
    setSelectedStatuses(new Set(d.selectedStatuses ?? []));
    setSelectedAreas(new Set(d.selectedAreas ?? []));
    setSelectedPriorities(new Set(d.selectedPriorities ?? []));
    setFiltersOpen(false);
    setShowMobileFilters(false);
  };
  const deleteSavedFilterByName = (name) => {
    persistSavedFilters(savedFilters.filter(f => f.name !== name));
  };

  // --------- Aparência ---------
  const getStatusColor = (status) => {
    const colors = {
      'aberto': 'bg-blue-100 text-blue-800',
      'em_tratativa': 'bg-yellow-100 text-yellow-800',
      'em_execucao': 'bg-blue-100 text-blue-800',
      'enviado_para_area': 'bg-purple-100 text-purple-800',
      'escalado_para_area': 'bg-purple-100 text-purple-800',
      'aguardando_aprovacao': 'bg-orange-100 text-orange-800',
      'executado_aguardando_validacao': 'bg-indigo-100 text-indigo-800',
      'executado_aguardando_validacao_operador': 'bg-indigo-100 text-indigo-800',
      'concluido': 'bg-green-100 text-green-800',
      'cancelado': 'bg-red-100 text-red-800',
      'devolvido': 'bg-pink-100 text-pink-800',
      'arquivado': 'bg-gray-100 text-gray-700'
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };
  const getPriorityColor = (priority) => {
    const colors = { 'baixa': 'bg-green-100 text-green-800', 'media': 'bg-yellow-100 text-yellow-800', 'alta': 'bg-red-100 text-red-800' };
    return colors[priority] || 'bg-gray-100 text-gray-800';
  };
  const handleTicketSelect = (ticketId, checked) => {
    const next = new Set(selectedTickets);
    if (checked) next.add(ticketId);
    else next.delete(ticketId);
    setSelectedTickets(next);
  };

  // --------- Ordenação e filtros ---------
  const priorityOrder = { 'alta': 3, 'media': 2, 'baixa': 1 };
  const statusOrder = {
    'aberto': 1, 'em_tratativa': 2, 'em_execucao': 3,
    'executado_aguardando_validacao': 4, 'executado_aguardando_validacao_operador': 5,
    'aguardando_aprovacao': 6, 'enviado_para_area': 7, 'escalado_para_area': 8, 'escalado_para_outra_area': 9,
    'devolvido': 10, 'concluido': 98, 'cancelado': 99, 'arquivado': 100
  };
  const getUpdatedDate = (t) => t.arquivadoEm?.toDate?.() || t.dataUltimaAtualizacao?.toDate?.() || t.createdAt?.toDate?.() || new Date(0);

  
  // --- Busca por ID (#...) util & submit handler ---
  const getSearchIdCandidate = (s) => (s || '').trim().replace(/^#/, '');

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    const raw = (searchTerm || '').trim();
    if (!raw) return;
    const idCandidate = getSearchIdCandidate(raw).toLowerCase();
    const exact = tickets.find(t => ((t.id || '').toString().toLowerCase() === idCandidate));
    if (exact) {
      navigate(`/chamado/${exact.id}`);
      return;
    }
    const partial = tickets.filter(t => ((t.id || '').toString().toLowerCase().includes(idCandidate)));
    if (partial.length === 1) {
      navigate(`/chamado/${partial[0].id}`);
    }
  };

  const getFilteredTickets = () => {
    let base = [];
    if (activeFilter === 'arquivados') {
      base = tickets.filter(t => t.status === 'arquivado');
    } else {
      base = tickets.filter(t => t.status !== 'arquivado');
      switch (activeFilter) {
        case 'com_notificacao': base = base.filter(t => ticketNotifications[t.id]); break;
        case 'sem_tratativa': base = base.filter(t => t.status === 'aberto'); break;
        case 'em_tratativa': base = base.filter(t => t.status === 'em_tratativa'); break;
        case 'em_execucao': base = base.filter(t => t.status === 'em_execucao'); break;
        case 'escalado':
          base = base.filter(t => t.status === 'enviado_para_area' || t.status === 'escalado_para_area'); break;
        case 'escalado_para_mim':
          base = base.filter(t => {
            if (t.status === 'escalado_para_outra_area') {
              if (t.areaEscalada === userProfile?.area) return true;
              if (t.usuarioEscalado === user?.uid || t.usuarioEscalado === userProfile?.email || t.usuarioEscalado === userProfile?.nome) return true;
              if (t.areasEnvolvidas && t.areasEnvolvidas.includes(userProfile?.area)) return true;
            }
            return false;
          });
          break;
        case 'aguardando_validacao':
          base = base.filter(t => t.status === 'executado_aguardando_validacao' || t.status === 'executado_aguardando_validacao_operador'); break;
        case 'concluidos': base = base.filter(t => t.status === 'concluido'); break;
        case 'aguardando_aprovacao': base = base.filter(t => t.status === 'aguardando_aprovacao'); break;
        default: break;
      }
    }

    // Busca por título/descrição e também por ID do chamado (#ABC123... ou parcial)
    const norm = (s) => (s || '').toString().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const term = norm(searchTerm || '');
    if (searchTerm && searchTerm.trim()) {
      const raw = (searchTerm || '').trim();
      const idCandidateRaw = getSearchIdCandidate(raw);
      const idCandidate = idCandidateRaw.toLowerCase();
      const looksLikeId = raw.startsWith('#') || (/^[A-Za-z0-9_-]{6,}$/.test(idCandidateRaw));

      base = base.filter(t => {
        const byId = looksLikeId ? ((t.id || '').toString().toLowerCase().includes(idCandidate)) : false;

        const titulo = norm(t.titulo);
        const descricao = norm(t.descricao);
        const area = norm(t.area);
        const status = norm(t.status);
        const prioridade = norm(t.prioridade);
        const directProjectName = norm(t.projetoNome || t.projectName || t.nomeProjeto || t.projeto || t.eventoNome || t.feira);
        const ids = Array.isArray(t.projetos) && t.projetos.length ? t.projetos : (t.projetoId ? [t.projetoId] : []);
        const projLabels = ids.map(id => norm(`${(projectMeta[id]?.nome || '')} ${(projectMeta[id]?.feira || '')}`)).join(' ');

        const byText = term && (
          titulo.includes(term) ||
          descricao.includes(term) ||
          area.includes(term) ||
          status.includes(term) ||
          prioridade.includes(term) ||
          directProjectName.includes(term) ||
          projLabels.includes(term)
        );

        return byId || byText;
      });
    }

    // Filtro por evento (project.feira)
    if (selectedEvent && selectedEvent !== 'todos') {
      base = base.filter(t => {
        const ids = Array.isArray(t.projetos) && t.projetos.length ? t.projetos : (t.projetoId ? [t.projetoId] : []);
        if (!ids.length) return false;
        return ids.some(id => (projectMeta[id]?.feira || '') === selectedEvent);
      });
    }

    // Filtro por projeto específico (via URL ?projectId=... ou escolhido em UI futura)
    if (selectedProjectIds && selectedProjectIds.length > 0) {
      base = base.filter(t => {
        const ids = Array.isArray(t.projetos) && t.projetos.length ? t.projetos : (t.projetoId ? [t.projetoId] : []);
        if (!ids.length) return false;
        return ids.some(id => selectedProjectIds.includes(id));
      });
    }

    if (selectedStatuses.size > 0) base = base.filter(t => selectedStatuses.has(t.status));
    if (selectedAreas.size > 0) base = base.filter(t => selectedAreas.has(t.area));
    if (selectedPriorities.size > 0) base = base.filter(t => selectedPriorities.has(t.prioridade));

    return [...base].sort((a, b) => {
      if (sortBy === 'priority') {
        const pa = priorityOrder[a.prioridade] || 0;
        const pb = priorityOrder[b.prioridade] || 0;
        if (pb !== pa) return pb - pa;
        return getUpdatedDate(b) - getUpdatedDate(a);
      }
      if (sortBy === 'status') {
        const sa = statusOrder[a.status] ?? 999;
        const sb = statusOrder[b.status] ?? 999;
        if (sa !== sb) return sa - sb;
        return getUpdatedDate(b) - getUpdatedDate(a);
      }
      return getUpdatedDate(b) - getUpdatedDate(a);
    });
  };

  const getTicketCounts = () => {
    const activeTickets = tickets.filter(t => t.status !== 'arquivado');
    return {
      todos: activeTickets.length,
      com_notificacao: Object.keys(ticketNotifications).length,
      sem_tratativa: activeTickets.filter(t => t.status === 'aberto').length,
      em_tratativa: activeTickets.filter(t => t.status === 'em_tratativa').length,
      em_execucao: activeTickets.filter(t => t.status === 'em_execucao').length,
      escalado: activeTickets.filter(t => t.status === 'enviado_para_area' || t.status === 'escalado_para_area').length,
      escalado_para_mim: activeTickets.filter(t => {
        if (t.status === 'escalado_para_outra_area') {
          if (t.areaEscalada === userProfile?.area) return true;
          if (t.usuarioEscalado === user?.uid || t.usuarioEscalado === userProfile?.email || t.usuarioEscalado === userProfile?.nome) return true;
          if (t.areasEnvolvidas && t.areasEnvolvidas.includes(userProfile?.area)) return true;
        }
        return false;
      }).length,
      aguardando_validacao: activeTickets.filter(t =>
        t.status === 'executado_aguardando_validacao' || t.status === 'executado_aguardando_validacao_operador'
      ).length,
      concluidos: activeTickets.filter(t => t.status === 'concluido').length,
      aguardando_aprovacao: activeTickets.filter(t => t.status === 'aguardando_aprovacao').length,
      arquivados: tickets.filter(t => t.status === 'arquivado').length
    };
  };

  const filterCards = [
    { id: 'todos', title: 'Todos', icon: FileText, color: 'bg-blue-50 border-blue-200 hover:bg-blue-100', iconColor: 'text-blue-600', activeColor: 'bg-blue-500 text-white border-blue-500' },
    ...(userProfile?.funcao === 'gerente' ? [{
      id: 'aguardando_aprovacao', title: 'Aguardando Aprovação', icon: UserIcon,
      color: 'bg-orange-50 border-orange-200 hover:bg-orange-100', iconColor: 'text-orange-600', activeColor: 'bg-orange-500 text-white border-orange-500'
    }] : []),
    { id: 'com_notificacao', title: 'Notificações', icon: BellRing, color: 'bg-red-50 border-red-200 hover:bg-red-100', iconColor: 'text-red-600', activeColor: 'bg-red-500 text-white border-red-500' },
    { id: 'sem_tratativa', title: 'Sem Tratativa', icon: AlertCircle, color: 'bg-orange-50 border-orange-200 hover:bg-orange-100', iconColor: 'text-orange-600', activeColor: 'bg-orange-500 text-white border-orange-500' },
    { id: 'em_tratativa', title: 'Em Tratativa', icon: Clock, color: 'bg-yellow-50 border-yellow-200 hover:bg-yellow-100', iconColor: 'text-yellow-600', activeColor: 'bg-yellow-500 text-white border-yellow-500' },
    { id: 'em_execucao', title: 'Em Execução', icon: LayoutGrid, color: 'bg-blue-50 border-blue-200 hover:bg-blue-100', iconColor: 'text-blue-600', activeColor: 'bg-blue-500 text-white border-blue-500' },
    { id: 'escalado', title: 'Escalado', icon: ArrowUp, color: 'bg-purple-50 border-purple-200 hover:bg-purple-100', iconColor: 'text-purple-600', activeColor: 'bg-purple-500 text-white border-purple-500' },
    { id: 'escalado_para_mim', title: 'Escalados para Mim', icon: ChevronDown, color: 'bg-indigo-50 border-indigo-200 hover:bg-indigo-100', iconColor: 'text-indigo-600', activeColor: 'bg-indigo-500 text-white border-indigo-500' },
    { id: 'aguardando_validacao', title: 'Aguardando Validação', icon: Hourglass, color: 'bg-indigo-50 border-indigo-200 hover:bg-indigo-100', iconColor: 'text-indigo-600', activeColor: 'bg-indigo-500 text-white border-indigo-500' },
    { id: 'concluidos', title: 'Concluídos', icon: CheckCircle, color: 'bg-green-50 border-green-200 hover:bg-green-100', iconColor: 'text-green-600', activeColor: 'bg-green-500 text-white border-green-500' },
    { id: 'arquivados', title: 'Arquivados', icon: Archive, color: 'bg-gray-50 border-gray-200 hover:bg-gray-100', iconColor: 'text-gray-600', activeColor: 'bg-gray-500 text-white border-gray-500' }
  ];

  if (!authInitialized || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Carregando dashboard...</p>
        </div>
      </div>
    );
  }

  // --------- Painel de filtros reutilizável ---------
  const FiltersPanel = ({ variant = 'mobile' }) => {
    const isDesktop = variant === 'desktop';
    const wrapperClass = `${isDesktop ? '' : 'lg:hidden'} px-4 sm:px-6 lg:px-8 pb-3`;

    return (
      <div className={wrapperClass}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-gray-500 block mb-1">Evento</label>
            <Select value={selectedEvent} onValueChange={setSelectedEvent}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Todos os eventos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os eventos</SelectItem>
                {allEvents.map(ev => <SelectItem key={ev} value={ev}>{ev}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-xs text-gray-500 block mb-1">Ordenar por</label>
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Ordenar por" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="updatedAtDesc">Atualização (desc)</SelectItem>
                <SelectItem value="priority">Prioridade</SelectItem>
                <SelectItem value="status">Status</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Chips */}
        <div className="space-y-3 mt-3">
          <div>
            <div className="text-xs font-medium text-gray-500 mb-2">Status</div>
            <div className="flex flex-wrap gap-2">
              {allStatuses.map(st => (
                <button
                  key={st}
                  onClick={() => setSelectedStatuses(prev => {
                    const n = new Set(prev); n.has(st) ? n.delete(st) : n.add(st); return n;
                  })}
                  className={`text-xs px-3 py-1 rounded-full border transition ${
                    selectedStatuses.has(st)
                      ? 'bg-gray-900 text-white border-gray-900'
                      : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-100'
                  }`}
                >
                  {st.replaceAll('_', ' ')}
                </button>
              ))}
              {!!allStatuses.length && (
                <button
                  onClick={() => setSelectedStatuses(new Set())}
                  className="text-xs px-2 py-1 rounded border border-gray-300 text-gray-600 hover:bg-gray-100"
                >
                  Limpar
                </button>
              )}
            </div>
          </div>

          <div>
            <div className="text-xs font-medium text-gray-500 mb-2">Área</div>
            <div className="flex flex-wrap gap-2">
              {allAreas.map(ar => (
                <button
                  key={ar}
                  onClick={() => setSelectedAreas(prev => {
                    const n = new Set(prev); n.has(ar) ? n.delete(ar) : n.add(ar); return n;
                  })}
                  className={`text-xs px-3 py-1 rounded-full border transition ${
                    selectedAreas.has(ar)
                      ? 'bg-gray-900 text-white border-gray-900'
                      : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-100'
                  }`}
                >
                  {ar.replaceAll('_', ' ')}
                </button>
              ))}
              {!!allAreas.length && (
                <button
                  onClick={() => setSelectedAreas(new Set())}
                  className="text-xs px-2 py-1 rounded border border-gray-300 text-gray-600 hover:bg-gray-100"
                >
                  Limpar
                </button>
              )}
            </div>
          </div>

          <div>
            <div className="text-xs font-medium text-gray-500 mb-2">Prioridade</div>
            <div className="flex flex-wrap gap-2">
              {['alta','media','baixa'].map(p => (
                <button
                  key={p}
                  onClick={() => setSelectedPriorities(prev => {
                    const n = new Set(prev); n.has(p) ? n.delete(p) : n.add(p); return n;
                  })}
                  className={`text-xs px-3 py-1 rounded-full border transition ${
                    selectedPriorities.has(p)
                      ? 'bg-gray-900 text-white border-gray-900'
                      : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-100'
                  }`}
                >
                  {p}
                </button>
              ))}
              <button
                onClick={() => setSelectedPriorities(new Set())}
                className="text-xs px-2 py-1 rounded border border-gray-300 text-gray-600 hover:bg-gray-100"
              >
                Limpar
              </button>
            </div>
          </div>
        </div>

        {/* Filtros salvos */}
        <div className="flex items-center gap-2 mt-3">
          <Button variant="outline" onClick={saveCurrentFilterCombination}>Salvar filtro atual</Button>
          <Button variant="ghost" onClick={clearAllFilters}>Limpar filtros</Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">Filtros salvos</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[220px]">
              {savedFilters.length === 0 && <DropdownMenuItem disabled>Nenhum filtro salvo</DropdownMenuItem>}
              {savedFilters.map(sf => (
                <div key={sf.name} className="flex items-center justify-between px-2 py-1">
                  <button className="text-sm hover:underline" onClick={() => applySavedFilterByName(sf.name)}>{sf.name}</button>
                  <button className="text-xs text-red-600 hover:underline" onClick={() => deleteSavedFilterByName(sf.name)}>Excluir</button>
                </div>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    );
  };

  const counts = getTicketCounts();

  // --------- Render helpers ---------
  const renderTicketsTable = () => (
    <div className="bg-white border rounded-lg overflow-auto">
      <table className="min-w-full text-sm">
        <thead className="bg-gray-50 text-gray-700">
          <tr className="text-left">
            <th className="px-3 sm:px-4 py-2 sm:py-3 font-medium">Título</th>
            <th className="px-3 sm:px-4 py-2 sm:py-3 font-medium">Status</th>
            <th className="px-3 sm:px-4 py-2 sm:py-3 font-medium">Prioridade</th>
            <th className="px-3 sm:px-4 py-2 sm:py-3 font-medium">Área</th>
            <th className="px-3 sm:px-4 py-2 sm:py-3 font-medium">Projeto/Evento</th>
            <th className="px-3 sm:px-4 py-2 sm:py-3 font-medium">Última atualização</th>
            <th className="px-3 sm:px-4 py-2 sm:py-3"></th>
          </tr>
        </thead>
        <tbody>
          {getFilteredTickets().map((ticket) => {
            const ids = Array.isArray(ticket.projetos) && ticket.projetos.length ? ticket.projetos : (ticket.projetoId ? [ticket.projetoId] : []);
            const projLabels = ids.length ? ids.map(getProjectLabel).join(' • ') : 'Sem Projeto – Sem Evento';
            const d = getUpdatedDate(ticket);
            const dateStr = d ? d.toLocaleDateString('pt-BR') : 'N/A';
            const timeStr = d ? d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';
            return (
              <tr key={ticket.id} className="border-t hover:bg-gray-50">
                <td className="px-3 sm:px-4 py-2 sm:py-3 max-w-[380px]">
                  <div className="flex items-center gap-2">
                    {(ticket.isConfidential || ticket.confidencial) && <Lock className="h-4 w-4 text-orange-500" title="Confidencial" />}
                    <div className="truncate">{ticket.titulo}</div>
                    {ticketNotifications[ticket.id] && (
                      <Badge className="bg-red-500 text-white text-[10px] px-2 py-0.5 rounded-full">
                        {ticketNotifications[ticket.id]}
                      </Badge>
                    )}
                  </div>
                  <div className="text-xs text-gray-500 line-clamp-1">
                    {(ticket.isConfidential || ticket.confidencial) ? 'Descrição confidencial' : (ticket.descricao || '')}
                  </div>
                </td>
                <td className="px-3 sm:px-4 py-2 sm:py-3">
                  <Badge className={`${getStatusColor(ticket.status)} text-[10px]`}>{ticket.status?.replaceAll('_',' ')}</Badge>
                </td>
                <td className="px-3 sm:px-4 py-2 sm:py-3">
                  <Badge className={`${getPriorityColor(ticket.prioridade)} text-[10px]`}>{ticket.prioridade}</Badge>
                </td>
                <td className="px-3 sm:px-4 py-2 sm:py-3"><span className="text-xs text-gray-700">{ticket.area?.replaceAll('_',' ')}</span></td>
                <td className="px-3 sm:px-4 py-2 sm:py-3"><span className="text-xs text-gray-700">{projLabels}</span></td>
                <td className="px-3 sm:px-4 py-2 sm:py-3">
                  <div className="text-xs text-gray-700">{dateStr}</div>
                  <div className="text-[10px] text-gray-500">{timeStr}</div>
                </td>
                <td className="px-3 sm:px-4 py-2 sm:py-3">
                  <Button variant="ghost" size="sm" onClick={() => navigate(`/chamado/${ticket.id}`)}>
                    <Eye className="h-4 w-4" />
                  </Button>
                </td>
              </tr>
            );
          })}
          {getFilteredTickets().length === 0 && (
            <tr>
              <td colSpan={7} className="px-4 py-8 text-center text-gray-500">Nenhum chamado encontrado com os filtros atuais.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );

  const renderTicketsByProjectCards = () => {
    const getTicketsByProject = () => {
      const grouped = {};
      getFilteredTickets().forEach(ticket => {
        const ids = Array.isArray(ticket.projetos) && ticket.projetos.length ? ticket.projetos : (ticket.projetoId ? [ticket.projetoId] : []);
        if (!ids.length) {
          const label = 'Sem Projeto – Sem Evento';
          if (!grouped[label]) grouped[label] = [];
          grouped[label].push(ticket);
        } else {
          ids.forEach(pid => {
            const label = getProjectLabel(pid);
            if (!grouped[label]) grouped[label] = [];
            grouped[label].push(ticket);
          });
        }
      });
      return grouped;
    };

    const grouped = getTicketsByProject();

    return (
      <div className="space-y-4">
        {Object.entries(grouped).map(([projectLabel, projectTickets]) => (
          <div key={projectLabel} className="border rounded-lg">
            <button
              onClick={() => setExpandedProjects(prev => ({ ...prev, [projectLabel]: !prev[projectLabel] }))}
              className="w-full flex items-center justify-between p-3 sm:p-4 text-left hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center space-x-3">
                {expandedProjects[projectLabel] ? <ChevronDown className="h-4 w-4 text-gray-500" /> : <ChevronRight className="h-4 w-4 text-gray-500" />}
                <div>
                  <h3 className="font-medium text-sm md:text-base">{projectLabel}</h3>
                  <p className="text-xs text-gray-500">{projectTickets.length} chamado{projectTickets.length !== 1 ? 's' : ''}</p>
                </div>
              </div>
            </button>

            {(expandedProjects[projectLabel] || (searchTerm && searchTerm.trim())) && (
              <div className="border-t bg-gray-50/50 p-3 sm:p-4 space-y-3">
                {projectTickets.map((ticket) => {
                  const isAwaitingApproval =
                    ticket.status === 'aguardando_aprovacao' &&
                    userProfile?.funcao === 'gerente' &&
                    ticket.gerenteResponsavelId === user.uid;
                  const cardClassName = `${bulkActionMode ? 'cursor-default' : 'cursor-pointer hover:shadow-md'} transition-shadow ${
                    isAwaitingApproval ? 'bg-orange-50 border-2 border-orange-400 shadow-lg ring-2 ring-orange-200' : 'bg-white'
                  } ${selectedTickets.has(ticket.id) ? 'ring-2 ring-blue-500' : ''}`;

                  const d = getUpdatedDate(ticket);
                  const dateStr = d ? d.toLocaleDateString('pt-BR') : 'N/A';
                  const timeStr = d ? d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';

                  return (
                    <Card key={ticket.id} className={cardClassName} onClick={bulkActionMode ? undefined : () => navigate(`/chamado/${ticket.id}`)}>
                      <CardContent className="p-3 md:p-4">
                        <div className="flex flex-col gap-2">
                          <div className="flex items-start justify-between gap-2">
                            {bulkActionMode && (
                              <div className="flex items-center mr-3">
                                <Checkbox
                                  checked={selectedTickets.has(ticket.id)}
                                  onCheckedChange={(checked) => handleTicketSelect(ticket.id, checked)}
                                  onClick={(e) => e.stopPropagation()}
                                />
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                {(ticket.isConfidential || ticket.confidencial) && <Lock className="h-4 w-4 text-orange-500" title="Confidencial" />}
                                <h3 className="font-medium text-sm md:text-base truncate">{ticket.titulo}</h3>
                                {ticketNotifications[ticket.id] && (
                                  <Badge className="bg-red-500 text-white text-xs px-2 py-1 rounded-full">
                                    {ticketNotifications[ticket.id]}
                                  </Badge>
                                )}
                              </div>
                              <p className="text-xs md:text-sm text-gray-600 mt-1 line-clamp-2">
                                {(ticket.isConfidential || ticket.confidencial) ? 'Descrição confidencial' : ticket.descricao}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="text-right text-xs text-gray-500">
                                <div className="flex flex-col items-end">
                                  <span className="font-medium">{dateStr}</span>
                                  <span className="text-xs opacity-75">{timeStr}</span>
                                </div>
                              </div>
                              <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); navigate(`/chamado/${ticket.id}`); }} className="h-8 w-8 p-0">
                                <Eye className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            <Badge className={`${getStatusColor(ticket.status)} text-xs`}>{ticket.status?.replaceAll('_', ' ')}</Badge>
                            <Badge className={`${getPriorityColor(ticket.prioridade)} text-xs`}>{ticket.prioridade}</Badge>
                            <span className="text-xs text-gray-500">{ticket.area?.replaceAll('_', ' ')}</span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        ))}
        {Object.keys(grouped).length === 0 && (
          <Card>
            <CardContent className="p-8 text-center">
              <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">Nenhum chamado encontrado</h3>
              <p className="text-gray-500">Ajuste os filtros para ver outros resultados.</p>
            </CardContent>
          </Card>
        )}
      </div>
    );
  };

  // --------- Página ---------
  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <div className={`${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'} fixed inset-y-0 left-0 z-50 w-64 bg-white shadow-lg transform transition-transform duration-300 ease-in-out lg:translate-x-0 lg:static lg:inset-0`}>
        <div className="flex items-center justify-between h-16 px-6 border-b">
          <h1 className="text-xl font-semibold text-gray-900">Gestão de Chamados</h1>
          <button onClick={() => setMobileMenuOpen(false)} className="lg:hidden">
            <X className="h-6 w-6" />
          </button>
        </div>

        <nav className="mt-6 px-3">
          <div className="space-y-1">
            {(userProfile?.funcao === 'produtor' || userProfile?.funcao === 'consultor' || userProfile?.funcao === 'administrador' ||
              (userProfile?.funcao === 'operador' && ['operacional','comunicacao_visual','almoxarifado','logistica'].includes(userProfile?.area))) && (
              <Button onClick={() => navigate('/novo-chamado')} className="w-full justify-start mb-4">
                <Plus className="h-4 w-4 mr-3" />
                Novo Chamado
              </Button>
            )}

            {userProfile?.funcao === 'administrador' && (
              { !isEmpreiteiro && (
<Button onClick={() => navigate('/novo-projeto')} variant="outline" className="w-full justify-start mb-4">
                <Plus className="h-4 w-4 mr-3" />
                Novo Projeto
              </Button>
            )}
            )}

            { !isEmpreiteiro && (
<Button onClick={() => navigate('/projetos')} variant="ghost" className="w-full justify-start">
              <FolderOpen className="h-4 w-4 mr-3" />
              Ver Projetos
            </Button>
            )}

            { !isEmpreiteiro && (
<Button onClick={() => navigate('/cronograma')} variant="ghost" className="w-full justify-start">
              <Calendar className="h-4 w-4 mr-3" />
              Cronograma
            </Button>
            )}

            {/* Atalho para a página de diários */}
            { !isEmpreiteiro && (
{ !isEmpreiteiro && (
<Button onClick={() => navigate('/diarios')} variant="ghost" className="w-full justify-start">
              <BookOpen className="h-4 w-4 mr-3" />
              Diário do Projeto
            </Button>
            )}

            {/* ➕ Novo: atalho para Resumo do Projeto no menu lateral */}
            <Button onClick={() => navigate('/resumo-projeto')} variant="ghost" className="w-full justify-start">
              <FileText className="h-4 w-4 mr-3" />
              Resumo do Projeto
            </Button>
            )}

            { !isEmpreiteiro && (
<Button onClick={() => navigate('/gaming')} variant="ghost" className="w-full justify-start">
              <Trophy className="h-4 w-4 mr-3" />
              Gamificação
            </Button>
            {/* Novo botão: Empreita (visível para admin, gerente e empreiteiro) */}
            {(isAdmin || isGerente || isEmpreiteiro) && (
              <Button onClick={() => navigate('/empreiteiro')} variant="ghost" className="w-full justify-start">
                <FileText className="h-4 w-4 mr-3" />
                empreita
              </Button>
            )}

            )}

            {userProfile?.funcao === 'gerente' && (
              <Button onClick={() => navigate('/relatorios')} variant="ghost" className="w-full justify-start">
                <BarChart3 className="h-4 w-4 mr-3" />
                Relatórios
              </Button>
            )}

            {userProfile?.funcao === 'administrador' && (
              <>
                <Button onClick={() => navigate('/eventos')} variant="ghost" className="w-full justify-start">
                  <Calendar className="h-4 w-4 mr-3" />
                  Eventos
                </Button>
                <Button onClick={() => navigate('/usuarios')} variant="ghost" className="w-full justify-start">
                  <Users className="h-4 w-4 mr-3" />
                  Usuários
                </Button>
                <Button onClick={() => navigate('/relatorios')} variant="ghost" className="w-full justify-start">
                  <BarChart3 className="h-4 w-4 mr-3" />
                  Relatórios
                </Button>
                <Button onClick={() => navigate('/analytics')} variant="ghost" className="w-full justify-start">
                  <BarChart3 className="h-4 w-4 mr-3" />
                  Analytics
                </Button>
                <Button onClick={() => navigate('/admin/painel')} variant="ghost" className="w-full justify-start">
                  <BarChart3 className="h-4 w-4 mr-3" />
                  Painel Admin
                </Button>
              </>
            )}
          </div>
        </nav>

        <div className="absolute bottom-0 w-full p-4 border-t">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="w-full justify-start">
                <UserIcon className="h-4 w-4 mr-3" />
                {userProfile?.nome || user?.email}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={logout}>
                <LogOut className="h-4 w-4 mr-2" />
                Sair
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {mobileMenuOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={() => setMobileMenuOpen(false)} />
      )}

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="bg-white shadow-sm border-b">
          <div className="flex items-center justify-between h-16 px-4 sm:px-6 lg:px-8">
            <div className="flex items-center space-x-4">
              <button onClick={() => setMobileMenuOpen(true)} className="lg:hidden">
                <Menu className="h-6 w-6" />
              </button>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Dashboard</h2>
                <p className="text-sm text-gray-500">Bem-vindo, {userProfile?.nome || user?.email} ({userProfile?.funcao})</p>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <NotificationCenter />
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-auto">
          <Tabs defaultValue="chamados" className="space-y-0">
            <div className="px-4 sm:px-6 lg:px-8 pt-4">
              <TabsList className="grid w-full grid-cols-1">
                <TabsTrigger value="chamados" className="flex items-center space-x-2">
                  <FileText className="h-4 w-4" />
                  <span>Chamados</span>
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="chamados">
              {/* Barra sticky: busca + filtros + toggle view */}
              <div className="sticky top-0 z-10 bg-white/80 backdrop-blur border-b">
                <div className="px-4 sm:px-6 lg:px-8 py-3 flex items-center gap-2">
                  <form onSubmit={handleSearchSubmit} className="flex-1">
                    <Input
                      className="h-9 w-full"
                      placeholder="Buscar por título, descrição, projeto ou #número do chamado..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                  </form>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-9 w-9"
                    onClick={() => (isMobile ? setShowMobileFilters(v => !v) : setFiltersOpen(true))}
                    title="Filtros"
                  >
                    <SlidersHorizontal className="h-4 w-4" />
                  </Button>
                  <Button
                    variant={viewMode === 'list' ? 'default' : 'outline'}
                    size="icon"
                    className="h-9 w-9"
                    onClick={() => setViewMode(viewMode === 'list' ? 'cards' : 'list')}
                    title={viewMode === 'list' ? 'Ver em cards' : 'Ver em lista'}
                  >
                    {viewMode === 'list' ? <LayoutGrid className="h-4 w-4" /> : <ListIcon className="h-4 w-4" />}
                  </Button>
                </div>

                {/* Extra (desktop) */}
                <div className="hidden lg:flex items-center gap-3 px-4 sm:px-6 lg:px-8 pb-3">
                  <div className="w-64">
                    <Select value={selectedEvent} onValueChange={setSelectedEvent}>
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="Filtrar por evento" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="todos">Todos os eventos</SelectItem>
                        {allEvents.map(ev => <SelectItem key={ev} value={ev}>{ev}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="w-56">
                    <Select value={sortBy} onValueChange={setSortBy}>
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="Ordenar por" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="updatedAtDesc">Atualização (desc)</SelectItem>
                        <SelectItem value="priority">Prioridade</SelectItem>
                        <SelectItem value="status">Status</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="ml-auto flex items-center gap-2">
                    <Button variant="outline" onClick={saveCurrentFilterCombination}>Salvar filtro atual</Button>
                    <Button variant="ghost" onClick={clearAllFilters}>Limpar filtros</Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline">Filtros salvos</Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="min-w-[220px]">
                        {savedFilters.length === 0 && <DropdownMenuItem disabled>Nenhum filtro salvo</DropdownMenuItem>}
                        {savedFilters.map(sf => (
                          <div key={sf.name} className="flex items-center justify-between px-2 py-1">
                            <button className="text-sm hover:underline" onClick={() => applySavedFilterByName(sf.name)}>{sf.name}</button>
                            <button className="text-xs text-red-600 hover:underline" onClick={() => deleteSavedFilterByName(sf.name)}>Excluir</button>
                          </div>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>

                {/* Painel de filtros (mobile) */}
                {showMobileFilters && <FiltersPanel variant="mobile" />}

                {/* Cards coloridos — mobile (grid 2 col) e desktop (grid grande) */}
                <div className="px-4 sm:px-6 lg:px-8 pb-3">
                  {/* mobile */}
                  <div className="grid grid-cols-2 gap-3 lg:hidden">
                    {filterCards.map((card) => {
                      const Icon = card.icon;
                      const isActive = activeFilter === card.id;
                      const count = counts[card.id];
                      return (
                        <Card
                          key={card.id}
                          className={`cursor-pointer transition-all duration-200 ${isActive ? card.activeColor : card.color} hover:shadow-md`}
                          onClick={() => setActiveFilter(card.id)}
                        >
                          <CardContent className="p-3">
                            <div className="flex items-center justify-between">
                              <Icon className={`h-5 w-5 ${isActive ? 'text-white' : card.iconColor}`} />
                              <span className={`text-xs font-medium ${isActive ? 'text-white' : 'text-gray-900'}`}>{card.title}</span>
                              <span className={`text-sm font-bold ${isActive ? 'text-white' : card.iconColor}`}>{count}</span>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>

                  {/* desktop */}
                  <div className="hidden lg:grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-10 gap-3">
                    {filterCards.map((card) => {
                      const Icon = card.icon;
                      const isActive = activeFilter === card.id;
                      const count = counts[card.id];
                      return (
                        <Card
                          key={card.id}
                          className={`cursor-pointer transition-all duration-200 ${isActive ? card.activeColor : card.color} hover:shadow-md`}
                          onClick={() => setActiveFilter(card.id)}
                        >
                          <CardContent className="p-3 sm:p-4">
                            <div className="flex flex-col items-center text-center space-y-2">
                              <Icon className={`h-5 w-5 sm:h-6 sm:w-6 ${isActive ? 'text-white' : card.iconColor}`} />
                              <div>
                                <p className={`text-xs sm:text-sm font-medium ${isActive ? 'text-white' : 'text-gray-900'}`}>{card.title}</p>
                                <p className={`text-lg sm:text-xl font-bold ${isActive ? 'text-white' : card.iconColor}`}>{count}</p>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Conteúdo */}
              <div className="px-4 sm:px-6 lg:px-8 py-4 space-y-4">
                {activeFilter !== 'todos' && (
                  <div className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-lg p-3">
                    <div className="flex items-center gap-2">
                      <Filter className="h-4 w-4 text-blue-600" />
                      <span className="text-sm font-medium text-blue-900">
                        Filtro ativo: {filterCards.find(c => c.id === activeFilter)?.title}
                      </span>
                      <Badge variant="secondary" className="bg-blue-100 text-blue-800">
                        {getTicketCounts()[activeFilter]} chamado{getTicketCounts()[activeFilter] !== 1 ? 's' : ''}
                      </Badge>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => setActiveFilter('todos')} className="text-blue-600 hover:text-blue-800">
                      <X className="h-4 w-4 mr-1" /> Limpar
                    </Button>
                  </div>
                )}

                {viewMode === 'list' ? renderTicketsTable() : renderTicketsByProjectCards()}
              </div>

              {/* Dialog de filtros — apenas DESKTOP (no mobile usamos painel) */}
              <Dialog open={filtersOpen && !isMobile} onOpenChange={setFiltersOpen}>
                <DialogContent className="sm:max-w-[760px] lg:max-w-[920px] w-[95vw] max-h-[85vh] overflow-y-auto">
                  <DialogHeader><DialogTitle>Filtros e Ordenação</DialogTitle></DialogHeader>
                  <FiltersPanel variant="desktop" />
                  <div className="px-4 sm:px-6 lg:px-8 pb-3 flex justify-end">
                    <Button onClick={() => setFiltersOpen(false)}>Aplicar</Button>
                  </div>
                </DialogContent>
              </Dialog>
            </TabsContent>
          </Tabs>
        </main>
      </div>
    </div>
  );
};

export default DashboardPage;
