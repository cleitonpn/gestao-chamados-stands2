import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  CalendarDays,
  Wrench,
  PartyPopper,
  Truck,
  Archive,
  Loader2,
  AlertCircle,
  Eye,
  ArrowLeft,
  FileText,
  MapPin,
  ExternalLink
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  collection,
  query,
  where,
  getDocs,
  writeBatch
} from 'firebase/firestore';
import { db } from '../config/firebase';

// Componente para o Cronograma de Eventos
const CronogramaPage = () => {

  // ── Helpers de normalização para casar nomes com/sem ano ─────────────────────
  const stripYear = (s) => (s || '').replace(/\b20\d{2}\b/g, '').replace(/\s{2,}/g, ' ').trim();
  const norm = (s) =>
    (s || '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // remove acentos
      .replace(/\s+/g, ' ') // espaços
      .trim()
      .toLowerCase();

  const { user, authInitialized } = useAuth();
  const navigate = useNavigate();

  const [eventos, setEventos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [archivingEvent, setArchivingEvent] = useState(null);

  // 🔗 Mapa com os links (manual/planta) do evento cadastrado
  // Mapa normalizado: chave em lowercase/sem acento/sem duplicidades
  const [eventLinksMap, setEventLinksMap] = useState({}); // { [normalizedKey]: { linkManual, linkPlanta } }

  useEffect(() => {
    if (authInitialized && user) {
      loadEventos();
    } else if (authInitialized && !user) {
      navigate('/login');
    }
  }, [user, authInitialized, navigate]);

  // Busca todos os eventos cadastrados (coleções "eventos" e "events") e cria um mapa por nome
  
  const loadEventLinksMap = async () => {
    const map = {};

    const saveVariants = (nome, data) => {
      const raw = (nome || '').trim();
      if (!raw) return;
      const ano = (data?.ano != null && data.ano !== '') ? String(data.ano) : '';
      const variants = new Set([raw, stripYear(raw), ano ? `${raw} ${ano}` : null].filter(Boolean));
      variants.forEach(v => {
        map[norm(v)] = {
          linkManual: (data.linkManual || '').trim(),
          linkPlanta: (data.linkPlanta || '').trim()
        };
      });
    };

    const readCollectionIntoMap = async (colName) => {
      try {
        const colRef = collection(db, colName);
        const snap = await getDocs(colRef);
        snap.forEach((d) => {
          const data = d.data() || {};
          saveVariants(data.nome, data);
        });
      } catch {
        // coleção pode não existir; ignora
      }
    };

    await readCollectionIntoMap('eventos');
    await readCollectionIntoMap('events');

    setEventLinksMap(map);
  };
;

  // Função para carregar e agrupar os projetos em eventos
  const loadEventos = async () => {
    try {
      setLoading(true);
      setError('');

      // Busca todos os documentos da coleção 'projetos'
      const projectsRef = collection(db, 'projetos');
      const snapshot = await getDocs(projectsRef);

      const projetos = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        const isArquivado = data.eventoArquivado === true;
        const isEncerrado = data.status === 'encerrado';
        if (!isArquivado && !isEncerrado) {
          projetos.push({ id: doc.id, ...data });
        }
      });

      if (projetos.length === 0) {
        setEventos([]);
        // Mesmo sem projetos, ainda vale montar o mapa de links
        await loadEventLinksMap();
        return;
      }

      // Agrupa os projetos por nome do evento
      const eventosMap = {};
      projetos.forEach((projeto) => {
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

        const toDate = (timestamp) => {
          if (!timestamp) return null;
          return timestamp.seconds ? new Date(timestamp.seconds * 1000) : new Date(timestamp);
        };

        const dataMontagemInicio = toDate(projeto.montagem?.dataInicio);
        const dataMontagemFim = toDate(projeto.montagem?.dataFim);
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

      // Processa e ordena
      const eventosProcessados = Object.values(eventosMap).map((evento) => {
        const getMinMaxDate = (dates) => {
          if (dates.length === 0) return 'N/A';
          const min = new Date(Math.min(...dates));
          const max = new Date(Math.max(...dates));
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
          dataOrdenacao:
            evento.datasMontagem.length > 0
              ? new Date(Math.min(...evento.datasMontagem))
              : new Date()
        };
      });

      eventosProcessados.sort((a, b) => a.dataOrdenacao - b.dataOrdenacao);
      setEventos(eventosProcessados);

      // Carrega o mapa de links após descobrir os nomes de eventos
      await loadEventLinksMap();
    } catch (err) {
      console.error('Erro ao carregar eventos:', err);
      setError('Não foi possível carregar o cronograma. Tente novamente mais tarde.');
    } finally {
      setLoading(false);
    }
  };

  // Função para arquivar todos os projetos de um evento
  const handleArchiveEvent = async (nomeEvento) => {
    if (
      !window.confirm(
        `Tem certeza que deseja arquivar o evento "${nomeEvento}"? Todos os projetos relacionados serão arquivados.`
      )
    ) {
      return;
    }

    setArchivingEvent(nomeEvento);
    try {
      const q = query(collection(db, 'projetos'), where('feira', '==', nomeEvento));
      const snapshot = await getDocs(q);

      const batch = writeBatch(db);
      snapshot.forEach((doc) => {
        batch.update(doc.ref, { eventoArquivado: true });
      });

      await batch.commit();
      loadEventos();
    } catch (err) {
      console.error('Erro ao arquivar evento:', err);
      setError('Falha ao arquivar o evento.');
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
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-800">
            Cronograma de Eventos
          </h1>
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
          <p className="mt-1 text-sm text-gray-500">
            Não há eventos no cronograma no momento.
          </p>
        </div>
      ) : (
        <div className="flex overflow-x-auto space-x-6 pb-4">
          {eventos.map((evento) => {
            const links = eventLinksMap[norm(evento.nome)] || eventLinksMap[norm(stripYear(evento.nome))] || {};
            const hasManual = !!links.linkManual;
            const hasPlanta = !!links.linkPlanta;

            return (
              <div key={evento.nome} className="flex-shrink-0 w-80">
                <Card className="h-full flex flex-col shadow-md hover:shadow-xl transition-shadow duration-300">
                  <CardHeader>
                    <CardTitle className="text-blue-700">{evento.nome}</CardTitle>
                    <CardDescription>
                      {evento.projetos.length} projeto(s) neste evento
                    </CardDescription>
                  </CardHeader>

                  <CardContent className="flex-grow space-y-4">
                    <div className="flex items-center">
                      <Wrench className="h-5 w-5 mr-3 text-yellow-600" />
                      <div>
                        <p className="text-sm font-medium text-gray-600">Montagem</p>
                        <p className="text-sm text-gray-800 font-semibold">
                          {evento.periodoMontagem}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center">
                      <PartyPopper className="h-5 w-5 mr-3 text-green-600" />
                      <div>
                        <p className="text-sm font-medium text-gray-600">Evento</p>
                        <p className="text-sm text-gray-800 font-semibold">
                          {evento.periodoEvento}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center">
                      <Truck className="h-5 w-5 mr-3 text-red-600" />
                      <div>
                        <p className="text-sm font-medium text-gray-600">Desmontagem</p>
                        <p className="text-sm text-gray-800 font-semibold">
                          {evento.periodoDesmontagem}
                        </p>
                      </div>
                    </div>
                  </CardContent>

                  <div className="p-4 border-t space-y-2">
                    {/* 🔗 Botões com links externos para Manual e Planta, quando disponíveis */}
                    {hasManual && (
                      <Button variant="secondary" size="sm" className="w-full" asChild>
                        <a
                          href={links.linkManual}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Abrir Manual da Feira (Drive)"
                        >
                          <FileText className="mr-2 h-4 w-4" />
                          Manual da Feira
                          <ExternalLink className="ml-1 h-3 w-3" />
                        </a>
                      </Button>
                    )}
                    {hasPlanta && (
                      <Button variant="secondary" size="sm" className="w-full" asChild>
                        <a
                          href={links.linkPlanta}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Abrir Planta da Feira (Drive)"
                        >
                          <MapPin className="mr-2 h-4 w-4" />
                          Planta da Feira
                          <ExternalLink className="ml-1 h-3 w-3" />
                        </a>
                      </Button>
                    )}

                    {/* Botão para ver os projetos do evento */}
                    <Button
                      variant="default"
                      size="sm"
                      className="w-full bg-blue-600 hover:bg-blue-700"
                      onClick={() =>
                        navigate(`/projetos?evento=${encodeURIComponent(evento.nome)}`)
                      }
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
            );
          })}
        </div>
      )}
    </div>
  );
};

export default CronogramaPage;
