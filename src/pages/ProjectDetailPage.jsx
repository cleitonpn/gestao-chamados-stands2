import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { projectService } from '../services/projectService';
import { userService } from '../services/userService';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  ArrowLeft, 
  Calendar,
  MapPin,
  Users, 
  ExternalLink,
  Loader2,
  Clock,
  Wrench,
  PartyPopper,
  Truck,
  FileText,
  Building,
  AlertCircle
} from 'lucide-react';

const ProjectDetailPage = () => {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const { user, userProfile, authInitialized } = useAuth();
  
  const [project, setProject] = useState(null);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    console.log('🔍 ProjectDetailPage carregando:', { projectId, user: !!user, userProfile: !!userProfile, authInitialized });
    
    if (authInitialized && user && userProfile) {
      loadProjectData();
    } else if (authInitialized && !user) {
      console.log('❌ Usuário não autenticado, redirecionando para login');
      navigate('/login');
    }
  }, [projectId, user, userProfile, authInitialized, navigate]);

  const loadProjectData = async () => {
    try {
      setLoading(true);
      setError('');
      
      console.log('📊 Carregando dados do projeto:', projectId);

      // Carregar projeto e usuários em paralelo
      const [projectData, usersData] = await Promise.all([
        projectService.getProjectById(projectId),
        userService.getAllUsers().catch(() => [])
      ]);

      if (!projectData) {
        console.log('❌ Projeto não encontrado:', projectId);
        setError('Projeto não encontrado');
        return;
      }

      console.log('✅ Projeto carregado:', projectData.nome);
      
      // Verificar permissões
      const userRole = userProfile.funcao;
      const userId = userProfile.id || user.uid;
      
      console.log('🔐 Verificando permissões:', { userRole, userId });

      // Administradores, gerentes e operadores podem ver todos os projetos
      if (userRole === 'administrador' || userRole === 'gerente' || userRole === 'operador') {
        console.log('✅ Usuário tem permissão total');
      }
      // Consultores e produtores só podem ver projetos vinculados a eles
      else if (userRole === 'consultor') {
        const hasAccess = projectData.consultorId === userId || 
                         projectData.consultorUid === userId ||
                         projectData.consultorEmail === userProfile.email ||
                         projectData.consultorNome === userProfile.nome;
        
        if (!hasAccess) {
          console.log('❌ Consultor sem acesso ao projeto');
          setError('Você não tem permissão para visualizar este projeto');
          return;
        }
        console.log('✅ Consultor tem acesso ao projeto');
      }
      else if (userRole === 'produtor') {
        const hasAccess = projectData.produtorId === userId || 
                         projectData.produtorUid === userId ||
                         projectData.produtorEmail === userProfile.email ||
                         projectData.produtorNome === userProfile.nome;
        
        if (!hasAccess) {
          console.log('❌ Produtor sem acesso ao projeto');
          setError('Você não tem permissão para visualizar este projeto');
          return;
        }
        console.log('✅ Produtor tem acesso ao projeto');
      }
      else {
        console.log('❌ Papel sem permissão:', userRole);
        setError('Você não tem permissão para visualizar projetos');
        return;
      }

      setProject(projectData);
      setUsers(usersData || []);

    } catch (err) {
      console.error('❌ Erro ao carregar projeto:', err);
      setError('Erro ao carregar dados do projeto');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (timestamp) => {
    if (!timestamp) return 'Não definido';
    
    try {
      // Se é um timestamp do Firestore
      if (timestamp.seconds) {
        const date = new Date(timestamp.seconds * 1000);
        return date.toLocaleDateString('pt-BR', {
          day: '2-digit',
          month: '2-digit',
          year: '2-digit'
        });
      }
      
      // Se é uma string de data (YYYY-MM-DD), formatar diretamente
      if (typeof timestamp === 'string' && timestamp.match(/^\d{4}-\d{2}-\d{2}$/)) {
        const [year, month, day] = timestamp.split('-');
        return `${day}/${month}/${year.slice(-2)}`;
      }
      
      // Para outros casos
      const date = new Date(timestamp);
      if (isNaN(date.getTime())) {
        return 'Data inválida';
      }
      
      return date.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: '2-digit'
      });
    } catch (error) {
      console.error('Erro ao formatar data:', error);
      return 'Data inválida';
    }
  };

  const getStatusInfo = () => {
    if (!project) return { label: 'Carregando...', color: 'gray' };
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Verificar se está em montagem
    if (project.montagem?.dataInicio && project.montagem?.dataFim) {
      const inicio = project.montagem.dataInicio.seconds ? 
        new Date(project.montagem.dataInicio.seconds * 1000) : 
        new Date(project.montagem.dataInicio);
      const fim = project.montagem.dataFim.seconds ? 
        new Date(project.montagem.dataFim.seconds * 1000) : 
        new Date(project.montagem.dataFim);
      
      inicio.setHours(0, 0, 0, 0);
      fim.setHours(23, 59, 59, 999);
      
      if (today >= inicio && today <= fim) {
        return { label: 'Em Montagem', color: 'blue' };
      }
    }

    // Verificar se está em evento
    if (project.evento?.dataInicio && project.evento?.dataFim) {
      const inicio = project.evento.dataInicio.seconds ? 
        new Date(project.evento.dataInicio.seconds * 1000) : 
        new Date(project.evento.dataInicio);
      const fim = project.evento.dataFim.seconds ? 
        new Date(project.evento.dataFim.seconds * 1000) : 
        new Date(project.evento.dataFim);
      
      inicio.setHours(0, 0, 0, 0);
      fim.setHours(23, 59, 59, 999);
      
      if (today >= inicio && today <= fim) {
        return { label: 'Em Andamento', color: 'green' };
      }
    }

    // Verificar se está em desmontagem
    if (project.desmontagem?.dataInicio && project.desmontagem?.dataFim) {
      const inicio = project.desmontagem.dataInicio.seconds ? 
        new Date(project.desmontagem.dataInicio.seconds * 1000) : 
        new Date(project.desmontagem.dataInicio);
      const fim = project.desmontagem.dataFim.seconds ? 
        new Date(project.desmontagem.dataFim.seconds * 1000) : 
        new Date(project.desmontagem.dataFim);
      
      inicio.setHours(0, 0, 0, 0);
      fim.setHours(23, 59, 59, 999);
      
      if (today >= inicio && today <= fim) {
        return { label: 'Desmontagem', color: 'orange' };
      }
    }

    // Verificar se é futuro
    const dataInicio = project.dataInicio || project.montagem?.dataInicio || project.evento?.dataInicio;
    if (dataInicio) {
      const inicio = dataInicio.seconds ? 
        new Date(dataInicio.seconds * 1000) : 
        new Date(dataInicio);
      inicio.setHours(0, 0, 0, 0);
      
      if (today < inicio) {
        return { label: 'Futuro', color: 'yellow' };
      }
    }

    return { label: 'Finalizado', color: 'gray' };
  };

  const canEdit = userProfile?.funcao === 'administrador';

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p>Carregando projeto...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Erro</h2>
          <p className="text-gray-600 mb-4">{error}</p>
          <Button onClick={() => navigate('/projetos')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar para Projetos
          </Button>
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Projeto não encontrado</h2>
          <p className="text-gray-600 mb-4">O projeto solicitado não existe ou foi removido.</p>
          <Button onClick={() => navigate('/projetos')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar para Projetos
          </Button>
        </div>
      </div>
    );
  }

  const statusInfo = getStatusInfo();

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-6xl mx-auto">
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
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-3xl font-bold text-gray-900">
                  {project.nome}
                </h1>
                <Badge 
                  variant="secondary"
                  className={`${
                    statusInfo.color === 'blue' ? 'bg-blue-100 text-blue-800' :
                    statusInfo.color === 'green' ? 'bg-green-100 text-green-800' :
                    statusInfo.color === 'orange' ? 'bg-orange-100 text-orange-800' :
                    statusInfo.color === 'yellow' ? 'bg-yellow-100 text-yellow-800' :
                    'bg-gray-100 text-gray-800'
                  }`}
                >
                  {statusInfo.label}
                </Badge>
              </div>
              <p className="text-gray-600">
                {project.feira} • {project.local}
              </p>
            </div>
          </div>
          
          {canEdit && (
            <Button
              onClick={() => navigate(`/projetos/editar/${project.id}`)}
              className="bg-blue-600 hover:bg-blue-700"
            >
              Editar Projeto
            </Button>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Coluna Principal */}
          <div className="lg:col-span-2 space-y-6">
            {/* Informações Básicas */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Building className="h-5 w-5 mr-2" />
                  Informações Básicas
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-gray-500">Nome do Projeto</label>
                    <p className="text-lg font-semibold">{project.nome}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-500">Feira</label>
                    <p className="text-lg">{project.feira}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-500">Localização</label>
                    <p className="flex items-center">
                      <MapPin className="h-4 w-4 mr-1" />
                      {project.local}
                    </p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-500">Metragem</label>
                    <p>{project.metragem}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-500">Tipo de Montagem</label>
                    <p>{project.tipoMontagem}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-500">Pavilhão</label>
                    <p>{project.pavilhao || 'Não especificado'}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Cronograma */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Calendar className="h-5 w-5 mr-2" />
                  Cronograma
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Montagem */}
                {(project.montagem?.dataInicio || project.montagem?.dataFim) && (
                  <div className="bg-blue-50 p-4 rounded-lg">
                    <h4 className="font-medium text-blue-800 mb-2 flex items-center">
                      <Wrench className="h-4 w-4 mr-2" />
                      Montagem
                    </h4>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-gray-600">Início:</span>
                        <p className="font-medium">{formatDate(project.montagem.dataInicio)}</p>
                      </div>
                      <div>
                        <span className="text-gray-600">Fim:</span>
                        <p className="font-medium">{formatDate(project.montagem.dataFim)}</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Evento */}
                {(project.evento?.dataInicio || project.evento?.dataFim) && (
                  <div className="bg-green-50 p-4 rounded-lg">
                    <h4 className="font-medium text-green-800 mb-2 flex items-center">
                      <PartyPopper className="h-4 w-4 mr-2" />
                      Evento
                    </h4>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-gray-600">Início:</span>
                        <p className="font-medium">{formatDate(project.evento.dataInicio)}</p>
                      </div>
                      <div>
                        <span className="text-gray-600">Fim:</span>
                        <p className="font-medium">{formatDate(project.evento.dataFim)}</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Desmontagem */}
                {(project.desmontagem?.dataInicio || project.desmontagem?.dataFim) && (
                  <div className="bg-orange-50 p-4 rounded-lg">
                    <h4 className="font-medium text-orange-800 mb-2 flex items-center">
                      <Truck className="h-4 w-4 mr-2" />
                      Desmontagem
                    </h4>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-gray-600">Início:</span>
                        <p className="font-medium">{formatDate(project.desmontagem.dataInicio)}</p>
                      </div>
                      <div>
                        <span className="text-gray-600">Fim:</span>
                        <p className="font-medium">{formatDate(project.desmontagem.dataFim)}</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Período Geral */}
                <div className="bg-gray-50 p-4 rounded-lg">
                  <h4 className="font-medium text-gray-800 mb-2 flex items-center">
                    <Clock className="h-4 w-4 mr-2" />
                    Período Geral
                  </h4>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-gray-600">Início:</span>
                      <p className="font-medium">{formatDate(project.dataInicio)}</p>
                    </div>
                    <div>
                      <span className="text-gray-600">Fim:</span>
                      <p className="font-medium">{formatDate(project.dataFim)}</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Descrição e Observações */}
            {(project.descricao || project.observacoes) && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <FileText className="h-5 w-5 mr-2" />
                    Detalhes Adicionais
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {project.descricao && (
                    <div>
                      <label className="text-sm font-medium text-gray-500">Descrição</label>
                      <p className="mt-1 text-gray-900 whitespace-pre-wrap">{project.descricao}</p>
                    </div>
                  )}
                  {project.observacoes && (
                    <div>
                      <label className="text-sm font-medium text-gray-500">Observações</label>
                      <p className="mt-1 text-gray-900 whitespace-pre-wrap">{project.observacoes}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>

          {/* Coluna Lateral */}
          <div className="space-y-6">
            {/* Responsáveis */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Users className="h-5 w-5 mr-2" />
                  Responsáveis
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-gray-500">Produtor</label>
                  <p className="text-blue-600 font-medium">
                    {project.produtorNome || 'Não atribuído'}
                  </p>
                  {project.produtorEmail && (
                    <p className="text-sm text-gray-500">{project.produtorEmail}</p>
                  )}
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">Consultor</label>
                  <p className="text-green-600 font-medium">
                    {project.consultorNome || 'Não atribuído'}
                  </p>
                  {project.consultorEmail && (
                    <p className="text-sm text-gray-500">{project.consultorEmail}</p>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Equipes Terceirizadas */}
            {project.equipesEmpreiteiras && Object.values(project.equipesEmpreiteiras).some(Boolean) && (
              <Card>
                <CardHeader>
                  <CardTitle>Equipes Terceirizadas</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {Object.entries(project.equipesEmpreiteiras).map(([area, empresa]) => (
                    empresa && (
                      <div key={area}>
                        <label className="text-sm font-medium text-gray-500 capitalize">
                          {area}
                        </label>
                        <p className="text-gray-900">{empresa}</p>
                      </div>
                    )
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Link do Drive */}
            {project.linkDrive && (
              <Card>
                <CardHeader>
                  <CardTitle>Documentos</CardTitle>
                </CardHeader>
                <CardContent>
                  <a
                    href={project.linkDrive}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center text-blue-600 hover:text-blue-800"
                  >
                    <FileText className="h-4 w-4 mr-2" />
                    Acessar Drive
                    <ExternalLink className="h-3 w-3 ml-1" />
                  </a>
                </CardContent>
              </Card>
            )}

            {/* Informações do Sistema */}
            <Card>
              <CardHeader>
                <CardTitle>Informações do Sistema</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-gray-600">
                <div>
                  <span className="font-medium">Criado em:</span>
                  <p>{formatDate(project.criadoEm)}</p>
                </div>
                {project.atualizadoEm && (
                  <div>
                    <span className="font-medium">Atualizado em:</span>
                    <p>{formatDate(project.atualizadoEm)}</p>
                  </div>
                )}
                <div>
                  <span className="font-medium">Status:</span>
                  <p className="capitalize">{project.status || 'ativo'}</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProjectDetailPage;

