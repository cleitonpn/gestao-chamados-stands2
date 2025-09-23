import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { projectService } from '../services/projectService';
import { userService } from '../services/userService';
import { ticketService } from '../services/ticketService';

import {
  doc,
  getDoc,
  updateDoc,
  arrayUnion,
} from 'firebase/firestore';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  ArrowLeft,
  Calendar,
  Users,
  Building,
  Mail,
  Link2,
  Save,
  Loader2,
  AlertCircle,
  User,
  ShieldCheck,
  Trash2,
  BarChart3,
  ClipboardList,
  TrendingUp,
} from 'lucide-react';

/* ============== Helpers de carregamento do db (evita erro de caminho) ============== */
async function loadDb() {
  const candidates = [
    '../services/firebase',
    '../lib/firebase',
    '../firebase',
    '@/services/firebase',
    '@/lib/firebase',
    '@/firebase',
  ];
  for (const p of candidates) {
    try {
      // Vite não vai tentar resolver em build por causa do @vite-ignore
      const mod = await import(/* @vite-ignore */ p);
      if (mod?.db) return mod.db;
      if (mod?.default?.db) return mod.default.db;
    } catch (_e) {
      /* tenta o próximo */
    }
  }
  throw new Error('Não foi possível encontrar o módulo de Firebase (db). Ajuste o caminho no loadDb().');
}

/* ---------- Helpers de Data ---------- */
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

/* ---------- Helpers de Drive ---------- */
const getDriveLinkFromProject = (p) =>
  p?.driveLink || p?.drive || p?.driveUrl || p?.driveURL || p?.linkDrive || p?.drive_link || '';

/* ---------- Utils do diário armazenado como ARRAY no doc do projeto ---------- */
const makeId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

const normalizeDiaryItem = (it) => ({
  id: it.id || makeId(),
  authorId: it.authorId || it.userId || '',
  authorName: it.authorName || it.nome || 'Usuário',
  authorRole: it.authorRole || it.funcao || '',
  text: it.text || it.obs || it.observacao || it.observação || '',
  // No seu dado existe "linkUrl" (print). Mantemos isso:
  linkUrl: it.linkUrl || it.driveLink || it.link || '',
  createdAt: it.createdAt || new Date().toISOString(),
});

/* =========================
   Página — Detalhe do Projeto
   ========================= */
