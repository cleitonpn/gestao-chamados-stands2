import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { projectService } from '../services/projectService';
import { userService } from '../services/userService';
import { ticketService } from '../services/ticketService';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

import {
  ArrowLeft,
  Calendar,
  MapPin,
  Users,
  Building,
  Mail,
  Phone,
  FileText,
  Link2,
  UploadCloud,
  Save,
  Loader2,
  AlertCircle,
  Clock,
  User,
  ShieldCheck,
  Send,
  Trash2,
  BarChart3,
  ClipboardList,
  TrendingUp,
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
  if (!date) return 'Não definido';
  try {
    if (isDateOnly(value)) {
      const dd = String(date.getUTCDate()).padStart(2, '0');
      const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
      const yyyy = String(date.getUTCFullYear());
      return `${dd}-${mm}-${yyyy}`;
    }
    const dd = date.toLocaleString('pt-BR', { day: '2-digit', timeZone: 'America/Sao_Paulo' });
    const mm = date.toLocaleString('pt-BR', { month: '2-digit', timeZone: 'America/Sao_Paulo' });
    const yyyy = date.toLocaleString('pt-BR', { year: 'numeric', timeZone: 'America/Sao_Paulo' });
    return `${dd}-${mm}-${yyyy}`;
  } catch {
    return 'Não definido';
  }
};

