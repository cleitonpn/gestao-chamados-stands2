import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { ticketService } from '../services/ticketService';
import { projectService } from '../services/projectService';
import { userService } from '../services/userService';
import { messageService } from '../services/messageService';
import notificationService from '../services/notificationService';
import ImageUpload from '../components/ImageUpload';
import Header from '../components/Header';
// ... (imports de UI e ícones)
import {
  ArrowLeft,
  Clock,
  User,
  MessageSquare,
  Send,
  CheckCircle,
  XCircle,
  AlertCircle,
  Loader2
  // Adicione outros ícones que você usa aqui
} from 'lucide-react';

const TicketDetailPage = () => {
  const { ticketId } = useParams();
  const navigate = useNavigate();
  const { user, userProfile } = useAuth();

  const [ticket, setTicket] = useState(null);
  const [project, setProject] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // ... (outros estados do seu componente)

  // Função para carregar dados do chamado
  const loadTicketData = async () => {
    try {
      setLoading(true);
      setError(null);
      const ticketData = await ticketService.getTicketById(ticketId);
      if (!ticketData) {
        throw new Error('Chamado não encontrado');
      }
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

  // Função para marcar notificações como lidas
  const markNotificationsAsRead = async () => {
    if (!user?.uid || !ticketId) return;
    try {
      await notificationService.markTicketNotificationsAsRead(user.uid, ticketId);
    } catch (error) {
      console.error('❌ Erro ao marcar notificações como lidas (não fatal):', error);
    }
  };
  
  // Carregar dados na inicialização
  useEffect(() => {
    // ✅ CORREÇÃO APLICADA AQUI
    const initData = async () => {
      if (ticketId && user) {
        try {
          await loadTicketData();
          await markNotificationsAsRead();
        } catch (e) {
          console.error("Erro na inicialização da página de detalhes:", e);
        }
      }
    };
    initData(); // Chama a função corrigida
  }, [ticketId, user]);


  // ... (O resto do seu componente, funções de handle, etc., permanece o mesmo)
  
  // Renderização de loading
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Carregando detalhes do chamado...</p>
        </div>
      </div>
    );
  }

  // Renderização de erro
  if (error) {
     return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <XCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Erro ao carregar chamado</h2>
          <p className="text-gray-600 mb-4">{error}</p>
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
                <p className="text-gray-600 mb-4">O chamado que você está procurando não existe ou foi movido.</p>
                <Button onClick={() => navigate('/dashboard')} variant="outline">
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Voltar ao Dashboard
                </Button>
            </div>
        </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
       <Header title={`Chamado #${ticket.numero || ticketId.slice(-8)}`} />
       {/* Aqui vai todo o JSX da sua página... ele não precisa ser alterado. */}
       <div className="p-4">
         Renderização do seu chamado...
       </div>
    </div>
  );
};

export default TicketDetailPage;
