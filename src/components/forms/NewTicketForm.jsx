import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { projectService } from '../../services/projectService';
import { ticketService, TICKET_TYPES, PRIORITIES } from '../../services/ticketService';
import { userService, AREAS } from '../../services/userService';
import { imageService } from '../../services/imageService';
import { TICKET_CATEGORIES, getCategoriesByArea } from '../../constants/ticketCategories';
import notificationService from '../../services/notificationService';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Loader2, Upload, X, AlertCircle, Bot, Sparkles, RefreshCw, TrendingUp, Lock, Link as LinkIcon } from 'lucide-react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { collection, getDocs, doc, setDoc, getDoc, query, orderBy, limit, where } from 'firebase/firestore';
import { db } from '../../config/firebase';

// A classe DynamicAITemplateService permanece inalterada
class DynamicAITemplateService {
  constructor() {
    this.templatesCollection = 'ai_templates';
    this.analyticsCollection = 'ai_analytics';
  }

  async loadAITemplates() {
    try {
      const templatesRef = collection(db, this.templatesCollection);
      const q = query(templatesRef, orderBy('confidence', 'desc'), limit(10));
      const snapshot = await getDocs(q);
      
      const templates = [];
      snapshot.forEach((doc) => {
        templates.push({ id: doc.id, ...doc.data() });
      });
      
      console.log('🤖 Templates IA carregados:', templates.length);
      return templates;
    } catch (error) {
      console.error('❌ Erro ao carregar templates IA:', error);
      return [];
    }
  }

  async analyzeAndUpdateTemplates() {
    try {
      console.log('🔍 Iniciando análise automática de chamados...');
      
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      const ticketsRef = collection(db, 'tickets');
      const q = query(
        ticketsRef, 
        where('createdAt', '>=', thirtyDaysAgo),
        orderBy('createdAt', 'desc')
      );
      const snapshot = await getDocs(q);
      
      const tickets = [];
      snapshot.forEach((doc) => {
        tickets.push({ id: doc.id, ...doc.data() });
      });
      
      console.log('📊 Chamados analisados:', tickets.length);
      
      const patterns = {};
      tickets.forEach(ticket => {
        const key = `${ticket.area}_${ticket.tipo}`;
        if (!patterns[key]) {
          patterns[key] = {
            area: ticket.area,
            tipo: ticket.tipo,
            titles: [],
            descriptions: [],
            priorities: [],
            count: 0
          };
        }
        
        patterns[key].titles.push(ticket.titulo);
        patterns[key].descriptions.push(ticket.descricao);
        patterns[key].priorities.push(ticket.prioridade);
        patterns[key].count++;
      });
      
      const newTemplates = [];
      Object.entries(patterns).forEach(([key, pattern]) => {
        if (pattern.count >= 3) {
          const template = this.generateTemplateFromPattern(key, pattern);
          if (template) {
            newTemplates.push(template);
          }
        }
      });
      
      for (const template of newTemplates) {
        await this.saveTemplate(template);
      }
      
      console.log('✅ Novos templates gerados:', newTemplates.length);
      return newTemplates;
      
    } catch (error) {
      console.error('❌ Erro na análise automática:', error);
      return [];
    }
  }