const formatDateTimeSP = (value) => {
  if (!value) return '—';
  const date = normalizeDateInput(value);
  if (!date) return '—';
  try {
    return date.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  } catch {
    return date.toLocaleString('pt-BR');
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
   Página — Detalhe do Projeto
   ========================================================================= */
const ProjectDetailPage = () => {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const { user, userProfile, authInitialized } = useAuth();

  const [project, setProject] = useState(null);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // ====== Diário
  const [diaryEntries, setDiaryEntries] = useState([]);
  const [newDiaryText, setNewDiaryText] = useState('');
  const [newDiaryLink, setNewDiaryLink] = useState('');
  const [savingDiary, setSavingDiary] = useState(false);

  // ====== Tickets (chamados) vinculados ao projeto
  const [tickets, setTickets] = useState([]);
  const [ticketsLoading, setTicketsLoading] = useState(true);
  const [ticketsErr, setTicketsErr] = useState('');

  /* =========================
     Carregamento inicial
     ========================= */
  useEffect(() => {
    if (!authInitialized) return;
    if (!user) {
      navigate('/login');
      return;
    }

    (async () => {
      try {
        setLoading(true);
        setError('');
        const proj = await projectService.getProjectById(projectId);
        setProject(proj || null);

        // Responsáveis/usuários
        const listUsers = await userService.getAllUsers?.();
        setUsers(Array.isArray(listUsers) ? listUsers : []);

        // Diário
        const diary = await projectService.getDiary?.(projectId);
        setDiaryEntries(Array.isArray(diary) ? diary : []);

        // Tickets
        setTicketsLoading(true);
        const tk = await ticketService.getTicketsByProject?.(projectId);
        setTickets(Array.isArray(tk) ? tk : []);
      } catch (err) {
        console.error(err);
        setError('Não foi possível carregar o projeto.');
      } finally {
        setTicketsLoading(false);
        setLoading(false);
      }
    })();
  }, [authInitialized, user, navigate, projectId]);

  /* =========================
     Salvar entrada do Diário
     ========================= */
  const handleAddDiaryEntry = async () => {
    if (!newDiaryText.trim() && !newDiaryLink.trim()) return;
    try {
      setSavingDiary(true);
      const entry = {
        authorId: userProfile?.id || user?.uid,
        authorName: userProfile?.nome || user?.displayName || 'Usuário',
        authorRole: userProfile?.funcao || '',
        text: newDiaryText.trim(),
        driveLink: newDiaryLink.trim(),
        createdAt: new Date(),
      };
      const saved = await projectService.addDiaryEntry?.(projectId, entry);
      setDiaryEntries((prev) => [saved || entry, ...prev]);
      setNewDiaryText('');
      setNewDiaryLink('');
    } catch (e) {
      console.error('Erro ao salvar observação do diário:', e);
      alert('Não foi possível salvar sua observação.');
    } finally {
      setSavingDiary(false);
    }
  };

  const canDeleteDiary = (entry) => {
    const role = (userProfile?.funcao || '').toLowerCase();
    return role === 'administrador';
  };

  const handleDeleteDiary = async (entryId) => {
    if (!canDeleteDiary()) return;
    if (!window.confirm('Remover esta observação do diário?')) return;
    try {
      await projectService.deleteDiaryEntry?.(projectId, entryId);
      setDiaryEntries((prev) => prev.filter((e) => e.id !== entryId));
    } catch (e) {
      console.error('Falha ao excluir observação:', e);
      alert('Não foi possível excluir.');
    }
  };

  /* =========================
     Métricas de chamados
     ========================= */
  const ticketMetrics = useMemo(() => {
    const total = tickets.length;
    // Considera concluído + arquivado (e variações comuns)
    const closedStatuses = new Set(['concluido','concluído','arquivado','fechado','resolvido']);
    const notOpenStatuses = new Set(['concluido','concluído','arquivado','fechado','resolvido','cancelado']);

    const closed = tickets.filter(t => closedStatuses.has((t.status || '').toLowerCase())).length;
    const open = tickets.filter(t => !notOpenStatuses.has((t.status || '').toLowerCase())).length;
    const completion = total > 0 ? Math.round((closed / total) * 100) : 0;

    // Top áreas
    const counts = {};
    for (const t of tickets) {
      const area = (t.area || t.areaAtual || 'Não informada').toString();
      if (!counts[area]) counts[area] = 0;
      counts[area] += 1;
    }
    const topAreas = Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);

    return { total, open, closed, completion, topAreas };
  }, [tickets]);

  // Linkar para a lista filtrada (Dashboard com filtro pelo projeto)
  const goToFilteredTickets = () => {
    const params = new URLSearchParams();
    if (project?.id) params.set('projectId', project.id);
    if (project?.nome) params.set('q', project.nome);
    navigate(`/dashboard?${params.toString()}`);
  };

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

  if (error || !project) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Erro</h2>
          <p className="text-gray-600 mb-4">{error || 'Projeto não encontrado.'}</p>
          <Button variant="outline" onClick={() => navigate('/projetos')}>
            <ArrowLeft className="h-4 w-4 mr-2" /> Voltar
          </Button>
        </div>
      </div>
    );
  }

  /* =========================
     Layout
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
                  {project.nome || 'Projeto'}
                </h1>
                <Badge variant="secondary" className="text-xs">
                  {project.status || 'Ativo'}
                </Badge>
              </div>
              <p className="text-gray-600">
                {project.feira} • {project.local}
              </p>
            </div>
          </div>

          {/* Drive (se houver) */}
          {project.driveLink && (
            <a
              href={project.driveLink}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center text-sm text-blue-600 hover:underline"
              title="Acessar Drive do Projeto"
            >
              <Link2 className="h-4 w-4 mr-1" /> Acessar Drive
            </a>
          )}
        </div>

        {/* GRID RESPONSIVA: 1 col (mobile), 3 col (desktop) */}
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
                    <p className="text-lg font-semibold">{project.nome || '—'}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-500">Feira</label>
                    <p className="text-lg font-semibold">{project.feira || '—'}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-500">Localização</label>
                    <p className="text-lg font-semibold">{project.local || '—'}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-500">Metragem</label>
                    <p className="text-lg font-semibold">{project.metragem || '—'}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-500">Tipo de Montagem</label>
                    <p className="text-lg font-semibold">{project.tipoMontagem || '—'}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-500">Pavilhão</label>
                    <p className="text-lg font-semibold">{project.pavilhao || '—'}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Diário do Projeto — FORM */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <FileText className="h-5 w-5 mr-2" />
                  Diário do Projeto
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Adicione uma observação
                  </label>
                  <textarea
                    rows={3}
                    value={newDiaryText}
                    onChange={(e) => setNewDiaryText(e.target.value)}
                    placeholder="Ex: Rita (consultora) definiu as cores do bagum: grafite e preto."
                    className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Link do Drive (opcional)
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="url"
                      value={newDiaryLink}
                      onChange={(e) => setNewDiaryLink(e.target.value)}
                      placeholder="https://drive.google.com/..."
                      className="flex-1 border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <Button onClick={handleAddDiaryEntry} disabled={savingDiary}>
                      {savingDiary ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Salvando...
                        </>
                      ) : (
                        <>
                          <Save className="h-4 w-4 mr-2" /> Salvar no diário
                        </>
                      )}
                    </Button>
                  </div>
                </div>
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
              <CardContent>
                {diaryEntries.length === 0 ? (
                  <p className="text-sm text-gray-500">Nenhuma observação por enquanto.</p>
                ) : (
                  <div className="space-y-4">
                    {diaryEntries.map((e) => (
                      <div key={e.id || e.createdAt?.seconds || Math.random()} className="border rounded-lg p-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <User className="h-4 w-4 text-gray-500" />
                            <span className="text-sm font-medium">
                              {e.authorName} {e.authorRole ? `(${e.authorRole})` : ''}
                            </span>
                          </div>
                          <span className="text-xs text-gray-500">{formatDateTimeSP(e.createdAt)}</span>
                        </div>
                        {e.text && <p className="mt-2 text-sm text-gray-700 whitespace-pre-wrap break-words">{e.text}</p>}
                        {e.driveLink && (
                          <a
                            href={e.driveLink}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline mt-2"
                          >
                            <Link2 className="h-4 w-4" /> Anexo/Link
                          </a>
                        )}
                        {canDeleteDiary(e) && (
                          <div className="mt-3 text-right">
                            <Button variant="destructive" size="sm" onClick={() => handleDeleteDiary(e.id)}>
                              <Trash2 className="h-4 w-4 mr-2" /> Excluir
                            </Button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
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
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="rounded-lg border p-4 bg-blue-50/50">
                    <div className="text-sm text-gray-500">Montagem</div>
                    <div className="mt-1 font-medium">
                      Início: {formatDate(project.montagem?.dataInicio)} • Fim: {formatDate(project.montagem?.dataFim)}
                    </div>
                  </div>
                  <div className="rounded-lg border p-4 bg-green-50/50">
                    <div className="text-sm text-gray-500">Evento</div>
                    <div className="mt-1 font-medium">
                      Início: {formatDate(project.evento?.dataInicio)} • Fim: {formatDate(project.evento?.dataFim)}
                    </div>
                  </div>
                  <div className="rounded-lg border p-4 bg-orange-50/50">
                    <div className="text-sm text-gray-500">Desmontagem</div>
                    <div className="mt-1 font-medium">
                      Início: {formatDate(project.desmontagem?.dataInicio)} • Fim: {formatDate(project.desmontagem?.dataFim)}
                    </div>
                  </div>
                  <div className="rounded-lg border p-4 bg-gray-50">
                    <div className="text-sm text-gray-500">Período Geral</div>
                    <div className="mt-1 font-medium">
                      Início: {formatDate(project.dataInicio)} • Fim: {formatDate(project.dataFim)}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Detalhes Adicionais */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <FileText className="h-5 w-5 mr-2" />
                  Detalhes Adicionais
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="prose max-w-none text-sm text-gray-700 whitespace-pre-wrap break-words">
                  {project.descricao || 'Sem descrição.'}
                </div>
              </CardContent>
            </Card>
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
              <CardContent className="space-y-4 text-sm">
                <div>
                  <div className="text-xs text-gray-500">Produtor</div>
                  <div className="font-medium">{project.produtorNome || 'Não atribuído'}</div>
                  {project.produtorEmail && (
                    <a className="text-blue-600 hover:underline flex items-center gap-1" href={`mailto:${project.produtorEmail}`}>
                      <Mail className="h-3 w-3" /> {project.produtorEmail}
                    </a>
                  )}
                </div>
                <div>
                  <div className="text-xs text-gray-500">Consultor</div>
                  <div className="font-medium">{project.consultorNome || 'Não atribuído'}</div>
                  {project.consultorEmail && (
                    <a className="text-blue-600 hover:underline flex items-center gap-1" href={`mailto:${project.consultorEmail}`}>
                      <Mail className="h-3 w-3" /> {project.consultorEmail}
                    </a>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Equipes Terceirizadas */}
            {Array.isArray(project.equipesTerceirizadas) && project.equipesTerceirizadas.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <Users className="h-5 w-5 mr-2" />
                    Equipes Terceirizadas
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="text-sm space-y-1">
                    {project.equipesTerceirizadas.map((eq, idx) => (
                      <li key={idx} className="flex items-center justify-between">
                        <span>{eq?.nome || 'Equipe'}</span>
                        {eq?.contato && (
                          <span className="text-gray-500 text-xs">{eq.contato}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}

            {/* Documentos */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <UploadCloud className="h-5 w-5 mr-2" />
                  Documentos
                </CardTitle>
              </CardHeader>
              <CardContent>
                {project.driveLink ? (
                  <a
                    href={project.driveLink}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center text-sm text-blue-600 hover:underline"
                  >
                    <Link2 className="h-4 w-4 mr-1" /> Acessar Drive
                  </a>
                ) : (
                  <p className="text-sm text-gray-500">Nenhum link de Drive informado.</p>
                )}
              </CardContent>
            </Card>

            {/* Informações do Sistema */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <ShieldCheck className="h-5 w-5 mr-2" />
                  Informações do Sistema
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Criado em:</span>
                  <span>{formatDateTimeSP(project.createdAt)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Atualizado em:</span>
                  <span>{formatDateTimeSP(project.updatedAt)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Status:</span>
                  <span className="font-medium">{project.status || 'Ativo'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Ativo:</span>
                  <span className="font-medium">{project.ativo ? 'Sim' : 'Não'}</span>
                </div>
              </CardContent>
            </Card>

            {/* Observações do Projeto — (lista vazia por padrão, mantém compatibilidade) */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <FileText className="h-5 w-5 mr-2" />
                  Observações do Projeto
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-gray-500">Nenhuma observação por enquanto.</p>
              </CardContent>
            </Card>

            {/* =========================
                NOVA SIDEBOX: Resumo de Chamados
               ========================= */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <BarChart3 className="h-5 w-5 mr-2" />
                  Resumo de Chamados
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {ticketsLoading ? (
                  <div className="text-center">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
                    <p className="text-sm text-gray-500">Carregando…</p>
                  </div>
                ) : ticketsErr ? (
                  <p className="text-red-600">{ticketsErr}</p>
                ) : (
                  <>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <ClipboardList className="h-4 w-4" />
                        <span>Total de chamados</span>
                      </div>
                      <span className="font-semibold">{ticketMetrics.total}</span>
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <AlertCircle className="h-4 w-4" />
                        <span>Abertos</span>
                      </div>
                      <span className="font-semibold">{ticketMetrics.open}</span>
                    </div>

                    <div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-2">
                          <TrendingUp className="h-4 w-4" />
                          Taxa de conclusão
                        </span>
                        <span className="font-semibold">{ticketMetrics.completion}%</span>
                      </div>
                      <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-green-500"
                          style={{ width: `${ticketMetrics.completion}%` }}
                        />
                      </div>
                    </div>

                    <div>
                      <div className="text-xs text-gray-500 mb-1">Top áreas envolvidas</div>
                      {ticketMetrics.topAreas.length === 0 ? (
                        <p className="text-sm text-gray-500">Sem dados suficientes.</p>
                      ) : (
                        <ul className="text-sm">
                          {ticketMetrics.topAreas.map(([area, count]) => (
                            <li key={area} className="flex items-center justify-between">
                              <span>{area}</span>
                              <span className="font-medium">{count}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    <div className="pt-2">
                      <Button
                        onClick={goToFilteredTickets}
                        className="w-full"
                        variant="outline"
                        disabled={tickets.length === 0}
                        title="Ver lista de chamados do projeto"
                      >
                        Ver todos os chamados
                      </Button>
                    </div>
                  </>
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
