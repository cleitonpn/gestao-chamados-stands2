import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { projectService } from '../services/projectService';
import { userService } from '../services/userService';
import { eventService } from '../services/eventService';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  ArrowLeft, 
  AlertCircle,
  Loader2,
  Save,
  Building,
  CalendarDays,
  FileText,
  Users,
  Wrench,
  PartyPopper,
  Truck,
  Calendar,
  ExternalLink
} from 'lucide-react';

const ProjectFormPage = () => {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const { user, userProfile, authInitialized } = useAuth();
  
  const [users, setUsers] = useState([]);
  const [events, setEvents] = useState([]);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState('');
  
  // Determinar se é modo edição
  const isEditMode = !!projectId;
  
  // Form state
  const [formData, setFormData] = useState({
    nome: '',
    feira: '',
    local: '',
    metragem: '',
    tipoMontagem: '',
    pavilhao: '',
    eventoId: '',
    montagem: {
      dataInicio: '',
      dataFim: ''
    },
    evento: {
      dataInicio: '',
      dataFim: ''
    },
    desmontagem: {
      dataInicio: '',
      dataFim: ''
    },
    dataInicio: '',
    dataFim: '',
    produtorId: '',
    consultorId: '',
    descricao: '',
    observacoes: '',
    linkDrive: '',
    equipesEmpreiteiras: {
      marcenaria: '',
      tapecaria: '',
      limpeza: '',
      eletrica: '',
      pintura: '',
      serralheria: ''
    }
  });

  useEffect(() => {
    if (authInitialized && user && userProfile) {
      if (userProfile.funcao !== 'administrador') {
        navigate('/dashboard');
        return;
      }
      loadData();
    } else if (authInitialized && !user) {
      navigate('/login');
    }
  }, [user, userProfile, authInitialized, navigate, projectId]);

  // Função segura para converter timestamp para string de data
  const formatDateForInput = (timestamp) => {
    if (!timestamp) return '';
    
    try {
      let date;
      
      // Se é um objeto Firestore timestamp
      if (timestamp && typeof timestamp === 'object' && timestamp.seconds) {
        date = new Date(timestamp.seconds * 1000);
      }
      // Se é uma string de data
      else if (typeof timestamp === 'string') {
        date = new Date(timestamp);
      }
      // Se já é um objeto Date
      else if (timestamp instanceof Date) {
        date = timestamp;
      }
      // Se é um número (timestamp em ms)
      else if (typeof timestamp === 'number') {
        date = new Date(timestamp);
      }
      else {
        console.warn('Formato de data não reconhecido:', timestamp);
        return '';
      }
      
      // Verificar se a data é válida
      if (isNaN(date.getTime())) {
        console.warn('Data inválida:', timestamp);
        return '';
      }
      
      return date.toISOString().split('T')[0];
    } catch (error) {
      console.error('Erro ao formatar data:', timestamp, error);
      return '';
    }
  };

  // Função segura para formatar data para exibição
  const formatDateForDisplay = (timestamp) => {
    if (!timestamp) return '-';
    
    try {
      let date;
      
      if (timestamp && typeof timestamp === 'object' && timestamp.seconds) {
        date = new Date(timestamp.seconds * 1000);
      } else if (typeof timestamp === 'string') {
        date = new Date(timestamp);
      } else if (timestamp instanceof Date) {
        date = timestamp;
      } else if (typeof timestamp === 'number') {
        date = new Date(timestamp);
      } else {
        return '-';
      }
      
      if (isNaN(date.getTime())) {
        return '-';
      }
      
      return date.toLocaleDateString('pt-BR');
    } catch (error) {
      console.error('Erro ao formatar data para exibição:', timestamp, error);
      return '-';
    }
  };

  const loadData = async () => {
    try {
      setLoading(true);
      setFormError('');

      console.log('🔄 Carregando dados...');
      
      // Carregar usuários e eventos em paralelo
      const [usersData, eventsData] = await Promise.all([
        userService.getAllUsers().catch(() => []),
        eventService.getAllEvents().catch(() => [])
      ]);
      
      console.log('👥 Usuários carregados:', usersData?.length || 0);
      console.log('📅 Eventos carregados:', eventsData?.length || 0);
      
      setUsers(usersData || []);
      setEvents(eventsData || []);

      // Se é modo edição, carregar dados do projeto
      if (isEditMode && projectId) {
        console.log('📝 Carregando projeto para edição:', projectId);
        const projectData = await projectService.getProjectById(projectId);
        
        if (projectData) {
          console.log('✅ Projeto carregado:', projectData.nome);

          // Preencher formulário com dados do projeto
          setFormData({
            nome: projectData.nome || '',
            feira: projectData.feira || '',
            local: projectData.local || '',
            metragem: projectData.metragem || '',
            tipoMontagem: projectData.tipoMontagem || '',
            pavilhao: projectData.pavilhao || '',
            eventoId: projectData.eventoId || '',
            montagem: {
              dataInicio: formatDateForInput(projectData.montagem?.dataInicio),
              dataFim: formatDateForInput(projectData.montagem?.dataFim)
            },
            evento: {
              dataInicio: formatDateForInput(projectData.evento?.dataInicio),
              dataFim: formatDateForInput(projectData.evento?.dataFim)
            },
            desmontagem: {
              dataInicio: formatDateForInput(projectData.desmontagem?.dataInicio),
              dataFim: formatDateForInput(projectData.desmontagem?.dataFim)
            },
            dataInicio: formatDateForInput(projectData.dataInicio),
            dataFim: formatDateForInput(projectData.dataFim),
            produtorId: projectData.produtorId || '',
            consultorId: projectData.consultorId || '',
            descricao: projectData.descricao || '',
            observacoes: projectData.observacoes || '',
            linkDrive: projectData.linkDrive || '',
            equipesEmpreiteiras: {
              marcenaria: projectData.equipesEmpreiteiras?.marcenaria || '',
              tapecaria: projectData.equipesEmpreiteiras?.tapecaria || '',
              limpeza: projectData.equipesEmpreiteiras?.limpeza || '',
              eletrica: projectData.equipesEmpreiteiras?.eletrica || '',
              pintura: projectData.equipesEmpreiteiras?.pintura || '',
              serralheria: projectData.equipesEmpreiteiras?.serralheria || ''
            }
          });

          // Se projeto tem evento associado, carregar dados do evento
          if (projectData.eventoId && eventsData.length > 0) {
            const event = eventsData.find(e => e.id === projectData.eventoId);
            if (event) {
              setSelectedEvent(event);
            }
          }
        }
      }
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
      setFormError('Erro ao carregar dados. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  // Função para filtrar usuários por função
  const getFilteredUsers = (role) => {
    if (!users || !Array.isArray(users)) return [];
    return users.filter(user => 
      user && 
      user.id && 
      user.nome && 
      user.funcao === role
    );
  };

  const producers = getFilteredUsers('produtor');
  const consultants = getFilteredUsers('consultor');

  // Função para lidar com seleção de evento
  const handleEventSelect = (eventId) => {
    console.log('📅 Evento selecionado:', eventId);
    
    if (eventId === 'manual') {
      // Modo manual - limpar evento selecionado
      setSelectedEvent(null);
      setFormData(prev => ({
        ...prev,
        eventoId: '',
        feira: prev.feira, // Manter feira se já preenchida
        pavilhao: prev.pavilhao // Manter pavilhão se já preenchido
      }));
      return;
    }

    const event = events.find(e => e.id === eventId);
    if (event) {
      console.log('✅ Dados do evento:', event);
      setSelectedEvent(event);
      
      try {
        // Preencher automaticamente os campos baseados no evento
        setFormData(prev => {
          const newData = {
            ...prev,
            eventoId: eventId,
            feira: event.nome || prev.feira,
            pavilhao: event.pavilhao || prev.pavilhao
          };

          // Preencher datas se disponíveis no evento - COM VALIDAÇÃO
          if (event.dataInicioMontagem) {
            const dataFormatada = formatDateForInput(event.dataInicioMontagem);
            if (dataFormatada) {
              newData.montagem.dataInicio = dataFormatada;
            }
          }
          
          if (event.dataFimMontagem) {
            const dataFormatada = formatDateForInput(event.dataFimMontagem);
            if (dataFormatada) {
              newData.montagem.dataFim = dataFormatada;
            }
          }
          
          if (event.dataInicioEvento) {
            const dataFormatada = formatDateForInput(event.dataInicioEvento);
            if (dataFormatada) {
              newData.evento.dataInicio = dataFormatada;
            }
          }
          
          if (event.dataFimEvento) {
            const dataFormatada = formatDateForInput(event.dataFimEvento);
            if (dataFormatada) {
              newData.evento.dataFim = dataFormatada;
            }
          }
          
          if (event.dataInicioDesmontagem) {
            const dataFormatada = formatDateForInput(event.dataInicioDesmontagem);
            if (dataFormatada) {
              newData.desmontagem.dataInicio = dataFormatada;
            }
          }
          
          if (event.dataFimDesmontagem) {
            const dataFormatada = formatDateForInput(event.dataFimDesmontagem);
            if (dataFormatada) {
              newData.desmontagem.dataFim = dataFormatada;
            }
          }

          // Calcular datas gerais
          newData.dataInicio = newData.montagem.dataInicio || newData.evento.dataInicio || '';
          newData.dataFim = newData.desmontagem.dataFim || newData.evento.dataFim || '';
          
          return newData;
        });
      } catch (error) {
        console.error('Erro ao processar dados do evento:', error);
        setFormError('Erro ao processar dados do evento. Tente novamente.');
      }
    }
  };

  const handleInputChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleNestedInputChange = (section, field, value) => {
    setFormData(prev => ({
      ...prev,
      [section]: {
        ...prev[section],
        [field]: value
      }
    }));
  };

  const validateForm = () => {
    if (!formData.nome.trim()) {
      setFormError('Nome do projeto é obrigatório');
      return false;
    }
    if (!formData.feira.trim()) {
      setFormError('Nome da feira é obrigatório');
      return false;
    }
    if (!formData.local.trim()) {
      setFormError('Local é obrigatório');
      return false;
    }
    if (!formData.metragem.trim()) {
      setFormError('Metragem é obrigatória');
      return false;
    }
    if (!formData.tipoMontagem.trim()) {
      setFormError('Tipo de montagem é obrigatório');
      return false;
    }
    
    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }

    try {
      setFormLoading(true);
      setFormError('');

      // Função para converter data string para Date ou null
      const parseDate = (dateString) => {
        if (!dateString || dateString.trim() === '') return null;
        try {
          return new Date(dateString);
        } catch (error) {
          console.error('Erro ao converter data:', dateString, error);
          return null;
        }
      };

      // Preparar dados do projeto - REMOVENDO CAMPOS UNDEFINED
      const projectData = {
        nome: formData.nome.trim(),
        feira: formData.feira.trim(),
        local: formData.local.trim(),
        metragem: formData.metragem.trim(),
        tipoMontagem: formData.tipoMontagem.trim(),
        pavilhao: formData.pavilhao.trim(),
        descricao: formData.descricao.trim(),
        observacoes: formData.observacoes.trim(),
        linkDrive: formData.linkDrive.trim(),
        equipesEmpreiteiras: formData.equipesEmpreiteiras,
        status: 'ativo',
        atualizadoEm: new Date()
      };

      // Adicionar eventoId apenas se não estiver vazio
      if (formData.eventoId && formData.eventoId.trim() !== '') {
        projectData.eventoId = formData.eventoId;
      }

      // Adicionar datas apenas se não forem null
      const montagemInicio = parseDate(formData.montagem.dataInicio);
      const montagemFim = parseDate(formData.montagem.dataFim);
      const eventoInicio = parseDate(formData.evento.dataInicio);
      const eventoFim = parseDate(formData.evento.dataFim);
      const desmontagemInicio = parseDate(formData.desmontagem.dataInicio);
      const desmontagemFim = parseDate(formData.desmontagem.dataFim);
      const dataInicio = parseDate(formData.dataInicio);
      const dataFim = parseDate(formData.dataFim);

      // Adicionar objetos de datas apenas se tiverem pelo menos uma data válida
      if (montagemInicio || montagemFim) {
        projectData.montagem = {};
        if (montagemInicio) projectData.montagem.dataInicio = montagemInicio;
        if (montagemFim) projectData.montagem.dataFim = montagemFim;
      }

      if (eventoInicio || eventoFim) {
        projectData.evento = {};
        if (eventoInicio) projectData.evento.dataInicio = eventoInicio;
        if (eventoFim) projectData.evento.dataFim = eventoFim;
      }

      if (desmontagemInicio || desmontagemFim) {
        projectData.desmontagem = {};
        if (desmontagemInicio) projectData.desmontagem.dataInicio = desmontagemInicio;
        if (desmontagemFim) projectData.desmontagem.dataFim = desmontagemFim;
      }

      if (dataInicio) projectData.dataInicio = dataInicio;
      if (dataFim) projectData.dataFim = dataFim;

      // Adicionar informações do produtor se selecionado
      if (formData.produtorId && formData.produtorId !== 'sem_produtor') {
        const producer = users.find(u => u.id === formData.produtorId);
        if (producer) {
          projectData.produtorId = formData.produtorId;
          projectData.produtorUid = producer.uid || '';
          projectData.produtorNome = producer.nome || '';
          projectData.produtorEmail = producer.email || '';
        }
      }

      // Adicionar informações do consultor se selecionado
      if (formData.consultorId && formData.consultorId !== 'sem_consultor') {
        const consultant = users.find(u => u.id === formData.consultorId);
        if (consultant) {
          projectData.consultorId = formData.consultorId;
          projectData.consultorUid = consultant.uid || '';
          projectData.consultorNome = consultant.nome || '';
          projectData.consultorEmail = consultant.email || '';
        }
      }

      // Adicionar criadoEm apenas para novos projetos
      if (!isEditMode) {
        projectData.criadoEm = new Date();
      }

      console.log('💾 Salvando projeto:', projectData);

      if (isEditMode) {
        await projectService.updateProject(projectId, projectData);
        console.log('✅ Projeto atualizado com sucesso');
      } else {
        await projectService.createProject(projectData);
        console.log('✅ Projeto criado com sucesso');
      }

      // Redirecionar para lista de projetos
      navigate('/projetos');
    } catch (error) {
      console.error('Erro ao salvar projeto:', error);
      setFormError('Erro ao salvar projeto. Tente novamente.');
    } finally {
      setFormLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p>Carregando...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center">
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate('/projetos')}
              className="mr-4"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Voltar
            </Button>
            <div>
              <h1 className="text-3xl font-bold">
                {isEditMode ? 'Editar Projeto' : 'Novo Projeto'}
              </h1>
              <p className="text-gray-600 mt-1">
                {isEditMode ? 'Atualize as informações do projeto' : 'Preencha as informações para criar um novo projeto'}
              </p>
            </div>
          </div>
        </div>

        {formError && (
          <Alert variant="destructive" className="mb-6">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{formError}</AlertDescription>
          </Alert>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Informações Básicas */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Building className="h-5 w-5 mr-2" />
                Informações Básicas
              </CardTitle>
              <CardDescription>
                Dados principais do projeto
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Seleção de Evento */}
              {events.length > 0 && (
                <div className="space-y-2">
                  <Label htmlFor="evento">Feira/Evento</Label>
                  <Select value={formData.eventoId || 'manual'} onValueChange={handleEventSelect}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecionar evento ou preencher manualmente" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="manual">✏️ Preencher manualmente</SelectItem>
                      {events.filter(event => event.ativo !== false).map(event => (
                        <SelectItem key={event.id} value={event.id}>
                          🎯 {event.nome} - {event.pavilhao || 'Sem pavilhão'}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  
                  {selectedEvent && (
                    <div className="mt-3 p-4 bg-blue-50 rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="font-medium text-blue-800">📅 Evento Selecionado</h4>
                        <Badge variant="secondary">Datas preenchidas automaticamente</Badge>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                        <div>
                          <p className="font-medium text-blue-600">Montagem</p>
                          <p>
                            {formatDateForDisplay(selectedEvent.dataInicioMontagem)} - {formatDateForDisplay(selectedEvent.dataFimMontagem)}
                          </p>
                        </div>
                        <div>
                          <p className="font-medium text-green-600">Evento</p>
                          <p>
                            {formatDateForDisplay(selectedEvent.dataInicioEvento)} - {formatDateForDisplay(selectedEvent.dataFimEvento)}
                          </p>
                        </div>
                        <div>
                          <p className="font-medium text-orange-600">Desmontagem</p>
                          <p>
                            {formatDateForDisplay(selectedEvent.dataInicioDesmontagem)} - {formatDateForDisplay(selectedEvent.dataFimDesmontagem)}
                          </p>
                        </div>
                      </div>
                      {selectedEvent.linkManual && (
                        <div className="mt-3">
                          <a 
                            href={selectedEvent.linkManual} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="inline-flex items-center text-blue-600 hover:text-blue-800 text-sm"
                          >
                            <FileText className="h-4 w-4 mr-1" />
                            Manual da Feira
                            <ExternalLink className="h-3 w-3 ml-1" />
                          </a>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="nome">Nome do Projeto *</Label>
                  <Input
                    id="nome"
                    value={formData.nome}
                    onChange={(e) => handleInputChange('nome', e.target.value)}
                    placeholder="Ex: Stand LABACE 20m²"
                    required
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="feira">Nome da Feira *</Label>
                  <Input
                    id="feira"
                    value={formData.feira}
                    onChange={(e) => handleInputChange('feira', e.target.value)}
                    placeholder="Ex: LABACE 2024"
                    required
                    disabled={!!selectedEvent}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="local">Localização (Rua/Stand) *</Label>
                  <Input
                    id="local"
                    value={formData.local}
                    onChange={(e) => handleInputChange('local', e.target.value)}
                    placeholder="Ex: Rua A, Stand 15"
                    required
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="metragem">Metragem *</Label>
                  <Input
                    id="metragem"
                    value={formData.metragem}
                    onChange={(e) => handleInputChange('metragem', e.target.value)}
                    placeholder="Ex: 20m²"
                    required
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="tipoMontagem">Tipo de Montagem *</Label>
                  <Select value={formData.tipoMontagem} onValueChange={(value) => handleInputChange('tipoMontagem', value)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecionar tipo" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="USET">USET</SelectItem>
                      <SelectItem value="SP GROUP">SP GROUP</SelectItem>
                      <SelectItem value="COSTUMER">COSTUMER</SelectItem>
                      <SelectItem value="CENOGRAFIA">CENOGRAFIA</SelectItem>
                      <SelectItem value="simples">Simples</SelectItem>
                      <SelectItem value="complexa">Complexa</SelectItem>
                      <SelectItem value="premium">Premium</SelectItem>
                      <SelectItem value="personalizada">Personalizada</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="pavilhao">Pavilhão</Label>
                <Input
                  id="pavilhao"
                  value={formData.pavilhao}
                  onChange={(e) => handleInputChange('pavilhao', e.target.value)}
                  placeholder="Ex: Pavilhão Azul"
                  disabled={!!selectedEvent}
                />
              </div>
            </CardContent>
          </Card>

          {/* Responsáveis */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Users className="h-5 w-5 mr-2" />
                Responsáveis
              </CardTitle>
              <CardDescription>
                Defina os responsáveis pelo projeto
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="produtor">Produtor Responsável</Label>
                  <Select value={formData.produtorId} onValueChange={(value) => handleInputChange('produtorId', value)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecionar produtor" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sem_produtor">Sem produtor</SelectItem>
                      {producers.map(producer => (
                        <SelectItem key={producer.id} value={producer.id}>
                          {producer.nome} ({producer.email})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="consultor">Consultor Responsável</Label>
                  <Select value={formData.consultorId} onValueChange={(value) => handleInputChange('consultorId', value)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecionar consultor" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sem_consultor">Sem consultor</SelectItem>
                      {consultants.map(consultant => (
                        <SelectItem key={consultant.id} value={consultant.id}>
                          {consultant.nome} ({consultant.email})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Cronograma Detalhado */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <CalendarDays className="h-5 w-5 mr-2" />
                Cronograma Detalhado
              </CardTitle>
              <CardDescription>
                {selectedEvent ? 'Datas preenchidas automaticamente baseadas no evento selecionado' : 'Defina as datas específicas de cada fase'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Montagem */}
              <div className="bg-blue-50 p-4 rounded-lg">
                <h4 className="font-medium text-blue-800 mb-3 flex items-center">
                  <Wrench className="h-4 w-4 mr-2" />
                  Fase de Montagem
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="montagemInicio">Data de Início</Label>
                    <Input
                      id="montagemInicio"
                      type="date"
                      value={formData.montagem.dataInicio}
                      onChange={(e) => handleNestedInputChange('montagem', 'dataInicio', e.target.value)}
                      disabled={!!selectedEvent}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="montagemFim">Data de Fim</Label>
                    <Input
                      id="montagemFim"
                      type="date"
                      value={formData.montagem.dataFim}
                      onChange={(e) => handleNestedInputChange('montagem', 'dataFim', e.target.value)}
                      disabled={!!selectedEvent}
                    />
                  </div>
                </div>
              </div>

              {/* Evento */}
              <div className="bg-green-50 p-4 rounded-lg">
                <h4 className="font-medium text-green-800 mb-3 flex items-center">
                  <PartyPopper className="h-4 w-4 mr-2" />
                  Fase do Evento
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="eventoInicio">Data de Início</Label>
                    <Input
                      id="eventoInicio"
                      type="date"
                      value={formData.evento.dataInicio}
                      onChange={(e) => handleNestedInputChange('evento', 'dataInicio', e.target.value)}
                      disabled={!!selectedEvent}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="eventoFim">Data de Fim</Label>
                    <Input
                      id="eventoFim"
                      type="date"
                      value={formData.evento.dataFim}
                      onChange={(e) => handleNestedInputChange('evento', 'dataFim', e.target.value)}
                      disabled={!!selectedEvent}
                    />
                  </div>
                </div>
              </div>

              {/* Desmontagem */}
              <div className="bg-orange-50 p-4 rounded-lg">
                <h4 className="font-medium text-orange-800 mb-3 flex items-center">
                  <Truck className="h-4 w-4 mr-2" />
                  Fase de Desmontagem
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="desmontagemInicio">Data de Início</Label>
                    <Input
                      id="desmontagemInicio"
                      type="date"
                      value={formData.desmontagem.dataInicio}
                      onChange={(e) => handleNestedInputChange('desmontagem', 'dataInicio', e.target.value)}
                      disabled={!!selectedEvent}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="desmontagemFim">Data de Fim</Label>
                    <Input
                      id="desmontagemFim"
                      type="date"
                      value={formData.desmontagem.dataFim}
                      onChange={(e) => handleNestedInputChange('desmontagem', 'dataFim', e.target.value)}
                      disabled={!!selectedEvent}
                    />
                  </div>
                </div>
              </div>

              {/* Datas Gerais */}
              <div className="bg-gray-50 p-4 rounded-lg">
                <h4 className="font-medium text-gray-800 mb-3 flex items-center">
                  <Calendar className="h-4 w-4 mr-2" />
                  Período Geral do Projeto
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="dataInicio">Data de Início Geral</Label>
                    <Input
                      id="dataInicio"
                      type="date"
                      value={formData.dataInicio}
                      onChange={(e) => handleInputChange('dataInicio', e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="dataFim">Data de Fim Geral</Label>
                    <Input
                      id="dataFim"
                      type="date"
                      value={formData.dataFim}
                      onChange={(e) => handleInputChange('dataFim', e.target.value)}
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Equipes Terceirizadas */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Users className="h-5 w-5 mr-2" />
                Equipes Terceirizadas
              </CardTitle>
              <CardDescription>
                Defina as empresas responsáveis por cada área
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="marcenaria">Marcenaria</Label>
                  <Input
                    id="marcenaria"
                    value={formData.equipesEmpreiteiras.marcenaria}
                    onChange={(e) => handleNestedInputChange('equipesEmpreiteiras', 'marcenaria', e.target.value)}
                    placeholder="Nome da empresa"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="tapecaria">Tapeçaria</Label>
                  <Input
                    id="tapecaria"
                    value={formData.equipesEmpreiteiras.tapecaria}
                    onChange={(e) => handleNestedInputChange('equipesEmpreiteiras', 'tapecaria', e.target.value)}
                    placeholder="Nome da empresa"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="limpeza">Limpeza</Label>
                  <Input
                    id="limpeza"
                    value={formData.equipesEmpreiteiras.limpeza}
                    onChange={(e) => handleNestedInputChange('equipesEmpreiteiras', 'limpeza', e.target.value)}
                    placeholder="Nome da empresa"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="eletrica">Elétrica</Label>
                  <Input
                    id="eletrica"
                    value={formData.equipesEmpreiteiras.eletrica}
                    onChange={(e) => handleNestedInputChange('equipesEmpreiteiras', 'eletrica', e.target.value)}
                    placeholder="Nome da empresa"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="pintura">Pintura</Label>
                  <Input
                    id="pintura"
                    value={formData.equipesEmpreiteiras.pintura}
                    onChange={(e) => handleNestedInputChange('equipesEmpreiteiras', 'pintura', e.target.value)}
                    placeholder="Nome da empresa"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="serralheria">Serralheria</Label>
                  <Input
                    id="serralheria"
                    value={formData.equipesEmpreiteiras.serralheria}
                    onChange={(e) => handleNestedInputChange('equipesEmpreiteiras', 'serralheria', e.target.value)}
                    placeholder="Nome da empresa"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Informações Adicionais */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <FileText className="h-5 w-5 mr-2" />
                Informações Adicionais
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="descricao">Descrição do Projeto</Label>
                <Textarea
                  id="descricao"
                  value={formData.descricao}
                  onChange={(e) => handleInputChange('descricao', e.target.value)}
                  placeholder="Descreva os detalhes do projeto..."
                  rows={3}
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="observacoes">Observações</Label>
                <Textarea
                  id="observacoes"
                  value={formData.observacoes}
                  onChange={(e) => handleInputChange('observacoes', e.target.value)}
                  placeholder="Observações importantes..."
                  rows={3}
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="linkDrive">Link do Drive</Label>
                <Input
                  id="linkDrive"
                  type="url"
                  value={formData.linkDrive}
                  onChange={(e) => handleInputChange('linkDrive', e.target.value)}
                  placeholder="https://drive.google.com/..."
                />
              </div>
            </CardContent>
          </Card>

          {/* Botões de Ação */}
          <div className="flex justify-end space-x-4 pt-6">
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate('/projetos')}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={formLoading}>
              {formLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Salvando...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  {isEditMode ? 'Atualizar Projeto' : 'Criar Projeto'}
                </>
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ProjectFormPage;

