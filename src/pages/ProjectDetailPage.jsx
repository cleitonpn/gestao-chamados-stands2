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

/* =========================================================================
   Helpers de data
   ========================================================================= */
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

const normalizeDateInput = (value) => {
  if (!value) return null;
  if (typeof value === 'object' && value.seconds) return new Date(value.seconds * 1000);
  if (typeof value === 'string' && /^\d{2}-\d{2}-\d{4}$/.test(value)) {
    const [dd, mm, yyyy] = value.split('-');
    return new Date(`${yyyy}-${mm}-${dd}T00:00:00.000Z`);
  }
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(`${value}T00:00:00.000Z`);
  }
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
};

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
  } catch {
    return 'Data inválida';
  }
};

const formatDateTimeSP = (isoOrDate) => {
  try {
    const d = typeof isoOrDate === 'string' ? new Date(isoOrDate) : (isoOrDate || new Date());
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

/* =========================================================================
   Página
   ========================================================================= */
const ProjectDetailPage = () => {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const { user, userProfile, authInitialized } = useAuth();

  const [project, setProject] = useState(null);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // ====== Diário (estado) ======
  const [diaryEntries, setDiaryEntries] = useState([]); // {id, text, authorId, authorName, authorRole, createdAt, linkUrl?}
  const [newDiaryText, setNewDiaryText] = useState('');
  const [newDiaryLink, setNewDiaryLink] = useState('');
  const [savingDiary, setSavingDiary] = useState(false);
  const [diaryError, setDiaryError] = useState('');

  useEffect(() => {
    if (authInitialized && user && userProfile) {
      loadProjectData();
    } else if (authInitialized && !user) {
      navigate('/login');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, user, userProfile, authInitialized]);

  const loadProjectData = async () => {
    try {
      setLoading(true);
      setError('');

      const [projectData, usersData] = await Promise.all([
        projectService.getProjectById(projectId),
        userService.getAllUsers().catch(() => []),
      ]);

      if (!projectData) {
        setError('Projeto não encontrado');
        return;
      }

      // ====== Permissões ======
      const role = userProfile?.funcao;
      const uid = userProfile?.id || user?.uid;

      if (role === 'consultor') {
        const ok =
          projectData.consultorId === uid ||
          projectData.consultorUid === uid ||
          projectData.consultorEmail === userProfile?.email ||
          projectData.consultorNome === userProfile?.nome;
        if (!ok) {
          setError('Você não tem permissão para visualizar este projeto');
          return;
        }
      } else if (role === 'produtor') {
        const ok =
          projectData.produtorId === uid ||
          projectData.produtorUid === uid ||
          projectData.produtorEmail === userProfile?.email ||
          projectData.produtorNome === userProfile?.nome;
        if (!ok) {
          setError('Você não tem permissão para visualizar este projeto');
          return;
        }
      } else if (!['administrador', 'gerente', 'operador'].includes(role)) {
        setError('Você não tem permissão para visualizar projetos');
        return;
      }

      setProject(projectData);
      setUsers(usersData || []);

      // ====== Diário: carregar do documento do projeto ======
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
    const linkVal = (newDiaryLink || '').trim();
    if (!textVal) return;

    if (linkVal && !/^https?:\/\//i.test(linkVal)) {
      setDiaryError('Informe um link válido (http/https).');
      return;
    }

    const entry = {
      id: (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now()),
      text: textVal,
      authorId: userProfile?.id || user?.uid || '',
      authorName: userProfile?.nome || user?.displayName || user?.email || 'Usuário',
      authorRole: userProfile?.funcao || 'usuário',
      createdAt: new Date().toISOString(),
      ...(linkVal ? { linkUrl: linkVal } : {}),
    };

    try {
      setSavingDiary(true);

      const next = Array.isArray(project?.diario) ? [...project.diario, entry] : [entry];

      if (typeof projectService.addDiaryEntry === 'function') {
        await projectService.addDiaryEntry(project.id || projectId, entry);
      } else if (typeof projectService.updateProject === 'function') {
        await projectService.updateProject(project.id || projectId, {
          diario: next,
          atualizadoEm: new Date().toISOString(),
        });
      }

      setDiaryEntries((prev) => [entry, ...prev]);
      setProject((prev) => ({
        ...(prev || {}),
        diario: next,
        atualizadoEm: new Date().toISOString(),
      }));
      setNewDiaryText('');
      setNewDiaryLink('');
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
      const next = current.filter((e) => e.id !== entryId);

      if (typeof projectService.removeDiaryEntry === 'function') {
        await projectService.removeDiaryEntry(project.id || projectId, entryId);
      } else if (typeof projectService.updateProject === 'function') {
        await projectService.updateProject(project.id || projectId, {
          diario: next,
          atualizadoEm: new Date().toISOString(),
        });
      }

      setDiaryEntries((prev) => prev.filter((e) => e.id !== entryId));
      setProject((prev) => ({ ...(prev || {}), diario: next }));
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

  /* =========================
     Loading/Erro
     ========================= */
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

  /* =========================
     Render
     ========================= */
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
          {/* Coluna Principal (esquerda) */}
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

            {/* Diário do Projeto — FORM (entre Info Básicas e Cronograma) */}
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
                  <div className="mt-2">
                    <input
                      type="url"
                      className="w-full rounded-lg border border-gray-300 bg-white p-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Link do Drive (opcional): https://drive.google.com/…"
                      value={newDiaryLink}
                      onChange={(e) => setNewDiaryLink(e.target.value)}
                    />
                  </div>
                  {diaryError && <p className="text-sm text-red-600 mt-2">{diaryError}</p>}
                  <div className="mt-3 flex justify-end">
                    <Button onClick={handleAddDiaryEntry} disabled={savingDiary || !newDiaryText.trim()}>
                      {savingDiary ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
                      Salvar no diário
                    </Button>
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
                        <p className="font-medium">{formatDate(project.montagem?.dataInicio) || '—'}</p>
                      </div>
                      <div>
                        <span className="text-gray-600">Fim:</span>
                        <p className="font-medium">{formatDate(project.montagem?.dataFim) || '—'}</p>
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
                        <p className="font-medium">{formatDate(project.evento?.dataInicio) || '—'}</p>
                      </div>
                      <div>
                        <span className="text-gray-600">Fim:</span>
                        <p className="font-medium">{formatDate(project.evento?.dataFim) || '—'}</p>
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
                        <p className="font-medium">{formatDate(project.desmontagem?.dataInicio) || '—'}</p>
                      </div>
                      <div>
                        <span className="text-gray-600">Fim:</span>
                        <p className="font-medium">{formatDate(project.desmontagem?.dataFim) || '—'}</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Período Geral */}
                {(project.periodoGeral?.dataInicio || project.periodoGeral?.dataFim) && (
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <h4 className="font-medium text-gray-800 mb-2 flex items-center">
                      <Clock className="h-4 w-4 mr-2" />
                      Período Geral
                    </h4>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-gray-600">Início:</span>
                        <p className="font-medium">{formatDate(project.periodoGeral?.dataInicio) || '—'}</p>
                      </div>
                      <div>
                        <span className="text-gray-600">Fim:</span>
                        <p className="font-medium">{formatDate(project.periodoGeral?.dataFim) || '—'}</p>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Detalhes Adicionais */}
            {project.descricao && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <FileText className="h-5 w-5 mr-2" />
                    Detalhes Adicionais
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <pre className="whitespace-pre-wrap text-sm">{project.descricao}</pre>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Coluna Lateral (direita) */}
          <div className="space-y-6">
            {/* Responsáveis */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Users className="h-5 w-5 mr-2" />
                  Responsáveis
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div>
                  <span className="font-medium">Produtor:</span>
                  <p>{project.produtorNome || 'Não atribuído'}</p>
                  {project.produtorEmail && (
                    <a
                      href={`mailto:${project.produtorEmail}`}
                      className="text-blue-600 hover:underline text-sm"
                    >
                      {project.produtorEmail}
                    </a>
                  )}
                </div>
                <div className="pt-2">
                  <span className="font-medium">Consultor:</span>
                  <p>{project.consultorNome || 'Não atribuído'}</p>
                  {project.consultorEmail && (
                    <a
                      href={`mailto:${project.consultorEmail}`}
                      className="text-blue-600 hover:underline text-sm"
                    >
                      {project.consultorEmail}
                    </a>
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

            {/* Documentos (usa project.linkDrive) */}
            {project.linkDrive && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <ExternalLink className="h-5 w-5 mr-2" />
                    Documentos
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <a
                    className="inline-flex items-center gap-2 text-blue-600 hover:underline"
                    href={project.linkDrive}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <FileText className="h-4 w-4" />
                    Acessar Drive
                    <ExternalLink className="h-3 w-3 ml-1" />
                  </a>
                </CardContent>
              </Card>
            )}

            {/* Informações do Sistema */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <AlertCircle className="h-5 w-5 mr-2" />
                  Informações do Sistema
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div> Criado em: <span className="font-medium">{formatDateTimeSP(project.criadoEm || project.criadoem)}</span></div>
                <div> Atualizado em: <span className="font-medium">{formatDateTimeSP(project.atualizadoEm || project.atualizadoem)}</span></div>
                <div> Status: <span className="font-medium capitalize">{project.status || 'ativo'}</span></div>
                <div> Ativo: <span className="font-medium">{project.ativo ? 'Sim' : 'Não'}</span></div>
              </CardContent>
            </Card>

            {/* Diário do Projeto — LISTA */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <FileText className="h-5 w-5 mr-2" />
                  Observações do Projeto
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
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
                          {e.linkUrl && (
                            <div className="mt-2 text-sm">
                              <a
                                href={e.linkUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-blue-600 hover:underline break-all"
                              >
                                <ExternalLink className="h-4 w-4" />
                                Abrir link
                              </a>
                            </div>
                          )}
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
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProjectDetailPage;
