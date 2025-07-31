import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { reportService } from '../services/reportService';
import { projectService } from '../services/projectService';
import { ticketService } from '../services/ticketService';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  ArrowLeft, 
  Download, 
  FileText, 
  BarChart3,
  Calendar,
  AlertCircle,
  Loader2,
  Eye
} from 'lucide-react';

const ReportsPage = () => {
  const { userProfile } = useAuth();
  const navigate = useNavigate();
  
  const [projects, setProjects] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [selectedProject, setSelectedProject] = useState('');
  const [selectedTicket, setSelectedTicket] = useState('');
  const [reportPreview, setReportPreview] = useState('');
  const [reportType, setReportType] = useState('project');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      
      const [projectsData, ticketsData] = await Promise.all([
        (userProfile?.funcao === 'administrador' || userProfile?.funcao === 'gerente')
          ? projectService.getAllProjects()
          : projectService.getProjectsByUser(userProfile?.id),
        (userProfile?.funcao === 'administrador' || userProfile?.funcao === 'gerente')
          ? ticketService.getAllTickets()
          : ticketService.getTicketsByUser(userProfile?.id)
      ]);
      
      setProjects(projectsData);
      setTickets(ticketsData);
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateReport = async (type, id, preview = false) => {
    if (!id) {
      alert('Selecione um item para gerar o relatório');
      return;
    }

    setGenerating(true);
    try {
      let reportData;
      
      if (type === 'project') {
        reportData = await reportService.generateProjectReport(id);
      } else {
        reportData = await reportService.generateTicketReport(id);
      }

      const markdown = reportService.generateMarkdownReport(reportData, type);
      
      if (preview) {
        setReportPreview(markdown);
        return;
      }

      // Criar arquivo temporário e converter para PDF
      const fileName = `relatorio_${type}_${id}_${Date.now()}`;
      const markdownFile = `/tmp/${fileName}.md`;
      const pdfFile = `/tmp/${fileName}.pdf`;
      
      // Salvar markdown em arquivo temporário
      const blob = new Blob([markdown], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      
      // Criar link para download do markdown (temporário)
      const link = document.createElement('a');
      link.href = url;
      link.download = `${fileName}.md`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      // TODO: Implementar conversão para PDF usando manus-md-to-pdf
      // Isso seria feito no backend ou usando uma API
      
    } catch (error) {
      console.error('Erro ao gerar relatório:', error);
      alert('Erro ao gerar relatório. Tente novamente.');
    } finally {
      setGenerating(false);
    }
  };

  const handleDownloadPDF = async (type, id) => {
    if (!id) {
      alert('Selecione um item para baixar o relatório');
      return;
    }

    setGenerating(true);
    try {
      let reportData;
      
      if (type === 'project') {
        reportData = await reportService.generateProjectReport(id);
      } else {
        reportData = await reportService.generateTicketReport(id);
      }

      const markdown = reportService.generateMarkdownReport(reportData, type);
      
      // Criar arquivo temporário
      const fileName = `relatorio_${type}_${id}_${Date.now()}`;
      
      // Enviar para o backend para conversão em PDF
      const response = await fetch('https://kkh7ikcgpp6y.manus.space/api/generate-pdf', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          markdown,
          fileName
        })
      });

      if (response.ok) {
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${fileName}.pdf`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      } else {
        throw new Error('Erro na conversão para PDF');
      }
      
    } catch (error) {
      console.error('Erro ao baixar PDF:', error);
      alert('Erro ao baixar PDF. Baixando em formato Markdown...');
      // Fallback para markdown
      await handleGenerateReport(type, id, false);
    } finally {
      setGenerating(false);
    }
  };

  const getProjectStats = (projectId) => {
    const projectTickets = tickets.filter(ticket => ticket.projetoId === projectId);
    const completed = projectTickets.filter(ticket => ticket.status === 'concluido').length;
    const total = projectTickets.length;
    
    return {
      total,
      completed,
      percentage: total > 0 ? Math.round((completed / total) * 100) : 0
    };
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p>Carregando dados...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between py-4">
            <div className="flex items-center">
              <Button 
                variant="ghost" 
                onClick={() => navigate('/dashboard')}
                className="mr-4"
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Voltar
              </Button>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">
                  Relatórios
                </h1>
                <p className="text-sm text-gray-600">
                  Gere relatórios detalhados de projetos e chamados
                </p>
              </div>
            </div>
            
            <div className="flex items-center space-x-2">
              <Badge variant="outline">
                <BarChart3 className="h-4 w-4 mr-1" />
                {projects.length} Projetos
              </Badge>
              <Badge variant="outline">
                <FileText className="h-4 w-4 mr-1" />
                {tickets.length} Chamados
              </Badge>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Painel de Geração */}
          <div className="lg:col-span-1 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <FileText className="h-5 w-5 mr-2" />
                  Gerar Relatório
                </CardTitle>
                <CardDescription>
                  Selecione o tipo e item para gerar relatório
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Tabs value={reportType} onValueChange={setReportType}>
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="project">Projeto</TabsTrigger>
                    <TabsTrigger value="ticket">Chamado</TabsTrigger>
                  </TabsList>
                  
                  <TabsContent value="project" className="space-y-4">
                    <div>
                      <label className="text-sm font-medium">Selecionar Projeto</label>
                      <Select value={selectedProject} onValueChange={setSelectedProject}>
                        <SelectTrigger>
                          <SelectValue placeholder="Escolha um projeto" />
                        </SelectTrigger>
                        <SelectContent>
                          {projects.map((project) => (
                            <SelectItem key={project.id} value={project.id}>
                              {project.nome} - {project.feira}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    
                    <div className="flex space-x-2">
                      <Button 
                        onClick={() => handleGenerateReport('project', selectedProject, true)}
                        disabled={generating || !selectedProject}
                        variant="outline"
                        size="sm"
                        className="flex-1"
                      >
                        <Eye className="h-4 w-4 mr-2" />
                        Preview
                      </Button>
                      <Button 
                        onClick={() => handleDownloadPDF('project', selectedProject)}
                        disabled={generating || !selectedProject}
                        size="sm"
                        className="flex-1"
                      >
                        {generating ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <Download className="h-4 w-4 mr-2" />
                        )}
                        PDF
                      </Button>
                    </div>
                  </TabsContent>
                  
                  <TabsContent value="ticket" className="space-y-4">
                    <div>
                      <label className="text-sm font-medium">Selecionar Chamado</label>
                      <Select value={selectedTicket} onValueChange={setSelectedTicket}>
                        <SelectTrigger>
                          <SelectValue placeholder="Escolha um chamado" />
                        </SelectTrigger>
                        <SelectContent>
                          {tickets.map((ticket) => (
                            <SelectItem key={ticket.id} value={ticket.id}>
                              {ticket.titulo} - {ticket.status?.replace('_', ' ').toUpperCase()}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    
                    <div className="flex space-x-2">
                      <Button 
                        onClick={() => handleGenerateReport('ticket', selectedTicket, true)}
                        disabled={generating || !selectedTicket}
                        variant="outline"
                        size="sm"
                        className="flex-1"
                      >
                        <Eye className="h-4 w-4 mr-2" />
                        Preview
                      </Button>
                      <Button 
                        onClick={() => handleDownloadPDF('ticket', selectedTicket)}
                        disabled={generating || !selectedTicket}
                        size="sm"
                        className="flex-1"
                      >
                        {generating ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <Download className="h-4 w-4 mr-2" />
                        )}
                        PDF
                      </Button>
                    </div>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>

            {/* Estatísticas Rápidas */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <BarChart3 className="h-5 w-5 mr-2" />
                  Estatísticas Gerais
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Total de Projetos</span>
                  <span className="font-medium">{projects.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Total de Chamados</span>
                  <span className="font-medium">{tickets.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Chamados Concluídos</span>
                  <span className="font-medium">
                    {tickets.filter(t => t.status === 'concluido').length}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Chamados Extras</span>
                  <span className="font-medium">
                    {tickets.filter(t => t.isExtra).length}
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Área de Preview/Lista */}
          <div className="lg:col-span-2">
            {reportPreview ? (
              <Card>
                <CardHeader>
                  <CardTitle>Preview do Relatório</CardTitle>
                  <CardDescription>
                    Visualização do conteúdo que será gerado em PDF
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="bg-gray-50 p-4 rounded-lg max-h-96 overflow-y-auto">
                    <pre className="whitespace-pre-wrap text-sm">{reportPreview}</pre>
                  </div>
                  <div className="mt-4 flex justify-end">
                    <Button 
                      onClick={() => setReportPreview('')}
                      variant="outline"
                    >
                      Fechar Preview
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-6">
                {/* Lista de Projetos */}
                <Card>
                  <CardHeader>
                    <CardTitle>Projetos Disponíveis</CardTitle>
                    <CardDescription>
                      Clique em um projeto para gerar relatório rapidamente
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {projects.map((project) => {
                        const stats = getProjectStats(project.id);
                        return (
                          <div 
                            key={project.id}
                            className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50 cursor-pointer"
                            onClick={() => {
                              setSelectedProject(project.id);
                              setReportType('project');
                            }}
                          >
                            <div className="flex-1">
                              <h3 className="font-medium">{project.nome}</h3>
                              <p className="text-sm text-gray-600">{project.feira} - {project.local}</p>
                              <div className="flex items-center space-x-2 mt-1">
                                <Badge variant="outline" className="text-xs">
                                  {stats.total} chamados
                                </Badge>
                                <Badge variant="outline" className="text-xs">
                                  {stats.percentage}% concluído
                                </Badge>
                              </div>
                            </div>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDownloadPDF('project', project.id);
                              }}
                            >
                              <Download className="h-4 w-4" />
                            </Button>
                          </div>
                        );
                      })}
                      
                      {projects.length === 0 && (
                        <div className="text-center py-8">
                          <AlertCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                          <p className="text-gray-600">Nenhum projeto encontrado</p>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>

                {/* Lista de Chamados Recentes */}
                <Card>
                  <CardHeader>
                    <CardTitle>Chamados Recentes</CardTitle>
                    <CardDescription>
                      Últimos chamados para geração de relatório individual
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {tickets.slice(0, 5).map((ticket) => (
                        <div 
                          key={ticket.id}
                          className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50 cursor-pointer"
                          onClick={() => {
                            setSelectedTicket(ticket.id);
                            setReportType('ticket');
                          }}
                        >
                          <div className="flex-1">
                            <h3 className="font-medium">{ticket.titulo}</h3>
                            <p className="text-sm text-gray-600">{ticket.descricao}</p>
                            <div className="flex items-center space-x-2 mt-1">
                              <Badge variant="outline" className="text-xs">
                                {ticket.status?.replace('_', ' ').toUpperCase()}
                              </Badge>
                              <Badge variant="outline" className="text-xs">
                                {ticket.prioridade?.toUpperCase()}
                              </Badge>
                              {ticket.isExtra && (
                                <Badge variant="outline" className="text-xs text-orange-600">
                                  EXTRA
                                </Badge>
                              )}
                            </div>
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDownloadPDF('ticket', ticket.id);
                            }}
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                      
                      {tickets.length === 0 && (
                        <div className="text-center py-8">
                          <AlertCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                          <p className="text-gray-600">Nenhum chamado encontrado</p>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

export default ReportsPage;

