import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import Header from '../components/Header';
import { 
  ArrowLeft, 
  Clock, 
  AlertTriangle, 
  User, 
  Calendar,
  MessageSquare,
  Eye,
  RefreshCw
} from 'lucide-react';

const ChamadosFiltradosPage = () => {
  const { user, userProfile, authInitialized } = useAuth();
  const navigate = useNavigate();
  
  const [chamadosFiltrados, setChamadosFiltrados] = useState([]);
  const [titulo, setTitulo] = useState('');
  const [filtro, setFiltro] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authInitialized && userProfile?.funcao !== 'administrador') {
      navigate('/dashboard');
      return;
    }
    
    // Recuperar dados do localStorage
    const dadosFiltrados = localStorage.getItem('chamadosFiltrados');
    
    if (dadosFiltrados) {
      const dados = JSON.parse(dadosFiltrados);
      setChamadosFiltrados(dados.chamados || []);
      setTitulo(dados.titulo || 'Chamados Filtrados');
      setFiltro(dados.filtro || '');
    }
    
    setLoading(false);
  }, [authInitialized, userProfile, navigate]);

  const formatarData = (timestamp) => {
    if (!timestamp) return 'Data não disponível';
    
    const data = timestamp.seconds ? 
      new Date(timestamp.seconds * 1000) : 
      new Date(timestamp);
    
    return data.toLocaleString('pt-BR');
  };

  const calcularTempoParado = (timestamp) => {
    if (!timestamp) return 'Tempo indeterminado';
    
    const data = timestamp.seconds ? 
      new Date(timestamp.seconds * 1000) : 
      new Date(timestamp);
    
    const agora = new Date();
    const diferenca = agora - data;
    const horas = Math.floor(diferenca / (1000 * 60 * 60));
    const dias = Math.floor(horas / 24);
    
    if (dias > 0) {
      return `${dias} dia${dias > 1 ? 's' : ''} e ${horas % 24}h`;
    } else {
      return `${horas}h`;
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'aberto':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'em_andamento':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'aguardando_validacao':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'concluido':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'escalado_gerencia':
        return 'bg-purple-100 text-purple-800 border-purple-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getStatusText = (status) => {
    switch (status) {
      case 'aberto':
        return 'Aberto';
      case 'em_andamento':
        return 'Em Andamento';
      case 'aguardando_validacao':
        return 'Aguardando Validação';
      case 'concluido':
        return 'Concluído';
      case 'escalado_gerencia':
        return 'Escalado para Gerência';
      default:
        return status;
    }
  };

  const navegarParaChamado = (chamadoId) => {
    navigate(`/chamado/${chamadoId}`);
  };

  const voltarParaPainel = () => {
    navigate('/admin/painel');
  };

  if (!authInitialized || loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header />
        <div className="flex items-center justify-center h-96">
          <div className="text-center">
            <RefreshCw className="h-12 w-12 animate-spin text-blue-600 mx-auto mb-4" />
            <p className="text-gray-600">Carregando chamados...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      
      <div className="container mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <Button 
            variant="outline" 
            onClick={voltarParaPainel}
            className="flex items-center gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar ao Painel
          </Button>
          
          <div>
            <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
              {filtro === 'parados' ? (
                <AlertTriangle className="h-8 w-8 text-red-600" />
              ) : (
                <User className="h-8 w-8 text-orange-600" />
              )}
              {titulo}
            </h1>
            <p className="text-gray-600 mt-1">
              {chamadosFiltrados.length} chamado{chamadosFiltrados.length !== 1 ? 's' : ''} encontrado{chamadosFiltrados.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>

        {/* Lista de Chamados */}
        {chamadosFiltrados.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <div className="text-gray-500">
                <Clock className="h-12 w-12 mx-auto mb-4" />
                <p className="text-lg font-medium">Nenhum chamado encontrado</p>
                <p className="text-sm">Não há chamados que atendam aos critérios de filtro.</p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {chamadosFiltrados.map((chamado) => (
              <Card 
                key={chamado.id} 
                className="hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => navegarParaChamado(chamado.id)}
              >
                <CardContent className="p-6">
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    {/* Informações Principais */}
                    <div className="flex-1">
                      <div className="flex items-start gap-3 mb-3">
                        <div className="flex-1">
                          <h3 className="text-lg font-semibold text-gray-900 mb-1">
                            {chamado.titulo || 'Título não disponível'}
                          </h3>
                          <p className="text-sm text-gray-600 mb-2">
                            {chamado.descricao || 'Descrição não disponível'}
                          </p>
                          
                          <div className="flex flex-wrap items-center gap-2 mb-2">
                            <Badge className={getStatusColor(chamado.status)}>
                              {getStatusText(chamado.status)}
                            </Badge>
                            
                            {chamado.prioridade && (
                              <Badge variant="outline">
                                Prioridade: {chamado.prioridade}
                              </Badge>
                            )}
                            
                            {chamado.areaAtual && (
                              <Badge variant="secondary">
                                {chamado.areaAtual.replace('_', ' ')}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                      
                      {/* Informações Detalhadas */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-600">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <User className="h-4 w-4" />
                            <span>Autor: {chamado.autorNome || 'Não informado'}</span>
                          </div>
                          
                          {chamado.responsavelNome && (
                            <div className="flex items-center gap-2">
                              <User className="h-4 w-4" />
                              <span>Responsável: {chamado.responsavelNome}</span>
                            </div>
                          )}
                          
                          {chamado.projetoNome && (
                            <div className="flex items-center gap-2">
                              <Calendar className="h-4 w-4" />
                              <span>Projeto: {chamado.projetoNome}</span>
                            </div>
                          )}
                        </div>
                        
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <Calendar className="h-4 w-4" />
                            <span>Criado: {formatarData(chamado.createdAt)}</span>
                          </div>
                          
                          {filtro === 'parados' && (
                            <div className="flex items-center gap-2 text-red-600">
                              <Clock className="h-4 w-4" />
                              <span>Parado há: {calcularTempoParado(chamado.updatedAt || chamado.createdAt)}</span>
                            </div>
                          )}
                          
                          {filtro === 'sem_responsavel' && (
                            <div className="flex items-center gap-2 text-orange-600">
                              <AlertTriangle className="h-4 w-4" />
                              <span>Sem responsável definido</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                    
                    {/* Ações */}
                    <div className="flex items-center gap-2">
                      {chamado.mensagens && chamado.mensagens.length > 0 && (
                        <div className="flex items-center gap-1 text-sm text-gray-500">
                          <MessageSquare className="h-4 w-4" />
                          <span>{chamado.mensagens.length}</span>
                        </div>
                      )}
                      
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          navegarParaChamado(chamado.id);
                        }}
                      >
                        <Eye className="h-4 w-4 mr-2" />
                        Ver Detalhes
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Ações no Rodapé */}
        <div className="mt-8 flex justify-center">
          <Button onClick={voltarParaPainel} variant="outline">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar ao Painel Administrativo
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ChamadosFiltradosPage;

