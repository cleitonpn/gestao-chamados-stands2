import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { ticketService, TICKET_STATUS } from '@/services/ticketService';
import { projectService } from '@/services/projectService';
import { userService, AREAS } from '@/services/userService';
import { messageService } from '@/services/messageService';
import notificationService from '@/services/notificationService';
import ImageUpload from '@/components/ImageUpload';
import Header from '@/components/Header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  ArrowLeft,
  Clock,
  User,
  MessageSquare,
  Send,
  CheckCircle,
  XCircle,
  AlertCircle,
  Camera,
  Calendar,
  MapPin,
  Loader2,
  ExternalLink,
  Upload,
  X,
  Image as ImageIcon,
  Settings,
  AtSign,
  Lock,
  UserCheck,
  PlusCircle,
  Shield,
  ThumbsUp,
  ThumbsDown,
  Archive,
  ArchiveRestore
} from 'lucide-react';

const TicketDetailPage = () => {
  const { ticketId } = useParams();
  const navigate = useNavigate();
  const { user, userProfile } = useAuth();

  // Estados principais
  const [ticket, setTicket] = useState(null);
  const [project, setProject] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState(null);
  const [accessDenied, setAccessDenied] = useState(false);

  // Estados do chat
  const [newMessage, setNewMessage] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);
  const [chatImages, setChatImages] = useState([]);

  // Estados de atualização de status
  const [newStatus, setNewStatus] = useState('');
  const [conclusionImages, setConclusionImages] = useState([]);
  const [conclusionDescription, setConclusionDescription] = useState('');
  const [selectedArea, setSelectedArea] = useState('');
  const [showAreaSelector, setShowAreaSelector] = useState(false);

  // Estados para escalação separada
  const [escalationArea, setEscalationArea] = useState('');
  const [escalationReason, setEscalationReason] = useState('');
  const [isEscalating, setIsEscalating] = useState(false);

  // Estados para escalação para gerência
  const [managementArea, setManagementArea] = useState('');
  const [managementReason, setManagementReason] = useState('');
  const [isEscalatingToManagement, setIsEscalatingToManagement] = useState(false);

  // Estados para escalação para consultor
  const [consultorReason, setConsultorReason] = useState('');
  const [isEscalatingToConsultor, setIsEscalatingToConsultor] = useState(false);

  // Estados para menções de usuários e histórico
  const [users, setUsers] = useState([]);
  const [historyEvents, setHistoryEvents] = useState([]);
  const [showMentionSuggestions, setShowMentionSuggestions] = useState(false);
  const [mentionSuggestions, setMentionSuggestions] = useState([]);
  const [mentionQuery, setMentionQuery] = useState('');
  const [cursorPosition, setCursorPosition] = useState(0);
  const textareaRef = useRef(null);

  const loadTicketData = async () => {
    try {
      setLoading(true);
      setError(null);
      setAccessDenied(false);

      console.log('Carregando dados do chamado:', ticketId);

      const ticketData = await ticketService.getTicketById(ticketId);
      if (!ticketData) {
        throw new Error('Chamado não encontrado');
      }

      setTicket(ticketData);
      console.log('Dados do chamado carregados:', ticketData);

      if (ticketData.projetoId) {
        try {
          const projectData = await projectService.getProjectById(ticketData.projetoId);
          setProject(projectData);
        } catch (err) {
          console.warn('Erro ao carregar projeto:', err);
        }
      }

      try {
        const messagesData = await messageService.getMessagesByTicket(ticketId);
        setMessages(messagesData || []);
      } catch (err) {
        console.warn('Erro ao carregar mensagens:', err);
        setMessages([]);
      }

    } catch (err) {
      console.error('Erro ao carregar dados do chamado:', err);
      setError(err.message || 'Erro ao carregar chamado');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (ticketId && user) {
      loadTicketData();
      markNotificationsAsRead();
    }
  }, [ticketId, user]);

  useEffect(() => {
    if (ticket && userProfile && user) {
      if (ticket.isConfidential) {
        const isCreator = ticket.criadoPor === user.uid;
        const isAdmin = userProfile.funcao === 'administrador';
        const isInvolvedOperator = userProfile.funcao === 'operador' &&
                                   (userProfile.area === ticket.area || userProfile.area === ticket.areaDeOrigem);

        if (!isCreator && !isAdmin && !isInvolvedOperator) {
          console.warn('ACESSO NEGADO: Usuário não autorizado a ver este chamado confidencial.');
          setAccessDenied(true);
        }
      }
    }
  }, [ticket, userProfile, user]);

  const markNotificationsAsRead = async () => {
    if (!user?.uid || !ticketId) return;

    try {
      await notificationService.markTicketNotificationsAsRead(user.uid, ticketId);
      console.log('✅ Notificações marcadas como lidas para o chamado:', ticketId);
    } catch (error) {
      console.error('❌ Erro ao marcar notificações como lidas:', error);
    }
  };

  useEffect(() => {
    const loadUsers = async () => {
      try {
        const allUsers = await userService.getAllUsers();
        setUsers(allUsers);
      } catch (error) {
        console.error('Erro ao carregar usuários:', error);
      }
    };

    loadUsers();
  }, []);
    
  const handleArchiveTicket = async () => {
    if (!window.confirm('Tem certeza que deseja arquivar este chamado? Ele sairá da visualização principal e só poderá ser consultado.')) {
        return;
    }

    setUpdating(true);
    try {
        await ticketService.updateTicket(ticketId, {
            status: 'arquivado',
            arquivadoEm: new Date(),
            arquivadoPor: user.uid,
            dataUltimaAtualizacao: new Date()
        });
        alert('Chamado arquivado com sucesso!');
        navigate('/dashboard');
    } catch (error) {
        console.error('Erro ao arquivar chamado:', error);
        alert('Ocorreu um erro ao arquivar o chamado.');
        setUpdating(false);
    }
  };

  const handleUnarchiveTicket = async () => {
    if (!window.confirm('Deseja desarquivar este chamado? Ele voltará para a lista de concluídos.')) {
        return;
    }

    setUpdating(true);
    try {
        await ticketService.updateTicket(ticketId, {
            status: 'concluido',
            arquivadoEm: null,
            arquivadoPor: null,
            dataUltimaAtualizacao: new Date()
        });
        alert('Chamado desarquivado com sucesso!');
        loadTicketData();
    } catch (error) {
        console.error('Erro ao desarquivar chamado:', error);
        alert('Ocorreu um erro ao desarquivar o chamado.');
    } finally {
        setUpdating(false);
    }
  };

  const getUserNameById = (userId) => {
      if (!users || !userId) return 'Sistema';
      const userFound = users.find(u => u.uid === userId || u.id === userId);
      return userFound?.nome || 'Usuário desconhecido';
  };

  useEffect(() => {
    if (ticket && users.length > 0) {
        const events = [];

        if (ticket.criadoEm) {
            events.push({
                date: ticket.criadoEm,
                description: 'Chamado criado por',
                userName: ticket.criadoPorNome || getUserNameById(ticket.criadoPor),
                Icon: PlusCircle,
                color: 'text-blue-500'
            });
        }

        if (ticket.escaladoEm && ticket.motivoEscalonamentoGerencial) {
             events.push({
                date: ticket.escaladoEm,
                description: 'Escalado para gerência por',
                userName: getUserNameById(ticket.escaladoPor),
                Icon: Shield,
                color: 'text-purple-500'
            });
        }

        if (ticket.aprovadoEm) {
            events.push({
                date: ticket.aprovadoEm,
                description: 'Aprovado por',
                userName: getUserNameById(ticket.aprovadoPor),
                Icon: ThumbsUp,
                color: 'text-green-500'
            });
        }

        if (ticket.rejeitadoEm) {
            events.push({
                date: ticket.rejeitadoEm,
                description: 'Rejeitado / Devolvido por',
                userName: getUserNameById(ticket.rejeitadoPor),
                Icon: ThumbsDown,
                color: 'text-red-500'
            });
        }

        if (ticket.concluidoEm) {
            events.push({
                date: ticket.concluidoEm,
                description: 'Concluído por',
                userName: getUserNameById(ticket.concluidoPor),
                Icon: CheckCircle,
                color: 'text-green-600'
            });
        }

        const sortedEvents = events.sort((a, b) => {
            const dateA = a.date.toDate ? a.date.toDate() : new Date(a.date);
            const dateB = b.date.toDate ? b.date.toDate() : new Date(b.date);
            return dateA - dateB;
        });

        setHistoryEvents(sortedEvents);
    }
  }, [ticket, users]);

  const detectMentions = (text, position) => {
    const beforeCursor = text.substring(0, position);
    const mentionMatch = beforeCursor.match(/@(\w*)$/);

    if (mentionMatch) {
      const query = mentionMatch[1].toLowerCase();
      const filtered = users.filter(user =>
        user.nome.toLowerCase().includes(query) ||
        user.email.toLowerCase().includes(query)
      ).slice(0, 5);

      setMentionQuery(query);
      setMentionSuggestions(filtered);
      setShowMentionSuggestions(true);
    } else {
      setShowMentionSuggestions(false);
      setMentionSuggestions([]);
      setMentionQuery('');
    }
  };

  const insertMention = (user) => {
    const beforeCursor = newMessage.substring(0, cursorPosition);
    const afterCursor = newMessage.substring(cursorPosition);
    const beforeMention = beforeCursor.replace(/@\w*$/, '');
    const newText = beforeMention + `@${user.nome} ` + afterCursor;

    setNewMessage(newText);
    setShowMentionSuggestions(false);
    setMentionSuggestions([]);
    setMentionQuery('');

    setTimeout(() => {
      if (textareaRef.current) {
        const newPosition = beforeMention.length + user.nome.length + 2;
        textareaRef.current.setSelectionRange(newPosition, newPosition);
        textareaRef.current.focus();
      }
    }, 0);
  };

  const handleTextareaChange = (e) => {
    const value = e.target.value;
    const position = e.target.selectionStart;

    setNewMessage(value);
    setCursorPosition(position);
    detectMentions(value, position);
  };

  const handleTextareaKeyDown = (e) => {
    if (showMentionSuggestions) {
      if (e.key === 'Escape') {
        setShowMentionSuggestions(false);
        setMentionSuggestions([]);
        setMentionQuery('');
      }
    }
  };

  const formatDate = (date) => {
    if (!date) return 'Data não disponível';

    try {
      let dateObj;
      if (date.toDate && typeof date.toDate === 'function') {
        dateObj = date.toDate();
      } else if (date instanceof Date) {
        dateObj = date;
      } else {
        dateObj = new Date(date);
      }

      if (isNaN(dateObj.getTime())) {
        return 'Data inválida';
      }

      return dateObj.toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (error) {
      console.error('Erro ao formatar data:', error);
      return 'Erro na data';
    }
  };

  const getStatusColor = (status) => {
    const colors = {
      'aberto': 'bg-blue-100 text-blue-800',
      'em_tratativa': 'bg-yellow-100 text-yellow-800',
      'em_execucao': 'bg-blue-100 text-blue-800',
      'enviado_para_area': 'bg-purple-100 text-purple-800',
      'escalado_para_area': 'bg-purple-100 text-purple-800',
      'escalado_para_outra_area': 'bg-purple-100 text-purple-800',
      'aguardando_aprovacao': 'bg-orange-100 text-orange-800',
      'executado_aguardando_validacao': 'bg-indigo-100 text-indigo-800',
      'concluido': 'bg-green-100 text-green-800',
      'cancelado': 'bg-red-100 text-red-800',
      'devolvido': 'bg-pink-100 text-pink-800',
      'aprovado': 'bg-green-100 text-green-800',
      'reprovado': 'bg-red-100 text-red-800',
      'arquivado': 'bg-gray-100 text-gray-700',
      'escalado_para_consultor': 'bg-cyan-100 text-cyan-800',
      'executado_pelo_consultor': 'bg-teal-100 text-teal-800'
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  const getStatusText = (status) => {
    const statusTexts = {
      'aberto': 'Aberto',
      'em_tratativa': 'Em Tratativa',
      'em_execucao': 'Em Execução',
      'enviado_para_area': 'Enviado para Área',
      'escalado_para_area': 'Escalado para Área',
      'escalado_para_outra_area': 'Escalado para Outra Área',
      'aguardando_aprovacao': 'Aguardando Aprovação',
      'executado_aguardando_validacao': 'Executado - Aguardando Validação',
      'concluido': 'Concluído',
      'cancelado': 'Cancelado',
      'devolvido': 'Devolvido',
      'aprovado': 'Aprovado',
      'reprovado': 'Reprovado',
      'arquivado': 'Arquivado',
      'escalado_para_consultor': 'Aguardando Consultor',
      'executado_pelo_consultor': 'Executado pelo Consultor'
    };
    return statusTexts[status] || status;
  };

  const getAvailableStatuses = () => {
    if (!ticket || !userProfile || !user) {
      return [];
    }

    const currentStatus = ticket.status;
    const userRole = userProfile.funcao;
    const isCreator = ticket.criadoPor === user.uid;

    const isProjectProducer = userProfile.funcao === 'produtor' && project && project.produtorId === user.uid;
    const isConsultantTicketForProducer = ticket.criadoPorFuncao === 'consultor';

    if (isProjectProducer && isConsultantTicketForProducer && (ticket.status === 'aberto' || ticket.status === 'em_tratativa')) {
        const producerActions = [];
        if (ticket.status === 'aberto') {
            producerActions.push({ value: TICKET_STATUS.IN_TREATMENT, label: 'Iniciar Tratativa', description: 'Começar a trabalhar no chamado' });
        }
        producerActions.push({ value: TICKET_STATUS.EXECUTED_AWAITING_VALIDATION, label: 'Executado', description: 'Marcar como executado para validação do consultor' });

        producerActions.push({ value: 'send_to_area', label: 'Enviar para a Área', description: 'Encaminhar o chamado para a área final' });

        return producerActions;
    }

    if (isCreator && currentStatus === TICKET_STATUS.EXECUTED_AWAITING_VALIDATION) {
        return [
            { value: TICKET_STATUS.COMPLETED, label: 'Validar e Concluir', description: 'O chamado foi resolvido corretamente.' },
            { value: TICKET_STATUS.SENT_TO_AREA, label: 'Rejeitar / Devolver', description: 'Devolver para a área responsável com um motivo.' }
        ];
    }

    if (userRole === 'administrador') {
      if (currentStatus === TICKET_STATUS.OPEN) {
        return [
          { value: TICKET_STATUS.IN_TREATMENT, label: 'Iniciar Tratativa', description: 'Começar a trabalhar no chamado' }
        ];
      }
      if (currentStatus === TICKET_STATUS.IN_TREATMENT) {
        return [
          { value: TICKET_STATUS.EXECUTED_AWAITING_VALIDATION, label: 'Executado', description: 'Marcar como executado para validação' }
        ];
      }
      if (currentStatus === TICKET_STATUS.EXECUTED_AWAITING_VALIDATION && !isCreator) {
        return [
          { value: TICKET_STATUS.COMPLETED, label: 'Forçar Conclusão (Admin)', description: 'Finalizar chamado como administrador.' }
        ];
      }
      if (currentStatus === 'aguardando_aprovacao') {
        return [
          { value: TICKET_STATUS.APPROVED, label: 'Aprovar', description: 'Aprovar e retornar para área' },
          { value: TICKET_STATUS.REJECTED, label: 'Reprovar', description: 'Reprovar e encerrar chamado' }
        ];
      }
    }

    // ✅ LÓGICA DO OPERADOR ATUALIZADA
    if (userRole === 'operador') {
      const isFromUserArea = ticket.area === userProfile.area;
      const isAssignedToUser = ticket.atribuidoA === user.uid;
      const canManage = isFromUserArea || isAssignedToUser;

      if (canManage) {
        // CORREÇÃO: Adicionada a verificação para status de escalonamento.
        if (currentStatus === 'aberto' || currentStatus === 'escalado_para_outra_area') {
          return [
            { value: 'em_tratativa', label: 'Iniciar Tratativa', description: 'Começar a trabalhar no chamado' }
          ];
        }
        if (currentStatus === 'em_tratativa') {
          return [
            { value: 'executado_aguardando_validacao', label: 'Executado', description: 'Marcar como executado para validação' }
          ];
        }
      }
    }

    if (userRole === 'gerente') {
      const isManagerOfArea = userProfile.area === 'producao';
      const isEscalatedToThisManager = currentStatus === 'aguardando_aprovacao' &&
                                       (ticket.gerenteResponsavelId === user.uid ||
                                        (!ticket.gerenteResponsavelId && isManagerOfArea));

      if (isEscalatedToThisManager) {
        return [
          { value: TICKET_STATUS.APPROVED, label: 'Aprovar', description: 'Aprovar e retornar para área' },
          { value: TICKET_STATUS.REJECTED, label: 'Reprovar', description: 'Reprovar e encerrar chamado' }
        ];
      }
      return [];
    }

    // ✅ NOVA LÓGICA PARA O CONSULTOR
    if (userRole === 'consultor') {
        const isResponsibleConsultant = ticket.consultorResponsavelId === user.uid;

        // Se o chamado foi escalado para este consultor
        if (currentStatus === 'escalado_para_consultor' && isResponsibleConsultant) {
            return [
                { value: 'executado_pelo_consultor', label: 'Executar e Devolver para a Área', description: 'Marcar como concluído e retornar o chamado para a área de origem.' }
            ];
        }

        // Mantém a lógica original para quando o consultor é o criador
        if (isCreator && currentStatus === 'concluido') {
            return [
                { value: 'concluido', label: 'Finalizar', description: 'Confirmar finalização do chamado' }
            ];
        }
    }

    return [];
  };

  const handleEscalation = async () => {
    if (!escalationArea) {
      alert('Por favor, selecione uma área de destino');
      return;
    }
    if (!escalationReason.trim()) {
      alert('Por favor, descreva o motivo da escalação');
      return;
    }
    setIsEscalating(true);
    try {
      const updateData = {
        status: 'escalado_para_outra_area',
        area: escalationArea || null,
        escalationReason: escalationReason || '',
        userRole: userProfile?.funcao || 'operador',
        areaDestino: escalationArea || null,
        motivoEscalonamento: escalationReason || '',
        atualizadoPor: user?.uid || null,
        updatedAt: new Date()
      };
      await ticketService.escalateTicketToArea(ticketId, escalationArea, updateData);
      const escalationMessage = {
        userId: user.uid,
        remetenteNome: userProfile.nome || user.email,
        conteudo: `🔄 **Chamado escalado para ${escalationArea.replace('_', ' ').toUpperCase()}**\n\n**Motivo:** ${escalationReason}`,
        criadoEm: new Date(),
        type: 'escalation'
      };
      await messageService.sendMessage(ticketId, escalationMessage);
      await loadTicketData();
      setEscalationArea('');
      setEscalationReason('');
      alert('Chamado escalado com sucesso!');
    } catch (error) {
      console.error('Erro ao escalar chamado:', error);
      alert('Erro ao escalar chamado: ' + error.message);
    } finally {
      setIsEscalating(false);
    }
  };

  const handleManagementEscalation = async () => {
    if (!managementArea) {
      alert('Por favor, selecione uma gerência de destino');
      return;
    }
    if (!managementReason.trim()) {
      alert('Por favor, descreva o motivo da escalação para gerência');
      return;
    }

    const targetArea = managementArea.replace('gerente_', '');
    const targetManager = users.find(u => u.funcao === 'gerente' && u.area === targetArea);

    if (!targetManager) {
      alert(`Erro: Nenhum gerente encontrado para a área "${targetArea}". Verifique o cadastro de usuários.`);
      return;
    }

    setIsEscalatingToManagement(true);
    try {
      const updateData = {
        status: 'aguardando_aprovacao',
        areaDeOrigem: ticket.area,
        gerenteResponsavelId: targetManager.uid,
        motivoEscalonamentoGerencial: managementReason,
        escaladoPor: user.uid,
        escaladoEm: new Date(),
        atualizadoPor: user.uid,
        updatedAt: new Date()
      };

      const managementNames = {
        'gerente_operacional': 'Gerência Operacional',
        'gerente_comercial': 'Gerência Comercial',
        'gerente_producao': 'Gerência Produção',
        'gerente_financeiro': 'Gerência Financeira'
      };

      await ticketService.updateTicket(ticketId, updateData);

      const escalationMessage = {
        userId: user.uid,
        remetenteNome: userProfile.nome || user.email,
        conteudo: `👨‍💼 **Chamado escalado para ${managementNames[managementArea]}**\n\n**Motivo:** ${managementReason}\n\n**Gerente Responsável:** ${targetManager.nome}`,
        criadoEm: new Date(),
        type: 'management_escalation'
      };
      await messageService.sendMessage(ticketId, escalationMessage);

      try {
        await notificationService.notifyManagementEscalation(
          ticketId,
          ticket,
          targetManager.uid,
          user.uid,
          managementReason
        );
        console.log('✅ Notificação de escalação gerencial enviada');
      } catch (notificationError) {
        console.error('❌ Erro ao enviar notificação de escalação gerencial:', notificationError);
      }

      await loadTicketData();
      setManagementArea('');
      setManagementReason('');
      alert('Chamado escalado para gerência com sucesso!');
    } catch (error) {
      console.error('Erro ao escalar para gerência:', error);
      alert('Erro ao escalar para gerência: ' + error.message);
    } finally {
      setIsEscalatingToManagement(false);
    }
  };

  const handleConsultorEscalation = async () => {
    if (!consultorReason.trim()) {
      alert('Por favor, descreva o motivo da escalação para o consultor');
      return;
    }
    if (!project?.consultorId) {
      alert('Erro: Consultor do projeto não encontrado');
      return;
    }
    setIsEscalatingToConsultor(true);
    try {
      const updateData = {
        status: 'escalado_para_consultor',
        areaDeOrigem: ticket.area,
        consultorResponsavelId: project.consultorId,
        motivoEscalonamentoConsultor: consultorReason,
        escaladoPor: user.uid,
        escaladoEm: new Date(),
        atualizadoPor: user.uid,
        updatedAt: new Date()
      };
      await ticketService.updateTicket(ticketId, updateData);
      const escalationMessage = {
        userId: user.uid,
        remetenteNome: userProfile.nome || user.email,
        conteudo: `👨‍🎯 **Chamado escalado para CONSULTOR DO PROJETO**\n\n**Motivo:** ${consultorReason}\n\n**Área de Origem:** ${ticket.area?.replace('_', ' ').toUpperCase()}`,
        criadoEm: new Date(),
        type: 'consultor_escalation'
      };
      await messageService.sendMessage(ticketId, escalationMessage);
      await loadTicketData();
      setConsultorReason('');
      alert('Chamado escalado para consultor com sucesso!');
    } catch (error) {
      console.error('Erro ao escalar para consultor:', error);
      alert('Erro ao escalar para consultor: ' + error.message);
    } finally {
      setIsEscalatingToConsultor(false);
    }
  };

  const handleTransferToProducer = async () => {
    if (!project?.produtorId) {
      alert('Erro: Produtor do projeto não encontrado');
      return;
    }
    setUpdating(true);
    try {
      const updateData = {
        status: 'transferido_para_produtor',
        produtorResponsavelId: project.produtorId,
        transferidoPor: user.uid,
        transferidoEm: new Date(),
        atualizadoPor: user.uid,
        updatedAt: new Date()
      };
      await ticketService.updateTicket(ticketId, updateData);
      const transferMessage = {
        userId: user.uid,
        remetenteNome: userProfile.nome || user.email,
        conteudo: `🏭 **Chamado transferido para PRODUTOR DO PROJETO**\n\nO chamado foi transferido para o produtor responsável para continuidade e finalização.`,
        criadoEm: new Date(),
        type: 'producer_transfer'
      };
      await messageService.sendMessage(ticketId, transferMessage);
      await loadTicketData();
      alert('Chamado transferido para produtor com sucesso!');
    } catch (error) {
      console.error('Erro ao transferir para produtor:', error);
      alert('Erro ao transferir para produtor: ' + error.message);
    } finally {
      setUpdating(false);
    }
  };

  const handleStatusUpdate = async () => {
    if (!newStatus) return;

    if ((newStatus === TICKET_STATUS.REJECTED || (newStatus === TICKET_STATUS.SENT_TO_AREA && ticket.status === TICKET_STATUS.EXECUTED_AWAITING_VALIDATION)) && !conclusionDescription.trim()) {
      alert('Por favor, forneça um motivo para a rejeição');
      return;
    }

    setUpdating(true);
    try {
      let updateData = {};
      let systemMessageContent = '';

      if (newStatus === 'send_to_area') {
        const targetArea = ticket.areaDestinoOriginal;

        if (!targetArea) {
            alert('Erro Crítico: A área de destino original não foi encontrada neste chamado. O chamado não pode ser enviado. Por favor, contate o suporte. (O campo areaDestinoOriginal está faltando no ticket).');
            setUpdating(false);
            return;
        }

        const newAreasEnvolvidas = [...new Set([...(ticket.areasEnvolvidas || []), targetArea])];

        updateData = {
          status: TICKET_STATUS.OPEN,
          area: targetArea,
          areasEnvolvidas: newAreasEnvolvidas,
          atualizadoPor: user.uid,
          updatedAt: new Date(),
        };
        systemMessageContent = `📲 **Chamado enviado pelo produtor para a área de destino: ${targetArea.replace('_', ' ').toUpperCase()}.**`;

      } else {
        updateData = {
          status: newStatus,
          atualizadoPor: user.uid,
          updatedAt: new Date()
        };

        if (newStatus === TICKET_STATUS.COMPLETED) {
          updateData.conclusaoDescricao = conclusionDescription;
          updateData.conclusaoImagens = conclusionImages;
          updateData.concluidoEm = new Date();
          updateData.concluidoPor = user.uid;
          systemMessageContent = `✅ **Chamado concluído**\n\n**Descrição:** ${conclusionDescription}`;
        } else if (newStatus === TICKET_STATUS.REJECTED) {
          updateData.motivoRejeicao = conclusionDescription;
          updateData.rejeitadoEm = new Date();
          updateData.rejeitadoPor = user.uid;
          const managerName = userProfile?.nome || user?.email || 'Gerente';
          systemMessageContent = `❌ **Chamado reprovado pelo gerente ${managerName}**\n\n**Motivo:** ${conclusionDescription}\n\nO chamado foi encerrado devido à reprovação gerencial.`;
        } else if (newStatus === TICKET_STATUS.SENT_TO_AREA && ticket.status === TICKET_STATUS.EXECUTED_AWAITING_VALIDATION) {
          updateData.motivoRejeicao = conclusionDescription;
          updateData.rejeitadoEm = new Date();
          updateData.rejeitadoPor = user.uid;
          updateData.area = ticket.areaDeOrigem || ticket.area;
          systemMessageContent = `🔄 **Status atualizado para:** ${getStatusText(newStatus)}`;
        } else if (newStatus === TICKET_STATUS.APPROVED) {
            if (ticket.status === 'aguardando_aprovacao' && userProfile.funcao === 'gerente') {
                const targetArea = ticket.areaDeOrigem || ticket.area;
                updateData.status = 'em_tratativa';
                updateData.area = targetArea;
                updateData.aprovadoEm = new Date();
                updateData.aprovadoPor = user.uid;
                const managerName = userProfile?.nome || user?.email || 'Gerente';
                systemMessageContent = `✅ **Chamado aprovado pelo gerente ${managerName}**\n\nO chamado foi aprovado e retornará para a área responsável para execução.`;
            }
        } else {
            systemMessageContent = `🔄 **Status atualizado para:** ${getStatusText(newStatus)}`;
        }
      }

      await ticketService.updateTicket(ticketId, updateData);

      const statusMessage = {
        userId: user.uid,
        remetenteNome: userProfile.nome || user.email,
        conteudo: systemMessageContent,
        criadoEm: new Date(),
        type: 'status_update'
      };
      await messageService.sendMessage(ticketId, statusMessage);

      try {
        await notificationService.notifyStatusChange(
          ticketId,
          ticket,
          updateData.status,
          ticket.status,
          user.uid
        );
        console.log('✅ Notificação de mudança de status enviada');
      } catch (notificationError) {
        console.error('❌ Erro ao enviar notificação de mudança de status:', notificationError);
      }

      await loadTicketData();
      setNewStatus('');
      setConclusionDescription('');
      setConclusionImages([]);
      alert('Status atualizado com sucesso!');
    } catch (error) {
      console.error('Erro ao atualizar status:', error);
      alert('Erro ao atualizar status: ' + error.message);
    } finally {
      setUpdating(false);
    }
  };

  const handleSendMessage = async () => {
    if (!newMessage.trim() && chatImages.length === 0) return;

    setSendingMessage(true);
    try {
      const messageData = {
        userId: user.uid,
        remetenteNome: userProfile.nome || user.email,
        conteudo: newMessage.trim(),
        imagens: chatImages,
        criadoEm: new Date(),
        type: 'user_message'
      };

      await messageService.sendMessage(ticketId, messageData);

      try {
        await notificationService.notifyNewMessage(
          ticketId,
          ticket,
          messageData,
          user.uid
        );
        console.log('✅ Notificação de nova mensagem enviada');
      } catch (notificationError) {
        console.error('❌ Erro ao enviar notificação de nova mensagem:', notificationError);
      }

      await loadTicketData();
      setNewMessage('');
      setChatImages([]);
    } catch (error) {
      console.error('Erro ao enviar mensagem:', error);
      alert('Erro ao enviar mensagem: ' + error.message);
    } finally {
      setSendingMessage(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-gray-600">Carregando chamado...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center p-8">
          <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Erro ao Carregar</h2>
          <p className="text-gray-600 mb-6">{error}</p>
          <Button onClick={() => navigate('/dashboard')} variant="outline">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar ao Dashboard
          </Button>
        </div>
      </div>
    );
  }

  if (accessDenied) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center p-8">
          <Lock className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Acesso Restrito</h2>
          <p className="text-gray-600 mb-6">
            Este é um chamado confidencial e você não tem permissão para visualizá-lo.
          </p>
          <Button onClick={() => navigate('/dashboard')} variant="outline">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar ao Dashboard
          </Button>
        </div>
      </div>
    );
  }

  if (!ticket) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="h-12 w-12 text-yellow-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Chamado não encontrado</h2>
          <p className="text-gray-600 mb-4">O chamado solicitado não existe ou você não tem permissão para visualizá-lo.</p>
          <Button onClick={() => navigate('/dashboard')} variant="outline">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar ao Dashboard
          </Button>
        </div>
      </div>
    );
  }

  const availableStatuses = getAvailableStatuses();
  const isArchived = ticket.status === 'arquivado';

  return (
    <div className="min-h-screen bg-gray-50">
      <Header title={`Chamado #${ticket.numero || ticketId.slice(-8)}`} />
      <div className="max-w-7xl mx-auto px-2 sm:px-4 lg:px-8 py-4 sm:py-6 lg:py-8">
        <div className="mb-4 sm:mb-6">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/dashboard')}
            className="mb-3 sm:mb-4 p-2 sm:p-3"
          >
            <ArrowLeft className="h-4 w-4 mr-1 sm:mr-2" />
            <span className="text-sm sm:text-base">Voltar ao Dashboard</span>
          </Button>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-0">
            <div className="min-w-0 flex-1">
              <h2 className="text-lg sm:text-xl lg:text-2xl font-bold text-gray-900 break-words">
                {ticket.titulo || 'Título não disponível'}
              </h2>
              <p className="text-gray-600 mt-1">
                Criado em {formatDate(ticket.criadoEm)} por {ticket.criadoPorNome || 'Usuário desconhecido'}
              </p>
            </div>
            <div className="flex items-center">
              {ticket.isConfidential && (
                <Badge variant="outline" className="mr-2 border-orange-400 bg-orange-50 text-orange-700">
                  <Lock className="h-3 w-3 mr-1.5" />
                  Confidencial
                </Badge>
              )}
              <Badge className={getStatusColor(ticket.status)}>
                {getStatusText(ticket.status)}
              </Badge>
            </div>
          </div>
        </div>

        {isArchived && (
          <Alert variant="default" className="mb-6 bg-gray-100 border-gray-300">
              <Archive className="h-4 w-4" />
              <AlertDescription>
                  Este chamado está arquivado e é somente para consulta. Para fazer alterações, é preciso desarquivá-lo.
              </AlertDescription>
          </Alert>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6 lg:gap-8">
          <div className="lg:col-span-2 space-y-4 sm:space-y-6">
            <Card>
              <CardHeader className="pb-3 sm:pb-4">
                <CardTitle className="flex items-center text-base sm:text-lg">
                  <AlertCircle className="h-4 w-4 sm:h-5 sm:w-5 mr-2" />
                  Detalhes do Chamado
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 sm:space-y-4">
                <div>
                  <Label className="text-xs sm:text-sm font-medium text-gray-700">Título</Label>
                  <p className="text-sm sm:text-base text-gray-900 break-words">{ticket.titulo || 'Título não disponível'}</p>
                </div>
                <div>
                  <Label className="text-xs sm:text-sm font-medium text-gray-700">Descrição</Label>
                  <p className="text-sm sm:text-base text-gray-900 whitespace-pre-wrap break-words">{ticket.descricao || 'Descrição não disponível'}</p>
                </div>
                {ticket.imagens && ticket.imagens.length > 0 && (
                  <div>
                    <Label className="text-xs sm:text-sm font-medium text-gray-700 mb-2 block">📷 Imagens Anexadas</Label>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                      {ticket.imagens.map((imagem, index) => (
                        <div key={index} className="relative group">
                          <img
                            src={imagem.url}
                            alt={imagem.name || `Imagem do chamado ${index + 1}`}
                            className="w-full h-32 object-cover rounded-lg border border-gray-200 cursor-pointer hover:opacity-75 transition-opacity shadow-sm hover:shadow-md"
                            onClick={() => window.open(imagem.url, '_blank')}
                            onError={(e) => {
                              e.target.style.display = 'none';
                              e.target.nextSibling.style.display = 'flex';
                            }}
                          />
                          <div className="hidden w-full h-32 bg-gray-100 rounded-lg border border-gray-200 items-center justify-center">
                            <div className="text-center">
                              <ImageIcon className="h-6 w-6 text-gray-400 mx-auto mb-1" />
                              <p className="text-xs text-gray-500">Erro ao carregar</p>
                            </div>
                          </div>
                          {imagem.name && (
                            <div className="absolute bottom-0 left-0 right-0 bg-black bg-opacity-50 text-white text-xs p-1 rounded-b-lg opacity-0 group-hover:opacity-100 transition-opacity">
                              <p className="truncate">{imagem.name}</p>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {ticket.isExtra && (
                  <div className="p-3 sm:p-4 bg-orange-50 border border-orange-200 rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-orange-600 font-semibold text-sm sm:text-base">🔥 ITEM EXTRA</span>
                    </div>
                    {ticket.motivoExtra && (
                      <div>
                        <Label className="text-xs sm:text-sm font-medium text-orange-700">Motivo do Item Extra</Label>
                        <p className="text-sm sm:text-base text-orange-900 whitespace-pre-wrap break-words">{ticket.motivoExtra}</p>
                      </div>
                    )}
                  </div>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                  <div>
                    <Label className="text-sm font-medium text-gray-700">Área</Label>
                    <p className="text-gray-900">{ticket.area || 'Não especificada'}</p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium text-gray-700">Tipo</Label>
                    <p className="text-gray-900">{ticket.tipo || 'Não especificado'}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-sm font-medium text-gray-700">Criado em</Label>
                    <p className="text-gray-900">{formatDate(ticket.createdAt || ticket.criadoEm)}</p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium text-gray-700">Criado por</Label>
                    <p className="text-gray-900">{ticket.criadoPorNome || 'Não disponível'}</p>
                  </div>
                </div>
                {ticket.imagensIniciais && ticket.imagensIniciais.length > 0 && (
                  <div>
                    <Label className="text-sm font-medium text-gray-700 mb-2 block">Imagens Iniciais</Label>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                      {ticket.imagensIniciais.map((imageUrl, index) => (
                        <div key={index} className="relative group">
                          <img
                            src={imageUrl}
                            alt={`Imagem ${index + 1}`}
                            className="w-full h-24 object-cover rounded-lg border border-gray-200 cursor-pointer hover:opacity-75 transition-opacity"
                            onClick={() => window.open(imageUrl, '_blank')}
                            onError={(e) => {
                              e.target.style.display = 'none';
                              e.target.nextSibling.style.display = 'flex';
                            }}
                          />
                          <div className="hidden w-full h-24 bg-gray-100 rounded-lg border border-gray-200 items-center justify-center">
                            <ImageIcon className="h-6 w-6 text-gray-400" />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <MessageSquare className="h-5 w-5 mr-2" />
                  Conversas ({messages.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4 mb-6 max-h-96 overflow-y-auto">
                  {messages.length === 0 ? (
                    <p className="text-gray-500 text-center py-4">Nenhuma mensagem ainda</p>
                  ) : (
                    messages.map((message, index) => (
                      <div key={index} className="flex space-x-3">
                        <div className="flex-shrink-0">
                          <div className="h-8 w-8 bg-blue-500 rounded-full flex items-center justify-center">
                            <User className="h-4 w-4 text-white" />
                          </div>
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center space-x-2">
                            <span className="text-sm font-medium text-gray-900">
                              {message.remetenteNome || 'Usuário'}
                            </span>
                            <span className="text-xs text-gray-500">
                              {formatDate(message.criadoEm)}
                            </span>
                          </div>
                          {message.conteudo && (
                            <p className="text-sm text-gray-700 mt-1">{message.conteudo}</p>
                          )}
                          {message.imagens && message.imagens.length > 0 && (
                            <div className="grid grid-cols-2 gap-2 mt-2">
                              {message.imagens.map((imageUrl, imgIndex) => (
                                <img
                                  key={imgIndex}
                                  src={imageUrl}
                                  alt={`Anexo ${imgIndex + 1}`}
                                  className="w-full h-20 object-cover rounded border cursor-pointer hover:opacity-75"
                                  onClick={() => window.open(imageUrl, '_blank')}
                                  onError={(e) => {
                                    e.target.style.display = 'none';
                                  }}
                                />
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
                <div className="border-t pt-4">
                  <div className="space-y-3">
                    <div className="relative">
                      <Textarea
                        ref={textareaRef}
                        placeholder={isArchived ? "Este chamado está arquivado e não permite novas mensagens." : "Digite sua mensagem..."}
                        value={newMessage}
                        onChange={handleTextareaChange}
                        onKeyDown={handleTextareaKeyDown}
                        rows={3}
                        disabled={isArchived || sendingMessage}
                      />
                      {showMentionSuggestions && mentionSuggestions.length > 0 && (
                        <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-40 overflow-y-auto">
                          {mentionSuggestions.map((user, index) => (
                            <button
                              key={index}
                              className="w-full px-3 py-2 text-left hover:bg-gray-100 flex items-center space-x-2"
                              onClick={() => insertMention(user)}
                            >
                              <AtSign className="h-4 w-4 text-gray-400" />
                              <span className="font-medium">{user.nome}</span>
                              <span className="text-sm text-gray-500">({user.email})</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    {!isArchived && (
                        <ImageUpload
                          onImagesUploaded={setChatImages}
                          existingImages={chatImages}
                          maxImages={3}
                          buttonText="Anexar ao Chat"
                          className="border-t pt-3"
                        />
                    )}
                    <div className="flex items-center justify-end">
                      <Button
                        onClick={handleSendMessage}
                        disabled={isArchived || sendingMessage || (!newMessage.trim() && chatImages.length === 0)}
                      >
                        {sendingMessage ? (
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        ) : (
                          <Send className="h-4 w-4 mr-2" />
                        )}
                        Enviar
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {!isArchived && userProfile && (userProfile.funcao === 'operador' || userProfile.funcao === 'administrador') && (
              <Card className="mt-6">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><span className="text-2xl">🔄</span>Escalar Chamado</CardTitle>
                  <CardDescription>Transfira este chamado para outra área quando necessário</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="escalation-area" className="text-base font-semibold">🎯 Área de Destino *</Label>
                      <Select value={escalationArea} onValueChange={setEscalationArea}>
                        <SelectTrigger className="mt-2 h-12 border-2 border-blue-300 focus:border-blue-500">
                          <SelectValue placeholder="👆 Selecione a área que deve receber o chamado" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="logistica">🚚 Logística</SelectItem>
                          <SelectItem value="almoxarifado">📦 Almoxarifado</SelectItem>
                          <SelectItem value="comunicacao_visual">🎨 Comunicação Visual</SelectItem>
                          <SelectItem value="locacao">🏢 Locação</SelectItem>
                          <SelectItem value="compras">🛒 Compras</SelectItem>
                          <SelectItem value="producao">🏭 Produção</SelectItem>
                          <SelectItem value="comercial">💼 Comercial</SelectItem>
                          <SelectItem value="operacional">⚙️ Operacional</SelectItem>
                          <SelectItem value="financeiro">💰 Financeiro</SelectItem>
                          <SelectItem value="logotipia">🎨 Logotipia</SelectItem>
                          <SelectItem value="detalhamento_tecnico">🔧 Detalhamento Técnico</SelectItem>
                          <SelectItem value="sub_locacao">🏗️ Sub-locação</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="escalation-reason" className="text-base font-semibold">📝 Motivo *</Label>
                      <Textarea
                        id="escalation-reason"
                        value={escalationReason}
                        onChange={(e) => setEscalationReason(e.target.value)}
                        placeholder="Descreva o motivo pelo qual está enviando este chamado para outra área..."
                        className="mt-2 min-h-[100px] border-2 border-blue-300 focus:border-blue-500"
                      />
                    </div>
                    {escalationArea && escalationReason.trim() && (
                      <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                        <p className="text-sm text-green-800 font-semibold">✅ Pronto para enviar para: <span className="font-bold">{escalationArea}</span></p>
                      </div>
                    )}
                    <Button
                      onClick={handleEscalation}
                      disabled={!escalationArea || !escalationReason.trim() || isEscalating}
                      className="w-full h-12 text-lg font-semibold bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400"
                    >
                      {isEscalating ? <><span className="animate-spin mr-2">⏳</span>Enviando...</> : <><span className="mr-2">🚀</span>Enviar para Área</>}
                    </Button>
                    <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                      <p className="text-sm text-yellow-800">⚠️ <strong>Atenção:</strong> Ao enviar, o chamado será transferido para a área selecionada e sairá da sua lista de responsabilidades.</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}


            {!isArchived && userProfile && (userProfile.funcao === 'operador' || userProfile.funcao === 'administrador') && project?.consultorId && (userProfile.funcao === 'administrador' || ticket.area === userProfile.area) && (
              <Card className="mt-6">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><span className="text-2xl">👨‍🎯</span>Escalar para Consultor</CardTitle>
                  <CardDescription>Escale este chamado para o consultor do projeto para tratativa específica</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="consultor-reason" className="text-base font-semibold">📝 Motivo da Escalação para Consultor *</Label>
                      <Textarea
                        id="consultor-reason"
                        value={consultorReason}
                        onChange={(e) => setConsultorReason(e.target.value)}
                        placeholder="Descreva o motivo pelo qual está escalando este chamado para o consultor do projeto..."
                        className="mt-2 min-h-[100px] border-2 border-green-300 focus:border-green-500"
                      />
                    </div>
                    {consultorReason.trim() && (
                      <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                        <p className="text-sm text-green-800 font-semibold">✅ Pronto para escalar para: <span className="font-bold">CONSULTOR DO PROJETO</span></p>
                        <p className="text-xs text-green-700 mt-1">Área de origem será salva para retorno: <span className="font-bold">{ticket.area?.replace('_', ' ').toUpperCase()}</span></p>
                      </div>
                    )}
                    <Button
                      onClick={handleConsultorEscalation}
                      disabled={!consultorReason.trim() || isEscalatingToConsultor}
                      className="w-full h-12 text-lg font-semibold bg-green-600 hover:bg-green-700 disabled:bg-gray-400"
                    >
                      {isEscalatingToConsultor ? <><span className="animate-spin mr-2">⏳</span>Escalando para Consultor...</> : <><span className="mr-2">👨‍🎯</span>Enviar para Consultor</>}
                    </Button>
                    <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                      <p className="text-sm text-green-800">⚠️ <strong>Fluxo:</strong> O chamado irá para o consultor do projeto. Após a ação do consultor, retornará automaticamente para sua área ({ticket.area?.replace('_', ' ').toUpperCase()}) para continuidade.</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {!isArchived && userProfile && (userProfile.funcao === 'operador' || userProfile.funcao === 'administrador') && (userProfile.funcao === 'administrador' || ticket.area === userProfile.area) && (
              <Card className="mt-6">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><span className="text-2xl">👨‍💼</span>Escalar para Gerência</CardTitle>
                  <CardDescription>Escale este chamado para qualquer gerência quando necessário</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="management-area" className="text-base font-semibold">👔 Gerência de Destino *</Label>
                      <Select value={managementArea} onValueChange={setManagementArea}>
                        <SelectTrigger className="mt-2 h-12 border-2 border-purple-300 focus:border-purple-500">
                          <SelectValue placeholder="👆 Selecione a gerência que deve receber o chamado" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="gerente_operacional">👨‍💼 Gerência Operacional</SelectItem>
                          <SelectItem value="gerente_comercial">💼 Gerência Comercial</SelectItem>
                          <SelectItem value="gerente_producao">🏭 Gerência Produção</SelectItem>
                          <SelectItem value="gerente_financeiro">💰 Gerência Financeira</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="management-reason" className="text-base font-semibold">📝 Motivo da Escalação para Gerência *</Label>
                      <Textarea
                        id="management-reason"
                        value={managementReason}
                        onChange={(e) => setManagementReason(e.target.value)}
                        placeholder="Descreva o motivo pelo qual está escalando este chamado para a gerência..."
                        className="mt-2 min-h-[100px] border-2 border-purple-300 focus:border-purple-500"
                      />
                    </div>
                    {managementArea && managementReason.trim() && (
                      <div className="p-3 bg-purple-50 border border-purple-200 rounded-lg">
                        <p className="text-sm text-purple-800 font-semibold">✅ Pronto para escalar para: <span className="font-bold">{managementArea.replace('gerente_', '').replace('_', ' ').toUpperCase()}</span></p>
                      </div>
                    )}
                    <Button
                      onClick={handleManagementEscalation}
                      disabled={!managementArea || !managementReason.trim() || isEscalatingToManagement}
                      className="w-full h-12 text-lg font-semibold bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400"
                    >
                      {isEscalatingToManagement ? <><span className="animate-spin mr-2">⏳</span>Escalando para Gerência...</> : <><span className="mr-2">👨‍💼</span>Enviar para Gerência</>}
                    </Button>
                    <div className="p-3 bg-purple-50 border border-purple-200 rounded-lg">
                      <p className="text-sm text-purple-800">⚠️ <strong>Atenção:</strong> Ao escalar para gerência, o chamado aguardará aprovação gerencial antes de retornar para execução.</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {!isArchived && userProfile && userProfile.funcao === 'operador' && project?.produtorId && (
              <Card className="mt-6">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><span className="text-2xl">🏭</span>Transferir para Produtor</CardTitle>
                  <CardDescription>Transfira este chamado para o produtor do projeto para continuidade e finalização</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                      <p className="text-sm text-blue-800 mb-2"><strong>Produtor do Projeto:</strong> {users.find(u => u.uid === project.produtorId)?.nome || 'Não identificado'}</p>
                      <p className="text-xs text-blue-600">O chamado será transferido para o produtor responsável por este projeto.</p>
                    </div>
                    <Button
                      onClick={handleTransferToProducer}
                      disabled={updating}
                      className="w-full h-12 text-lg font-semibold bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400"
                    >
                      {updating ? <><span className="animate-spin mr-2">⏳</span>Transferindo...</> : <><span className="mr-2">🏭</span>Enviar para Produtor</>}
                    </Button>
                    <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                      <p className="text-sm text-blue-800">ℹ️ <strong>Informação:</strong> O chamado será transferido para o produtor do projeto para dar continuidade e finalização.</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Sidebar */}
          <div className="lg:col-span-1 space-y-4 sm:space-y-6">
            <Card>
              <CardHeader className="pb-3 sm:pb-4">
                <CardTitle className="flex items-center text-base sm:text-lg">
                  <MapPin className="h-4 w-4 sm:h-5 sm:w-5 mr-2" />
                  Projeto
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 sm:space-y-4">
                <div>
                  <Label className="text-xs sm:text-sm font-medium text-gray-700">Nome</Label>
                  <p className="text-sm sm:text-base text-gray-900 break-words">{project?.nome || 'Projeto não encontrado'}</p>
                </div>
                {project?.cliente && (
                  <div>
                    <Label className="text-xs sm:text-sm font-medium text-gray-700">Cliente</Label>
                    <p className="text-sm sm:text-base text-gray-900 break-words">{project.cliente}</p>
                  </div>
                )}
                {project?.local && (
                  <div>
                    <Label className="text-xs sm:text-sm font-medium text-gray-700">Local</Label>
                    <p className="text-sm sm:text-base text-gray-900 break-words">{project.local}</p>
                  </div>
                )}
                {project && (
                  <div className="pt-3 mt-3 border-t">
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full"
                      onClick={() => navigate(`/projeto/${project.id}`)}
                    >
                      <ExternalLink className="h-4 w-4 mr-2" />
                      Acessar Detalhes do Projeto
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            {!isArchived && availableStatuses.length > 0 && (
              <Card>
                <CardHeader className="pb-3 sm:pb-4">
                  <CardTitle className="flex items-center text-base sm:text-lg">
                    <Settings className="h-4 w-4 sm:h-5 sm:w-5 mr-2" />
                    Ações
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 sm:space-y-4">
                  <div>
                    <Label className="text-xs sm:text-sm font-medium text-gray-700">Alterar Status</Label>
                    <Select value={newStatus} onValueChange={setNewStatus}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Selecione uma ação" />
                      </SelectTrigger>
                      <SelectContent>
                        {availableStatuses.map((status) => (
                          <SelectItem key={status.value} value={status.value}>
                            {status.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {(newStatus === 'concluido' || newStatus === 'rejeitado' || (newStatus === 'enviado_para_area' && ticket.status === 'executado_aguardando_validacao')) && (
                    <div className="space-y-3">
                      <div>
                        <Label htmlFor="conclusion-description">
                          {newStatus === 'concluido' ? 'Descrição da Conclusão' : 'Motivo da Rejeição'}
                        </Label>
                        <Textarea
                          id="conclusion-description"
                          placeholder={newStatus === 'concluido' ? "Descreva como o problema foi resolvido..." : "Explique o motivo da rejeição..."}
                          value={conclusionDescription}
                          onChange={(e) => setConclusionDescription(e.target.value)}
                          rows={3}
                          className={(newStatus === 'rejeitado' || (newStatus === 'enviado_para_area' && ticket.status === 'executado_aguardando_validacao')) ? "border-red-300 focus:border-red-500" : ""}
                        />
                        {(newStatus === 'rejeitado' || (newStatus === 'enviado_para_area' && ticket.status === 'executado_aguardando_validacao')) && (
                          <p className="text-xs text-red-600 mt-1">* Campo obrigatório para rejeição</p>
                        )}
                      </div>
                      {newStatus === 'concluido' && (
                        <div>
                          <Label>Evidências (Imagens)</Label>
                          <ImageUpload
                            onImagesUploaded={setConclusionImages}
                            existingImages={conclusionImages}
                            maxImages={5}
                            buttonText="Anexar Evidências"
                            className="mt-2"
                          />
                        </div>
                      )}
                    </div>
                  )}
                  <Button
                    onClick={handleStatusUpdate}
                    disabled={!newStatus || updating}
                    className={`w-full ${newStatus === 'rejeitado' ? 'bg-red-600 hover:bg-red-700' : ''}`}
                    variant={newStatus === 'rejeitado' ? 'destructive' : 'default'}
                  >
                    {updating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : newStatus === 'rejeitado' ? <XCircle className="h-4 w-4 mr-2" /> : <CheckCircle className="h-4 w-4 mr-2" />}
                    {updating ? 'Atualizando...' : 'Confirmar Ação'}
                  </Button>
                </CardContent>
              </Card>
            )}

            {!isArchived && userProfile?.funcao === 'administrador' && ticket.status === 'concluido' && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center text-base sm:text-lg">
                    <Archive className="h-4 w-4 sm:h-5 sm:w-5 mr-2" />
                    Ações de Arquivo
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Button onClick={handleArchiveTicket} disabled={updating} variant="outline" className="w-full">
                    {updating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Archive className="h-4 w-4 mr-2" />}
                    Arquivar Chamado
                  </Button>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Clock className="h-5 w-5 mr-2" />
                  Histórico do Chamado
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {historyEvents.length > 0 ? (
                    historyEvents.map((event, index) => (
                      <div key={index} className="flex items-start space-x-3">
                        <div className="flex flex-col items-center">
                          <span className={`flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 ${event.color}`}>
                            <event.Icon className="h-5 w-5" />
                          </span>
                          {index < historyEvents.length - 1 && (
                            <div className="h-6 w-px bg-gray-200" />
                          )}
                        </div>
                        <div className="flex-1 pt-1.5">
                          <p className="text-sm text-gray-800">
                            {event.description}{' '}
                            <span className="font-semibold text-gray-900">{event.userName}</span>
                          </p>
                          <p className="text-xs text-gray-500 mt-0.5">
                            {formatDate(event.date)}
                          </p>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-gray-500 text-center py-4">
                      Nenhum evento de histórico registrado.
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TicketDetailPage;
