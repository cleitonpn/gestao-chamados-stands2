import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { userService, USER_ROLES, AREAS } from '../services/userService';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { 
  Plus, 
  ArrowLeft, 
  Edit, 
  Trash2, 
  Users, 
  Mail,
  Shield,
  AlertCircle,
  Loader2
} from 'lucide-react';

const UsersPage = () => {
  const { userProfile } = useAuth();
  const navigate = useNavigate();
  
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showNewUserDialog, setShowNewUserDialog] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  
  // Form state
  const [formData, setFormData] = useState({
    nome: '',
    email: '',
    funcao: '',
    area: '',
    telefone: '',
    observacoes: ''
  });
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    // Verificar se o usuário tem permissão para acessar esta página
    if (userProfile?.funcao !== 'administrador') {
      navigate('/dashboard');
      return;
    }
    
    loadUsers();
  }, [userProfile, navigate]);

  const loadUsers = async () => {
    try {
      setLoading(true);
      const usersData = await userService.getAllUsers();
      setUsers(usersData);
    } catch (error) {
      console.error('Erro ao carregar usuários:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
    if (formError) setFormError('');
  };

  const resetForm = () => {
    setFormData({
      nome: '',
      email: '',
      funcao: '',
      area: '',
      telefone: '',
      observacoes: ''
    });
    setFormError('');
    setEditingUser(null);
  };

  const handleEdit = (user) => {
    setFormData({
      nome: user.nome || '',
      email: user.email || '',
      funcao: user.funcao || '',
      area: user.area || '',
      telefone: user.telefone || '',
      observacoes: user.observacoes || ''
    });
    setEditingUser(user);
    setShowNewUserDialog(true);
  };

  const validateForm = () => {
    if (!formData.nome.trim()) {
      setFormError('Nome é obrigatório');
      return false;
    }
    if (!formData.email.trim()) {
      setFormError('Email é obrigatório');
      return false;
    }
    if (!formData.funcao) {
      setFormError('Função é obrigatória');
      return false;
    }
    
    // Verificar se área é obrigatória para certas funções
    const rolesRequiringArea = ['gerente', 'operador'];
    if (rolesRequiringArea.includes(formData.funcao) && !formData.area) {
      setFormError('Área é obrigatória para esta função');
      return false;
    }
    
    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validateForm()) return;

    setFormLoading(true);
    setFormError('');

    try {
      if (editingUser) {
        await userService.updateUser(editingUser.id, formData);
      } else {
        await userService.createUser(formData);
      }

      await loadUsers();
      setShowNewUserDialog(false);
      resetForm();
    } catch (error) {
      console.error('Erro ao salvar usuário:', error);
      setFormError('Erro ao salvar usuário. Tente novamente.');
    } finally {
      setFormLoading(false);
    }
  };

  const handleDelete = async (userId) => {
    if (!confirm('Tem certeza que deseja excluir este usuário?')) return;

    try {
      await userService.deleteUser(userId);
      await loadUsers();
    } catch (error) {
      console.error('Erro ao excluir usuário:', error);
      alert('Erro ao excluir usuário. Tente novamente.');
    }
  };

  const getRoleColor = (role) => {
    const colors = {
      'administrador': 'bg-red-100 text-red-800',
      'produtor': 'bg-blue-100 text-blue-800',
      'consultor': 'bg-green-100 text-green-800',
      'gerente': 'bg-purple-100 text-purple-800',
      'operador': 'bg-yellow-100 text-yellow-800',
      'comercial': 'bg-orange-100 text-orange-800'
    };
    return colors[role] || 'bg-gray-100 text-gray-800';
  };

  const formatRole = (role) => {
    const roleMap = {
      'administrador': 'Administrador',
      'produtor': 'Produtor',
      'consultor': 'Consultor',
      'gerente': 'Gerente',
      'operador': 'Operador',
      'comercial': 'Comercial'
    };
    return roleMap[role] || role;
  };

  const formatArea = (area) => {
    const areaMap = {
      'logistica': 'Logística',
      'almoxarifado': 'Almoxarifado',
      'comunicacao_visual': 'Comunicação Visual',
      'locacao': 'Locação',
      'compras': 'Compras',
      'producao': 'Produção',
      'comercial': 'Comercial',
      'operacional': 'Operacional'
    };
    return areaMap[area] || area;
  };

  // Opções de função
  const roleOptions = [
    { value: USER_ROLES.ADMIN, label: 'Administrador' },
    { value: USER_ROLES.PRODUCER, label: 'Produtor' },
    { value: USER_ROLES.CONSULTANT, label: 'Consultor' },
    { value: USER_ROLES.MANAGER, label: 'Gerente' },
    { value: USER_ROLES.OPERATOR, label: 'Operador' },
    { value: USER_ROLES.COMMERCIAL, label: 'Comercial' }
  ];

  // Opções de área
  const areaOptions = [
    { value: AREAS.LOGISTICS, label: 'Logística' },
    { value: AREAS.WAREHOUSE, label: 'Almoxarifado' },
    { value: AREAS.VISUAL_COMMUNICATION, label: 'Comunicação Visual' },
    { value: AREAS.RENTAL, label: 'Locação' },
    { value: AREAS.PURCHASES, label: 'Compras' },
    { value: AREAS.PRODUCTION, label: 'Produção' },
    { value: AREAS.COMMERCIAL, label: 'Comercial' },
    { value: AREAS.OPERATIONS, label: 'Operacional' }
  ];

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p>Carregando usuários...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between py-4">
            <div className="flex items-center">
              <Button 
                variant="ghost" 
                onClick={() => navigate('/dashboard')}
                className="mr-4"
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Voltar
              </Button>
              <h1 className="text-2xl font-bold text-gray-900">
                Gerenciar Usuários
              </h1>
            </div>
            
            <Dialog open={showNewUserDialog} onOpenChange={setShowNewUserDialog}>
              <DialogTrigger asChild>
                <Button onClick={resetForm}>
                  <Plus className="h-4 w-4 mr-2" />
                  Novo Usuário
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>
                    {editingUser ? 'Editar Usuário' : 'Novo Usuário'}
                  </DialogTitle>
                  <DialogDescription>
                    Preencha os dados do usuário
                  </DialogDescription>
                </DialogHeader>
                
                <form onSubmit={handleSubmit} className="space-y-4">
                  {formError && (
                    <Alert variant="destructive">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>{formError}</AlertDescription>
                    </Alert>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="nome">Nome Completo *</Label>
                      <Input
                        id="nome"
                        value={formData.nome}
                        onChange={(e) => handleInputChange('nome', e.target.value)}
                        disabled={formLoading}
                        required
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="email">Email *</Label>
                      <Input
                        id="email"
                        type="email"
                        value={formData.email}
                        onChange={(e) => handleInputChange('email', e.target.value)}
                        disabled={formLoading}
                        required
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="funcao">Função *</Label>
                      <Select value={formData.funcao} onValueChange={(value) => handleInputChange('funcao', value)}>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione a função" />
                        </SelectTrigger>
                        <SelectContent>
                          {roleOptions.map((role) => (
                            <SelectItem key={role.value} value={role.value}>
                              {role.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="area">Área</Label>
                      <Select value={formData.area} onValueChange={(value) => handleInputChange('area', value)}>
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
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="telefone">Telefone</Label>
                    <Input
                      id="telefone"
                      value={formData.telefone}
                      onChange={(e) => handleInputChange('telefone', e.target.value)}
                      disabled={formLoading}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="observacoes">Observações</Label>
                    <Input
                      id="observacoes"
                      value={formData.observacoes}
                      onChange={(e) => handleInputChange('observacoes', e.target.value)}
                      disabled={formLoading}
                    />
                  </div>

                  <div className="flex justify-end space-x-3 pt-4">
                    <Button 
                      type="button" 
                      variant="outline" 
                      onClick={() => setShowNewUserDialog(false)}
                      disabled={formLoading}
                    >
                      Cancelar
                    </Button>
                    <Button type="submit" disabled={formLoading}>
                      {formLoading ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Salvando...
                        </>
                      ) : (
                        editingUser ? 'Atualizar' : 'Criar'
                      )}
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid gap-6">
          {users.map((user) => (
            <Card key={user.id}>
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div className="space-y-3 flex-1">
                    <div className="flex items-center space-x-3">
                      <h3 className="text-xl font-semibold">{user.nome}</h3>
                      <Badge className={getRoleColor(user.funcao)}>
                        {formatRole(user.funcao)}
                      </Badge>
                      {user.area && (
                        <Badge variant="outline">
                          {formatArea(user.area)}
                        </Badge>
                      )}
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-sm text-gray-600">
                      <div className="flex items-center">
                        <Mail className="h-4 w-4 mr-2" />
                        {user.email}
                      </div>
                      {user.telefone && (
                        <div className="flex items-center">
                          <Shield className="h-4 w-4 mr-2" />
                          {user.telefone}
                        </div>
                      )}
                      <div className="flex items-center">
                        <Users className="h-4 w-4 mr-2" />
                        Criado em: {user.createdAt?.toDate?.()?.toLocaleDateString('pt-BR') || 'Data não disponível'}
                      </div>
                    </div>
                    
                    {user.observacoes && (
                      <p className="text-gray-600">{user.observacoes}</p>
                    )}
                  </div>
                  
                  <div className="flex space-x-2 ml-4">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleEdit(user)}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDelete(user.id)}
                      className="text-red-600 hover:text-red-700"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
          
          {users.length === 0 && (
            <Card>
              <CardContent className="p-8 text-center">
                <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">
                  Nenhum usuário encontrado
                </h3>
                <p className="text-gray-600">
                  Crie o primeiro usuário para começar.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </div>
  );
};

export default UsersPage;

