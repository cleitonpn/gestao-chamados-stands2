import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { projectService } from '../services/projectService';

// Componente Card Simplificado
const ProjectCard = ({ project, onArchive, userRole }) => {
  const navigate = useNavigate();

  const formatDate = (timestamp) => {
    if (!timestamp) return 'N/A';
    try {
      const date = timestamp.seconds ? new Date(timestamp.seconds * 1000) : new Date(timestamp);
      return date.toLocaleDateString('pt-BR');
    } catch (error) {
      return 'N/A';
    }
  };

  const getStatusInfo = () => {
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

  const handleViewClick = () => {
    console.log('🔍 Navegando para projeto:', project.id);
    navigate(`/projeto/${project.id}`);
  };

  const handleEditClick = () => {
    navigate(`/projetos/editar/${project.id}`);
  };

  const statusInfo = getStatusInfo();

  return (
    <div className="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow">
      {/* Header */}
      <div className="flex justify-between items-start mb-4">
        <div className="flex-1">
          <h3 className="text-lg font-semibold text-gray-900 mb-1">
            {project.nome}
          </h3>
          <p className="text-sm text-gray-600">
            {project.feira} • {project.local}
          </p>
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

      {/* Detalhes */}
      <div className="space-y-2 mb-4">
        <div className="flex items-center text-sm text-gray-600">
          <span className="w-16">📍</span>
          <span>{project.local || 'N/A'}</span>
          <span className="ml-4">📏</span>
          <span className="ml-1">{project.metragem || 'N/A'}</span>
        </div>
        
        <div className="flex items-center text-sm text-gray-600">
          <span className="w-16">👤 Produtor:</span>
          <span className="text-blue-600">{project.produtorNome || 'N/A'}</span>
        </div>
        
        <div className="flex items-center text-sm text-gray-600">
          <span className="w-16">🎯 Consultor:</span>
          <span className="text-green-600">{project.consultorNome || 'N/A'}</span>
        </div>
      </div>

      {/* Datas */}
      <div className="text-xs text-gray-500 mb-4">
        <div>Início: {formatDate(project.dataInicio)}</div>
        <div>Fim: {formatDate(project.dataFim)}</div>
      </div>

      {/* Ações */}
      <div className="flex space-x-2">
        <button
          onClick={handleViewClick}
          className="flex-1 bg-blue-600 text-white px-3 py-2 rounded-md text-sm font-medium hover:bg-blue-700 transition-colors flex items-center justify-center"
        >
          👁️ Ver
        </button>
        
        {(userRole === 'administrador') && (
          <>
            <button
              onClick={handleEditClick}
              className="bg-gray-600 text-white px-3 py-2 rounded-md text-sm font-medium hover:bg-gray-700 transition-colors"
            >
              ✏️
            </button>
            
            <button
              onClick={() => onArchive(project.id)}
              className="bg-red-600 text-white px-3 py-2 rounded-md text-sm font-medium hover:bg-red-700 transition-colors"
            >
              🗑️
            </button>
          </>
        )}
      </div>
    </div>
  );
};

const ProjectsPage = () => {
  const navigate = useNavigate();
  const { user, userProfile, authInitialized } = useAuth();
  const [allProjects, setAllProjects] = useState([]);
  const [filteredProjects, setFilteredProjects] = useState([]);
  const [events, setEvents] = useState([]);
  const [selectedEvent, setSelectedEvent] = useState('todos');
  const [activeTab, setActiveTab] = useState('ativos');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const location = useLocation();

  useEffect(() => {
    if (authInitialized && user && userProfile) {
      loadProjects();
    } else if (authInitialized && !user) {
      navigate('/login');
    }
  }, [user, userProfile, authInitialized, navigate]);

  useEffect(() => {
    // Verificar filtro de evento na URL
    const params = new URLSearchParams(location.search);
    const eventFromUrl = params.get('evento');
    if (eventFromUrl) {
      setSelectedEvent(eventFromUrl);
    }
    
    filterProjects();
  }, [allProjects, selectedEvent, activeTab, location.search, userProfile]);

  const loadProjects = async () => {
    try {
      setLoading(true);
      setError('');
      
      console.log('🔄 Carregando projetos para usuário:', userProfile?.funcao);
      
      const projectsData = await projectService.getAllProjects();
      
      // Ordenar por data de início
      const sortedProjects = projectsData.sort((a, b) => {
        const dateA = a.dataInicio?.seconds ? new Date(a.dataInicio.seconds * 1000) : new Date(a.dataInicio || 0);
        const dateB = b.dataInicio?.seconds ? new Date(b.dataInicio.seconds * 1000) : new Date(b.dataInicio || 0);
        return dateB - dateA;
      });
      
      setAllProjects(sortedProjects);
      
      // Extrair eventos únicos
      const uniqueEvents = [...new Set(
        projectsData
          .map(p => p.feira || p.evento)
          .filter(Boolean)
      )];
      setEvents(uniqueEvents);

      console.log('✅ Projetos carregados:', sortedProjects.length);

    } catch (err) {
      console.error('Erro ao carregar projetos:', err);
      setError('Não foi possível carregar os projetos.');
    } finally {
      setLoading(false);
    }
  };

  const filterProjects = () => {
    if (!userProfile) return;

    let projectsToDisplay = [...allProjects];

    // APLICAR PERMISSÕES BASEADAS NO PAPEL DO USUÁRIO
    const userRole = userProfile.funcao;
    const userId = userProfile.id || user.uid;

    console.log('🔍 Filtrando projetos para:', userRole, 'ID:', userId);

    if (userRole === 'administrador' || userRole === 'gerente' || userRole === 'operador') {
      // Administradores, gerentes e operadores veem todos os projetos
      console.log('✅ Usuário pode ver todos os projetos');
    } else if (userRole === 'consultor') {
      // Consultores veem apenas projetos vinculados a eles
      projectsToDisplay = projectsToDisplay.filter(project => {
        const isAssigned = project.consultorId === userId || 
                          project.consultorUid === userId ||
                          project.consultorEmail === userProfile.email ||
                          project.consultorNome === userProfile.nome;
        
        if (isAssigned) {
          console.log('✅ Projeto vinculado ao consultor:', project.nome);
        }
        
        return isAssigned;
      });
      console.log('🎯 Projetos filtrados para consultor:', projectsToDisplay.length);
    } else if (userRole === 'produtor') {
      // Produtores veem apenas projetos vinculados a eles
      projectsToDisplay = projectsToDisplay.filter(project => {
        const isAssigned = project.produtorId === userId || 
                          project.produtorUid === userId ||
                          project.produtorEmail === userProfile.email ||
                          project.produtorNome === userProfile.nome;
        
        if (isAssigned) {
          console.log('✅ Projeto vinculado ao produtor:', project.nome);
        }
        
        return isAssigned;
      });
      console.log('👤 Projetos filtrados para produtor:', projectsToDisplay.length);
    } else {
      // Outros papéis não veem projetos
      projectsToDisplay = [];
      console.log('❌ Papel sem permissão para ver projetos:', userRole);
    }

    // Filtrar por status
    if (activeTab === 'ativos') {
      projectsToDisplay = projectsToDisplay.filter(p => p.status !== 'encerrado');
    } else {
      projectsToDisplay = projectsToDisplay.filter(p => p.status === 'encerrado');
    }

    // Filtrar por evento
    if (selectedEvent && selectedEvent !== 'todos') {
      projectsToDisplay = projectsToDisplay.filter(p => 
        (p.feira || p.evento) === selectedEvent
      );
    }
    
    console.log('📊 Projetos finais após filtros:', projectsToDisplay.length);
    setFilteredProjects(projectsToDisplay);
  };

  const handleArchiveProject = async (projectId) => {
    if (!window.confirm('Tem certeza que deseja encerrar este projeto?')) return;
    
    try {
      await projectService.updateProject(projectId, { 
        status: 'encerrado',
        dataEncerramento: new Date()
      });
      
      // Recarregar projetos
      loadProjects();
    } catch (error) {
      console.error('Erro ao encerrar projeto:', error);
      setError('Erro ao encerrar projeto. Tente novamente.');
    }
  };

  // Verificar se usuário tem permissão para criar projetos
  const canCreateProject = userProfile?.funcao === 'administrador';

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
      {/* Header */}
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Projetos</h1>
          <p className="text-gray-600 mt-1">
            {userProfile?.funcao === 'administrador' || userProfile?.funcao === 'gerente' || userProfile?.funcao === 'operador' 
              ? 'Gerencie todos os projetos do sistema'
              : 'Seus projetos vinculados'
            }
          </p>
        </div>
        
        {canCreateProject && (
          <button
            onClick={() => navigate('/projetos/novo')}
            className="bg-blue-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-blue-700 transition-colors flex items-center"
          >
            ➕ Novo Projeto
          </button>
        )}
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
        <div className="flex flex-wrap gap-4 items-center">
          {/* Tabs de Status */}
          <div className="flex bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => setActiveTab('ativos')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                activeTab === 'ativos'
                  ? 'bg-white text-blue-600 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Ativos ({filteredProjects.filter(p => p.status !== 'encerrado').length})
            </button>
            <button
              onClick={() => setActiveTab('encerrados')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                activeTab === 'encerrados'
                  ? 'bg-white text-blue-600 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
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
        </div>
      </div>

      {/* Mensagem de Erro */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <p className="text-red-600">{error}</p>
        </div>
      )}

      {/* Content */}
      {filteredProjects.length === 0 ? (
        <div className="text-center py-16">
          <div className="mx-auto h-12 w-12 text-gray-400 mb-4">
            ⚠️
          </div>
          <h3 className="mt-2 text-sm font-medium text-gray-900">
            Nenhum projeto encontrado
          </h3>
          <p className="mt-1 text-sm text-gray-500">
            {activeTab === 'ativos' 
              ? (userProfile?.funcao === 'consultor' || userProfile?.funcao === 'produtor' 
                  ? 'Você não possui projetos vinculados no momento.'
                  : 'Tente alterar os filtros ou crie um novo projeto.')
              : 'Projetos encerrados aparecerão aqui.'
            }
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {filteredProjects.map(project => (
            <ProjectCard 
              key={project.id} 
              project={project} 
              onArchive={handleArchiveProject}
              userRole={userProfile?.funcao}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default ProjectsPage;