  generateTemplateFromPattern(key, pattern) {
    try {
      const titleWords = pattern.titles.join(' ').toLowerCase().split(' ');
      const titleWordCount = {};
      titleWords.forEach(word => {
        if (word.length > 3) {
          titleWordCount[word] = (titleWordCount[word] || 0) + 1;
        }
      });
      
      const priorityCount = {};
      pattern.priorities.forEach(priority => {
        priorityCount[priority] = (priorityCount[priority] || 0) + 1;
      });
      const mostCommonPriority = Object.keys(priorityCount).reduce((a, b) => 
        priorityCount[a] > priorityCount[b] ? a : b
      );
      
      const commonWords = Object.entries(titleWordCount)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 3)
        .map(([word]) => word);
      
      const templateTitle = this.generateSmartTitle(pattern.area, pattern.tipo, commonWords);
      const templateDescription = this.generateSmartDescription(pattern.area, pattern.tipo, pattern.descriptions);
      
      const confidence = Math.min(0.95, 0.5 + (pattern.count * 0.05));
      
      return {
        id: `ai_${key}_${Date.now()}`,
        nome: templateTitle,
        area: pattern.area,
        tipo: pattern.tipo,
        titulo: templateTitle,
        descricao: templateDescription,
        prioridade: mostCommonPriority,
        confidence: confidence,
        frequency: pattern.count,
        generatedAt: new Date(),
        icon: this.getIconForArea(pattern.area),
        isAI: true,
        autoGenerated: true
      };
      
    } catch (error) {
      console.error('❌ Erro ao gerar template:', error);
      return null;
    }
  }

  generateSmartTitle(area, tipo, commonWords) {
    const areaNames = {
      'comunicacao_visual': 'Comunicação Visual',
      'producao': 'Produção',
      'almoxarifado': 'Almoxarifado',
      'operacional': 'Operacional',
      'logistica': 'Logística',
      'locacao': 'Locação'
    };
    
    const tipoNames = {
      'troca_lona_cliente': 'Troca de Lona',
      'manutencao_eletrica': 'Manutenção',
      'pedido_material': 'Pedido de Material',
      'informacoes': 'Informações',
      'frete_imediato': 'Frete Urgente'
    };
    
    const areaName = areaNames[area] || area;
    const tipoName = tipoNames[tipo] || tipo;
    
    return `${tipoName} - ${areaName}`;
  }

  generateSmartDescription(area, tipo, descriptions) {
    const commonPhrases = this.extractCommonPhrases(descriptions);
    
    const templates = {
      'comunicacao_visual': {
        'troca_lona_cliente': `Solicitação de troca de lona para cliente.\n\nCliente: [NOME_CLIENTE]\nLocalização: [STAND/ÁREA]\nMotivo: [ESPECIFICAR_MOTIVO]\nPrazo: [DATA_DESEJADA]\n\nObservações:\n[INFORMAÇÕES_ADICIONAIS]`,
        'troca_adesivo_cliente': `Solicitação de troca de adesivo para cliente.\n\nCliente: [NOME_CLIENTE]\nTipo de adesivo: [ESPECIFICAR]\nLocalização: [STAND/ÁREA]\nMotivo: [ESPECIFICAR_MOTIVO]`
      },
      'producao': {
        'manutencao_eletrica': `Necessária manutenção elétrica urgente.\n\nEquipamento: [ESPECIFICAR_EQUIPAMENTO]\nProblema: [DESCRIÇÃO_PROBLEMA]\nLocalização: [SETOR/ÁREA]\nImpacto: [ALTO/MÉDIO/BAIXO]\n\nAção necessária:\n[ESPECIFICAR_SOLUÇÃO]`,
        'manutencao_marcenaria': `Solicitação de manutenção em marcenaria.\n\nItem: [ESPECIFICAR_ITEM]\nProblema: [DESCRIÇÃO]\nUrgência: [ALTA/MÉDIA/BAIXA]`
      },
      'almoxarifado': {
        'pedido_material': `Solicitação de material do almoxarifado.\n\nMaterial: [TIPO_MATERIAL]\nQuantidade: [QTD]\nLocal de entrega: [LOCAL]\nPrazo: [DATA_NECESSÁRIA]\n\nJustificativa:\n[MOTIVO_DA_SOLICITAÇÃO]`,
        'pedido_mobiliario': `Pedido de mobiliário.\n\nItem: [ESPECIFICAR_MOBILIÁRIO]\nQuantidade: [QTD]\nLocal: [DESTINO]`
      }
    };
    
    return templates[area]?.[tipo] || `Solicitação relacionada a ${area} - ${tipo}.\n\nDescrição: [ESPECIFICAR]\nPrazo: [DATA]\nObservações: [INFORMAÇÕES_ADICIONAIS]`;
  }

  extractCommonPhrases(descriptions) {
    const allText = descriptions.join(' ').toLowerCase();
    const phrases = allText.match(/\b\w+\s+\w+\s+\w+\b/g) || [];
    
    const phraseCount = {};
    phrases.forEach(phrase => {
      phraseCount[phrase] = (phraseCount[phrase] || 0) + 1;
    });
    
    return Object.entries(phraseCount)
      .filter(([phrase, count]) => count > 1)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
      .map(([phrase]) => phrase);
  }

  getIconForArea(area) {
    const icons = {
      'comunicacao_visual': '🎨',
      'producao': '🔧',
      'almoxarifado': '📦',
      'operacional': '⚙️',
      'logistica': '🚚',
      'locacao': '🏢',
      'compras': '🛒',
      'financeiro': '💰'
    };
    return icons[area] || '📋';
  }

  async saveTemplate(template) {
    try {
      const templateRef = doc(db, this.templatesCollection, template.id);
      await setDoc(templateRef, template);
      console.log('✅ Template salvo:', template.id);
    } catch (error) {
      console.error('❌ Erro ao salvar template:', error);
    }
  }

  async recordTemplateUsage(templateId, success = true) {
    try {
      const usageRef = doc(db, 'ai_template_usage', `${templateId}_${Date.now()}`);
      await setDoc(usageRef, {
        templateId,
        success,
        usedAt: new Date(),
        userId: 'current_user'
      });
    } catch (error) {
      console.error('❌ Erro ao registrar uso:', error);
    }
  }
}

