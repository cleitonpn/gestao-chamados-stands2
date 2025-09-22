import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { projectService } from '../services/projectService';
import { userService } from '../services/userService';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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

// =====================
// Helpers de Data / Fuso
// =====================
// Detecta se o valor representa uma data SEM hora (date-only)
const isDateOnly = (value) => {
  if (typeof value === 'string') {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return true; // YYYY-MM-DD
    if (/^\d{2}-\d{2}-\d{4}$/.test(value)) return true; // DD-MM-YYYY
  }
  if (value && typeof value === 'object' && value.seconds) {
    const d = new Date(value.seconds * 1000);
    return d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0;
  }
  return false;
};

// Normaliza entradas de data em um Date válido
const normalizeDateInput = (value) => {
  if (!value) return null;
  if (typeof value === 'object' && value.seconds) {
    return new Date(value.seconds * 1000);
  }
  if (typeof value === 'string' && /^\d{2}-\d{2}-\d{4}$/.test(value)) {
    const [dd, mm, yyyy] = value.split('-');
    return new Date(`${yyyy}-${mm}-${dd}T00:00:00.000Z`);
  }
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(`${value}T00:00:00.000Z`);
  }
  const d = new Date(value);
  if (isNaN(d.getTime())) return null;
  return d;
};

// Formata SEM deslocar o dia:
// - para "date-only": usa componentes UTC (evita cair pro dia anterior no BRT)
// - caso contrário: usa America/Sao_Paulo
const formatDate = (value) => {
  if (!value) return 'Não definido';
  const date = normalizeDateInput(value);
  if (!date) return 'Data inválida';

  try {
    if (isDateOnly(value)) {
      const dd = String(date.getUTCDate()).padStart(2, '0');
      const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
      const yy = String(date.getUTCFullYear()).slice(-2);
      return `${dd}/${mm}/${yy}`;
    }
    return date.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
      timeZone: 'America/Sao_Paulo',
    });
  } catch (e) {
    console.error('Erro ao formatar data:', e);
    return 'Data inválida';
  }
};

// Limites do dia para comparações (usando o horário local do cliente)
const startOfDaySP = (value) => {
  const d = normalizeDateInput(value);
  if (!d) return null;
  const copy = new Date(d.getTime());
  copy.setHours(0, 0, 0, 0);
  return copy;
};

const endOfDaySP = (value) => {
  const d = normalizeDateInput(value);
  if (!d) return null;
  const copy = new Date(d.getTime());
  copy.setHours(23, 59, 59, 999);
  return copy;
};

const ProjectDetailPage = () => {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const { user, userProfile, authInitialized } = useAuth();
  
  const [project, setProject] = useState(null);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (authInitialized && user && userProfile) {
      loadProjectData();
    } else if (authInitialized && !user) {
      navigate('/login');
    }
  }, [projectId, user, userProfile, authInitialized, navigate]);

  const loadProjectData = async () => {
    try {
      setLoading(true);
      setError('');

      const [projectData, usersData] = await Promise.all([
        projectService.getProjectById(projectId),
        userService.getAllUsers().catch(() => [])
      ]);

      if (!projectData) {
        setError('Projeto não encontrado');
        return;
      }

      // Permissões
      const userRole = userProfile.funcao;
      const userId = userProfile.id || user.uid;

      if (userRole === 'consultor') {
        const hasAccess = projectData.consultorId === userId || 
                         projectData.consultorUid === userId ||
                         projectData.consultorEmail === userProfile.email ||
                         projectData.consultorNome === userProfile.nome;
        if (!hasAccess) {
          setError('Você não tem permissão para visualizar este projeto');
          return;
        }
      } else if (userRole === 'produtor') {
        const hasAccess = projectData.produtorId === userId || 
                         projectData.produtorUid === userId ||
                         projectData.produtorEmail === userProfile.email ||
                         projectData.produtorNome === userProfile.nome;
        if (!hasAccess) {
          setError('Você não tem permissão para visualizar este projeto');
          return;
        }
      } else if (!['administrador','gerente','operador'].includes(userRole)) {
        setError('Você não tem permissão para visualizar projetos');
        return;
      }

      setProject(projectData);
      setUsers(usersData || []);

    } catch (err) {
      console.error('Erro ao carregar projeto:', err);
      setError('Erro ao carregar dados do projeto');
    } finally {
      setLoading(false);
    }
  };

  const getStatusInfo = () => {
    if (!project) return { label: 'Carregando...', color: 'gray' };
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (project.montagem?.dataInicio && project.montagem?.dataFim) {
      const inicio = startOfDaySP(project.montagem.dataInicio);
      const fim = endOfDaySP(project.montagem.dataFim);
      if (inicio && fim && today >= inicio && today <= fim) return { label: 'Em Montagem', color: 'blue' };
    }

    if (project.evento?.dataInicio && project.evento?.dataFim) {
      const inicio = startOfDaySP(project.evento.dataInicio);
      const fim = endOfDaySP(project.evento.dataFim);
      if (inicio && fim && today >= inicio && today <= fim) return { label: 'Em Andamento', color: 'green' };
    }

    if (project.desmontagem?.dataInicio && project.desmontagem?.dataFim) {
      const inicio = startOfDaySP(project.desmontagem.dataInicio);
      const fim = endOfDaySP(project.desmontagem.dataFim);
      if (inicio && fim && today >= inicio && today <= fim) return { label: 'Desmontagem', color: 'orange' };
    }

    const dataInicio = project.dataInicio || project.montagem?.dataInicio || project.evento?.dataInicio;
    if (dataInicio) {
      const inicio = startOfDaySP(dataInicio);
      if (inicio && today < inicio) return { label: 'Futuro', color: 'yellow' };
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
