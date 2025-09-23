import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { projectService } from '../services/projectService';

import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

import {
  ArrowLeft,
  Search,
  BarChart3,
  Download,
  CheckSquare,
  Square,
} from 'lucide-react';

/* =========================================================================
   ProjectsPage — com seleção em massa, exportação, busca e resumo por fase
   ========================================================================= */
const ProjectsPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, userProfile, authInitialized } = useAuth();

  // dados
  const [allProjects, setAllProjects] = useState([]);
  const [filteredProjects, setFilteredProjects] = useState([]);
  const [loading, setLoading] = useState(true);

  // filtros
  const [activeTab, setActiveTab] = useState('ativos'); // 'ativos' | 'encerrados'
  const [selectedEvent, setSelectedEvent] = useState('todos'); // feira/evento
  const [searchTerm, setSearchTerm] = useState('');

  // seleção em massa
  const [selectedIds, setSelectedIds] = useState(new Set());

  // query atual (útil p/ navegar mantendo filtros)
  const currentSearch = useMemo(() => location.search || '', [location.search]);

  /* =========================
     Carregar da URL (evento/tab/q)
     ========================= */
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const eventFromUrl = params.get('evento');
    const tabFromUrl = params.get('tab');
    const qFromUrl = params.get('q') || '';

    if (eventFromUrl) setSelectedEvent(eventFromUrl);
    if (tabFromUrl) setActiveTab(tabFromUrl);
    setSearchTerm(qFromUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* =========================
     Sincronizar URL quando filtros mudam
     ========================= */
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    params.set('evento', selectedEvent);
    params.set('tab', activeTab);
    params.set('q', searchTerm);

    const newSearch = `?${params.toString()}`;
    if (newSearch !== location.search) {
      navigate({ pathname: location.pathname, search: newSearch }, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEvent, activeTab, searchTerm]);

  /* =========================
     Carregar projetos
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
        let list = [];
        if (typeof projectService?.getAllProjects === 'function') {
          list = await projectService.getAllProjects();
        } else if (typeof projectService?.getAll === 'function') {
          list = await projectService.getAll();
        } else if (typeof projectService?.list === 'function') {
          list = await projectService.list();
        }
        setAllProjects(Array.isArray(list) ? list : []);
      } catch (err) {
        console.error('Erro ao carregar projetos:', err);
        setAllProjects([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [authInitialized, user, navigate]);

  /* =========================
     Filtro (aba / evento / busca)
     ========================= */
  useEffect(() => {
    let projectsToDisplay = [...allProjects];

    // Ativos x Encerrados (ajuste se seu status final for outro)
    if (activeTab === 'ativos') {
      projectsToDisplay = projectsToDisplay.filter(
        (p) => (p.status || '').toLowerCase() !== 'encerrado' && (p.status || '').toLowerCase() !== 'finalizado'
      );
    } else {
      projectsToDisplay = projectsToDisplay.filter(
        (p) => (p.status || '').toLowerCase() === 'encerrado' || (p.status || '').toLowerCase() === 'finalizado'
      );
    }

    // Filtro por Feira/Evento
    if (selectedEvent && selectedEvent !== 'todos') {
      projectsToDisplay = projectsToDisplay.filter(
        (p) => (p.feira || p.evento || '') === selectedEvent
      );
    }

    // Busca (nome, feira, local, consultor, produtor, pavilhão, tipo)
    const term = (searchTerm || '').trim().toLowerCase();
    if (term) {
      const hit = (v) => (v || '').toString().toLowerCase().includes(term);
      projectsToDisplay = projectsToDisplay.filter(
        (p) =>
          hit(p.nome) ||
          hit(p.feira || p.evento) ||
          hit(p.local) ||
          hit(p.consultorNome) ||
          hit(p.produtorNome) ||
          hit(p.pavilhao) ||
          hit(p.tipoMontagem)
      );
    }

    setFilteredProjects(projectsToDisplay);
    // ao mudar filtro, limpe seleção (evita itens invisíveis marcados)
    setSelectedIds(new Set());
  }, [allProjects, selectedEvent, activeTab, searchTerm]);

  /* =========================
     Eventos únicos para o select
     ========================= */
  const events = useMemo(() => {
    const set = new Set();
    for (const p of allProjects) {
      const ev = p.feira || p.evento;
      if (ev) set.add(ev);
    }
    return Array.from(set).sort();
  }, [allProjects]);

  /* =========================
     Helpers de data (classificação de fase)
     ========================= */
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

  /* =========================
     Resumo por fase (usa filteredProjects)
     ========================= */
  const phaseCounts = useMemo(() => {
    const counts = { futuro: 0, andamento: 0, desmontagem: 0, finalizado: 0 };
    const today = new Date(); today.setHours(0, 0, 0, 0);

    const inRange = (s, e) => {
      const S = startOfDaySP(s), E = endOfDaySP(e);
      return S && E && today >= S && today <= E;
    };

    for (const p of filteredProjects) {
      let phase = 'finalizado';
      const statusLower = (p.status || '').toLowerCase();

      if (statusLower === 'encerrado' || statusLower === 'finalizado' || statusLower === 'arquivado') {
        phase = 'finalizado';
      } else if (inRange(p.desmontagem?.dataInicio, p.desmontagem?.dataFim)) {
        phase = 'desmontagem';
      } else if (
        inRange(p.montagem?.dataInicio, p.montagem?.dataFim) ||
        inRange(p.evento?.dataInicio, p.evento?.dataFim)
      ) {
        phase = 'andamento'; // considera montagem + evento como andamento
      } else {
        const start = p.dataInicio || p.montagem?.dataInicio || p.evento?.dataInicio;
        const S = startOfDaySP(start);
        phase = (S && today < S) ? 'futuro' : 'finalizado';
      }

      counts[phase] = (counts[phase] || 0) + 1;
    }
    return counts;
  }, [filteredProjects]);

  /* =========================
     Seleção em massa
     ========================= */
  const isSelected = (id) => selectedIds.has(id);

  const toggleOne = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllVisible = () => {
    setSelectedIds((prev) => {
      const allVisibleIds = new Set(filteredProjects.map((p) => p.id));
      // se todos os visíveis já estão selecionados, limpa; senão, seleciona todos visíveis
      let allSelected = true;
      for (const id of allVisibleIds) {
        if (!prev.has(id)) { allSelected = false; break; }
      }
      if (allSelected) return new Set([...prev].filter((id) => !allVisibleIds.has(id)));
      return new Set([...prev, ...allVisibleIds]);
    });
  };

  const clearSelection = () => setSelectedIds(new Set());

  const selectedList = useMemo(() => {
    if (selectedIds.size === 0) return [];
    const ids = new Set(selectedIds);
    return filteredProjects.filter((p) => ids.has(p.id));
  }, [selectedIds, filteredProjects]);

  /* =========================
     Exportação CSV (selecionados ou filtrados)
     ========================= */
  const toCSVRow = (obj) => {
    const escape = (v) => {
      if (v === null || v === undefined) return '';
      const s = String(v).replace(/"/g, '""');
      return `"${s}"`;
    };
    return [
      escape(obj.id),
      escape(obj.nome),
      escape(obj.feira || obj.evento),
      escape(obj.local),
      escape(obj.pavilhao),
      escape(obj.tipoMontagem),
      escape(obj.metragem),
      escape(obj.consultorNome),
      escape(obj.produtorNome),
      escape(obj.status),
    ].join(',');
  };

  const downloadCSV = (rows, filename = 'projetos.csv') => {
    const header = [
      'id','nome','feira','local','pavilhao','tipoMontagem','metragem','consultor','produtor','status'
    ].join(',');
    const body = rows.map(toCSVRow).join('\n');
    const csv = header + '\n' + body;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportSelected = () => {
    const rows = selectedList;
    if (rows.length === 0) return;
    downloadCSV(rows, 'projetos_selecionados.csv');
  };

  const exportFiltered = () => {
    if (filteredProjects.length === 0) return;
    downloadCSV(filteredProjects, 'projetos_filtrados.csv');
  };

  /* =========================
     UI
     ========================= */
  return (
    <div className="container mx-auto px-4 py-6">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={() => navigate('/dashboard')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar
          </Button>
          <h1 className="text-2xl font-bold">Projetos</h1>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="flex items-center gap-2">
          <Button
            variant={activeTab === 'ativos' ? 'default' : 'outline'}
            onClick={() => setActiveTab('ativos')}
          >
            Ativos
          </Button>
          <Button
            variant={activeTab === 'encerrados' ? 'default' : 'outline'}
            onClick={() => setActiveTab('encerrados')}
          >
            Encerrados
          </Button>
        </div>

        {events.length > 0 && (
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-600">Feira:</label>
            <select
              className="border border-gray-300 rounded-md px-3 py-2 text-sm"
              value={selectedEvent}
              onChange={(e) => setSelectedEvent(e.target.value)}
            >
              <option value="todos">Todas as feiras</option>
              {events.map((ev) => (
                <option key={ev} value={ev}>{ev}</option>
              ))}
            </select>
          </div>
        )}

        {/* Busca */}
        <div className="w-full md:w-96">
          <div className="relative">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por nome, feira, local, consultor, produtor…"
              className="pl-9 w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      </div>

      {/* Barra de ações (seleção + exportação) */}
      <div className="mt-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={toggleAllVisible} title="Selecionar / desselecionar todos os visíveis">
            {selectedIds.size > 0 && filteredProjects.every(p => selectedIds.has(p.id))
              ? <CheckSquare className="h-4 w-4 mr-2" />
              : <Square className="h-4 w-4 mr-2" />}
            Selecionar todos (visíveis)
          </Button>
          <Button variant="ghost" size="sm" onClick={clearSelection}>
            Limpar seleção ({selectedIds.size})
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={exportSelected}
            disabled={selectedIds.size === 0}
            title="Exportar seleção (CSV)"
          >
            <Download className="h-4 w-4 mr-2" /> Exportar selecionados
          </Button>
          <Button
            size="sm"
            onClick={exportFiltered}
            disabled={filteredProjects.length === 0}
            title="Exportar listagem filtrada (CSV)"
          >
            <Download className="h-4 w-4 mr-2" /> Exportar filtrados
          </Button>
        </div>
      </div>

      {/* Sidebox: Resumo por Fase */}
      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Resumo por Fase (após filtros e busca)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="rounded-lg border p-3">
              <div className="text-xs text-gray-500">Futuro</div>
              <div className="text-2xl font-bold">{phaseCounts.futuro}</div>
            </div>
            <div className="rounded-lg border p-3">
              <div className="text-xs text-gray-500">Andamento</div>
              <div className="text-2xl font-bold">{phaseCounts.andamento}</div>
            </div>
            <div className="rounded-lg border p-3">
              <div className="text-xs text-gray-500">Desmontagem</div>
              <div className="text-2xl font-bold">{phaseCounts.desmontagem}</div>
            </div>
            <div className="rounded-lg border p-3">
              <div className="text-xs text-gray-500">Finalizado</div>
              <div className="text-2xl font-bold">{phaseCounts.finalizado}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Lista de projetos (cards customizados) */}
      {loading ? (
        <div className="text-gray-500 mt-6">Carregando…</div>
      ) : (
        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredProjects.map((p) => (
            <Card
              key={p.id}
              className={`transition-shadow hover:shadow-lg ${isSelected(p.id) ? 'ring-2 ring-blue-500' : ''}`}
            >
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <CardTitle className="text-base leading-tight break-words">
                      {p.nome || 'Sem nome'}
                    </CardTitle>
                    <p className="text-xs text-gray-500 mt-1">
                      {(p.feira || p.evento || '—')} • {(p.local || '—')}
                    </p>
                  </div>
                  {/* checkbox nativo para evitar dependência */}
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4 accent-blue-600 cursor-pointer"
                    checked={isSelected(p.id)}
                    onChange={() => toggleOne(p.id)}
                    title="Selecionar este projeto"
                  />
                </div>
              </CardHeader>
              <CardContent className="text-sm text-gray-700 space-y-1">
                <div><span className="text-gray-500">Pavilhão:</span> {p.pavilhao || '—'}</div>
                <div><span className="text-gray-500">Tipo:</span> {p.tipoMontagem || '—'}</div>
                <div><span className="text-gray-500">Metragem:</span> {p.metragem || '—'}</div>
                <div><span className="text-gray-500">Consultor:</span> {p.consultorNome || '—'}</div>
                <div><span className="text-gray-500">Produtor:</span> {p.produtorNome || '—'}</div>

                <div className="pt-3 grid grid-cols-2 gap-2">
                  <Button
                    className="w-full"
                    variant="outline"
                    onClick={() => navigate(`/projetos/${p.id}${currentSearch}`)}
                  >
                    Detalhes
                  </Button>
                  <Button
                    className="w-full"
                    variant={isSelected(p.id) ? 'default' : 'outline'}
                    onClick={() => toggleOne(p.id)}
                  >
                    {isSelected(p.id) ? 'Selecionado' : 'Selecionar'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}

          {filteredProjects.length === 0 && (
            <div className="text-gray-600">Nenhum projeto encontrado com os filtros aplicados.</div>
          )}
        </div>
      )}
    </div>
  );
};

export default ProjectsPage;
