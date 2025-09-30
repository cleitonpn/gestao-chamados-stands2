import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { eventService } from '../services/eventService';
// 🔔 IMPORTAÇÃO DO SERVIÇO DE NOTIFICAÇÕES
import notificationService from '../services/notificationService';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { 
  Calendar, 
  MapPin, 
  Plus, 
  Edit, 
  Trash2, 
  Eye, 
  EyeOff, 
  FileText, 
  ExternalLink,
  Loader2,
  AlertCircle,
  CalendarDays,
  Building,
  Users,
  BarChart3,
  Archive,
  ArchiveRestore,
  RefreshCw,
  XCircle,
  Wifi,
  WifiOff,
  Clock
} from 'lucide-react';

const EventsPage = () => {
  const { userProfile, user } = useAuth();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingEvent, setEditingEvent] = useState(null);
  const [stats, setStats] = useState(null);
  const [showArchived, setShowArchived] = useState(false);

  // 🔧 ADIÇÃO: Estados para controle de cache
  const [cacheStatus, setCacheStatus] = useState('unknown');
  const [lastRefresh, setLastRefresh] = useState(null);

  // ---------- FORM STATE ----------
  const [formData, setFormData] = useState({
    nome: '',
    ano: '', // ✅ NOVO CAMPO (select 2025–2035)
    pavilhao: '',
    dataInicioMontagem: '',
    dataFimMontagem: '',
    dataInicioEvento: '',
    dataFimEvento: '',
    dataInicioDesmontagem: '',
    dataFimDesmontagem: '',
    linkManual: '',
    linkPlanta: '',
    observacoes: ''
  });

  const [formLoading, setFormLoading] = useState(false);

  // ---------- HELPERS DE DATA ----------
  const createDateFromString = (dateString) => {
    if (!dateString) return null;
    const [year, month, day] = dateString.split('-').map(Number);
    return new Date(year, month - 1, day, 12, 0, 0);
  };

  const formatDateForInput = (date) => {
    if (!date) return '';
    try {
      let dateObj;
      if (date?.seconds) {
        dateObj = new Date(date.seconds * 1000);
      } else if (typeof date === 'string') {
        dateObj = new Date(date);
      } else if (date instanceof Date) {
        dateObj = date;
      } else {
        return '';
      }
      const year = dateObj.getFullYear();
      const month = String(dateObj.getMonth() + 1).padStart(2, '0');
      const day = String(dateObj.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    } catch {
      return '';
    }
  };

  // 🔎 Utilitário: tentar inferir ano do evento existente
  const inferYear = (ev) => {
    // 1) se existir campo explícito
    if (ev?.ano) return String(ev.ano);
    // 2) do início do evento
    try {
      const d = ev?.dataInicioEvento?.seconds
        ? new Date(ev.dataInicioEvento.seconds * 1000)
        : ev?.dataInicioEvento
        ? new Date(ev.dataInicioEvento)
        : null;
      if (d && !isNaN(d.getTime())) return String(d.getFullYear());
    } catch {}
    // 3) heurística no nome (quatro dígitos iniciando por 20)
    const m = String(ev?.nome || '').match(/\b(20\d{2})\b/);
    return m ? m[1] : '';
  };

  useEffect(() => {
    if (userProfile?.funcao === 'administrador' || userProfile?.papel === 'administrador') {
      loadEvents(true);
      loadStats();
    }
  }, [userProfile]);

  const loadEvents = async (forceServerFetch = false) => {
    try {
      setLoading(true);
      const eventsData = await eventService.getAllEvents(forceServerFetch);
      setEvents(eventsData);
      setCacheStatus(forceServerFetch ? 'server' : 'cache');
      setLastRefresh(new Date().toLocaleTimeString());
    } catch (error) {
      console.error('❌ Erro ao carregar eventos:', error);
      setError('Erro ao carregar eventos');
      setCacheStatus('error');
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    try {
      const statsData = await eventService.getEventStats();
      setStats(statsData);
    } catch (error) {
      console.error('Erro ao carregar estatísticas:', error);
    }
  };

  const handleManualRefresh = async () => {
    await loadEvents(true);
    await loadStats();
  };

  const handleInputChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const resetForm = () => {
    setFormData({
      nome: '',
      ano: '', // ✅ limpa também
      pavilhao: '',
      dataInicioMontagem: '',
      dataFimMontagem: '',
      dataInicioEvento: '',
      dataFimEvento: '',
      dataInicioDesmontagem: '',
      dataFimDesmontagem: '',
      linkManual: '',
      linkPlanta: '',
      observacoes: ''
    });
    setError('');
  };

  const handleEdit = (event) => {
    const formattedData = {
      nome: event.nome || '',
      ano: inferYear(event), // ✅ pré-preenche
      pavilhao: event.pavilhao || '',
      dataInicioMontagem: formatDateForInput(event.dataInicioMontagem),
      dataFimMontagem: formatDateForInput(event.dataFimMontagem),
      dataInicioEvento: formatDateForInput(event.dataInicioEvento),
      dataFimEvento: formatDateForInput(event.dataFimEvento),
      dataInicioDesmontagem: formatDateForInput(event.dataInicioDesmontagem),
      dataFimDesmontagem: formatDateForInput(event.dataFimDesmontagem),
      linkManual: event.linkManual || '',
      linkPlanta: event.linkPlanta || '',
      observacoes: event.observacoes || ''
    };
    setFormData(formattedData);
    setEditingEvent(event);
    setShowForm(true);
  };

  const validateForm = () => {
    if (!formData.nome.trim()) { setError('Nome do evento é obrigatório'); return false; }
    if (!formData.ano) { setError('Ano do evento é obrigatório'); return false; }
    const anoNum = Number(formData.ano);
    if (Number.isNaN(anoNum) || anoNum < 2025 || anoNum > 2035) { setError('Ano deve estar entre 2025 e 2035'); return false; }
    if (!formData.pavilhao.trim()) { setError('Pavilhão é obrigatório'); return false; }

    if (!formData.dataInicioMontagem) { setError('Data de início da montagem é obrigatória'); return false; }
    if (!formData.dataFimMontagem) { setError('Data de fim da montagem é obrigatória'); return false; }
    if (!formData.dataInicioEvento) { setError('Data de início do evento é obrigatória'); return false; }
    if (!formData.dataFimEvento) { setError('Data de fim do evento é obrigatória'); return false; }
    if (!formData.dataInicioDesmontagem) { setError('Data de início da desmontagem é obrigatória'); return false; }
    if (!formData.dataFimDesmontagem) { setError('Data de fim da desmontagem é obrigatória'); return false; }

    const dates = {
      inicioMontagem: createDateFromString(formData.dataInicioMontagem),
      fimMontagem: createDateFromString(formData.dataFimMontagem),
      inicioEvento: createDateFromString(formData.dataInicioEvento),
      fimEvento: createDateFromString(formData.dataFimEvento),
      inicioDesmontagem: createDateFromString(formData.dataInicioDesmontagem),
      fimDesmontagem: createDateFromString(formData.dataFimDesmontagem)
    };

    if (dates.inicioMontagem >= dates.fimMontagem) { setError('Data de fim da montagem deve ser posterior ao início'); return false; }
    if (dates.fimMontagem > dates.inicioEvento) { setError('Data de início do evento deve ser posterior ao fim da montagem'); return false; }
    if (dates.inicioEvento >= dates.fimEvento) { setError('Data de fim do evento deve ser posterior ao início'); return false; }
    if (dates.fimEvento > dates.inicioDesmontagem) { setError('Data de início da desmontagem deve ser posterior ao fim do evento'); return false; }
    if (dates.inicioDesmontagem >= dates.fimDesmontagem) { setError('Data de fim da desmontagem deve ser posterior ao início'); return false; }

    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;

    try {
      setFormLoading(true);
      setError('');

      const eventData = {
        nome: formData.nome.trim(),
        ano: Number(formData.ano), // ✅ envia como número
        pavilhao: formData.pavilhao.trim(),
        dataInicioMontagem: createDateFromString(formData.dataInicioMontagem),
        dataFimMontagem: createDateFromString(formData.dataFimMontagem),
        dataInicioEvento: createDateFromString(formData.dataInicioEvento),
        dataFimEvento: createDateFromString(formData.dataFimEvento),
        dataInicioDesmontagem: createDateFromString(formData.dataInicioDesmontagem),
        dataFimDesmontagem: createDateFromString(formData.dataFimDesmontagem),
        linkManual: formData.linkManual.trim(),
        linkPlanta: formData.linkPlanta.trim(),
        observacoes: formData.observacoes.trim()
      };

      if (editingEvent) {
        await eventService.updateEvent(editingEvent.id, eventData);
      } else {
        const newEvent = await eventService.createEvent({
          ...eventData,
          createdAt: new Date(),
          createdBy: user.uid,
          ativo: true,
          arquivado: false
        });
        // 🔔 notificação de novo evento
        try {
          await notificationService.notifyNewEvent(newEvent.id, { ...eventData, id: newEvent.id }, user.uid);
        } catch (notificationError) {
          console.error('Erro ao enviar notificação de novo evento:', notificationError);
        }
      }

      // reload
      await new Promise(r => setTimeout(r, 3000));
      for (let i = 1; i <= 3; i++) {
        await loadEvents(true);
        await new Promise(r => setTimeout(r, 1000));
      }
      await loadStats();

      setShowForm(false);
      setEditingEvent(null);
      resetForm();
    } catch (error) {
      console.error('💥 ERRO CRÍTICO NO SALVAMENTO:', error);
      setError(`Erro crítico ao salvar evento: ${error.message || 'Erro desconhecido'}`);
    } finally {
      setFormLoading(false);
    }
  };

  const handleToggleActive = async (event) => {
    try {
      if (event.ativo) { await eventService.deactivateEvent(event.id); }
      else { await eventService.reactivateEvent(event.id); }
      await loadEvents(true);
      await loadStats();
    } catch (error) {
      console.error('Erro ao alterar status do evento:', error);
      setError('Erro ao alterar status do evento');
    }
  };

  const handleDelete = async (eventId) => {
    if (window.confirm('Tem certeza que deseja deletar este evento permanentemente?')) {
      try {
        await eventService.deleteEvent(eventId);
        await loadEvents(true);
        await loadStats();
      } catch (error) {
        console.error('Erro ao deletar evento:', error);
        setError('Erro ao deletar evento');
      }
    }
  };

  const handleArchive = async (event) => {
    const action = event.arquivado ? 'desarquivar' : 'arquivar';
    if (window.confirm(`Tem certeza que deseja ${action} este evento?`)) {
      try {
        await eventService.updateEvent(event.id, {
          arquivado: !event.arquivado,
          updatedAt: new Date(),
          updatedBy: user.uid
        });
        await loadEvents(true);
        await loadStats();
      } catch (error) {
        console.error(`❌ Erro ao ${action} evento:`, error);
        setError(`Erro ao ${action} evento: ${error.message || 'Tente novamente.'}`);
      }
    }
  };

  const formatDate = (date) => {
    if (!date) return '-';
    if (date?.seconds) {
      const dateObj = new Date(date.seconds * 1000);
      return dateObj.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
    }
    if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
      const [year, month, day] = date.split('-');
      return `${day}/${month}/${year.slice(-2)}`;
    }
    try {
      const dateObj = new Date(date);
      return dateObj.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
    } catch {
      return '-';
    }
  };

  const getEventStatus = (event) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (!event.ativo) return { label: 'Inativo', color: 'bg-gray-100 text-gray-800' };
    if (event.arquivado) return { label: 'Arquivado', color: 'bg-purple-100 text-purple-800' };
    if (!event.dataInicioEvento || !event.dataFimEvento) return { label: 'Sem Data', color: 'bg-gray-100 text-gray-800' };
    const startDate = new Date(event.dataInicioEvento.seconds * 1000);
    const endDate = new Date(event.dataFimEvento.seconds * 1000);
    if (endDate < today) return { label: 'Finalizado', color: 'bg-blue-100 text-blue-800' };
    if (startDate <= today && endDate >= today) return { label: 'Em Andamento', color: 'bg-green-100 text-green-800' };
    return { label: 'Futuro', color: 'bg-yellow-100 text-yellow-800' };
  };

  const filteredEvents = events.filter(event => showArchived ? true : !event.arquivado);

  if (userProfile?.funcao !== 'administrador' && userProfile?.papel !== 'administrador') {
    return (
      <div className="container mx-auto px-4 py-8">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Acesso negado. Esta página é restrita a administradores.
            <br />
            <small className="text-gray-500 mt-2 block">
              Debug: funcao="{userProfile?.funcao}", papel="{userProfile?.papel}"
            </small>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  // opções fixas 2025–2035
  const yearOptions = Array.from({ length: 11 }, (_, i) => 2025 + i);

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold">🕐 Gerenciamento de Eventos (Fuso Corrigido)</h1>
          <p className="text-gray-600 mt-2">Gerencie eventos para automatizar preenchimento de datas em projetos</p>
          <div className="flex items-center gap-4 mt-2 text-sm">
            <div className="flex items-center gap-1">
              {cacheStatus === 'server' ? (
                <Wifi className="h-4 w-4 text-green-500" />
              ) : cacheStatus === 'cache' ? (
                <WifiOff className="h-4 w-4 text-yellow-500" />
              ) : (
                <XCircle className="h-4 w-4 text-red-500" />
              )}
              <span className={`${cacheStatus === 'server' ? 'text-green-600' : cacheStatus === 'cache' ? 'text-yellow-600' : 'text-red-600'}`}>
                {cacheStatus === 'server' ? 'Dados do Servidor' : cacheStatus === 'cache' ? 'Dados em Cache' : 'Erro de Conexão'}
              </span>
            </div>
            {lastRefresh && <span className="text-gray-500">Última atualização: {lastRefresh}</span>}
            <div className="flex items-center gap-1"><Clock className="h-4 w-4 text-blue-500" /><span className="text-blue-600">Fuso Horário: UTC-3</span></div>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center space-x-2">
            <input type="checkbox" id="showArchived" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} className="rounded" />
            <label htmlFor="showArchived" className="text-sm font-medium">Mostrar Arquivados</label>
          </div>
          <Button variant="outline" onClick={handleManualRefresh} disabled={loading} title="Recarregar dados do servidor">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          <Button onClick={() => setShowForm(true)} className="flex items-center"><Plus className="h-4 w-4 mr-2" />Novo Evento</Button>
        </div>
      </div>

      {error && (
        <Alert variant="destructive" className="mb-6">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <Card><CardContent className="p-4"><div className="flex items-center"><CalendarDays className="h-8 w-8 text-blue-500" /><div className="ml-4"><p className="text-sm font-medium text-gray-600">Total de Eventos</p><p className="text-2xl font-bold">{stats.total}</p></div></div></CardContent></Card>
          <Card><CardContent className="p-4"><div className="flex items-center"><Users className="h-8 w-8 text-green-500" /><div className="ml-4"><p className="text-sm font-medium text-gray-600">Eventos Ativos</p><p className="text-2xl font-bold">{stats.ativos}</p></div></div></CardContent></Card>
          <Card><CardContent className="p-4"><div className="flex items-center"><Calendar className="h-8 w-8 text-yellow-500" /><div className="ml-4"><p className="text-sm font-medium text-gray-600">Eventos Futuros</p><p className="text-2xl font-bold">{stats.futuros}</p></div></div></CardContent></Card>
          <Card><CardContent className="p-4"><div className="flex items-center"><BarChart3 className="h-8 w-8 text-purple-500" /><div className="ml-4"><p className="text-sm font-medium text-gray-600">Em Andamento</p><p className="text-2xl font-bold">{stats.atuais}</p></div></div></CardContent></Card>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center items-center py-8"><Loader2 className="h-8 w-8 animate-spin" /></div>
      ) : (
        <div className="grid gap-4">
          {filteredEvents.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <Calendar className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">{showArchived ? 'Nenhum evento arquivado' : 'Nenhum evento cadastrado'}</h3>
                <p className="text-gray-600 mb-4">{showArchived ? 'Não há eventos arquivados no momento.' : 'Comece criando seu primeiro evento para automatizar o preenchimento de datas em projetos.'}</p>
                {!showArchived && (<Button onClick={() => setShowForm(true)}><Plus className="h-4 w-4 mr-2" />Criar Primeiro Evento</Button>)}
              </CardContent>
            </Card>
          ) : (
            filteredEvents.map((event) => {
              const status = getEventStatus(event);
              return (
                <Card key={event.id} className={`hover:shadow-md transition-shadow ${event.arquivado ? 'opacity-75 border-purple-200' : ''}`}>
                  <CardContent className="p-6">
                    <div className="flex justify-between items-start mb-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="text-xl font-semibold">{event.nome}</h3>
                          {event.ano && (<Badge variant="outline" className="text-gray-700">{event.ano}</Badge>)}
                          <Badge className={status.color}>{status.label}</Badge>
                          {event.arquivado && (<Badge variant="outline" className="text-purple-600 border-purple-300"><Archive className="h-3 w-3 mr-1" />Arquivado</Badge>)}
                        </div>
                        <div className="flex items-center text-gray-600 mb-2"><Building className="h-4 w-4 mr-2" /><span>{event.pavilhao}</span></div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                          <div><p className="font-medium text-blue-600">Montagem</p><p>{formatDate(event.dataInicioMontagem)} - {formatDate(event.dataFimMontagem)}</p></div>
                          <div><p className="font-medium text-green-600">Evento</p><p>{formatDate(event.dataInicioEvento)} - {formatDate(event.dataFimEvento)}</p></div>
                          <div><p className="font-medium text-orange-600">Desmontagem</p><p>{formatDate(event.dataInicioDesmontagem)} - {formatDate(event.dataFimDesmontagem)}</p></div>
                        </div>
                        <div className="mt-3 flex flex-col gap-2">
                          {event.linkManual && (<a href={event.linkManual} target="_blank" rel="noopener noreferrer" className="inline-flex items-center text-blue-600 hover:text-blue-800"><FileText className="h-4 w-4 mr-1" />Manual da Feira<ExternalLink className="h-3 w-3 ml-1" /></a>)}
                          {event.linkPlanta && (<a href={event.linkPlanta} target="_blank" rel="noopener noreferrer" className="inline-flex items-center text-blue-600 hover:text-blue-800"><MapPin className="h-4 w-4 mr-1" />Planta da Feira<ExternalLink className="h-3 w-3 ml-1" /></a>)}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 ml-4">
                        <Button variant="outline" size="sm" onClick={() => handleEdit(event)} title="Editar evento"><Edit className="h-4 w-4" /></Button>
                        <Button variant="outline" size="sm" onClick={() => handleToggleActive(event)} className={event.ativo ? 'text-orange-600' : 'text-green-600'} title={event.ativo ? 'Desativar evento' : 'Ativar evento'}>{event.ativo ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</Button>
                        <Button variant="outline" size="sm" onClick={() => handleArchive(event)} className={event.arquivado ? 'text-blue-600' : 'text-gray-600'} title={event.arquivado ? 'Desarquivar evento' : 'Arquivar evento'}>{event.arquivado ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}</Button>
                        <Button variant="outline" size="sm" onClick={() => handleDelete(event.id)} className="text-red-600 hover:text-red-800" title="Deletar evento permanentemente"><Trash2 className="h-4 w-4" /></Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      )}

      {/* Modal de Formulário */}
      <Dialog open={showForm} onOpenChange={(open) => { setShowForm(open); if (!open) { setEditingEvent(null); resetForm(); } }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingEvent ? `🕐 Editar Evento: ${editingEvent.nome}` : '🕐 Novo Evento'}</DialogTitle>
            <DialogDescription>{editingEvent ? 'Modifique as informações do evento. As datas serão salvas considerando o fuso horário local (UTC-3).' : 'Preencha as informações do evento. As datas serão salvas considerando o fuso horário local (UTC-3).'}</DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (<Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertDescription>{error}</AlertDescription></Alert>)}

            {/* Informações Básicas */}
            <div className="space-y-4">
              <h4 className="font-medium">Informações Básicas</h4>

              {/* Grid com 3 colunas: Nome | Ano | Pavilhão */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="nome">Nome do Evento *</Label>
                  <Input id="nome" value={formData.nome} onChange={(e) => handleInputChange('nome', e.target.value)} placeholder="Ex: LABACE" required />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="ano">Ano *</Label>
                  <select
                    id="ano"
                    value={formData.ano}
                    onChange={(e) => handleInputChange('ano', e.target.value)}
                    required
                    className="block w-full h-10 rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Selecione...</option>
                    {yearOptions.map((y) => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="pavilhao">Pavilhão *</Label>
                  <Input id="pavilhao" value={formData.pavilhao} onChange={(e) => handleInputChange('pavilhao', e.target.value)} placeholder="Ex: Pavilhão Azul" required />
                </div>
              </div>
            </div>

            {/* Cronograma */}
            <div className="space-y-4">
              <h4 className="font-medium">Cronograma (Fuso Horário: UTC-3)</h4>

              {/* Montagem */}
              <div className="bg-blue-50 p-4 rounded-lg">
                <h5 className="font-medium text-blue-800 mb-3">🔧 Fase de Montagem</h5>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="dataInicioMontagem">Data de Início da Montagem *</Label>
                    <Input id="dataInicioMontagem" type="date" value={formData.dataInicioMontagem} onChange={(e) => handleInputChange('dataInicioMontagem', e.target.value)} required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="dataFimMontagem">Data de Fim da Montagem *</Label>
                    <Input id="dataFimMontagem" type="date" value={formData.dataFimMontagem} onChange={(e) => handleInputChange('dataFimMontagem', e.target.value)} required />
                  </div>
                </div>
              </div>

              {/* Evento */}
              <div className="bg-green-50 p-4 rounded-lg">
                <h5 className="font-medium text-green-800 mb-3">🎯 Fase do Evento</h5>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="dataInicioEvento">Data de Início do Evento *</Label>
                    <Input id="dataInicioEvento" type="date" value={formData.dataInicioEvento} onChange={(e) => handleInputChange('dataInicioEvento', e.target.value)} required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="dataFimEvento">Data de Fim do Evento *</Label>
                    <Input id="dataFimEvento" type="date" value={formData.dataFimEvento} onChange={(e) => handleInputChange('dataFimEvento', e.target.value)} required />
                  </div>
                </div>
              </div>

              {/* Desmontagem */}
              <div className="bg-orange-50 p-4 rounded-lg">
                <h5 className="font-medium text-orange-800 mb-3">📦 Fase de Desmontagem</h5>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="dataInicioDesmontagem">Data de Início da Desmontagem *</Label>
                    <Input id="dataInicioDesmontagem" type="date" value={formData.dataInicioDesmontagem} onChange={(e) => handleInputChange('dataInicioDesmontagem', e.target.value)} required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="dataFimDesmontagem">Data de Fim da Desmontagem *</Label>
                    <Input id="dataFimDesmontagem" type="date" value={formData.dataFimDesmontagem} onChange={(e) => handleInputChange('dataFimDesmontagem', e.target.value)} required />
                  </div>
                </div>
              </div>
            </div>

            {/* Informações Adicionais */}
            <div className="space-y-4">
              <h4 className="font-medium">Informações Adicionais</h4>
              <div className="space-y-2">
                <Label htmlFor="linkManual">Link do Manual da Feira (PDF)</Label>
                <Input id="linkManual" type="url" value={formData.linkManual} onChange={(e) => handleInputChange('linkManual', e.target.value)} placeholder="https://drive.google.com/file/d/..." />
              </div>
              <div className="space-y-2">
                <Label htmlFor="linkPlanta">Link da Planta da Feira (Drive)</Label>
                <Input id="linkPlanta" type="url" value={formData.linkPlanta} onChange={(e) => handleInputChange('linkPlanta', e.target.value)} placeholder="https://drive.google.com/file/d/... ou https://drive.google.com/drive/folders/..." />
              </div>
              <div className="space-y-2">
                <Label htmlFor="observacoes">Observações</Label>
                <Textarea id="observacoes" value={formData.observacoes} onChange={(e) => handleInputChange('observacoes', e.target.value)} placeholder="Informações adicionais sobre o evento" rows={3} />
              </div>
            </div>

            {/* Botões */}
            <div className="flex justify-end space-x-2 pt-4">
              <Button type="button" variant="outline" onClick={() => { setShowForm(false); setEditingEvent(null); resetForm(); }}>Cancelar</Button>
              <Button type="submit" disabled={formLoading}>
                {formLoading ? (<><Loader2 className="h-4 w-4 mr-2 animate-spin" />{editingEvent ? 'Salvando...' : 'Criando...'}</>) : (editingEvent ? 'Salvar' : 'Criar Evento')}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default EventsPage;
