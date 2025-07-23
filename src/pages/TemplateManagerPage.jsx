import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { 
  ArrowLeft, 
  Plus, 
  Edit, 
  Trash2, 
  Save, 
  X,
  FileText,
  AlertCircle,
  CheckCircle
} from 'lucide-react';
import { collection, query, onSnapshot, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { AREAS } from '../services/userService';

const TemplateManagerPage = () => {
  const navigate = useNavigate();
  const { user, userProfile } = useAuth();
  
  // Estados principais
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  
  // Estados do formulário
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [formData, setFormData] = useState({
    nome: '',
    titulo: '',
    descricao: '',
    area: '',
    tipo: '',
    prioridade: 'media',
    ativo: true
  });

  // Verificar se o usuário é administrador
  useEffect(() => {
    if (userProfile && userProfile.funcao !== 'administrador') {
      navigate('/dashboard');
      return;
    }
  }, [userProfile, navigate]);

  // Carregar templates do Firestore
  useEffect(() => {
    if (!user?.uid) return;

    const templatesRef = collection(db, 'ticketTemplates');
    const q = query(templatesRef);

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const templatesData = [];
      snapshot.forEach((doc) => {
        templatesData.push({
          id: doc.id,
          ...doc.data()
        });
      });
      
      setTemplates(templatesData);
      setLoading(false);
    }, (error) => {
      console.error('Erro ao carregar templates:', error);
      setError('Erro ao carregar templates');
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user?.uid]);

  // Função para resetar formulário
  const resetForm = () => {
    setFormData({
      nome: '',
      titulo: '',
      descricao: '',
      area: '',
      tipo: '',
      prioridade: 'media',
      ativo: true
    });
    setEditingTemplate(null);
    setError('');
    setSuccess('');
  };

  // Função para abrir dialog de criação
  const handleCreate = () => {
    resetForm();
    setIsDialogOpen(true);
  };

  // Função para abrir dialog de edição
  const handleEdit = (template) => {
    setFormData({
      nome: template.nome || '',
      titulo: template.titulo || '',
      descricao: template.descricao || '',
      area: template.area || '',
      tipo: template.tipo || '',
      prioridade: template.prioridade || 'media',
      ativo: template.ativo !== false
    });
    setEditingTemplate(template);
    setIsDialogOpen(true);
  };

  // Função para salvar template
  const handleSave = async () => {
    try {
      // Validações
      if (!formData.nome.trim()) {
        setError('Nome do template é obrigatório');
        return;
      }
      if (!formData.titulo.trim()) {
        setError('Título é obrigatório');
        return;
      }
      if (!formData.descricao.trim()) {
        setError('Descrição é obrigatória');
        return;
      }
      if (!formData.area) {
        setError('Área é obrigatória');
        return;
      }

      const templateData = {
        ...formData,
        updatedAt: new Date().toISOString(),
        updatedBy: user.uid
      };

      if (editingTemplate) {
        // Atualizar template existente
        const templateRef = doc(db, 'ticketTemplates', editingTemplate.id);
        await updateDoc(templateRef, templateData);
        setSuccess('Template atualizado com sucesso!');
      } else {
        // Criar novo template
        templateData.createdAt = new Date().toISOString();
        templateData.createdBy = user.uid;
        await addDoc(collection(db, 'ticketTemplates'), templateData);
        setSuccess('Template criado com sucesso!');
      }

      setIsDialogOpen(false);
      resetForm();
      
      // Limpar mensagem de sucesso após 3 segundos
      setTimeout(() => setSuccess(''), 3000);

    } catch (error) {
      console.error('Erro ao salvar template:', error);
      setError('Erro ao salvar template. Tente novamente.');
    }
  };

  // Função para excluir template
  const handleDelete = async (templateId) => {
    if (!window.confirm('Tem certeza que deseja excluir este template?')) {
      return;
    }

    try {
      await deleteDoc(doc(db, 'ticketTemplates', templateId));
      setSuccess('Template excluído com sucesso!');
      
      // Limpar mensagem de sucesso após 3 segundos
      setTimeout(() => setSuccess(''), 3000);
    } catch (error) {
      console.error('Erro ao excluir template:', error);
      setError('Erro ao excluir template. Tente novamente.');
    }
  };

  // Função para alternar status ativo/inativo
  const toggleActive = async (template) => {
    try {
      const templateRef = doc(db, 'ticketTemplates', template.id);
      await updateDoc(templateRef, {
        ativo: !template.ativo,
        updatedAt: new Date().toISOString(),
        updatedBy: user.uid
      });
    } catch (error) {
      console.error('Erro ao alterar status do template:', error);
      setError('Erro ao alterar status do template.');
    }
  };

  // Função para obter cor da área
  const getAreaColor = (area) => {
    const colors = {
      'almoxarifado': 'bg-blue-100 text-blue-800',
      'comunicacao_visual': 'bg-purple-100 text-purple-800',
      'operacional': 'bg-green-100 text-green-800',
      'comercial': 'bg-orange-100 text-orange-800',
      'financeiro': 'bg-red-100 text-red-800',
      'logotipia': 'bg-pink-100 text-pink-800',
      'producao': 'bg-yellow-100 text-yellow-800',
      'logistica': 'bg-indigo-100 text-indigo-800',
      'compras': 'bg-teal-100 text-teal-800'
    };
    return colors[area] || 'bg-gray-100 text-gray-800';
  };

  // Função para obter cor da prioridade
  const getPriorityColor = (priority) => {
    const colors = {
      'alta': 'bg-red-100 text-red-800',
      'media': 'bg-yellow-100 text-yellow-800',
      'baixa': 'bg-green-100 text-green-800'
    };
    return colors[priority] || 'bg-gray-100 text-gray-800';
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-4">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
              <p className="text-gray-600">Carregando templates...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-4 sm:space-y-0">
            <div className="flex flex-col sm:flex-row sm:items-center space-y-2 sm:space-y-0 sm:space-x-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate('/dashboard')}
                className="flex items-center space-x-2 w-fit"
              >
                <ArrowLeft className="h-4 w-4" />
                <span>Voltar</span>
              </Button>
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Gerenciador de Templates</h1>
                <p className="text-sm sm:text-base text-gray-600 mt-1">
                  Gerencie templates de chamados para agilizar a criação
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <div className="text-center sm:text-right">
                <div className="text-xs sm:text-sm text-gray-500">Total de templates</div>
                <div className="text-xl sm:text-2xl font-bold text-blue-600">{templates.length}</div>
              </div>
              <Button onClick={handleCreate} className="flex items-center space-x-2">
                <Plus className="h-4 w-4" />
                <span>Novo Template</span>
              </Button>
            </div>
          </div>
        </div>

        {/* Mensagens de feedback */}
        {error && (
          <Alert variant="destructive" className="mb-4">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {success && (
          <Alert className="mb-4 border-green-200 bg-green-50">
            <CheckCircle className="h-4 w-4 text-green-600" />
            <AlertDescription className="text-green-800">{success}</AlertDescription>
          </Alert>
        )}

        {/* Lista de Templates */}
        {templates.length === 0 ? (
          <Card className="text-center py-12">
            <CardContent>
              <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                Nenhum template encontrado
              </h3>
              <p className="text-gray-600 mb-4">
                Crie seu primeiro template para agilizar a criação de chamados.
              </p>
              <Button onClick={handleCreate}>
                <Plus className="h-4 w-4 mr-2" />
                Criar Primeiro Template
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {templates.map((template) => (
              <Card key={template.id} className={`${template.ativo ? '' : 'opacity-60'}`}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="text-lg font-semibold text-gray-900 mb-1">
                        {template.nome}
                      </CardTitle>
                      <CardDescription className="text-sm text-gray-600">
                        {template.titulo}
                      </CardDescription>
                    </div>
                    <div className="flex items-center space-x-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEdit(template)}
                        className="h-8 w-8 p-0"
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(template.id)}
                        className="h-8 w-8 p-0 text-red-600 hover:text-red-700"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                
                <CardContent className="pt-0">
                  <p className="text-sm text-gray-700 mb-3 line-clamp-3">
                    {template.descricao}
                  </p>
                  
                  <div className="flex flex-wrap gap-2 mb-3">
                    {template.area && (
                      <Badge className={`${getAreaColor(template.area)} text-xs`}>
                        {template.area.replace('_', ' ').toUpperCase()}
                      </Badge>
                    )}
                    {template.prioridade && (
                      <Badge className={`${getPriorityColor(template.prioridade)} text-xs`}>
                        {template.prioridade.toUpperCase()}
                      </Badge>
                    )}
                    <Badge variant={template.ativo ? "default" : "secondary"} className="text-xs">
                      {template.ativo ? 'ATIVO' : 'INATIVO'}
                    </Badge>
                  </div>

                  <div className="flex justify-between items-center">
                    <div className="text-xs text-gray-500">
                      {template.tipo && (
                        <span>Tipo: {template.tipo}</span>
                      )}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => toggleActive(template)}
                      className="text-xs"
                    >
                      {template.ativo ? 'Desativar' : 'Ativar'}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Dialog de Criação/Edição */}
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editingTemplate ? 'Editar Template' : 'Novo Template'}
              </DialogTitle>
              <DialogDescription>
                {editingTemplate 
                  ? 'Edite as informações do template de chamado.'
                  : 'Crie um novo template para agilizar a criação de chamados.'
                }
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              {/* Nome do Template */}
              <div>
                <Label htmlFor="nome">Nome do Template *</Label>
                <Input
                  id="nome"
                  value={formData.nome}
                  onChange={(e) => setFormData(prev => ({ ...prev, nome: e.target.value }))}
                  placeholder="Ex: Material Urgente, Problema Técnico..."
                  className="mt-1"
                />
              </div>

              {/* Título */}
              <div>
                <Label htmlFor="titulo">Título do Chamado *</Label>
                <Input
                  id="titulo"
                  value={formData.titulo}
                  onChange={(e) => setFormData(prev => ({ ...prev, titulo: e.target.value }))}
                  placeholder="Título que aparecerá no chamado"
                  className="mt-1"
                />
              </div>

              {/* Descrição */}
              <div>
                <Label htmlFor="descricao">Descrição *</Label>
                <Textarea
                  id="descricao"
                  value={formData.descricao}
                  onChange={(e) => setFormData(prev => ({ ...prev, descricao: e.target.value }))}
                  placeholder="Descrição detalhada do chamado"
                  className="mt-1 min-h-[100px]"
                />
              </div>

              {/* Área */}
              <div>
                <Label htmlFor="area">Área *</Label>
                <Select value={formData.area} onValueChange={(value) => setFormData(prev => ({ ...prev, area: value }))}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Selecione a área" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(AREAS).map(([key, value]) => (
                      <SelectItem key={key} value={key}>
                        {value}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Tipo */}
              <div>
                <Label htmlFor="tipo">Tipo</Label>
                <Input
                  id="tipo"
                  value={formData.tipo}
                  onChange={(e) => setFormData(prev => ({ ...prev, tipo: e.target.value }))}
                  placeholder="Tipo específico do chamado (opcional)"
                  className="mt-1"
                />
              </div>

              {/* Prioridade */}
              <div>
                <Label htmlFor="prioridade">Prioridade</Label>
                <Select value={formData.prioridade} onValueChange={(value) => setFormData(prev => ({ ...prev, prioridade: value }))}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="baixa">Baixa</SelectItem>
                    <SelectItem value="media">Média</SelectItem>
                    <SelectItem value="alta">Alta</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex justify-end space-x-2 pt-4">
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                <X className="h-4 w-4 mr-2" />
                Cancelar
              </Button>
              <Button onClick={handleSave}>
                <Save className="h-4 w-4 mr-2" />
                {editingTemplate ? 'Atualizar' : 'Criar'} Template
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
};

export default TemplateManagerPage;

