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
  AlertCircle,
  Send,
  Trash2,
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

// Data e hora no fuso de São Paulo (para o Diário)
const formatDateTimeSP = (isoStringOrDate) => {
  try {
    const d = typeof isoStringOrDate === 'string' ? new Date(isoStringOrDate) : (isoStringOrDate || new Date());
    if (isNaN(d?.getTime())) return '—';
    return d.toLocaleString('pt-BR', {
      dateStyle: 'short',
      timeStyle: 'short',
      timeZone: 'America/Sao_Paulo',
    });
  } catch {
    return '—';
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

  // ====== Diário (estado) ======
  const [diaryEntries, setDiaryEntries] = useState([]); // [{id, text, authorId, authorName, authorRole, createdAt}]
  const [newDiaryText, setNewDiaryText] = useState('');
  const [savingDiary, setSavingDiary] = useState(false);
  const [diaryError, setDiaryError] = useState('');

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

      // Permissões básicas (ajuste conforme sua regra de negócios)
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

      // Diário: carrega do documento do projeto
      const initialDiary = Array.isArray(projectData?.diario) ? projectData.diario : [];
      initialDiary.sort((a, b) => {
        const ta = new Date(a?.createdAt || 0).getTime();
        const tb = new Date(b?.createdAt || 0).getTime();
        return tb - ta;
      });
      setDiaryEntries(initialDiary);

    } catch (err) {
      console.error('Erro ao carregar projeto:', err);
      setError('Erro ao carregar dados do projeto');
    } finally {
      setLoading(false);
    }
  };

  // ====== Diário (ações) ======
  const handleAddDiaryEntry = async () => {
    setDiaryError('');
    const textVal = (newDiaryText || '').trim();
    if (!textVal) return;

    const entry = {
      id: (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now()),
      text: textVal,
      authorId: userProfile?.id || user?.uid || '',
      authorName: userProfile?.nome || user?.displayName || user?.email || 'Usuário',
      authorRole: userProfile?.funcao || 'usuário',
      createdAt: new Date().toISOString(),
    };

    try {
      setSavingDiary(true);

      // Salva dentro do documento do projeto (campo 'diario')
      const next = Array.isArray(project?.diario) ? [...project.diario, entry] : [entry];

      if (typeof projectService.addDiaryEntry === 'function') {
        await projectService.addDiaryEntry(project.id || projectId, entry);
      } else if (typeof projectService.updateProject === 'function') {
        await projectService.updateProject(project.id || projectId, {
          diario: next,
          atualizadoEm: new Date().toISOString(),
        });
      }

      // Otimista
      setDiaryEntries(prev => [entry, ...prev]);
      setProject(prev => ({
        ...(prev || {}),
        diario: next,
        atualizadoEm: new Date().toISOString(),
      }));
      setNewDiaryText('');

    } catch (e) {
      console.error('Erro ao salvar observação do diário:', e);
      setDiaryError('Não foi possível salvar a observação. Tente novamente.');
    } finally {
      setSavingDiary(false);
    }
  };

  const handleDeleteDiaryEntry = async (entryId) => {
    setDiaryError('');
    if (userProfile?.funcao !== 'administrador') {
      setDiaryError('Apenas administradores podem excluir observações.');
      return;
    }
    try {
      setSavingDiary(true);
      const current = Array.isArray(project?.diario) ? project.diario : diaryEntries;
      const next = current.filter(e => e.id !== entryId);

      if (typeof projectService.removeDiaryEntry === 'function') {
        await projectService.removeDiaryEntry(project.id || projectId, entryId);
      } else if (typeof projectService.updateProject === 'function') {
        await projectService.updateProject(project.id || projectId, {
          diario: next,
          atualizadoEm: new Date().toISOString(),
        });
      }

      setDiaryEntries(prev => prev.filter(e => e.id != entryId));
      setProject(prev => ({ ...(prev || {}), diario: next }));

    } catch (e) {
      console.error('Erro ao excluir observação do diário:', e);
      setDiaryError('Não foi possível excluir a observação. Tente novamente.');
    } finally {
      setSavingDiary(false);
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
                  className={`$
                    {statusInfo.color === 'blue' ? 'bg-blue-100 text-blue-800' :
                    statusInfo.color === 'green' ? 'bg-green-100 text-green-800' :
                    statusInfo.color === 'orange' ? 'bg-orange-100 text-orange-800' :
                    statusInfo.color === 'yellow' ? 'bg-yellow-100 text-yellow-800' :
                    'bg-gray-100 text-gray-800'}
                  `}
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

            {/* Cronograma (exemplo, mantenha conforme seu arquivo) */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Calendar className="h-5 w-5 mr-2" />
                  Cronograma
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Exemplos de blocos de cronograma... */}
                <div className="bg-blue-50 p-4 rounded-lg">
                  <h4 className="font-medium text-blue-800 mb-2 flex items-center">
                    <Wrench className="h-4 w-4 mr-2" />
                    Montagem
                  </h4>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-gray-600">Início:</span>
                      <p className="font-medium">{formatDate(project?.montagem?.dataInicio) || '—'}</p>
                    </div>
                    <div>
                      <span className="text-gray-600">Fim:</span>
                      <p className="font-medium">{formatDate(project?.montagem?.dataFim) || '—'}</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Diário do Projeto */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <FileText className="h-5 w-5 mr-2" />
                  Diário do Projeto
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-gray-600">Adicionar observação</label>
                  <textarea
                    className="mt-2 w-full rounded-lg border border-gray-300 bg-white p-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    rows={3}
                    value={newDiaryText}
                    onChange={(e) => setNewDiaryText(e.target.value)}
                    placeholder="Ex.: Rita (consultora) definiu as cores do bagum: grafite e preto."
                  />
                  {diaryError && <p className="text-sm text-red-600 mt-2">{diaryError}</p>}
                  <div className="mt-3 flex justify-end">
                    <Button onClick={handleAddDiaryEntry} disabled={savingDiary || !newDiaryText.trim()}>
                      {savingDiary ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
                      Salvar no diário
                    </Button>
                  </div>
                </div>

                <div className="space-y-3">
                  {Array.isArray(diaryEntries) && diaryEntries.length === 0 ? (
                    <p className="text-sm text-gray-500">Nenhuma observação por enquanto.</p>
                  ) : (
                    (diaryEntries || []).map((e) => (
                      <div key={e.id} className="rounded-lg border p-3 bg-gray-50">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm text-gray-700">
                              <span className="font-semibold">{e.authorName}</span> ({e.authorRole}) deixou a seguinte observação:
                            </p>
                            <p className="mt-1 whitespace-pre-wrap text-gray-900 break-words">{e.text}</p>
                          </div>
                          {userProfile?.funcao === 'administrador' && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDeleteDiaryEntry(e.id)}
                              title="Excluir observação"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                        <div className="mt-2 text-xs text-gray-500">
                          {formatDateTimeSP(e.createdAt)}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Coluna Lateral (exemplo) */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Users className="h-5 w-5 mr-2" />
                  Equipe
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div>
                  <span className="font-medium">Consultor:</span>
                  <p>{project.consultorNome || '—'}</p>
                </div>
                <div>
                  <span className="font-medium">Produtor:</span>
                  <p>{project.produtorNome || '—'}</p>
                </div>
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
