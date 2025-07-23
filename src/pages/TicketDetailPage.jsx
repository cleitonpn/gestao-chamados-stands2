import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { ticketService } from '../services/ticketService';
import { projectService } from '../services/projectService';
import { userService } from '../services/userService';
import { messageService } from '../services/messageService';
import notificationService from '../services/notificationService';
import Header from '../components/Header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  ArrowLeft,
  Clock,
  User,
  MessageSquare,
  AlertCircle,
  Loader2,
  XCircle,
  MapPin,
  Settings
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

  const loadTicketData = async () => {
    try {
      if (!ticketId) {
        throw new Error("ID do chamado não encontrado na URL.");
      }
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

  const markNotificationsAsRead = async () => {
    if (!user?.uid || !ticketId) return;
    try {
      await notificationService.markTicketNotificationsAsRead(user.uid, ticketId);
    } catch (error) {
      console.error('❌ Erro ao marcar notificações como lidas (não fatal):', error);
    }
  };

  useEffect(() => {
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
    initData();
  }, [ticketId, user]);
  
  const formatDate = (dateValue) => {
    if (!dateValue) return 'N/A';
    const date = dateValue.toDate ? dateValue.toDate() : new Date(dateValue);
    return date.toLocaleString('pt-BR');
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex justify-center items-center h-screen text-red-500">
        <XCircle className="h-8 w-8 mr-2" />
        <p>Erro: {error}</p>
      </div>
    );
  }

  if (!ticket) {
    return (
      <div className="flex justify-center items-center h-screen">
        <p>Chamado não encontrado.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header title={`Chamado #${ticket.numero || ticketId.slice(-6)}`} />

      <main className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
        <Button variant="ghost" onClick={() => navigate(-1)} className="mb-4">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Voltar
        </Button>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Coluna Principal */}
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="text-2xl">{ticket.titulo}</CardTitle>
                    <p className="text-sm text-gray-500">
                      Criado por {ticket.criadoPorNome} em {formatDate(ticket.createdAt)}
                    </p>
                  </div>
                  <Badge>{ticket.status}</Badge>
                </div>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap">{ticket.descricao}</p>
              </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center">
                        <MessageSquare className="h-5 w-5 mr-2" />
                        Conversas
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {/* Aqui virá o componente de chat */}
                    <p className="text-gray-500">O chat será implementado aqui.</p>
                </CardContent>
            </Card>
          </div>

          {/* Coluna Lateral */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center"><Settings className="h-5 w-5 mr-2" />Ações</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-500">Opções de status e escalação virão aqui.</p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center"><MapPin className="h-5 w-5 mr-2" />Projeto</CardTitle>
              </CardHeader>
              <CardContent>
                {project ? (
                  <div className="space-y-2">
                    <p><strong>Nome:</strong> {project.nome}</p>
                    <p><strong>Cliente:</strong> {project.cliente}</p>
                    <p><strong>Local:</strong> {project.local}</p>
                  </div>
                ) : (
                  <p>Carregando informações do projeto...</p>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
};

export default TicketDetailPage;
