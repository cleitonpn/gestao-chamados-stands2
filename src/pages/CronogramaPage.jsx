import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Calendar, 
  Clock, 
  Wrench, 
  PartyPopper, 
  Truck, 
  Archive, 
  Loader2, 
  AlertCircle, 
  CalendarDays, 
  Eye, 
  ArrowLeft 
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { collection, query, where, getDocs, updateDoc, doc, writeBatch } from 'firebase/firestore';
import { db } from '../config/firebase';

// Componente para o Cronograma de Eventos
const CronogramaPage = () => {
  const { user, authInitialized } = useAuth();
  const navigate = useNavigate();

  const [eventos, setEventos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [archivingEvent, setArchivingEvent] = useState(null);

  // Efeito para carregar os eventos quando o componente montar
  useEffect(() => {
    // Só carrega os dados se a autenticação já foi checada e o usuário está logado
    if (authInitialized && user) {
      loadEventos();
    } else if (authInitialized && !user) {
      // Se não estiver logado, redireciona para a página de login
      navigate('/login');
    }
  }, [user, authInitialized, navigate]);

  // Função para carregar e agrupar os projetos em eventos
  const loadEventos = async () => {
    try {
      setLoading(true);
      setError('');
      console.log('🔍 Iniciando carregamento de eventos...');

      // Busca todos os documentos da coleção 'projetos'
      const projectsRef = collection(db, 'projetos');
      const snapshot = await getDocs(projectsRef);
      console.log('📊 Total de projetos no banco:', snapshot.size);

      const projetos = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        // Filtra apenas os projetos que não estão arquivados ou encerrados
        const isArquivado = data.eventoArquivado === true;
        const isEncerrado = data.status === 'encerrado';
        
        if (!isArquivado && !isEncerrado) {
          projetos.push({ id: doc.id, ...data });
        }
      });

      console.log('✅ Projetos filtrados para eventos:', projetos.length);

      if (projetos.length === 0) {
        console.log('⚠️ Nenhum projeto encontrado após filtros');
        setEventos([]);
        setLoading(false);
        return;
      }

      // Agrupa os projetos por nome do evento
      const eventosMap = {};
      projetos.forEach(projeto => {
        // Usa o campo 'feira' ou 'evento' como nome do evento. Se não houver, usa um nome padrão.
        const nomeEvento = projeto.feira || projeto.evento || 'Evento Geral';

        if (!eventosMap[nomeEvento]) {
          eventosMap[nomeEvento] = {
            nome: nomeEvento,
            projetos: [],
            datasMontagem: [],
            datasEvento: [],
            datasDesmontagem: []
          };
        }

        eventosMap[nomeEvento].projetos.push(projeto);

        // Função auxiliar para converter datas do Firebase para objeto Date
        const toDate = (timestamp) => {
          if (!timestamp) return null;
          return timestamp.seconds ? new Date(timestamp.seconds * 1000) : new Date(timestamp);
        };

        // Coleta e armazena as datas de cada fase
        const dataMontagemInicio = toDate(projeto.montagem?.dataInicio);
        const dataMontagemFim = toDate(projeto.montagem?.dataFim);
        // CORREÇÃO: Alterado de 'evento_datas' para 'evento' para corresponder à estrutura de dados
        const dataEventoInicio = toDate(projeto.evento?.dataInicio);
        const dataEventoFim = toDate(projeto.evento?.dataFim);
        const dataDesmontagemInicio = toDate(projeto.desmontagem?.dataInicio);
        const dataDesmontagemFim = toDate(projeto.desmontagem?.dataFim);

        if (dataMontagemInicio) eventosMap[nomeEvento].datasMontagem.push(dataMontagemInicio);
        if (dataMontagemFim) eventosMap[nomeEvento].datasMontagem.push(dataMontagemFim);
        if (dataEventoInicio) eventosMap[nomeEvento].datasEvento.push(dataEventoInicio);
        if (dataEventoFim) eventosMap[nomeEvento].datasEvento.push(dataEventoFim);
        if (dataDesmontagemInicio) eventosMap[nomeEvento].datasDesmontagem.push(dataDesmontagemInicio);
        if (dataDesmontagemFim) eventosMap[nomeEvento].datasDesmontagem.push(dataDesmontagemFim);
      });

      // Processa os eventos agrupados para formatação final
      const eventosProcessados = Object.values(eventosMap).map(evento => {
        // Encontra a menor e a maior data para cada fase
        const getMinMaxDate = (dates) => {
          if (dates.length === 0) return 'N/A';
          const min = new Date(Math.min(...dates));
          const max = new Date(Math.max(...dates));
          // CORREÇÃO: Adicionado timeZone: 'UTC' para evitar problemas de fuso horário
          const options = { day: '2-digit', month: '2-digit', timeZone: 'UTC' };
          if (min.getTime() === max.getTime()) {
            return min.toLocaleDateString('pt-BR', options);
          }
          return `${min.toLocaleDateString('pt-BR', options)} - ${max.toLocaleDateString('pt-BR', options)}`;
        };

        return {
          ...evento,
          periodoMontagem: getMinMaxDate(evento.datasMontagem),
          periodoEvento: getMinMaxDate(evento.datasEvento),
          periodoDesmontagem: getMinMaxDate(evento.datasDesmontagem),
          // Usa a data de início do evento para ordenação
          dataOrdenacao: evento.datasMontagem.length > 0 ? new Date(Math.min(...evento.datasMontagem)) : new Date(),
        };
      });

      // Ordena os eventos pela data de início da MONTAGEM mais próxima
      eventosProcessados.sort((a, b) => a.dataOrdenacao - b.dataOrdenacao);

      console.log('🎉 Eventos processados e ordenados:', eventosProcessados);
      setEventos(eventosProcessados);

    } catch (err) {
      console.error("Erro ao carregar eventos:", err);
      setError("Não foi possível carregar o cronograma. Tente novamente mais tarde.");
    } finally {
      setLoading(false);
    }
  };

  // Função para arquivar todos os projetos de um evento
  const handleArchiveEvent = async (nomeEvento) => {
    if (!window.confirm(`Tem certeza que deseja arquivar o evento "${nomeEvento}"? Todos os projetos relacionados serão arquivados.`)) {
      return;
    }
    
    setArchivingEvent(nomeEvento);
    try {
      // Encontra todos os projetos que pertencem ao evento
      const q = query(collection(db, 'projetos'), where('feira', '==', nomeEvento)); // Assumindo que 'feira' é o campo principal do evento
      const snapshot = await getDocs(q);
      
      // Cria um batch para atualizar todos os documentos de uma vez
      const batch = writeBatch(db);
      snapshot.forEach(doc => {
        batch.update(doc.ref, { eventoArquivado: true });
      });
      
      await batch.commit();
      
      // Recarrega a lista de eventos para refletir a mudança
      loadEventos();

    } catch (err) {
      console.error("Erro ao arquivar evento:", err);
      setError("Falha ao arquivar o evento.");
    } finally {
      setArchivingEvent(null);
    }
  };

  // Renderização do componente
  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-100">
        <Loader2 className="h-12 w-12 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 md:p-8 bg-gray-50 min-h-screen">
      <header className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-800">Cronograma de Eventos</h1>
        </div>
      </header>

      {error && (
        <Alert variant="destructive" className="mb-6">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {eventos.length === 0 ? (
        <div className="text-center py-16">
          <CalendarDays className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-medium text-gray-900">Nenhum evento ativo</h3>
          <p className="mt-1 text-sm text-gray-500">Não há eventos no cronograma no momento.</p>
        </div>
      ) : (
        <div className="flex overflow-x-auto space-x-6 pb-4">
          {eventos.map((evento) => (
            <div key={evento.nome} className="flex-shrink-0 w-80">
              <Card className="h-full flex flex-col shadow-md hover:shadow-xl transition-shadow duration-300">
                <CardHeader>
                  <CardTitle className="text-blue-700">{evento.nome}</CardTitle>
                  <CardDescription>{evento.projetos.length} projeto(s) neste evento</CardDescription>
                </CardHeader>
                <CardContent className="flex-grow space-y-4">
                  <div className="flex items-center">
                    <Wrench className="h-5 w-5 mr-3 text-yellow-600" />
                    <div>
                      <p className="text-sm font-medium text-gray-600">Montagem</p>
                      <p className="text-sm text-gray-800 font-semibold">{evento.periodoMontagem}</p>
                    </div>
                  </div>
                  <div className="flex items-center">
                    <PartyPopper className="h-5 w-5 mr-3 text-green-600" />
                    <div>
                      <p className="text-sm font-medium text-gray-600">Evento</p>
                      <p className="text-sm text-gray-800 font-semibold">{evento.periodoEvento}</p>
                    </div>
                  </div>
                  <div className="flex items-center">
                    <Truck className="h-5 w-5 mr-3 text-red-600" />
                    <div>
                      <p className="text-sm font-medium text-gray-600">Desmontagem</p>
                      <p className="text-sm text-gray-800 font-semibold">{evento.periodoDesmontagem}</p>
                    </div>
                  </div>
                </CardContent>
                <div className="p-4 border-t space-y-2">
                  {/* MELHORIA: Botão para ver os projetos */}
                  <Button 
                    variant="default" 
                    size="sm" 
                    className="w-full bg-blue-600 hover:bg-blue-700"
                    onClick={() => navigate(`/projetos?evento=${encodeURIComponent(evento.nome)}`)}
                  >
                    <Eye className="mr-2 h-4 w-4" />
                    Ver Projetos
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="w-full"
                    onClick={() => handleArchiveEvent(evento.nome)}
                    disabled={archivingEvent === evento.nome}
                  >
                    {archivingEvent === evento.nome ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Archive className="mr-2 h-4 w-4" />
                    )}
                    Arquivar Evento
                  </Button>
                </div>
              </Card>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default CronogramaPage;
