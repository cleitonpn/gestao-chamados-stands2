import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, updateDoc, collection, addDoc, query, orderBy, onSnapshot, getDocs, where } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from '../contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import { Badge } from '../components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { ArrowLeft, Send, Clock, User, Building, CheckCircle, AlertCircle, UserCheck, Users, FileText } from 'lucide-react';
import { toast } from 'react-hot-toast';

const TicketDetailPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, userProfile } = useAuth();
  
  const [ticket, setTicket] = useState(null);
  const [loading, setLoading] = useState(true);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [escalationArea, setEscalationArea] = useState('');
  const [escalationReason, setEscalationReason] = useState('');
  const [escalationTarget, setEscalationTarget] = useState('');
  const [users, setUsers] = useState([]);
  const [projects, setProjects] = useState([]);

  // Áreas disponíveis para escalonamento
  const areas = [
    { value: 'producao', label: '🏗️ Produção', color: 'bg-blue-500' },
    { value: 'comunicacao_visual', label: '📺 Comunicação Visual', color: 'bg-yellow-500' },
    { value: 'almoxarifado', label: '📦 Almoxarifado', color: 'bg-green-500' },
    { value: 'projetos', label: '📋 Projetos', color: 'bg-purple-500' },
    { value: 'ti', label: '⚙️ TI', color: 'bg-gray-500' },
    { value: 'rh', label: '👥 RH', color: 'bg-pink-500' },
    { value: 'financeiro', label: '💰 Financeiro', color: 'bg-red-500' },
    { value: 'compras', label: '💼 Compras', color: 'bg-indigo-500' },
    { value: 'locacao', label: '🚚 Locação', color: 'bg-orange-500' },
    { value: 'operacao', label: '🔧 Operação', color: 'bg-teal-500' },
    { value: 'logistica', label: '📦 Logística', color: 'bg-cyan-500' },
    { value: 'comercial', label: '📞 Comercial', color: 'bg-emerald-500' }
  ];

  useEffect(() => {
    if (!id) {
      setLoading(false);
      return;
    }
    
    loadTicket();
    loadUsers();
    loadProjects();
  }, [id]);

  useEffect(() => {
    if (!id) return;
    
    const messagesRef = collection(db, 'chamados', id, 'mensagens');
    const q = query(messagesRef, orderBy('timestamp', 'asc'));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const messagesData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setMessages(messagesData);
    });

    return () => unsubscribe();
  }, [id]);

  const loadTicket = async () => {
    try {
      const ticketDoc = await getDoc(doc(db, 'chamados', id));
      if (ticketDoc.exists()) {
        setTicket({ id: ticketDoc.id, ...ticketDoc.data() });
      } else {
        toast.error('Chamado não encontrado');
        navigate('/');
      }
    } catch (error) {
      console.error('Erro ao carregar chamado:', error);
      toast.error('Erro ao carregar chamado');
    } finally {
      setLoading(false);
    }
  };

  const loadUsers = async () => {
    try {
      const usersSnapshot = await getDocs(collection(db, 'usuarios'));
      const usersData = usersSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setUsers(usersData);
    } catch (error) {
      console.error('Erro ao carregar usuários:', error);
    }
  };

  const loadProjects = async () => {
    try {
      const projectsSnapshot = await getDocs(collection(db, 'projetos'));
      const projectsData = projectsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setProjects(projectsData);
    } catch (error) {
      console.error('Erro ao carregar projetos:', error);
    }
  };

  const sendMessage = async () => {
    if (!newMessage.trim()) return;

    try {
      const messagesRef = collection(db, 'chamados', id, 'mensagens');
      await addDoc(messagesRef, {
        texto: newMessage,
        autorId: user.uid,
        autorNome: userProfile?.nome || user.email,
        timestamp: new Date(),
        tipo: 'mensagem'
      });

      setNewMessage('');
      toast.success('Mensagem enviada');
    } catch (error) {
      console.error('Erro ao enviar mensagem:', error);
      toast.error('Erro ao enviar mensagem');
    }
  };

  const updateTicketStatus = async (newStatus) => {
    try {
      await updateDoc(doc(db, 'chamados', id), {
        status: newStatus,
        updatedAt: new Date()
      });

      // Adicionar mensagem de status
      const messagesRef = collection(db, 'chamados', id, 'mensagens');
      await addDoc(messagesRef, {
        texto: `Status alterado para: ${newStatus}`,
        autorId: user.uid,
        autorNome: userProfile?.nome || user.email,
        timestamp: new Date(),
        tipo: 'status'
      });

      toast.success('Status atualizado');
      loadTicket();
    } catch (error) {
      console.error('Erro ao atualizar status:', error);
      toast.error('Erro ao atualizar status');
    }
  };

  const escalateToArea = async () => {
    if (!escalationArea || !escalationReason.trim()) {
      toast.error('Selecione uma área e informe o motivo');
      return;
    }

    try {
      await updateDoc(doc(db, 'chamados', id), {
        areaAtual: escalationArea,
        status: 'aberto',
        updatedAt: new Date()
      });

      // Adicionar mensagem de escalonamento
      const messagesRef = collection(db, 'chamados', id, 'mensagens');
      await addDoc(messagesRef, {
        texto: `Chamado escalado para: ${areas.find(a => a.value === escalationArea)?.label}\nMotivo: ${escalationReason}`,
        autorId: user.uid,
        autorNome: userProfile?.nome || user.email,
        timestamp: new Date(),
        tipo: 'escalacao'
      });

      setEscalationArea('');
      setEscalationReason('');
      toast.success('Chamado escalado com sucesso');
      loadTicket();
    } catch (error) {
      console.error('Erro ao escalar chamado:', error);
      toast.error('Erro ao escalar chamado');
    }
  };

  const escalateToManager = async () => {
    if (!escalationTarget || !escalationReason.trim()) {
      toast.error('Selecione um gerente e informe o motivo');
      return;
    }

    try {
      const selectedManager = users.find(u => u.id === escalationTarget);
      
      await updateDoc(doc(db, 'chamados', id), {
        gerenteId: escalationTarget,
        status: 'escalado_gerencia',
        updatedAt: new Date()
      });

      // Adicionar mensagem de escalonamento
      const messagesRef = collection(db, 'chamados', id, 'mensagens');
      await addDoc(messagesRef, {
        texto: `Chamado escalado para gerência: ${selectedManager?.nome}\nMotivo: ${escalationReason}`,
        autorId: user.uid,
        autorNome: userProfile?.nome || user.email,
        timestamp: new Date(),
        tipo: 'escalacao'
      });

      setEscalationTarget('');
      setEscalationReason('');
      toast.success('Chamado escalado para gerência');
      loadTicket();
    } catch (error) {
      console.error('Erro ao escalar para gerência:', error);
      toast.error('Erro ao escalar para gerência');
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'aberto': return 'bg-blue-500';
      case 'em_andamento': return 'bg-yellow-500';
      case 'concluido': return 'bg-green-500';
      case 'escalado_gerencia': return 'bg-purple-500';
      default: return 'bg-gray-500';
    }
  };

  const getProjectName = (projectId) => {
    const project = projects.find(p => p.id === projectId);
    return project ? project.nome : 'Projeto não encontrado';
  };

  const formatDate = (date) => {
    if (!date) return '';
    const d = date.toDate ? date.toDate() : new Date(date);
    return d.toLocaleString('pt-BR');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Carregando chamado...</p>
        </div>
      </div>
    );
  }

  if (!ticket) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <p className="text-gray-600">Chamado não encontrado</p>
          <Button onClick={() => navigate('/')} className="mt-4">
            Voltar ao Dashboard
          </Button>
        </div>
      </div>
    );
  }

  const managers = users.filter(u => u.funcao === 'gerente');

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate('/')}
                className="mr-4"
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Voltar
              </Button>
              <h1 className="text-xl font-semibold text-gray-900">
                Chamado #{ticket.numero || ticket.id?.slice(-6)}
              </h1>
            </div>
            <Badge className={`${getStatusColor(ticket.status)} text-white`}>
              {ticket.status}
            </Badge>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Informações do Chamado */}
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <FileText className="h-5 w-5 mr-2" />
                  Detalhes do Chamado
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-gray-700">Título</label>
                  <p className="text-gray-900">{ticket.titulo}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">Descrição</label>
                  <p className="text-gray-900">{ticket.descricao}</p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-gray-700">Projeto</label>
                    <p className="text-gray-900">{getProjectName(ticket.projetoId)}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700">Área Atual</label>
                    <p className="text-gray-900">{ticket.areaAtual}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-gray-700">Criado por</label>
                    <p className="text-gray-900">{ticket.autorNome}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700">Data de Criação</label>
                    <p className="text-gray-900">{formatDate(ticket.createdAt)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Chat de Mensagens */}
            <Card className="mt-6">
              <CardHeader>
                <CardTitle>Conversas</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4 max-h-96 overflow-y-auto mb-4">
                  {messages.map((message) => (
                    <div
                      key={message.id}
                      className={`flex ${message.autorId === user.uid ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${
                          message.autorId === user.uid
                            ? 'bg-blue-500 text-white'
                            : 'bg-gray-200 text-gray-900'
                        }`}
                      >
                        <p className="text-sm font-medium">{message.autorNome}</p>
                        <p>{message.texto}</p>
                        <p className="text-xs opacity-75 mt-1">
                          {formatDate(message.timestamp)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
                
                <div className="flex space-x-2">
                  <Input
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    placeholder="Digite sua mensagem..."
                    onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                  />
                  <Button onClick={sendMessage}>
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Ações */}
          <div>
            <Card>
              <CardHeader>
                <CardTitle>Ações</CardTitle>
              </CardHeader>
              <CardContent>
                <Tabs defaultValue="status" className="w-full">
                  <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="status">Status</TabsTrigger>
                    <TabsTrigger value="escalacao">Escalar</TabsTrigger>
                    <TabsTrigger value="gerencia">Gerência</TabsTrigger>
                  </TabsList>
                  
                  <TabsContent value="status" className="space-y-4">
                    <Button
                      onClick={() => updateTicketStatus('em_andamento')}
                      className="w-full"
                      variant="outline"
                    >
                      <Clock className="h-4 w-4 mr-2" />
                      Iniciar Tratativa
                    </Button>
                    <Button
                      onClick={() => updateTicketStatus('concluido')}
                      className="w-full"
                      variant="outline"
                    >
                      <CheckCircle className="h-4 w-4 mr-2" />
                      Marcar como Executado
                    </Button>
                  </TabsContent>
                  
                  <TabsContent value="escalacao" className="space-y-4">
                    <Select value={escalationArea} onValueChange={setEscalationArea}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione uma área" />
                      </SelectTrigger>
                      <SelectContent>
                        {areas.map((area) => (
                          <SelectItem key={area.value} value={area.value}>
                            <div className="flex items-center">
                              <div className={`w-3 h-3 rounded-full ${area.color} mr-2`}></div>
                              {area.label}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    
                    <Textarea
                      value={escalationReason}
                      onChange={(e) => setEscalationReason(e.target.value)}
                      placeholder="Motivo do escalonamento..."
                    />
                    
                    <Button onClick={escalateToArea} className="w-full">
                      <Building className="h-4 w-4 mr-2" />
                      Escalar para Área
                    </Button>
                  </TabsContent>
                  
                  <TabsContent value="gerencia" className="space-y-4">
                    <Select value={escalationTarget} onValueChange={setEscalationTarget}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione um gerente" />
                      </SelectTrigger>
                      <SelectContent>
                        {managers.map((manager) => (
                          <SelectItem key={manager.id} value={manager.id}>
                            <div className="flex items-center">
                              <UserCheck className="h-4 w-4 mr-2 text-purple-600" />
                              {manager.nome} ({manager.area || 'Geral'})
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    
                    <Textarea
                      value={escalationReason}
                      onChange={(e) => setEscalationReason(e.target.value)}
                      placeholder="Motivo do escalonamento..."
                    />
                    
                    <Button onClick={escalateToManager} className="w-full">
                      <Users className="h-4 w-4 mr-2" />
                      Escalar para Gerência
                    </Button>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TicketDetailPage;
