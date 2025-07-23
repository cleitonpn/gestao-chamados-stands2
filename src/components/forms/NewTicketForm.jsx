import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { projectService } from '../../services/projectService';
import { ticketService } from '../../services/ticketService';
import { eventService } from '../../services/eventService';
// 🔔 IMPORTAÇÃO DO SERVIÇO DE NOTIFICAÇÕES FUNCIONAL
import notificationService from '../../services/notificationService';
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
  Plus, 
  Calendar, 
  MapPin, 
  Building, 
  Users, 
  AlertCircle, 
  CheckCircle, 
  Loader2,
  FileText,
  Clock,
  User,
  Briefcase
} from 'lucide-react';
import { TICKET_CATEGORIES } from '../../constants/ticketCategories';

const NewTicketForm = ({ onSuccess, onCancel }) => {
  const { user, userProfile } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [projects, setProjects] = useState([]);
  const [events, setEvents] = useState([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [loadingEvents, setLoadingEvents] = useState(true);

  // Form state
  const [formData, setFormData] = useState({
    projetoId: '',
    eventoId: '',
    categoria: '',
    subcategoria: '',
    titulo: '',
    descricao: '',
    prioridade: 'media',
    dataLimite: '',
    observacoes: ''
  });

  // Carregar projetos e eventos
  useEffect(() => {
    loadProjects();
    loadEvents();
  }, []);

  const loadProjects = async () => {
    try {
      setLoadingProjects(true);
      const projectsData = await projectService.getUserProjects(user.uid, userProfile);
      setProjects(projectsData);
    } catch (error) {
      console.error('Erro ao carregar projetos:', error);
      setError('Erro ao carregar projetos');
    } finally {
      setLoadingProjects(false);
    }
  };

  const loadEvents = async () => {
    try {
      setLoadingEvents(true);
      const eventsData = await eventService.getActiveEvents();
      setEvents(eventsData);
    } catch (error) {
      console.error('Erro ao carregar eventos:', error);
      // Não mostrar erro para eventos, pois é opcional
    } finally {
      setLoadingEvents(false);
    }
  };

  const handleInputChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));

    // Limpar subcategoria quando categoria muda
    if (field === 'categoria') {
      setFormData(prev => ({
        ...prev,
        subcategoria: ''
      }));
    }

    // Limpar erros quando usuário começa a digitar
    if (error) {
      setError('');
    }
  };

  const validateForm = () => {
    if (!formData.projetoId) {
      setError('Selecione um projeto');
      return false;
    }
    if (!formData.categoria) {
      setError('Selecione uma categoria');
      return false;
    }
    if (!formData.subcategoria) {
      setError('Selecione uma subcategoria');
      return false;
    }
    if (!formData.titulo.trim()) {
      setError('Digite um título para o chamado');
      return false;
    }
    if (!formData.descricao.trim()) {
      setError('Digite uma descrição para o chamado');
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
      setLoading(true);
      setError('');

      // Buscar dados do projeto selecionado
      const selectedProject = projects.find(p => p.id === formData.projetoId);
      if (!selectedProject) {
        throw new Error('Projeto não encontrado');
      }

      // Buscar dados do evento selecionado (se houver)
      let selectedEvent = null;
      if (formData.eventoId) {
        selectedEvent = events.find(e => e.id === formData.eventoId);
      }

      // Preparar dados do chamado
      const ticketData = {
        projetoId: formData.projetoId,
        projetoNome: selectedProject.nomeEvento || selectedProject.nome,
        eventoId: formData.eventoId || null,
        eventoNome: selectedEvent?.nome || null,
        categoria: formData.categoria,
        subcategoria: formData.subcategoria,
        titulo: formData.titulo.trim(),
        descricao: formData.descricao.trim(),
        prioridade: formData.prioridade,
        dataLimite: formData.dataLimite || null,
        observacoes: formData.observacoes.trim(),
        
        // Dados do criador
        criadoPor: user.uid,
        criadoPorNome: userProfile.nome,
        criadoPorEmail: userProfile.email,
        criadoPorFuncao: userProfile.funcao,
        
        // Dados do projeto para facilitar consultas
        consultorId: selectedProject.consultorId,
        consultorNome: selectedProject.consultorNome,
        consultorEmail: selectedProject.consultorEmail,
        produtorId: selectedProject.produtorId,
        produtorNome: selectedProject.produtorNome,
        produtorEmail: selectedProject.produtorEmail,
        
        // Status inicial
        status: 'aberto',
        areaAtual: userProfile.funcao === 'consultor' ? 'produtor' : 
                  TICKET_CATEGORIES[formData.categoria]?.subcategorias[formData.subcategoria]?.area || 'geral'
      };

      // Criar chamado
      const newTicket = await ticketService.createTicket(ticketData);

      // 🔔 NOTIFICAÇÃO DE NOVO CHAMADO
      try {
        console.log('🔔 Enviando notificação de novo chamado...');
        await notificationService.notifyNewTicket(newTicket.id, ticketData, user.uid);
        console.log('✅ Notificação de novo chamado enviada com sucesso');
      } catch (notificationError) {
        console.error('❌ Erro ao enviar notificação de novo chamado:', notificationError);
        // Não bloquear o fluxo se a notificação falhar
      }

      setSuccess('Chamado criado com sucesso!');
      
      // Limpar formulário
      setFormData({
        projetoId: '',
        eventoId: '',
        categoria: '',
        subcategoria: '',
        titulo: '',
        descricao: '',
        prioridade: 'media',
        dataLimite: '',
        observacoes: ''
      });

      // Chamar callback de sucesso
      if (onSuccess) {
        setTimeout(() => {
          onSuccess(newTicket);
        }, 1500);
      }

    } catch (error) {
      console.error('Erro ao criar chamado:', error);
      setError('Erro ao criar chamado. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  const getSelectedProject = () => {
    return projects.find(p => p.id === formData.projetoId);
  };

  const getSelectedEvent = () => {
    return events.find(e => e.id === formData.eventoId);
  };

  const getAvailableSubcategories = () => {
    if (!formData.categoria || !TICKET_CATEGORIES[formData.categoria]) {
      return [];
    }
    return Object.entries(TICKET_CATEGORIES[formData.categoria].subcategorias);
  };

  const formatDate = (date) => {
    if (!date) return '';
    const dateObj = date.seconds ? new Date(date.seconds * 1000) : new Date(date);
    return dateObj.toLocaleDateString('pt-BR');
  };

  const selectedProject = getSelectedProject();
  const selectedEvent = getSelectedEvent();

  return (
    <div className="max-w-4xl mx-auto p-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" />
            Novo Chamado
          </CardTitle>
          <CardDescription>
            Crie um novo chamado para solicitar suporte ou reportar problemas
          </CardDescription>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Alertas */}
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {success && (
              <Alert>
                <CheckCircle className="h-4 w-4" />
                <AlertDescription>{success}</AlertDescription>
              </Alert>
            )}

            {/* Seleção de Projeto */}
            <div className="space-y-2">
              <Label htmlFor="projeto">Projeto *</Label>
              {loadingProjects ? (
                <div className="flex items-center gap-2 p-3 border rounded-md">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm text-gray-600">Carregando projetos...</span>
                </div>
              ) : (
                <Select value={formData.projetoId} onValueChange={(value) => handleInputChange('projetoId', value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um projeto" />
                  </SelectTrigger>
                  <SelectContent>
                    {projects.map((project) => (
                      <SelectItem key={project.id} value={project.id}>
                        <div className="flex items-center gap-2">
                          <Briefcase className="h-4 w-4" />
                          <span>{project.nomeEvento || project.nome}</span>
                          {project.consultorNome && (
                            <Badge variant="outline" className="text-xs">
                              {project.consultorNome}
                            </Badge>
                          )}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Informações do Projeto Selecionado */}
            {selectedProject && (
              <Card className="bg-blue-50 border-blue-200">
                <CardContent className="p-4">
                  <h4 className="font-medium text-blue-900 mb-2 flex items-center gap-2">
                    <Building className="h-4 w-4" />
                    Informações do Projeto
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="font-medium text-blue-800">Consultor:</span>
                      <p className="text-blue-700">{selectedProject.consultorNome}</p>
                    </div>
                    <div>
                      <span className="font-medium text-blue-800">Produtor:</span>
                      <p className="text-blue-700">{selectedProject.produtorNome}</p>
                    </div>
                    {selectedProject.cliente && (
                      <div>
                        <span className="font-medium text-blue-800">Cliente:</span>
                        <p className="text-blue-700">{selectedProject.cliente}</p>
                      </div>
                    )}
                    {selectedProject.stand && (
                      <div>
                        <span className="font-medium text-blue-800">Stand:</span>
                        <p className="text-blue-700">{selectedProject.stand}</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Seleção de Evento (Opcional) */}
            <div className="space-y-2">
              <Label htmlFor="evento">Evento (Opcional)</Label>
              {loadingEvents ? (
                <div className="flex items-center gap-2 p-3 border rounded-md">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm text-gray-600">Carregando eventos...</span>
                </div>
              ) : (
                <Select value={formData.eventoId} onValueChange={(value) => handleInputChange('eventoId', value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um evento (opcional)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Nenhum evento específico</SelectItem>
                    {events.map((event) => (
                      <SelectItem key={event.id} value={event.id}>
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4" />
                          <span>{event.nome}</span>
                          <Badge variant="outline" className="text-xs">
                            {event.pavilhao}
                          </Badge>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Informações do Evento Selecionado */}
            {selectedEvent && (
              <Card className="bg-green-50 border-green-200">
                <CardContent className="p-4">
                  <h4 className="font-medium text-green-900 mb-2 flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    Informações do Evento
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                    <div>
                      <span className="font-medium text-green-800">Montagem:</span>
                      <p className="text-green-700">
                        {formatDate(selectedEvent.dataInicioMontagem)} - {formatDate(selectedEvent.dataFimMontagem)}
                      </p>
                    </div>
                    <div>
                      <span className="font-medium text-green-800">Evento:</span>
                      <p className="text-green-700">
                        {formatDate(selectedEvent.dataInicioEvento)} - {formatDate(selectedEvent.dataFimEvento)}
                      </p>
                    </div>
                    <div>
                      <span className="font-medium text-green-800">Desmontagem:</span>
                      <p className="text-green-700">
                        {formatDate(selectedEvent.dataInicioDesmontagem)} - {formatDate(selectedEvent.dataFimDesmontagem)}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            <Separator />

            {/* Categoria e Subcategoria */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="categoria">Categoria *</Label>
                <Select value={formData.categoria} onValueChange={(value) => handleInputChange('categoria', value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione uma categoria" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(TICKET_CATEGORIES).map(([key, category]) => (
                      <SelectItem key={key} value={key}>
                        <div className="flex items-center gap-2">
                          <span className="text-lg">{category.icon}</span>
                          <span>{category.nome}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="subcategoria">Subcategoria *</Label>
                <Select 
                  value={formData.subcategoria} 
                  onValueChange={(value) => handleInputChange('subcategoria', value)}
                  disabled={!formData.categoria}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione uma subcategoria" />
                  </SelectTrigger>
                  <SelectContent>
                    {getAvailableSubcategories().map(([key, subcategory]) => (
                      <SelectItem key={key} value={key}>
                        <div className="flex items-center gap-2">
                          <span>{subcategory.nome}</span>
                          <Badge variant="outline" className="text-xs">
                            {subcategory.area}
                          </Badge>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Título */}
            <div className="space-y-2">
              <Label htmlFor="titulo">Título *</Label>
              <Input
                id="titulo"
                value={formData.titulo}
                onChange={(e) => handleInputChange('titulo', e.target.value)}
                placeholder="Digite um título claro e objetivo"
                maxLength={100}
              />
              <div className="text-xs text-gray-500 text-right">
                {formData.titulo.length}/100 caracteres
              </div>
            </div>

            {/* Descrição */}
            <div className="space-y-2">
              <Label htmlFor="descricao">Descrição *</Label>
              <Textarea
                id="descricao"
                value={formData.descricao}
                onChange={(e) => handleInputChange('descricao', e.target.value)}
                placeholder="Descreva detalhadamente o problema ou solicitação"
                rows={4}
                maxLength={1000}
              />
              <div className="text-xs text-gray-500 text-right">
                {formData.descricao.length}/1000 caracteres
              </div>
            </div>

            {/* Prioridade e Data Limite */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="prioridade">Prioridade</Label>
                <Select value={formData.prioridade} onValueChange={(value) => handleInputChange('prioridade', value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="baixa">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                        <span>Baixa</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="media">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 bg-yellow-500 rounded-full"></div>
                        <span>Média</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="alta">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 bg-orange-500 rounded-full"></div>
                        <span>Alta</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="urgente">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                        <span>Urgente</span>
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="dataLimite">Data Limite (Opcional)</Label>
                <Input
                  id="dataLimite"
                  type="date"
                  value={formData.dataLimite}
                  onChange={(e) => handleInputChange('dataLimite', e.target.value)}
                />
              </div>
            </div>

            {/* Observações */}
            <div className="space-y-2">
              <Label htmlFor="observacoes">Observações Adicionais</Label>
              <Textarea
                id="observacoes"
                value={formData.observacoes}
                onChange={(e) => handleInputChange('observacoes', e.target.value)}
                placeholder="Informações adicionais que possam ajudar na resolução"
                rows={3}
                maxLength={500}
              />
              <div className="text-xs text-gray-500 text-right">
                {formData.observacoes.length}/500 caracteres
              </div>
            </div>

            {/* Botões */}
            <div className="flex justify-end space-x-4 pt-6">
              {onCancel && (
                <Button type="button" variant="outline" onClick={onCancel}>
                  Cancelar
                </Button>
              )}
              <Button type="submit" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Criando Chamado...
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4 mr-2" />
                    Criar Chamado
                  </>
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default NewTicketForm;

