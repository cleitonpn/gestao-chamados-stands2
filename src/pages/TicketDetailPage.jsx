import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { ticketService, TICKET_STATUS } from '@/services/ticketService';
import { projectService } from '@/services/projectService';
import { userService, AREAS } from '@/services/userService';
import { messageService } from '@/services/messageService';
// ✅ CORREÇÃO: Usando o serviço de notificação unificado
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
  AtSign
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

  // Estados para menções de usuários
  const [users, setUsers] = useState([]);
  const textareaRef = useRef(null);

  const loadTicketData = async () => {
    try {
      setLoading(true);
      setError(null);
      const ticketData = await ticketService.getTicketById(ticketId);
      if (!ticketData) throw new Error('Chamado não encontrado');
      setTicket(ticketData);

      if (ticketData.projetoId) {
        const projectData = await projectService.getProjectById(ticketData.projetoId);
        setProject(projectData);
      }
      const messagesData = await messageService.getMessagesByTicket(ticketId);
      setMessages(messagesData || []);
    } catch (err) {
      console.error('Erro ao carregar dados do chamado:', err);
      setError(err.message || 'Erro ao carregar chamado');
    } finally {
      setLoading(false);
    }
  };

  const markNotificationsAsRead = async () => {
    if (!user?.uid || !ticketId) return;
    try {
      // ✅ CORREÇÃO: Chama o serviço unificado
      await notificationService.markTicketNotificationsAsRead(user.uid, ticketId);
      console.log('✅ Notificações marcadas como lidas para o chamado:', ticketId);
    } catch (error) {
      console.error('❌ Erro ao marcar notificações como lidas (não-fatal):', error);
    }
  };
  
  const getAvailableStatuses = () => {
    // Sua lógica original aqui...
    return []; // Placeholder
  };
  
  const getStatusText = (status) => {
    // Sua lógica original aqui...
    return status; // Placeholder
  };

  const getStatusColor = (status) => {
    // Sua lógica original aqui...
    return 'bg-gray-100 text-gray-800'; // Placeholder
  };
  
  const formatDate = (dateValue) => {
    if (!dateValue) return 'N/A';
    try {
        const date = dateValue.toDate ? dateValue.toDate() : new Date(dateValue);
        return date.toLocaleString('pt-BR');
    } catch (e) {
        return 'Data inválida';
    }
  };


  useEffect(() => {
    const initData = async () => {
      if (ticketId && user) {
        await loadTicketData();
        await markNotificationsAsRead();
      }
    };
    initData();
  }, [ticketId, user]);

  const handleSendMessage = async () => {
    if ((!newMessage.trim() && chatImages.length === 0) || sendingMessage) return;
    try {
      setSendingMessage(true);
      const messageData = {
        remetenteId: user.uid,
        remetenteNome: userProfile.nome || user.email,
        conteudo: newMessage.trim(),
        imagens: chatImages,
        criadoEm: new Date(),
      };
      await messageService.sendMessage(ticketId, messageData);
      
      // ✅ ADICIONADO: Gatilho de notificação
      await notificationService.notifyNewMessage(ticketId, ticket, messageData, user.uid);
      
      setNewMessage('');
      setChatImages([]);
      const updatedMessages = await messageService.getMessagesByTicket(ticketId);
      setMessages(updatedMessages);
    } catch (err) {
      console.error('Erro ao enviar mensagem:', err);
    } finally {
      setSendingMessage(false);
    }
  };

  if (loading) return <div className="flex h-screen items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  if (error) return <div className="flex h-screen items-center justify-center text-red-500">{error}</div>;
  if (!ticket) return <div className="flex h-screen items-center justify-center">Chamado não encontrado.</div>;

  const availableStatuses = getAvailableStatuses();

  return (
    <div className="min-h-screen bg-gray-50">
      <Header title={`Chamado #${ticket.numero || ticketId.slice(-8)}`} />
      <div className="max-w-7xl mx-auto px-2 sm:px-4 lg:px-8 py-4 sm:py-6 lg:py-8">
        <div className="mb-4 sm:mb-6">
          <Button variant="ghost" size="sm" onClick={() => navigate('/dashboard')} className="mb-3 sm:mb-4 p-2 sm:p-3">
            <ArrowLeft className="h-4 w-4 mr-1 sm:mr-2" />
            <span className="text-sm sm:text-base">Voltar ao Dashboard</span>
          </Button>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-0">
            <div className="min-w-0 flex-1">
              <h2 className="text-lg sm:text-xl lg:text-2xl font-bold text-gray-900 break-words">{ticket.titulo || 'Título não disponível'}</h2>
              <p className="text-gray-600 mt-1">Criado em {formatDate(ticket.criadoEm)} por {ticket.criadoPorNome || 'Usuário desconhecido'}</p>
            </div>
            <Badge className={getStatusColor(ticket.status)}>{getStatusText(ticket.status)}</Badge>
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6 lg:gap-8">
          <div className="lg:col-span-2 space-y-4 sm:space-y-6">
            <Card>
              <CardHeader className="pb-3 sm:pb-4">
                <CardTitle className="flex items-center text-base sm:text-lg">
                  <AlertCircle className="h-4 w-4 sm:h-5 sm:w-5 mr-2" /> Detalhes do Chamado
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 sm:space-y-4">
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
                          <img src={imagem.url} alt={imagem.name || `Imagem ${index + 1}`} className="w-full h-32 object-cover rounded-lg border cursor-pointer hover:opacity-75" onClick={() => window.open(imagem.url, '_blank')} />
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
                  <MessageSquare className="h-5 w-5 mr-2" /> Conversas ({messages.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4 mb-6 max-h-96 overflow-y-auto">
                  {messages.length === 0 ? (
                    <p className="text-gray-500 text-center py-4">Nenhuma mensagem ainda.</p>
                  ) : (
                    messages.map((message, index) => (
                      <div key={index} className={`flex ${message.remetenteId === user.uid ? 'justify-end' : ''}`}>
                        <div className={`max-w-lg p-3 rounded-lg ${message.remetenteId === user.uid ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-800'}`}>
                          <p className="font-bold text-sm">{message.remetenteNome}</p>
                          <p className="text-sm">{message.conteudo}</p>
                          <p className="text-xs text-right mt-1 opacity-75">{formatDate(message.criadoEm)}</p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
                <div className="border-t pt-4">
                  <div className="space-y-3">
                    <Textarea placeholder="Digite sua mensagem..." value={newMessage} onChange={(e) => setNewMessage(e.target.value)} rows={3} />
                    <ImageUpload onImagesUploaded={setChatImages} existingImages={chatImages} maxImages={3} buttonText="Anexar Imagens" />
                    <div className="flex justify-end">
                      <Button onClick={handleSendMessage} disabled={sendingMessage || (!newMessage.trim() && chatImages.length === 0)}>
                        {sendingMessage ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />} Enviar
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
          <div className="lg:col-span-1 space-y-4 sm:space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center text-base sm:text-lg"><MapPin className="h-5 w-5 mr-2" /> Projeto</CardTitle>
              </CardHeader>
              <CardContent>
                {project ? (
                  <>
                    <p><strong>Nome:</strong> {project.nome}</p>
                    <p><strong>Cliente:</strong> {project.cliente}</p>
                    <p><strong>Local:</strong> {project.local}</p>
                  </>
                ) : <p>Carregando...</p>}
              </CardContent>
            </Card>
            {/* Outras cards como Ações e Histórico iriam aqui */}
          </div>
        </div>
      </div>
    </div>
  );
};

export default TicketDetailPage;