const ProjectDetailPage = () => {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const { user, userProfile, authInitialized } = useAuth();

  const [project, setProject] = useState(null);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Diário (array dentro do doc)
  const [diaryEntries, setDiaryEntries] = useState([]);
  const [newDiaryText, setNewDiaryText] = useState('');
  const [newDiaryLink, setNewDiaryLink] = useState('');
  const [savingDiary, setSavingDiary] = useState(false);

  // Tickets do projeto
  const [tickets, setTickets] = useState([]);
  const [ticketsLoading, setTicketsLoading] = useState(true);
  const [ticketsErr, setTicketsErr] = useState('');

  // Permissão para excluir
  const canDeleteDiary = () => (userProfile?.funcao || '').toLowerCase() === 'administrador';

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

        // Carrega projeto
        const proj = await projectService.getProjectById(projectId);
        setProject(proj || null);

        // Usuários (caso use em alguma parte)
        const listUsers = await userService.getAllUsers?.();
        setUsers(Array.isArray(listUsers) ? listUsers : []);

        // Diário: ler do array "diario" dentro do doc
        try {
          const db = await loadDb();
          const ref = doc(db, 'projects', projectId);
          const snap = await getDoc(ref);
          const data = snap.exists() ? snap.data() : {};
          const arr = Array.isArray(data?.diario) ? data.diario : [];
          const normalized = arr.map(normalizeDiaryItem).sort(
            (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
          );
          setDiaryEntries(normalized);
        } catch (e) {
          console.warn('Falha ao ler diario do doc:', e);
          setDiaryEntries([]);
        }

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

  // Adiciona nova observação no array "diario"
  const handleAddDiaryEntry = async () => {
    if (!newDiaryText.trim() && !newDiaryLink.trim()) return;
    try {
      setSavingDiary(true);
      const entry = normalizeDiaryItem({
        id: makeId(),
        authorId: userProfile?.id || user?.uid,
        authorName: userProfile?.nome || user?.displayName || 'Usuário',
        authorRole: userProfile?.funcao || '',
        text: newDiaryText.trim(),
        linkUrl: newDiaryLink.trim(),
        createdAt: new Date().toISOString(),
      });

      const db = await loadDb();
      const ref = doc(db, 'projects', projectId);
      // Adiciona sem precisar regravar o array inteiro
      await updateDoc(ref, { diario: arrayUnion(entry) });

      setDiaryEntries((prev) => [entry, ...prev]);
      setNewDiaryText('');
      setNewDiaryLink('');
    } catch (e) {
      console.error('Erro ao salvar observação do diário:', e);
      alert('Não foi possível salvar sua observação.');
    } finally {
      setSavingDiary(false);
    }
  };

  // Exclui UMA observação: lê o doc, filtra pelo id e regrava o array
  const handleDeleteDiary = async (entryId) => {
    if (!canDeleteDiary()) return;
    if (!window.confirm('Remover esta observação do diário?')) return;
    try {
      const db = await loadDb();
      const ref = doc(db, 'projects', projectId);
      const snap = await getDoc(ref);
      const data = snap.exists() ? snap.data() : {};
      const arr = Array.isArray(data?.diario) ? data.diario : [];
      const updated = arr.filter((e) => (e.id || '') !== entryId);

      await updateDoc(ref, { diario: updated });
      setDiaryEntries((prev) => prev.filter((e) => e.id !== entryId));
    } catch (e) {
      console.error('Falha ao excluir observação:', e);
      alert('Não foi possível excluir.');
    }
  };

  /* ---------- Métricas de chamados ---------- */
  const ticketMetrics = useMemo(() => {
    const total = tickets.length;

    // concluído + arquivado + variações
    const closedStatuses = new Set(['concluido', 'concluído', 'arquivado', 'fechado', 'resolvido']);
    const notOpenStatuses = new Set([
      'concluido',
      'concluído',
      'arquivado',
      'fechado',
      'resolvido',
      'cancelado',
    ]);

    const closed = tickets.filter((t) => closedStatuses.has((t.status || '').toLowerCase())).length;
    const open = tickets.filter((t) => !notOpenStatuses.has((t.status || '').toLowerCase())).length;
    const completion = total > 0 ? Math.round((closed / total) * 100) : 0;

    const counts = {};
    for (const t of tickets) {
      const area = (t.area || t.areaAtual || 'Não informada').toString();
      counts[area] = (counts[area] || 0) + 1;
    }
    const topAreas = Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);

    return { total, open, closed, completion, topAreas };
  }, [tickets]);

  const goToFilteredTickets = () => {
    const params = new URLSearchParams();
    if (project?.id) params.set('projectId', project.id);
    if (project?.nome) params.set('projectName', project.nome);
    navigate(`/dashboard?${params.toString()}`);
  };

  /* ---------- Loading / Erro ---------- */
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

  const driveHref = getDriveLinkFromProject(project);

  /* =========================
     Layout (responsivo)
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

          {/* Acesso rápido ao Drive (se houver) */}
          {driveHref && (
            <a
              href={driveHref}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center text-sm text-blue-600 hover:underline"
              title="Acessar Drive do Projeto"
            >
              <Link2 className="h-4 w-4 mr-1" /> Acessar Drive
            </a>
          )}
        </div>

        {/* GRID: esquerda (conteúdo principal) / direita (sidebar) */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* ESQUERDA */}
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
                    <div className="text-sm font-medium text-gray-500">Nome do Projeto</div>
                    <div className="text-lg font-semibold">{project.nome || '—'}</div>
                  </div>
                  <div>
                    <div className="text-sm font-medium text-gray-500">Feira</div>
                    <div className="text-lg font-semibold">{project.feira || '—'}</div>
                  </div>
                  <div>
                    <div className="text-sm font-medium text-gray-500">Localização</div>
                    <div className="text-lg font-semibold">{project.local || '—'}</div>
                  </div>
                  <div>
                    <div className="text-sm font-medium text-gray-500">Metragem</div>
                    <div className="text-lg font-semibold">{project.metragem || '—'}</div>
                  </div>
                  <div>
                    <div className="text-sm font-medium text-gray-500">Tipo de Montagem</div>
                    <div className="text-lg font-semibold">{project.tipoMontagem || '—'}</div>
                  </div>
                  <div>
                    <div className="text-sm font-medium text-gray-500">Pavilhão</div>
                    <div className="text-lg font-semibold">{project.pavilhao || '—'}</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Diário do Projeto — FORM (fica entre Info Básicas e Cronograma) */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <ClipboardList className="h-5 w-5 mr-2" />
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
          </div>

          {/* DIREITA (Sidebar) */}
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
                    <a
                      className="text-blue-600 hover:underline flex items-center gap-1"
                      href={`mailto:${project.produtorEmail}`}
                    >
                      <Mail className="h-3 w-3" /> {project.produtorEmail}
                    </a>
                  )}
                </div>
                <div>
                  <div className="text-xs text-gray-500">Consultor</div>
                  <div className="font-medium">{project.consultorNome || 'Não atribuído'}</div>
                  {project.consultorEmail && (
                    <a
                      className="text-blue-600 hover:underline flex items-center gap-1"
                      href={`mailto:${project.consultorEmail}`}
                    >
                      <Mail className="h-3 w-3" /> {project.consultorEmail}
                    </a>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Documentos (Drive) */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Link2 className="h-5 w-5 mr-2" />
                  Documentos
                </CardTitle>
              </CardHeader>
              <CardContent>
                {driveHref ? (
                  <a
                    href={driveHref}
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

            {/* Observações do Projeto (lista do diário) */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <ClipboardList className="h-5 w-5 mr-2" />
                  Observações do Projeto
                </CardTitle>
              </CardHeader>
              <CardContent>
                {diaryEntries.length === 0 ? (
                  <p className="text-sm text-gray-500">Nenhuma observação por enquanto.</p>
                ) : (
                  <div className="space-y-4">
                    {diaryEntries.map((e) => (
                      <div key={e.id} className="border rounded-lg p-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <User className="h-4 w-4 text-gray-500" />
                            <span className="text-sm font-medium">
                              {e.authorName} {e.authorRole ? `(${e.authorRole})` : ''}
                            </span>
                          </div>
                          <span className="text-xs text-gray-500">
                            {formatDateTimeSP(e.createdAt)}
                          </span>
                        </div>
                        {e.text && (
                          <p className="mt-2 text-sm text-gray-700 whitespace-pre-wrap break-words">
                            {e.text}
                          </p>
                        )}
                        {e.linkUrl && (
                          <a
                            href={e.linkUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline mt-2"
                          >
                            <Link2 className="h-4 w-4" /> Anexo/Link
                          </a>
                        )}
                        {canDeleteDiary() && (
                          <div className="mt-3 text-right">
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => handleDeleteDiary(e.id)}
                            >
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

            {/* Resumo de Chamados */}
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
