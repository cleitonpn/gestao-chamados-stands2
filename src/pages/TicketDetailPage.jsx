import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { ticketService, TICKET_STATUS } from '@/services/ticketService';
import { projectService } from '@/services/projectService';
import { userService, AREAS } from '@/services/userService';
import { messageService } from '@/services/messageService';
// ✅ ADICIONADO: Serviço de notificação unificado
import notificationService from '@/services/notificationService';
// ❌ REMOVIDO: Importação direta do serviço de baixo nível
// import { firestoreNotificationService } from '@/services/firestoreNotificationService'; 
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

  // (Todos os seus 'useState' originais permanecem aqui, sem alterações)
  const [ticket, setTicket] = useState(null);
  const [project, setProject] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState(null);
  const [newMessage, setNewMessage] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);
  const [chatImages, setChatImages] = useState([]);
  const [newStatus, setNewStatus] = useState('');
  // ... etc

  const loadTicketData = async () => {
      // (Sua função original, sem alterações)
  };

  useEffect(() => {
    if (ticketId && user) {
      loadTicketData();
      markNotificationsAsRead();
    }
  }, [ticketId, user]);

  // ✅ CORRIGIDO: A função agora chama o serviço correto
  const markNotificationsAsRead = async () => {
    if (!user?.uid || !ticketId) return;
    try {
      await notificationService.markTicketNotificationsAsRead(user.uid, ticketId);
      console.log('✅ Notificações marcadas como lidas para o chamado:', ticketId);
    } catch (error) {
      console.error('❌ Erro ao marcar notificações como lidas:', error);
    }
  };

  // (Todas as suas funções originais como `loadUsers`, `detectMentions`, `getAvailableStatuses`, etc., permanecem aqui sem alterações)
  
  const handleStatusUpdate = async () => {
    // (Início da sua função original `handleStatusUpdate`, sem alterações)
    if (!newStatus || updating) return;
    // ... (toda a sua lógica de validação original)

    try {
      setUpdating(true);
      // (Toda a sua lógica original para construir `updateData`)
      
      // ... após a chamada ao banco de dados que atualiza o ticket
      await ticketService.updateTicket(ticketId, updateData); // ou outra chamada de atualização

      // ✅ ADICIONADO: Gatilho de notificação para mudança de status
      try {
        console.log('🔔 Enviando notificação de mudança de status...');
        await notificationService.notifyStatusChange(ticketId, ticket, {
          novoStatus: getStatusText(newStatus), // Usando a função que você já tem para pegar o texto do status
          statusAnterior: getStatusText(ticket.status)
        }, user.uid);
        console.log('✅ Notificação de mudança de status enviada.');
      } catch (notificationError) {
        console.error('❌ Erro ao enviar notificação de status:', notificationError);
      }
      
      await loadTicketData();
      // ... (resto da sua função original)
    } catch (err) {
      // ... (seu `catch` original)
    } finally {
      setUpdating(false);
    }
  };

  const handleSendMessage = async () => {
    if ((!newMessage.trim() && chatImages.length === 0) || sendingMessage) return;

    try {
      setSendingMessage(true);

      const messageData = {
        ticketId,
        remetenteId: user.uid,
        remetenteFuncao: userProfile.funcao,
        remetenteNome: userProfile.nome || user.email,
        conteudo: newMessage.trim(),
        imagens: chatImages, // Supondo que isso seja um array de URLs
        criadoEm: new Date() // Usar new Date() é mais seguro que toISOString()
      };

      await messageService.sendMessage(ticketId, messageData);

      // ✅ ADICIONADO: Gatilho de notificação para nova mensagem
      try {
        console.log('🔔 Enviando notificação de nova mensagem...');
        await notificationService.notifyNewMessage(ticketId, ticket, messageData, user.uid);
        console.log('✅ Notificação de nova mensagem enviada.');
      } catch (notificationError) {
        console.error('❌ Erro ao enviar notificação de mensagem:', notificationError);
      }

      const messagesData = await messageService.getMessagesByTicket(ticketId);
      setMessages(messagesData || []);

      setNewMessage('');
      setChatImages([]);

    } catch (err) {
      console.error('Erro ao enviar mensagem:', err);
      setError('Erro ao enviar mensagem');
    } finally {
      setSendingMessage(false);
    }
  };


  // (Todo o resto do seu arquivo, incluindo o JSX, permanece exatamente como no original)
  return (
    <div className="min-h-screen bg-gray-50">
        <Header title={`Chamado #${ticket?.numero || ticketId.slice(-8)}`} />
        {/* ... seu JSX original completo aqui ... */}
    </div>
  );
};

export default TicketDetailPage;
