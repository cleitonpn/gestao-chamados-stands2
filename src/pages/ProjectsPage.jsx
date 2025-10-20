import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { projectService } from '../services/projectService';
import { ArrowLeft, Search, BarChart3, Download } from 'lucide-react';
import * as XLSX from 'xlsx'; // <--- NOVO: Importação da biblioteca SheetJS (xlsx)

/* =========================================================================
   Helpers de data / fuso e formatação
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
  if (!value) return 'N/A';
  const date = normalizeDateInput(value);
  if (!date) return 'N/A';
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
    return 'N/A';
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
   Card do Projeto (custom)
   ========================================================================= */
const ProjectCard = ({ project, onArchive, userRole, selected, onToggleSelect, currentSearch }) => {
  const navigate = useNavigate();

  const getStatusInfo = () => {
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

  const statusInfo = getStatusInfo();

  return (
    <div className={`bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow ${selected ? 'ring-2 ring-blue-500' : ''}`}>
      <div className="flex justify-between items-start mb-4">
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={selected}
            onChange={() => onToggleSelect(project.id)}
            className="h-4 w-4"
            aria-label="Selecionar projeto"
          />
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-1 break-words">{project.nome}</h3>
            <p className="text-sm text-gray-600">{project.feira} • {project.local}</p>
          </div>
        </div>
        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
          statusInfo.color === 'blue' ? 'bg-blue-100 text-blue-800' :
          statusInfo.color === 'green' ? 'bg-green-100 text-green-800' :
          statusInfo.color === 'orange' ? 'bg-orange-100 text-orange-800' :
          statusInfo.color === 'yellow' ? 'bg-yellow-100 text-yellow-800' :
          'bg-gray-100 text-gray-800'
        }`}>
          {statusInfo.label}
        </span>
      </div>

      <div className="space-y-2 mb-4 text-sm text-gray-600">
        <div className="flex items-center"><span className="w-20">📍 Local:</span><span>{project.local || 'N/A'}</span></div>
        <div className="flex items-center"><span className="w-20">📏 Área:</span><span>{project.metragem || 'N/A'}</span></div>
        <div className="text-xs text-gray-500">
          <div>Início: {formatDate(project.dataInicio)}</div>
          <div>Fim: {formatDate(project.dataFim)}</div>
        </div>

        {/* ======= NOVO: Equipes terceirizadas em pílulas ======= */}
        {project.equipesEmpreiteiras && Object.values(project.equipesEmpreiteiras).some(Boolean) && (
          <div className="flex items-start pt-1">
            <span className="w-20">👥 Equipes:</span>
            <div className="flex flex-wrap gap-1">
              {Object.values(project.equipesEmpreiteiras)
                .filter(Boolean)
                .map((empresa, idx) => (
                  <span
                    key={idx}
                    className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-800 text-xs border"
                    title={empresa}
                  >
                    {empresa}
                  </span>
                ))}
            </div>
          </div>
        )}
        {/* ======= FIM DO BLOCO NOVO ======= */}
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => navigate(`/projeto/${project.id}${currentSearch}`)} // <- DETALHES (rota singular)
          className="flex-1 bg-blue-600 text-white px-3 py-2 rounded-md text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          👁️ Ver
        </button>

        {userRole === 'administrador' && (
          <>
            <button
              onClick={() => navigate(`/projetos/editar/${project.id}${currentSearch}`)}
              className="bg-gray-600 text-white px-3 py-2 rounded-md text-sm font-medium hover:bg-gray-700 transition-colors"
              title="Editar"
            >
              ✏️
            </button>
            <button
              onClick={() => onArchive(project.id)}
              className="bg-red-600 text-white px-3 py-2 rounded-md text-sm font-medium hover:bg-red-700 transition-colors"
              title="Encerrar"
            >
              🗑️
            </button>
          </>
        )}
      </div>
    </div>
  );
};

/* =========================================================================
   Página
   ========================================================================= */
const ProjectsPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, userProfile, authInitialized } = useAuth();

  const [allProjects, setAllProjects] = useState([]);
  const [filteredProjects, setFilteredProjects] = useState([]);
  const [events, setEvents] = useState([]);
  const [selectedEvent, setSelectedEvent] = useState('todos');
  const [activeTab, setActiveTab] = useState('ativos');
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // seleção em massa
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  // query atual para repassar na navegação
  const currentSearch = useMemo(() => location.search || '', [location.search]);

  /* Persistência de filtros na URL (carregar) */
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

  /* Persistência de filtros na URL (salvar) */
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    params.set('evento', selectedEvent);
    params.set('tab', activeTab);
    params.set('q', searchTerm); // <- mantém a busca na URL
    const newSearch = `?${params.toString()}`;
    if (newSearch !== location.search) {
      navigate({ pathname: location.pathname, search: newSearch }, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEvent, activeTab, searchTerm]);

  /* Carregar projetos */
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
        const projectsData = await projectService.getAllProjects();
        const sortedProjects = projectsData.sort((a, b) => {
          const aDate = normalizeDateInput(a.dataInicio || 0) || new Date(0);
          const bDate = normalizeDateInput(b.dataInicio || 0) || new Date(0);
          return bDate - aDate;
        });
        setAllProjects(sortedProjects);
        const uniqueEvents = [...new Set(sortedProjects.map(p => p.feira || p.evento).filter(Boolean))];
        setEvents(uniqueEvents);
      } catch (err) {
        console.error('Erro ao carregar projetos:', err);
        setError('Não foi possível carregar os projetos.');
      } finally {
        setLoading(false);
      }
    })();
  }, [authInitialized, user, navigate]);

  /* Filtragem por papéis + tabs + evento + busca */
  useEffect(() => {
    if (!userProfile) return;

    let projectsToDisplay = [...allProjects];
    const userRole = userProfile.funcao;
    const userId = userProfile.id || user?.uid;

    if (userRole === 'consultor') {
      projectsToDisplay = projectsToDisplay.filter(project => (
        project.consultorId === userId ||
        project.consultorUid === userId ||
        project.consultorEmail === userProfile.email ||
        project.consultorNome === userProfile.nome
      ));
    } else if (userRole === 'produtor') {
      projectsToDisplay = projectsToDisplay.filter(project => (
        project.produtorId === userId ||
        project.produtorUid === userId ||
        project.produtorEmail === userProfile.email ||
        project.produtorNome === userProfile.nome
      ));
    } else if (!['administrador', 'gerente', 'operador'].includes(userRole)) {
      projectsToDisplay = [];
    }

    if (activeTab === 'ativos') {
      projectsToDisplay = projectsToDisplay.filter(p => p.status !== 'encerrado');
    } else {
      projectsToDisplay = projectsToDisplay.filter(p => p.status === 'encerrado');
    }

    if (selectedEvent && selectedEvent !== 'todos') {
      projectsToDisplay = projectsToDisplay.filter(p => (p.feira || p.evento) === selectedEvent);
    }

    // Busca
    const term = (searchTerm || '').trim().toLowerCase();
    if (term) {
      const hit = (v) => (v || '').toString().toLowerCase().includes(term);
      projectsToDisplay = projectsToDisplay.filter(p =>
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
    setSelectedIds(new Set()); // limpa seleção ao mudar filtros
  }, [allProjects, selectedEvent, activeTab, searchTerm, userProfile, user]);

  /* Encerrar individual e em massa */
  const handleArchiveProject = async (projectId) => {
    if (!window.confirm('Tem certeza que deseja encerrar este projeto?')) return;
    try {
      await projectService.updateProject(projectId, { status: 'encerrado', dataEncerramento: new Date() });
      const projectsData = await projectService.getAllProjects();
      setAllProjects(projectsData);
    } catch (error) {
      console.error('Erro ao encerrar projeto:', error);
      setError('Erro ao encerrar projeto. Tente novamente.');
    }
  };

  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const allVisibleIds = useMemo(() => filteredProjects.map(p => p.id), [filteredProjects]);

  const toggleSelectAll = () => {
    setSelectedIds(prev => {
      if (prev.size === allVisibleIds.length) return new Set();
      return new Set(allVisibleIds);
    });
  };

  const handleBulkArchive = async () => {
    if (selectedIds.size === 0) return;
    if (!window.confirm(`Encerrar ${selectedIds.size} projeto(s)?`)) return;
    setBulkBusy(true);
    try {
      await Promise.all(Array.from(selectedIds).map(id =>
        projectService.updateProject(id, { status: 'encerrado', dataEncerramento: new Date() })
      ));
      const projectsData = await projectService.getAllProjects();
      setAllProjects(projectsData);
      setSelectedIds(new Set());
    } catch (e) {
      console.error('Erro no encerramento em massa:', e);
      setError('Alguns projetos podem não ter sido encerrados. Tente novamente.');
    } finally {
      setBulkBusy(false);
    }
  };

  const canCreateProject = userProfile?.funcao === 'administrador';

  /* Resumo por fase (com filteredProjects já filtrados) */
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
        phase = 'andamento';
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
     Exportação Excel (com SheetJS) - ATUALIZADO
     ========================= */
  const downloadExcel = (data, filename = 'projetos.xlsx') => {
    // 1. Definir os cabeçalhos
    const headers = [
      'ID',
      'Nome do Projeto',
      'Feira/Evento',
      'Local',
      'Pavilhão',
      'Tipo Montagem',
      'Metragem',
      'Consultor', // <--- INCLUÍDO
      'Produtor',  // <--- INCLUÍDO
      'Status',
      'Equipes Terceirizadas' // <--- INCLUÍDO
    ];

    // 2. Mapear os dados para as linhas
    const rows = data.map(p => {
      // Formata as equipes (conforme lógica do card)
      const equipes = Object.values(p.equipesEmpreiteiras || {})
        .filter(Boolean)
        .join(', ');
      
      return [
        p.id,
        p.nome,
        p.feira || p.evento,
        p.local,
        p.pavilhao,
        p.tipoMontagem,
        p.metragem,
        p.consultorNome, // Nome do Consultor
        p.produtorNome,  // Nome do Produtor
        p.status,
        equipes // Equipes formatadas
      ];
    });

    // 3. Criar a planilha (worksheet)
    const worksheetData = [headers, ...rows];
    const ws = XLSX.utils.aoa_to_sheet(worksheetData);
    
    // Opcional: ajustar largura das colunas
    ws['!cols'] = [
       { wch: 20 }, // ID
       { wch: 30 }, // Nome do Projeto
       { wch: 25 }, // Feira/Evento
       { wch: 20 }, // Local
       { wch: 15 }, // Pavilhão
       { wch: 15 }, // Tipo Montagem
       { wch: 10 }, // Metragem
       { wch: 20 }, // Consultor
       { wch: 20 }, // Produtor
       { wch: 12 }, // Status
       { wch: 40 }, // Equipes Terceirizadas
    ];

    // 4. Criar o 'livro' (workbook) e fazer o download
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Projetos');
    XLSX.writeFile(wb, filename);
  };


  const exportSelected = () => {
    const setIds = new Set(selectedIds);
    const rows = filteredProjects.filter(p => setIds.has(p.id));
    if (rows.length === 0) return;
    downloadExcel(rows, 'projetos_selecionados.xlsx'); // <--- ATUALIZADO
  };

  const exportFiltered = () => {
    if (filteredProjects.length === 0) return;
    downloadExcel(filteredProjects, 'projetos_filtrados.xlsx'); // <--- ATUALIZADO
  };

  /* UI */
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p>Carregando projetos...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <button
        onClick={() => navigate('/dashboard')}
        className="flex items-center text-sm text-gray-600 hover:text-gray-900 mb-6 bg-gray-100 px-3 py-2 rounded-md hover:bg-gray-200 transition-colors"
      >
        <ArrowLeft className="h-4 w-4 mr-2" />
        Voltar ao Dashboard
      </button>

      {/* Header */}
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Projetos</h1>
          <p className="text-gray-600 mt-1">
            {['administrador','gerente','operador'].includes(userProfile?.funcao)
              ? 'Gerencie todos os projetos do sistema'
              : 'Seus projetos vinculados'}
          </p>
        </div>
        <div className="flex gap-2 items-center">
          <button
            onClick={handleBulkArchive}
            disabled={selectedIds.size === 0 || bulkBusy}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${selectedIds.size === 0 || bulkBusy ? 'bg-gray-200 text-gray-500' : 'bg-red-600 text-white hover:bg-red-700'}`}
            title={selectedIds.size ? `Encerrar ${selectedIds.size} selecionado(s)` : 'Selecione projetos para encerrar'}
          >
            {bulkBusy ? 'Encerrando...' : `Encerrar selecionados (${selectedIds.size})`}
          </button>

          {/* Exportações */}
          <button
            onClick={exportSelected}
            disabled={selectedIds.size === 0}
            className={`px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2 ${selectedIds.size === 0 ? 'bg-gray-200 text-gray-500' : 'bg-white border hover:bg-gray-50'}`}
            title="Exportar projetos selecionados (Excel)" // <--- ATUALIZADO
          >
            <Download className="h-4 w-4" /> Exportar selecionados
          </button>
          <button
            onClick={exportFiltered}
            disabled={filteredProjects.length === 0}
            className={`px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2 ${filteredProjects.length === 0 ? 'bg-gray-200 text-gray-500' : 'bg-white border hover:bg-gray-50'}`}
            title="Exportar lista filtrada (Excel)" // <--- ATUALIZADO
          >
            <Download className="h-4 w-4" /> Exportar filtrados
          </button>

          {/* Novo Projeto */}
          {userProfile?.funcao === 'administrador' && (
            <button
              onClick={() => navigate(`/projetos/novo${currentSearch}`)}
              className="bg-blue-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-blue-700 transition-colors"
            >
              ➕ Novo Projeto
            </button>
          )}
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
        <div className="flex flex-wrap gap-4 items-center">
          {/* Tabs de Status */}
          <div className="flex bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => setActiveTab('ativos')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === 'ativos' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
            >
              Ativos ({allProjects.filter(p => p.status !== 'encerrado').length})
            </button>
            <button
              onClick={() => setActiveTab('encerrados')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === 'encerrados' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
            >
              Encerrados ({allProjects.filter(p => p.status === 'encerrado').length})
            </button>
          </div>

          {/* Filtro por Evento */}
          {events.length > 0 && (
            <div className="flex items-center space-x-2">
              <label className="text-sm font-medium text-gray-700">Feira:</label>
              <select
                value={selectedEvent}
                onChange={(e) => setSelectedEvent(e.target.value)}
                className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="todos">Todas as feiras</option>
                {events.map(event => (
                  <option key={event} value={event}>{event}</option>
                ))}
              </select>
            </div>
          )}

          {/* Busca */}
          <div className="w-full md:w-96 ml-auto">
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

          {/* Selecionar todos */}
          <button
            onClick={toggleSelectAll}
            className="text-sm px-3 py-2 rounded-md bg-gray-100 hover:bg-gray-200"
          >
            {selectedIds.size === allVisibleIds.length && allVisibleIds.length > 0 ? 'Desmarcar todos' : 'Selecionar todos'}
          </button>
        </div>
      </div>

      {/* Sidebox: Resumo por Fase */}
      <div className="bg-white rounded-lg shadow-sm p-5 mb-6">
        <div className="flex items-center gap-2 mb-3">
          <BarChart3 className="h-5 w-5 text-gray-700" />
          <h3 className="font-semibold text-gray-800">Resumo por Fase (após filtros e busca)</h3>
        </div>
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
      </div>

      {/* Mensagem de Erro */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <p className="text-red-600">{error}</p>
        </div>
      )}

      {/* Lista */}
      {filteredProjects.length === 0 ? (
        <div className="text-center py-16">
          <div className="mx-auto h-12 w-12 text-gray-400 mb-4">⚠️</div>
          <h3 className="mt-2 text-sm font-medium text-gray-900">Nenhum projeto encontrado</h3>
          <p className="mt-1 text-sm text-gray-500">
            {activeTab === 'ativos'
              ? (['consultor','produtor'].includes(userProfile?.funcao) ? 'Você não possui projetos vinculados no momento.' : 'Tente alterar os filtros ou crie um novo projeto.')
              : 'Projetos encerrados aparecerão aqui.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {filteredProjects.map(project => (
            <ProjectCard
              key={project.id}
              project={project}
              userRole={userProfile?.funcao}
              onArchive={handleArchiveProject}
              selected={selectedIds.has(project.id)}
              onToggleSelect={toggleSelect}
              currentSearch={currentSearch}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default ProjectsPage;
