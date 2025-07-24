import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { projectService } from '../../services/projectService';
import { ticketService, TICKET_TYPES, PRIORITIES } from '../../services/ticketService';
import { userService, AREAS } from '../../services/userService';
import { imageService } from '../../services/imageService';
import { TICKET_CATEGORIES, getCategoriesByArea } from '../../constants/ticketCategories';
// 🔔 IMPORTAÇÃO DO SERVIÇO DE NOTIFICAÇÕES - JÁ EXISTENTE
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
// ✅ ADIÇÃO: Importando o ícone de cadeado
import { Loader2, Upload, X, AlertCircle, Bot, Sparkles, RefreshCw, TrendingUp, Lock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { collection, getDocs, doc, setDoc, getDoc, query, orderBy, limit, where } from 'firebase/firestore';
import { db } from '../../config/firebase';

// 🤖 SERVIÇO DE TEMPLATES IA DINÂMICOS (sem alterações)
class DynamicAITemplateService {
  constructor() {
    this.templatesCollection = 'ai_templates';
    this.analyticsCollection = 'ai_analytics';
  }

  // Carregar templates IA do Firebase
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

  // Analisar chamados e gerar novos templates
  async analyzeAndUpdateTemplates() {
    try {
      console.log('🔍 Iniciando análise automática de chamados...');
      
      // Buscar chamados recentes (últimos 30 dias)
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
      
      // Agrupar por área e tipo
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
      
      // Gerar templates para padrões com mais de 3 ocorrências
      const newTemplates = [];
      Object.entries(patterns).forEach(([key, pattern]) => {
        if (pattern.count >= 3) {
          const template = this.generateTemplateFromPattern(key, pattern);
          if (template) {
            newTemplates.push(template);
          }
        }
      });
      
      // Salvar novos templates no Firebase
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

  // Gerar template baseado no padrão identificado
  generateTemplateFromPattern(key, pattern) {
    try {
      // Encontrar palavras mais comuns nos títulos
      const titleWords = pattern.titles.join(' ').toLowerCase().split(' ');
      const titleWordCount = {};
      titleWords.forEach(word => {
        if (word.length > 3) {
          titleWordCount[word] = (titleWordCount[word] || 0) + 1;
        }
      });
      
      // Prioridade mais comum
      const priorityCount = {};
      pattern.priorities.forEach(priority => {
        priorityCount[priority] = (priorityCount[priority] || 0) + 1;
      });
      const mostCommonPriority = Object.keys(priorityCount).reduce((a, b) => 
        priorityCount[a] > priorityCount[b] ? a : b
      );
      
      // Gerar título do template
      const commonWords = Object.entries(titleWordCount)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 3)
        .map(([word]) => word);
      
      const templateTitle = this.generateSmartTitle(pattern.area, pattern.tipo, commonWords);
      const templateDescription = this.generateSmartDescription(pattern.area, pattern.tipo, pattern.descriptions);
      
      // Calcular confiança baseada na frequência
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

  // Gerar título inteligente
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

  // Gerar descrição inteligente
  generateSmartDescription(area, tipo, descriptions) {
    // Extrair padrões comuns das descrições
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

  // Extrair frases comuns das descrições
  extractCommonPhrases(descriptions) {
    // Implementação simplificada - pode ser melhorada com NLP
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

  // Obter ícone para área
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

  // Salvar template no Firebase
  async saveTemplate(template) {
    try {
      const templateRef = doc(db, this.templatesCollection, template.id);
      await setDoc(templateRef, template);
      console.log('✅ Template salvo:', template.id);
    } catch (error) {
      console.error('❌ Erro ao salvar template:', error);
    }
  }

  // Registrar uso de template para aprendizado
  async recordTemplateUsage(templateId, success = true) {
    try {
      const usageRef = doc(db, 'ai_template_usage', `${templateId}_${Date.now()}`);
      await setDoc(usageRef, {
        templateId,
        success,
        usedAt: new Date(),
        userId: 'current_user' // Substituir pelo ID do usuário atual
      });
    } catch (error) {
      console.error('❌ Erro ao registrar uso:', error);
    }
  }
}

const NewTicketForm = ({ projectId, onClose, onSuccess }) => {
  const { user, userProfile } = useAuth();
  const navigate = useNavigate();
  
  // ✅ ADIÇÃO: Campo `isConfidential` adicionado ao estado inicial do formulário.
  const [formData, setFormData] = useState({
    titulo: '',
    descricao: '',
    area: '',
    tipo: '',
    prioridade: 'media',
    isExtra: false,
    motivoExtra: '',
    isConfidential: false, // <-- NOVO CAMPO
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
  
  // 🤖 Estados para IA
  const [aiTemplates, setAiTemplates] = useState([]);
  const [loadingAI, setLoadingAI] = useState(false);
  const [aiService] = useState(new DynamicAITemplateService());

  useEffect(() => {
    loadProjects();
    loadAITemplates(); // Carregar templates IA na inicialização
  }, []);

  // Carregar templates IA do Firebase
  const loadAITemplates = async () => {
    setLoadingAI(true);
    try {
      const templates = await aiService.loadAITemplates();
      setAiTemplates(templates);
      console.log('🤖 Templates IA carregados no componente:', templates.length);
    } catch (error) {
      console.error('❌ Erro ao carregar templates IA:', error);
    } finally {
      setLoadingAI(false);
    }
  };

  // Atualizar templates IA (análise automática)
  const updateAITemplates = async () => {
    setLoadingAI(true);
    try {
      console.log('🔄 Iniciando atualização automática de templates...');
      await aiService.analyzeAndUpdateTemplates();
      await loadAITemplates(); // Recarregar templates atualizados
      console.log('✅ Templates IA atualizados com sucesso!');
    } catch (error) {
      console.error('❌ Erro ao atualizar templates IA:', error);
    } finally {
      setLoadingAI(false);
    }
  };

  // Carregar tipos quando área for selecionada
  useEffect(() => {
    if (formData.area) {
      console.log('🔄 Área selecionada:', formData.area);
      loadTypesByArea(formData.area);
    } else {
      setAvailableTypes([]);
      setOperators([]);
      setSelectedOperator('');
    }
  }, [formData.area]);

  // Carregar operadores quando tipo for selecionado
  useEffect(() => {
    if (formData.area && formData.tipo) {
      console.log('🔄 Tipo selecionado:', formData.tipo, 'para área:', formData.area);
      loadOperatorsByArea(formData.area);
    } else {
      setOperators([]);
      setSelectedOperator('');
    }
  }, [formData.area, formData.tipo]);

  const loadProjects = async () => {
    try {
      console.log('🔄 Carregando projetos para usuário:', userProfile?.funcao);
      
      const projectsData = await projectService.getAllProjects();
      
      // Filtrar projetos baseado no papel do usuário
      let filteredProjects = [];
      
      if (userProfile?.funcao === 'administrador' || userProfile?.funcao === 'gerente' || userProfile?.funcao === 'operador') {
        // Administradores, gerentes e operadores veem todos os projetos ativos
        filteredProjects = projectsData.filter(project => project.status !== 'encerrado');
      } else if (userProfile?.funcao === 'consultor') {
        // Consultores veem apenas projetos vinculados a eles
        const userId = userProfile.id || user.uid;
        filteredProjects = projectsData.filter(project => {
          const isAssigned = project.consultorId === userId || 
                            project.consultorUid === userId ||
                            project.consultorEmail === userProfile.email ||
                            project.consultorNome === userProfile.nome;
          return isAssigned && project.status !== 'encerrado';
        });
      } else if (userProfile?.funcao === 'produtor') {
        // Produtores veem apenas projetos vinculados a eles
        const userId = userProfile.id || user.uid;
        filteredProjects = projectsData.filter(project => {
          const isAssigned = project.produtorId === userId || 
                            project.produtorUid === userId ||
                            project.produtorEmail === userProfile.email ||
                            project.produtorNome === userProfile.nome;
          return isAssigned && project.status !== 'encerrado';
        });
      }

      // Ordenar por data de início (mais recentes primeiro)
      filteredProjects.sort((a, b) => {
        const dateA = a.dataInicio?.seconds ? new Date(a.dataInicio.seconds * 1000) : new Date(a.dataInicio || 0);
        const dateB = b.dataInicio?.seconds ? new Date(b.dataInicio.seconds * 1000) : new Date(b.dataInicio || 0);
        return dateB - dateA;
      });

      setProjects(filteredProjects);
      console.log('✅ Projetos carregados:', filteredProjects.length);
      
    } catch (error) {
      console.error('❌ Erro ao carregar projetos:', error);
      setError('Erro ao carregar projetos. Tente novamente.');
    }
  };

  const loadTypesByArea = (area) => {
    try {
      console.log('🔍 Carregando tipos para área:', area);
      const categories = getCategoriesByArea(area);
      console.log('📋 Categorias retornadas:', categories);
      
      const validTypes = categories.filter(category => {
        const isValid = category && 
                       category.value && 
                       typeof category.value === 'string' &&
                       category.value.trim() !== '' && 
                       category.label && 
                       typeof category.label === 'string' &&
                       category.label.trim() !== '';
        
        if (!isValid) {
          console.error('❌ Tipo inválido detectado:', category);
        }
        
        return isValid;
      });
      
      console.log('✅ Tipos válidos após validação:', validTypes);
      setAvailableTypes(validTypes);
      
      if (formData.tipo && !validTypes.find(type => type.value === formData.tipo)) {
        handleInputChange('tipo', '');
      }
      
    } catch (error) {
      console.error('❌ Erro ao carregar tipos por área:', error);
      setAvailableTypes([]);
    }
  };

  const loadOperatorsByArea = async (area) => {
    try {
      console.log('👥 Carregando operadores para área:', area);
      const allUsers = await userService.getAllUsers();
      const operatorsByArea = allUsers.filter(user => 
        user.funcao === 'operador' && user.area === area
      );
      console.log('👥 Operadores encontrados:', operatorsByArea);
      setOperators(operatorsByArea);
      
      if (selectedOperator && !operatorsByArea.find(op => op.id === selectedOperator)) {
        setSelectedOperator('');
      }
      
    } catch (error) {
      console.error('❌ Erro ao carregar operadores por área:', error);
      setOperators([]);
    }
  };

  // Função para obter eventos únicos
  const getUniqueEvents = () => {
    const events = [...new Set(projects.map(project => project.feira).filter(Boolean))];
    return events.sort();
  };

  // Função para obter projetos filtrados por evento
  const getProjectsByEvent = (eventName) => {
    return projects.filter(project => project.feira === eventName);
  };

  // Função para lidar com mudança de evento
  const handleEventChange = (eventName) => {
    console.log('🎯 Evento selecionado:', eventName);
    setSelectedEvent(eventName);
    setSelectedProject(''); // Limpar projeto selecionado quando evento muda
    setSelectedProjectData(null); // Limpar dados do projeto
  };

  // Função para lidar com mudança de projeto
  const handleProjectChange = (projectId) => {
    console.log('📋 Projeto selecionado:', projectId);
    
    const project = projects.find(p => p.id === projectId);
    if (project) {
      setSelectedProject(projectId);
      setSelectedProjectData(project);
      console.log('✅ Dados do projeto carregados:', project.nome);
    } else {
      setSelectedProject('');
      setSelectedProjectData(null);
    }
  };

  const handleInputChange = (field, value) => {
    console.log(`🔄 Alterando ${field} para:`, value);
    
    if (field === 'area') {
      const newFormData = {
        ...formData,
        [field]: value,
        tipo: ''
      };
      setFormData(newFormData);
      setSelectedOperator('');
    } else {
      const newFormData = {
        ...formData,
        [field]: value
      };
      setFormData(newFormData);
    }
    
    if (error) setError('');
  };

  // 🤖 Função para aplicar template de IA
  const applyAITemplate = async (templateId) => {
    const template = aiTemplates.find(t => t.id === templateId);
    if (!template) return;
    
    console.log('🤖 Aplicando template IA:', templateId, template);
    
    setFormData(prev => ({
      ...prev,
      titulo: template.titulo,
      descricao: template.descricao,
      area: template.area,
      tipo: template.tipo,
      prioridade: template.prioridade
    }));
    
    setSelectedAITemplate(templateId);
    
    // Registrar uso do template para aprendizado
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
          uploading: false,
          uploaded: false,
          url: null
        };
        
        setImages(prev => [...prev, newImage]);
      } catch (error) {
        console.error('Erro ao processar imagem:', error);
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
    
    if (!validateForm()) {
      return;
    }

    setLoading(true);
    setError('');

    try {
      let finalTicketData = { ...formData };
      
      if (userProfile?.funcao === 'consultor' && 
          (formData.tipo === TICKET_TYPES.MAINTENANCE || 
           formData.tipo === TICKET_TYPES.MAINTENANCE_PRODUCTION ||
           formData.tipo === TICKET_TYPES.MAINTENANCE_FURNITURE ||
           formData.tipo === TICKET_TYPES.MAINTENANCE_VISUAL)) {
        
        finalTicketData.area = AREAS.PRODUCTION;
        finalTicketData.observacoes = `${finalTicketData.observacoes || ''}\n\n[CHAMADO DE CONSULTOR] - Direcionado para o produtor avaliar e tratar ou escalar para área específica.`.trim();
      }

      // 🤖 Adicionar informação se foi usado template IA
      if (selectedAITemplate) {
        const aiTemplate = aiTemplates.find(t => t.id === selectedAITemplate);
        if (aiTemplate) {
          finalTicketData.observacoes = `${finalTicketData.observacoes || ''}\n\n[TEMPLATE IA] - Gerado automaticamente baseado em ${aiTemplate.frequency} chamados similares (${Math.round(aiTemplate.confidence * 100)}% confiança).`.trim();
        }
      }

      const ticketData = {
        ...finalTicketData,
        // ✅ ADIÇÃO: Campo `isConfidential` incluído nos dados do chamado a ser criado.
        isConfidential: formData.isConfidential, // <-- NOVO CAMPO
        projetoId: selectedProject,
        criadoPor: user.uid,
        criadoPorNome: userProfile?.nome || user.email,
        criadoPorFuncao: (() => {
          if (userProfile?.funcao === 'operador' && userProfile?.area === 'comunicacao_visual') {
            return 'operador_comunicacao_visual';
          } else if (userProfile?.funcao === 'operador' && userProfile?.area === 'almoxarifado') {
            return 'operador_almoxarifado';
          } else {
            return userProfile?.funcao;
          }
        })(),
        areasEnvolvidas: (() => {
          const areas = [];
          
          if (userProfile?.area) {
            areas.push(userProfile.area);
          }
          
          if (finalTicketData.area && finalTicketData.area !== userProfile?.area) {
            areas.push(finalTicketData.area);
          }
          
          if (!userProfile?.area && finalTicketData.area) {
            areas.push(finalTicketData.area);
          }
          
          return areas;
        })(),
        areaDeOrigem: userProfile?.area || null,
        imagens: [],
        createdAt: new Date(),
        updatedAt: new Date()
      };

      if (selectedOperator) {
        ticketData.atribuidoA = selectedOperator;
        ticketData.status = 'em_tratativa';
        ticketData.atribuidoEm = new Date();
        ticketData.atribuidoPor = user.uid;
      }

      const ticketId = await ticketService.createTicket(ticketData);

      // 🔔 NOTIFICAÇÃO DE NOVO CHAMADO (lógica existente mantida)
      try {
        console.log('🔔 Enviando notificação de novo chamado...');
        await notificationService.notifyNewTicket(ticketId, ticketData, user.uid);
        console.log('✅ Notificação de novo chamado enviada com sucesso');
      } catch (notificationError) {
        console.error('❌ Erro ao enviar notificação de novo chamado:', notificationError);
        // Não bloquear o fluxo se a notificação falhar
      }

      // 🤖 Após criar chamado, atualizar templates IA automaticamente
      setTimeout(() => {
        updateAITemplates();
      }, 2000);

      if (images.length > 0) {
        setImages(prev => prev.map(img => ({ ...img, uploading: true })));
        
        try {
          const uploadedImages = await imageService.uploadMultipleImages(
            images.map(img => img.file), 
            ticketId
          );
          
          await ticketService.updateTicket(ticketId, {
            imagens: uploadedImages.map(img => ({
              url: img.url,
              name: img.name,
              path: img.path
            }))
          });
          
          setImages(prev => prev.map((img, index) => ({
            ...img,
            uploading: false,
            uploaded: true,
            url: uploadedImages[index]?.url
          })));
          
        } catch (uploadError) {
          console.error('Erro no upload das imagens:', uploadError);
          alert('Chamado criado com sucesso, mas houve erro no upload das imagens. Você pode adicionar as imagens depois.');
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
        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Seleção de Evento */}
          <div className="space-y-2">
            <Label htmlFor="event">Selecione o Evento *</Label>
            <Select value={selectedEvent} onValueChange={handleEventChange}>
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

          {/* Seleção de Projeto */}
          <div className="space-y-2">
            <Label htmlFor="project">Selecione o Projeto *</Label>
            <Select 
              value={selectedProject} 
              onValueChange={handleProjectChange}
              disabled={!selectedEvent}
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
            
            {/* Informações do projeto selecionado */}
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

          {/* 🤖 TEMPLATES IA DINÂMICOS (sem alterações) */}
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
                                🕒 {new Date(template.generatedAt.seconds * 1000).toLocaleDateString()}
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

          {/* Título */}
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

          {/* Descrição */}
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

          {/* Área e Tipo */}
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
              {formData.area && availableTypes.length === 0 && (
                <p className="text-sm text-amber-600">
                  ⚠️ Nenhum tipo disponível para esta área
                </p>
              )}
            </div>
          </div>

          {/* Prioridade */}
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

          {/* Atribuição Direta a Operador */}
          {formData.area && formData.tipo && (
            <div className="space-y-2 p-4 border border-gray-200 rounded-lg bg-gray-50">
              <label htmlFor="operator-select" className="block text-sm font-medium text-gray-700 mb-1">
                Atribuir a um operador (Opcional):
              </label>
              <div className="text-xs text-gray-500 mb-2">
                Área: {formData.area} | Tipo: {formData.tipo} | Operadores encontrados: {operators.length}
              </div>
              {operators.length > 0 ? (
                <select 
                  id="operator-select"
                  value={selectedOperator || ''} 
                  onChange={(e) => setSelectedOperator(e.target.value)}
                  className="block w-full p-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 bg-white text-black"
                >
                  <option value="">Enviar para a área toda</option>
                  {operators.map(operator => {
                    if (!operator || !operator.id || !operator.nome) {
                      console.error('❌ Operador inválido:', operator);
                      return null;
                    }
                    return (
                      <option key={operator.id} value={operator.id}>
                        {operator.nome} - {operator.area?.replace('_', ' ').toUpperCase() || 'SEM_ÁREA'}
                      </option>
                    );
                  })}
                </select>
              ) : (
                <div className="text-sm text-gray-500 p-2 border rounded bg-white">
                  Carregando operadores da área {formData.area}...
                </div>
              )}
              {selectedOperator && (
                <p className="text-sm text-blue-600 mt-2">
                  ℹ️ O chamado será enviado diretamente para o operador selecionado
                </p>
              )}
            </div>
          )}

          {/* Opções Adicionais (Extra e Confidencial) */}
          <div className="space-y-4 pt-4 border-t">
            {/* Pedido Extra (já existente) */}
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

            {/* ✅ ADIÇÃO: Seção para o chamado confidencial */}
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

            {formData.isConfidential && (
              <div className="p-3 bg-orange-50 border-l-4 border-orange-400 text-orange-800 text-sm rounded-r-lg">
                <p className="font-semibold">Atenção: Chamado Confidencial</p>
                <p className="mt-1">
                  Este chamado será visível apenas para você (criador), para a área de destino ({formData.area ? areaOptions.find(a => a.value === formData.area)?.label : 'N/A'}) e para administradores.
                </p>
                <p className="font-bold mt-2">Ele não aparecerá para o consultor ou produtor do projeto.</p>
              </div>
            )}
          </div>


          {/* Upload de Imagens */}
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

          {/* Observações */}
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

          {/* Botões */}
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