const NewTicketForm = ({ projectId, onClose, onSuccess }) => {
  const { user, userProfile } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  
  const [formData, setFormData] = useState({
    titulo: '',
    descricao: '',
    area: '',
    tipo: '',
    prioridade: 'media',
    isExtra: false,
    motivoExtra: '',
    isConfidential: false,
    observacoes: ''
  });
  
  const [projects, setProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState(projectId || '');
  const [selectedEvent, setSelectedEvent] = useState('');
  const [selectedProjectData, setSelectedProjectData] = useState(null);
  const [selectedAITemplate, setSelectedAITemplate] = useState('');
  const [operators, setOperators] = useState([]);
  const [selectedOperator, setSelectedOperator] = useState('');
  const [availableTypes, setAvailableTypes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [images, setImages] = useState([]);
  
  const [aiTemplates, setAiTemplates] = useState([]);
  const [loadingAI, setLoadingAI] = useState(false);
  const [aiService] = useState(new DynamicAITemplateService());
  
  const [linkedTicket, setLinkedTicket] = useState(null);
  const [loadingLinkedTicket, setLoadingLinkedTicket] = useState(true);

  useEffect(() => {
    const linkedTicketId = location.state?.linkedTicketId;
    if (linkedTicketId) {
      const fetchLinkedTicket = async () => {
        try {
          const ticketData = await ticketService.getTicketById(linkedTicketId);
          if (ticketData) {
            const projectData = await projectService.getProjectById(ticketData.projetoId);
            setLinkedTicket({ ...ticketData, projectName: projectData?.nome || 'N/A', eventName: projectData?.feira || 'N/A' });
            if (projectData) {
              setSelectedEvent(projectData.feira);
              setSelectedProject(projectData.id);
              setSelectedProjectData(projectData);
            }
          }
        } catch (err) {
          console.error("Erro ao buscar chamado vinculado:", err);
        } finally {
          setLoadingLinkedTicket(false);
        }
      };
      fetchLinkedTicket();
    } else {
      setLoadingLinkedTicket(false);
    }
  }, [location.state]);


  useEffect(() => {
    loadProjects();
    loadAITemplates();
  }, []);

  const loadAITemplates = async () => {
    setLoadingAI(true);
    try {
      const templates = await aiService.loadAITemplates();
      setAiTemplates(templates);
    } catch (error) {
      console.error('❌ Erro ao carregar templates IA:', error);
    } finally {
      setLoadingAI(false);
    }
  };

  const updateAITemplates = async () => {
    setLoadingAI(true);
    try {
      await aiService.analyzeAndUpdateTemplates();
      await loadAITemplates();
    } catch (error) {
      console.error('❌ Erro ao atualizar templates IA:', error);
    } finally {
      setLoadingAI(false);
    }
  };

  useEffect(() => {
    if (formData.area) {
      loadTypesByArea(formData.area);
      // Carrega operadores apenas se a área não for Produção
      if (formData.area !== AREAS.PRODUCTION) {
        loadOperatorsByArea(formData.area);
      } else {
        setOperators([]);
        setSelectedOperator('');
      }
    } else {
      setAvailableTypes([]);
      setOperators([]);
      setSelectedOperator('');
    }
  }, [formData.area]);

  const loadProjects = async () => {
    try {
      const projectsData = await projectService.getAllProjects();
      let filteredProjects = [];
      
      if (userProfile?.funcao === 'administrador' || userProfile?.funcao === 'gerente' || userProfile?.funcao === 'operador') {
        filteredProjects = projectsData.filter(project => project.status !== 'encerrado');
      } else if (userProfile?.funcao === 'consultor') {
        const userId = userProfile.id || user.uid;
        filteredProjects = projectsData.filter(project => {
          const isAssigned = project.consultorId === userId || 
                            project.consultorUid === userId ||
                            project.consultorEmail === userProfile.email ||
                            project.consultorNome === userProfile.nome;
          return isAssigned && project.status !== 'encerrado';
        });
      } else if (userProfile?.funcao === 'produtor') {
        const userId = userProfile.id || user.uid;
        filteredProjects = projectsData.filter(project => {
          const isAssigned = project.produtorId === userId || 
                            project.produtorUid === userId ||
                            project.produtorEmail === userProfile.email ||
                            project.produtorNome === userProfile.nome;
          return isAssigned && project.status !== 'encerrado';
        });
      }

      filteredProjects.sort((a, b) => {
        const dateA = a.dataInicio?.seconds ? new Date(a.dataInicio.seconds * 1000) : new Date(a.dataInicio || 0);
        const dateB = b.dataInicio?.seconds ? new Date(b.dataInicio.seconds * 1000) : new Date(b.dataInicio || 0);
        return dateB - dateA;
      });

      setProjects(filteredProjects);
    } catch (error) {
      setError('Erro ao carregar projetos. Tente novamente.');
    }
  };

  const loadTypesByArea = (area) => {
    try {
      const categories = getCategoriesByArea(area);
      const validTypes = categories.filter(category => {
        return category && 
               category.value && 
               typeof category.value === 'string' &&
               category.value.trim() !== '' && 
               category.label && 
               typeof category.label === 'string' &&
               category.label.trim() !== '';
      });
      setAvailableTypes(validTypes);
      if (formData.tipo && !validTypes.find(type => type.value === formData.tipo)) {
        handleInputChange('tipo', '');
      }
    } catch (error) {
      setAvailableTypes([]);
    }
  };

  const loadOperatorsByArea = async (area) => {
    try {
      const allUsers = await userService.getAllUsers();
      const operatorsByArea = allUsers.filter(user => 
        user.funcao === 'operador' && user.area === area
      );
      setOperators(operatorsByArea);
      if (selectedOperator && !operatorsByArea.find(op => op.id === selectedOperator)) {
        setSelectedOperator('');
      }
    } catch (error) {
      setOperators([]);
    }
  };

  const getUniqueEvents = () => {
    const events = [...new Set(projects.map(project => project.feira).filter(Boolean))];
    return events.sort();
  };

  const getProjectsByEvent = (eventName) => {
    return projects.filter(project => project.feira === eventName);
  };

  const handleEventChange = (eventName) => {
    setSelectedEvent(eventName);
    setSelectedProject('');
    setSelectedProjectData(null);
  };

  const handleProjectChange = (projectId) => {
    const project = projects.find(p => p.id === projectId);
    if (project) {
      setSelectedProject(projectId);
      setSelectedProjectData(project);
    } else {
      setSelectedProject('');
      setSelectedProjectData(null);
    }
  };

  const handleInputChange = (field, value) => {
    if (field === 'area') {
      setFormData({ ...formData, [field]: value, tipo: '' });
      setSelectedOperator('');
    } else {
      setFormData({ ...formData, [field]: value });
    }
    if (error) setError('');
  };

  const applyAITemplate = async (templateId) => {
    const template = aiTemplates.find(t => t.id === templateId);
    if (!template) return;
    setFormData(prev => ({
      ...prev,
      titulo: template.titulo,
      descricao: template.descricao,
      area: template.area,
      tipo: template.tipo,
      prioridade: template.prioridade
    }));
    setSelectedAITemplate(templateId);
    await aiService.recordTemplateUsage(templateId, true);
  };

  const handleImageUpload = async (event) => {
    const files = Array.from(event.target.files);
    for (const file of files) {
      try {
        imageService.validateImageFile(file);
        const resizedFile = await imageService.resizeImage(file);
        const newImage = {
          file: resizedFile || file,
          preview: URL.createObjectURL(resizedFile || file),
          id: Math.random().toString(36).substr(2, 9),
        };
        setImages(prev => [...prev, newImage]);
      } catch (error) {
        alert(`Erro ao processar ${file.name}: ${error.message}`);
      }
    }
  };

  const removeImage = (imageId) => {
    setImages(prev => {
      const imageToRemove = prev.find(img => img.id === imageId);
      if (imageToRemove) {
        URL.revokeObjectURL(imageToRemove.preview);
      }
      return prev.filter(img => img.id !== imageId);
    });
  };

  const validateForm = () => {
    if (!selectedProject) {
      setError('Selecione um projeto');
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
    if (!formData.area) {
      setError('Selecione a área responsável');
      return false;
    }
    if (!formData.tipo) {
      setError('Selecione o tipo do chamado');
      return false;
    }
    if (formData.isExtra && !formData.motivoExtra.trim()) {
      setError('Digite o motivo para o pedido extra');
      return false;
    }
    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;

    if (formData.area === AREAS.PRODUCTION && !selectedProjectData?.produtorId) {
        setError('Não é possível criar o chamado: o projeto selecionado não possui um produtor responsável definido.');
        return;
    }

    setLoading(true);
    setError('');

    let ticketId = null; 

    try {
      let finalTicketData = { ...formData };
      
      if (selectedAITemplate) {
        const aiTemplate = aiTemplates.find(t => t.id === selectedAITemplate);
        if (aiTemplate) {
          finalTicketData.observacoes = `${finalTicketData.observacoes || ''}\n\n[TEMPLATE IA] - Gerado automaticamente baseado em ${aiTemplate.frequency} chamados similares (${Math.round(aiTemplate.confidence * 100)}% confiança).`.trim();
        }
      }

      const ticketData = {
        ...finalTicketData,
        isConfidential: formData.isConfidential,
        projetoId: selectedProject,
        criadoPor: user.uid,
        criadoPorNome: userProfile?.nome || user.email,
        criadoPorFuncao: userProfile?.funcao,
        areasEnvolvidas: [userProfile?.area, finalTicketData.area].filter(Boolean),
        areaDeOrigem: userProfile?.area || null,
        imagens: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        chamadoPaiId: linkedTicket ? linkedTicket.id : null,
      };

      if (formData.area === AREAS.PRODUCTION) {
        const producerId = selectedProjectData.produtorId;
        Object.assign(ticketData, { 
          atribuidoA: producerId,
          atribuidoEm: new Date(), 
          atribuidoPor: user.uid 
        });
      } else if (selectedOperator) {
        Object.assign(ticketData, { 
          atribuidoA: selectedOperator,
          atribuidoEm: new Date(), 
          atribuidoPor: user.uid 
        });
      }

      ticketId = await ticketService.createTicket(ticketData);

      try {
        await notificationService.notifyNewTicket(ticketId, ticketData, user.uid);
      } catch (notificationError) {
        console.error('Falha não-crítica ao enviar notificação:', notificationError);
      }
      
      setTimeout(() => updateAITemplates(), 2000);

      if (images.length > 0) {
        try {
          const uploadedImages = await imageService.uploadMultipleImages(images.map(img => img.file), ticketId);
          await ticketService.updateTicket(ticketId, {
            imagens: uploadedImages.map(img => ({ url: img.url, name: img.name, path: img.path }))
          });
        } catch (uploadError) {
          alert('Chamado criado com sucesso, mas houve erro no upload das imagens.');
        }
      }
      
      if (onSuccess) {
        onSuccess(ticketId);
      } else {
        navigate('/dashboard');
      }
    } catch (error) {
      console.error('Erro ao criar chamado:', error);
      setError('Erro ao criar chamado. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };
  
  const areaOptions = [
    { value: AREAS.LOGISTICS, label: 'Logística' },
    { value: AREAS.WAREHOUSE, label: 'Almoxarifado' },
    { value: AREAS.VISUAL_COMMUNICATION, label: 'Comunicação Visual' },
    { value: AREAS.RENTAL, label: 'Locação' },
    { value: AREAS.PURCHASES, label: 'Compras' },
    { value: AREAS.PRODUCTION, label: 'Produção' },
    { value: AREAS.OPERATIONS, label: 'Operacional' },
    { value: AREAS.FINANCIAL, label: 'Financeiro' },
    { value: AREAS.PROJECTS, label: 'Projetos' },
    { value: AREAS.LOGOTIPIA, label: 'Logotipia' },
    { value: 'detalhamento_tecnico', label: 'Detalhamento Técnico' },
    { value: 'sub_locacao', label: 'Sub-locação' }
  ];

  const priorityOptions = [
    { value: PRIORITIES.LOW, label: 'Baixa', color: 'bg-gray-100 text-gray-800' },
    { value: PRIORITIES.MEDIUM, label: 'Média', color: 'bg-yellow-100 text-yellow-800' },
    { value: PRIORITIES.HIGH, label: 'Alta', color: 'bg-orange-100 text-orange-800' },
    { value: PRIORITIES.URGENT, label: 'Urgente', color: 'bg-red-100 text-red-800' }
  ];

  if (loadingLinkedTicket) {
    return (
        <Card className="w-full max-w-2xl mx-auto">
            <CardContent className="p-8 flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-gray-500" />
            </CardContent>
        </Card>
    );
  }

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          Novo Chamado
          {onClose && (
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          )}
        </CardTitle>
        <CardDescription>
          Preencha os dados para criar um novo chamado
        </CardDescription>
      </CardHeader>
      
      <CardContent>
        {linkedTicket && (
            <Card className="mb-6 bg-amber-50 border-amber-200">
                <CardHeader>
                    <CardTitle className="flex items-center text-base text-amber-900">
                        <LinkIcon className="h-4 w-4 mr-2" />
                        Chamado Vinculado
                    </CardTitle>
                    <CardDescription>
                        Este novo chamado será vinculado ao chamado abaixo.
                    </CardDescription>
                </CardHeader>
                <CardContent className="text-sm space-y-1">
                    <p><strong>Título Original:</strong> {linkedTicket.titulo}</p>
                    <p><strong>Projeto:</strong> {linkedTicket.projectName}</p>
                    <p><strong>Evento:</strong> {linkedTicket.eventName}</p>
                    <p><strong>ID do Chamado Original:</strong> 
                        <Link to={`/chamado/${linkedTicket.id}`} className="text-blue-600 hover:underline ml-1">
                            {linkedTicket.id}
                        </Link>
                    </p>
                </CardContent>
            </Card>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label htmlFor="event">Selecione o Evento *</Label>
            <Select value={selectedEvent} onValueChange={handleEventChange} disabled={!!linkedTicket}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione o evento" />
              </SelectTrigger>
              <SelectContent>
                {getUniqueEvents().map((event) => (
                  <SelectItem key={event} value={event}>
                    🎯 {event}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="project">Selecione o Projeto *</Label>
            <Select 
              value={selectedProject} 
              onValueChange={handleProjectChange}
              disabled={!selectedEvent || !!linkedTicket}
            >
              <SelectTrigger>
                <SelectValue placeholder={selectedEvent ? "Selecione o projeto" : "Primeiro selecione um evento"} />
              </SelectTrigger>
              <SelectContent>
                {selectedEvent && getProjectsByEvent(selectedEvent).map((project) => (
                  <SelectItem key={project.id} value={project.id}>
                    <div className="flex items-center space-x-2">
                      <span>{project.nome}</span>
                      <span className="text-xs text-gray-500">• {project.local}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            {selectedProjectData && (
              <div className="mt-3 p-4 bg-blue-50 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-medium text-blue-800">📋 Projeto Selecionado</h4>
                  <Badge variant="secondary">{selectedProjectData.feira}</Badge>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                  <div>
                    <p className="font-medium text-blue-600">Local</p>
                    <p>{selectedProjectData.local}</p>
                  </div>
                  <div>
                    <p className="font-medium text-blue-600">Metragem</p>
                    <p>{selectedProjectData.metragem}</p>
                  </div>
                  <div>
                    <p className="font-medium text-blue-600">Período</p>
                    <p>
                      {selectedProjectData.dataInicio && new Date(selectedProjectData.dataInicio.seconds * 1000).toLocaleDateString('pt-BR')} - {selectedProjectData.dataFim && new Date(selectedProjectData.dataFim.seconds * 1000).toLocaleDateString('pt-BR')}
                    </p>
                  </div>
                </div>
                {selectedProjectData.produtorNome && (
                  <div className="mt-2 text-sm">
                    <span className="font-medium text-blue-600">Produtor:</span> {selectedProjectData.produtorNome}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="space-y-2 border-t pt-4">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-2">
                <Bot className="h-4 w-4 text-purple-600" />
                <span className="text-purple-700 font-medium">Templates IA</span>
                <Badge variant="outline" className="text-xs bg-purple-50 text-purple-700 border-purple-200">
                  <Sparkles className="h-3 w-3 mr-1" />
                  Aprendizado Automático
                </Badge>
              </Label>
              
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={updateAITemplates}
                disabled={loadingAI}
                className="text-purple-600 border-purple-200 hover:bg-purple-50"
              >
                {loadingAI ? (
                  <Loader2 className="h-3 w-3 animate-spin mr-1" />
                ) : (
                  <RefreshCw className="h-3 w-3 mr-1" />
                )}
                Atualizar IA
              </Button>
            </div>
            
            <p className="text-xs text-gray-600 mb-3">
              Templates criados automaticamente pela IA baseados nos padrões dos seus chamados. 
              <span className="text-purple-600 font-medium">Atualiza automaticamente a cada novo chamado!</span>
            </p>
            
            {loadingAI ? (
              <div className="flex items-center justify-center p-8 text-gray-500">
                <Loader2 className="h-5 w-5 animate-spin mr-2" />
                Analisando chamados e atualizando templates...
              </div>
            ) : aiTemplates.length > 0 ? (
              <div className="grid grid-cols-1 gap-3">
                {aiTemplates.map((template) => (
                  <Card 
                    key={template.id}
                    className={`cursor-pointer transition-all hover:shadow-md border-purple-200 ${
                      selectedAITemplate === template.id 
                        ? 'ring-2 ring-purple-500 bg-purple-50' 
                        : 'hover:border-purple-300'
                    }`}
                    onClick={() => applyAITemplate(template.id)}
                  >
                    <CardContent className="p-3">
                      <div className="flex items-start gap-3">
                        <div className="text-lg">{template.icon}</div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className="font-medium text-sm text-purple-900">{template.nome}</h4>
                            <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200">
                              {Math.round(template.confidence * 100)}% confiança
                            </Badge>
                            {template.autoGenerated && (
                              <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200">
                                <TrendingUp className="h-3 w-3 mr-1" />
                                Auto
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-gray-600 mb-2 line-clamp-2">
                            {template.descricao.split('\n')[0]}
                          </p>
                          <div className="flex gap-1 items-center">
                            <Badge variant="outline" className="text-xs">
                              {template.area?.replace('_', ' ')}
                            </Badge>
                            <Badge variant="outline" className="text-xs">
                              {template.prioridade}
                            </Badge>
                            <span className="text-xs text-gray-500 ml-2">
                              📊 {template.frequency} chamados similares
                            </span>
                            {template.generatedAt && (
                              <span className="text-xs text-gray-400 ml-2">
                                 {new Date(template.generatedAt.seconds * 1000).toLocaleDateString()}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="text-center p-6 text-gray-500 border-2 border-dashed border-gray-200 rounded-lg">
                <Bot className="h-8 w-8 mx-auto mb-2 text-gray-400" />
                <p className="text-sm">Nenhum template IA disponível ainda.</p>
                <p className="text-xs mt-1">A IA criará templates automaticamente conforme você usar o sistema!</p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={updateAITemplates}
                  className="mt-3"
                >
                  <Sparkles className="h-3 w-3 mr-1" />
                  Gerar Templates Agora
                </Button>
              </div>
            )}
            
            {selectedAITemplate && (
              <div className="flex items-center gap-2 text-sm text-purple-600 bg-purple-50 p-2 rounded">
                <Bot className="h-4 w-4" />
                Template IA aplicado! Este template foi gerado automaticamente pela análise de padrões.
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="titulo">Título *</Label>
            <Input
              id="titulo"
              placeholder="Ex: Troca de lona na parede C2"
              value={formData.titulo}
              onChange={(e) => handleInputChange('titulo', e.target.value)}
              disabled={loading}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="descricao">Descrição *</Label>
            <Textarea
              id="descricao"
              placeholder="Descreva detalhadamente o que precisa ser feito..."
              value={formData.descricao}
              onChange={(e) => handleInputChange('descricao', e.target.value)}
              disabled={loading}
              rows={4}
              required
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="area">Área Responsável *</Label>
              <Select 
                value={formData.area} 
                onValueChange={(value) => handleInputChange('area', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a área" />
                </SelectTrigger>
                <SelectContent>
                  {areaOptions.map((area) => (
                    <SelectItem key={area.value} value={area.value}>
                      {area.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="tipo">Tipo *</Label>
              <Select 
                value={formData.tipo} 
                onValueChange={(value) => handleInputChange('tipo', value)}
                disabled={!formData.area || availableTypes.length === 0}
              >
                <SelectTrigger>
                  <SelectValue placeholder={
                    !formData.area 
                      ? "Selecione a área primeiro" 
                      : availableTypes.length === 0 
                        ? "Carregando tipos..." 
                        : "Selecione o tipo"
                  } />
                </SelectTrigger>
                <SelectContent>
                  {availableTypes.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          
          {formData.area && formData.area !== AREAS.PRODUCTION && (
            <div className="space-y-2 pt-4 border-t">
              <Label htmlFor="operator">Atribuir para Operador (Opcional)</Label>
              <Select
                value={selectedOperator}
                onValueChange={setSelectedOperator}
                disabled={!formData.area || operators.length === 0}
              >
                <SelectTrigger>
                  <SelectValue placeholder={
                    operators.length > 0
                      ? "Selecione um operador para agilizar"
                      : "Nenhum operador encontrado para esta área"
                  } />
                </SelectTrigger>
                <SelectContent>
                  {operators.map((op) => (
                    <SelectItem key={op.id} value={op.id}>
                      {op.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {formData.area === AREAS.PRODUCTION && selectedProjectData && (
            <Alert variant="default" className="bg-blue-50 border-blue-200 mt-4">
              <AlertCircle className="h-4 w-4 text-blue-700" />
              <AlertDescription className="text-blue-800">
                O chamado será <strong>automaticamente atribuído</strong> ao produtor do projeto: 
                <span className="font-semibold ml-1">{selectedProjectData.produtorNome || 'Não identificado'}</span>.
              </AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label htmlFor="prioridade">Prioridade *</Label>
            <div className="flex flex-wrap gap-2">
              {priorityOptions.map((priority) => (
                <button
                  key={priority.value}
                  type="button"
                  onClick={() => handleInputChange('prioridade', priority.value)}
                  className={`px-3 py-1 rounded-full text-sm font-medium transition-all ${
                    formData.prioridade === priority.value
                      ? priority.color + ' ring-2 ring-offset-2 ring-blue-500'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                  disabled={loading}
                >
                  {priority.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-4 pt-4 border-t">
            <div className="flex items-center space-x-2">
              <Switch
                id="isExtra"
                checked={formData.isExtra}
                onCheckedChange={(checked) => handleInputChange('isExtra', checked)}
                disabled={loading}
              />
              <Label htmlFor="isExtra" className="text-sm font-medium">
                Este é um pedido extra
              </Label>
            </div>
            {formData.isExtra && (
              <div className="space-y-2">
                <Label htmlFor="motivoExtra">Motivo do Pedido Extra *</Label>
                <Textarea
                  id="motivoExtra"
                  placeholder="Explique por que este pedido é necessário..."
                  value={formData.motivoExtra}
                  onChange={(e) => handleInputChange('motivoExtra', e.target.value)}
                  disabled={loading}
                  rows={3}
                  required={formData.isExtra}
                />
              </div>
            )}
            <div className="flex items-center space-x-2 pt-4 border-t">
              <Switch
                id="isConfidential"
                checked={formData.isConfidential}
                onCheckedChange={(checked) => handleInputChange('isConfidential', checked)}
                disabled={loading}
              />
              <Label htmlFor="isConfidential" className="text-sm font-medium flex items-center gap-2">
                <Lock className="h-4 w-4 text-orange-600"/>
                <span className="text-orange-700">Tornar este chamado confidencial</span>
              </Label>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="images">Imagens</Label>
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-4">
              <input
                type="file"
                id="images"
                multiple
                accept="image/*"
                onChange={handleImageUpload}
                className="hidden"
                disabled={loading}
              />
              <label
                htmlFor="images"
                className="cursor-pointer flex flex-col items-center justify-center space-y-2 text-gray-600 hover:text-gray-800"
              >
                <Upload className="h-8 w-8" />
                <span className="text-sm">Clique para adicionar imagens</span>
              </label>
            </div>
            {images.length > 0 && (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-4">
                {images.map((image) => (
                  <div key={image.id} className="relative">
                    <img
                      src={image.preview}
                      alt="Preview"
                      className="w-full h-24 object-cover rounded-lg border"
                    />
                    <button
                      type="button"
                      onClick={() => removeImage(image.id)}
                      className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600"
                      disabled={loading}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="observacoes">Observações Adicionais</Label>
            <Textarea
              id="observacoes"
              placeholder="Informações adicionais relevantes..."
              value={formData.observacoes}
              onChange={(e) => handleInputChange('observacoes', e.target.value)}
              disabled={loading}
              rows={3}
            />
          </div>

          <div className="flex justify-end space-x-3 pt-4">
            {onClose && (
              <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
                Cancelar
              </Button>
            )}
            <Button type="submit" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Criando...
                </>
              ) : (
                'Criar Chamado'
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
};

export default NewTicketForm;
