// ===================================
// 📊 DASHBOARD DE INSIGHTS E RELATÓRIOS IA
// Componente React para visualização de dados
// ===================================

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, Area, AreaChart
} from 'recharts';
import { 
  Brain, TrendingUp, Target, Users, FileText, Zap, 
  AlertCircle, CheckCircle, Clock, Star, ThumbsUp,
  RefreshCw, Download, Settings, Eye, Trash2
} from 'lucide-react';
import intelligentTemplateService from '../services/intelligent-template-service';

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8'];

const AIInsightsDashboard = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('overview');
  
  // Estados dos dados
  const [analysisData, setAnalysisData] = useState(null);
  const [templates, setTemplates] = useState([]);
  const [metrics, setMetrics] = useState(null);
  const [performanceReport, setPerformanceReport] = useState(null);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      setError('');

      // Carregar dados em paralelo
      const [
        latestAnalysis,
        aiTemplates,
        templateMetrics,
        performance
      ] = await Promise.all([
        intelligentTemplateService.getLatestAnalysis(),
        intelligentTemplateService.getActiveAITemplates(),
        intelligentTemplateService.getTemplateMetrics(),
        intelligentTemplateService.getPerformanceReport(30)
      ]);

      setAnalysisData(latestAnalysis);
      setTemplates(aiTemplates);
      setMetrics(templateMetrics);
      setPerformanceReport(performance);

    } catch (err) {
      console.error('Erro ao carregar dados do dashboard:', err);
      setError('Erro ao carregar dados. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  const runNewAnalysis = async () => {
    try {
      setLoading(true);
      await intelligentTemplateService.runIncrementalUpdate();
      await loadDashboardData();
    } catch (err) {
      setError('Erro ao executar nova análise.');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p>Carregando insights da IA...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Brain className="h-8 w-8 text-blue-600" />
            IA - Insights de Chamados
          </h1>
          <p className="text-gray-600 mt-1">
            Sistema inteligente de análise e geração de templates
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={runNewAnalysis} disabled={loading}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Nova Análise
          </Button>
          <Button variant="outline">
            <Download className="h-4 w-4 mr-2" />
            Exportar
          </Button>
        </div>
      </div>

      {/* Cards de Resumo */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Templates IA</p>
                <p className="text-2xl font-bold">{templates.length}</p>
              </div>
              <Brain className="h-8 w-8 text-blue-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Confiança Média</p>
                <p className="text-2xl font-bold">
                  {metrics ? `${metrics.feedback.averageRating.toFixed(1)}` : '0'}
                </p>
              </div>
              <Target className="h-8 w-8 text-green-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Uso Total</p>
                <p className="text-2xl font-bold">
                  {metrics ? metrics.usage.totalUsage : '0'}
                </p>
              </div>
              <TrendingUp className="h-8 w-8 text-orange-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Aprovação</p>
                <p className="text-2xl font-bold">
                  {metrics ? `${(metrics.feedback.positiveRatio * 100).toFixed(0)}%` : '0%'}
                </p>
              </div>
              <ThumbsUp className="h-8 w-8 text-purple-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs de Conteúdo */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="overview">Visão Geral</TabsTrigger>
          <TabsTrigger value="templates">Templates</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
          <TabsTrigger value="insights">Insights</TabsTrigger>
        </TabsList>

        {/* Visão Geral */}
        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Distribuição por Área */}
            <Card>
              <CardHeader>
                <CardTitle>Templates por Área</CardTitle>
                <CardDescription>Distribuição dos templates gerados pela IA</CardDescription>
              </CardHeader>
              <CardContent>
                {metrics && (
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={Object.entries(metrics.byArea).map(([area, count]) => ({
                          name: area.replace('_', ' ').toUpperCase(),
                          value: count
                        }))}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                        outerRadius={80}
                        fill="#8884d8"
                        dataKey="value"
                      >
                        {Object.entries(metrics.byArea).map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            {/* Níveis de Confiança */}
            <Card>
              <CardHeader>
                <CardTitle>Níveis de Confiança</CardTitle>
                <CardDescription>Distribuição da confiança dos templates</CardDescription>
              </CardHeader>
              <CardContent>
                {metrics && (
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium">Alta (≥80%)</span>
                      <Badge variant="default">{metrics.byConfidence.high}</Badge>
                    </div>
                    <Progress value={(metrics.byConfidence.high / metrics.total) * 100} className="h-2" />
                    
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium">Média (60-79%)</span>
                      <Badge variant="secondary">{metrics.byConfidence.medium}</Badge>
                    </div>
                    <Progress value={(metrics.byConfidence.medium / metrics.total) * 100} className="h-2" />
                    
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium">Baixa (<60%)</span>
                      <Badge variant="outline">{metrics.byConfidence.low}</Badge>
                    </div>
                    <Progress value={(metrics.byConfidence.low / metrics.total) * 100} className="h-2" />
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Última Análise */}
          {analysisData && (
            <Card>
              <CardHeader>
                <CardTitle>Última Análise</CardTitle>
                <CardDescription>
                  Executada em {new Date(analysisData.createdAt.seconds * 1000).toLocaleDateString()}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="text-center">
                    <p className="text-2xl font-bold text-blue-600">{analysisData.tickets}</p>
                    <p className="text-sm text-gray-600">Chamados Analisados</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-green-600">{analysisData.templates?.length || 0}</p>
                    <p className="text-sm text-gray-600">Templates Gerados</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-orange-600">{analysisData.insights?.confidence || 0}%</p>
                    <p className="text-sm text-gray-600">Confiança Geral</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Templates */}
        <TabsContent value="templates" className="space-y-6">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold">Templates Inteligentes</h2>
            <div className="flex gap-2">
              <Button variant="outline" size="sm">
                <Eye className="h-4 w-4 mr-2" />
                Visualizar Todos
              </Button>
              <Button variant="outline" size="sm">
                <Settings className="h-4 w-4 mr-2" />
                Gerenciar
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {templates.slice(0, 6).map((template) => (
              <Card key={template.id} className="hover:shadow-md transition-shadow">
                <CardHeader className="pb-3">
                  <div className="flex justify-between items-start">
                    <CardTitle className="text-lg">{template.nome}</CardTitle>
                    <div className="flex gap-2">
                      <Badge variant={template.confidence >= 0.8 ? 'default' : template.confidence >= 0.6 ? 'secondary' : 'outline'}>
                        {(template.confidence * 100).toFixed(0)}%
                      </Badge>
                      <Badge variant="outline">{template.status}</Badge>
                    </div>
                  </div>
                  <CardDescription>{template.area.replace('_', ' ').toUpperCase()}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div>
                      <p className="text-sm font-medium">Título:</p>
                      <p className="text-sm text-gray-600">{template.titulo}</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium">Descrição:</p>
                      <p className="text-sm text-gray-600 line-clamp-2">
                        {template.descricao.substring(0, 100)}...
                      </p>
                    </div>
                    <div className="flex justify-between items-center text-sm text-gray-500">
                      <span>Usado {template.usage?.timesUsed || 0}x</span>
                      <span>Freq: {template.frequency}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* Analytics */}
        <TabsContent value="analytics" className="space-y-6">
          {analysisData && (
            <>
              {/* Padrões por Área */}
              <Card>
                <CardHeader>
                  <CardTitle>Análise de Padrões por Área</CardTitle>
                  <CardDescription>Frequência de chamados por área</CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={400}>
                    <BarChart data={Object.entries(analysisData.patterns?.byArea || {}).map(([area, data]) => ({
                      area: area.replace('_', ' ').toUpperCase(),
                      total: data.total,
                      tipos: Object.keys(data.tipos).length
                    }))}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="area" />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="total" fill="#8884d8" name="Total de Chamados" />
                      <Bar dataKey="tipos" fill="#82ca9d" name="Tipos Diferentes" />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* Insights de Texto */}
              <Card>
                <CardHeader>
                  <CardTitle>Padrões de Texto Identificados</CardTitle>
                  <CardDescription>Palavras e frases mais comuns</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {Object.entries(analysisData.patterns?.textPatterns || {}).slice(0, 2).map(([area, patterns]) => (
                      <div key={area} className="space-y-4">
                        <h3 className="font-semibold text-lg">{area.replace('_', ' ').toUpperCase()}</h3>
                        
                        <div>
                          <h4 className="font-medium mb-2">Palavras Comuns:</h4>
                          <div className="flex flex-wrap gap-2">
                            {patterns.commonTitleWords?.slice(0, 8).map((word, index) => (
                              <Badge key={index} variant="outline">
                                {word.word} ({word.count})
                              </Badge>
                            ))}
                          </div>
                        </div>

                        <div>
                          <h4 className="font-medium mb-2">Templates de Título:</h4>
                          <div className="space-y-1">
                            {patterns.titleTemplates?.slice(0, 3).map((template, index) => (
                              <div key={index} className="text-sm p-2 bg-gray-50 rounded">
                                <span className="font-mono">{template.template}</span>
                                <span className="text-gray-500 ml-2">({template.frequency}x)</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        {/* Performance */}
        <TabsContent value="performance" className="space-y-6">
          {performanceReport && (
            <>
              {/* Resumo de Performance */}
              <Card>
                <CardHeader>
                  <CardTitle>Relatório de Performance - {performanceReport.period}</CardTitle>
                  <CardDescription>Análise de uso e efetividade dos templates</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="text-center">
                      <p className="text-2xl font-bold">{performanceReport.summary.templatesActive}</p>
                      <p className="text-sm text-gray-600">Templates Ativos</p>
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-bold">{performanceReport.summary.totalUsage}</p>
                      <p className="text-sm text-gray-600">Uso Total</p>
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-bold">{performanceReport.summary.averageRating.toFixed(1)}</p>
                      <p className="text-sm text-gray-600">Avaliação Média</p>
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-bold">{(performanceReport.summary.adoptionRate * 100).toFixed(0)}%</p>
                      <p className="text-sm text-gray-600">Taxa de Adoção</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Top Performers */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Star className="h-5 w-5 text-yellow-500" />
                      Melhores Performers
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {performanceReport.topPerformers.slice(0, 5).map((template, index) => (
                        <div key={template.id} className="flex justify-between items-center p-3 bg-green-50 rounded-lg">
                          <div>
                            <p className="font-medium text-sm">{template.nome}</p>
                            <p className="text-xs text-gray-600">{template.area}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-bold text-green-600">
                              {(template.performanceScore * 100).toFixed(0)}%
                            </p>
                            <p className="text-xs text-gray-500">{template.recentUsage} usos</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <AlertCircle className="h-5 w-5 text-orange-500" />
                      Precisam de Atenção
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {performanceReport.lowPerformers.slice(0, 5).map((template, index) => (
                        <div key={template.id} className="flex justify-between items-center p-3 bg-orange-50 rounded-lg">
                          <div>
                            <p className="font-medium text-sm">{template.nome}</p>
                            <p className="text-xs text-gray-600">{template.area}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-bold text-orange-600">
                              {(template.performanceScore * 100).toFixed(0)}%
                            </p>
                            <p className="text-xs text-gray-500">{template.recentUsage} usos</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </>
          )}
        </TabsContent>

        {/* Insights e Recomendações */}
        <TabsContent value="insights" className="space-y-6">
          {analysisData?.insights && (
            <>
              {/* Resumo de Insights */}
              <Card>
                <CardHeader>
                  <CardTitle>Insights Principais</CardTitle>
                  <CardDescription>Descobertas da análise de dados</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {analysisData.insights.summary.mostActiveArea && (
                      <Alert>
                        <TrendingUp className="h-4 w-4" />
                        <AlertDescription>
                          <strong>Área mais ativa:</strong> {analysisData.insights.summary.mostActiveArea.name} 
                          com {analysisData.insights.summary.mostActiveArea.count} chamados 
                          ({analysisData.insights.summary.mostActiveArea.percentage}% do total)
                        </AlertDescription>
                      </Alert>
                    )}

                    <Alert>
                      <Clock className="h-4 w-4" />
                      <AlertDescription>
                        <strong>Tendência recente:</strong> {analysisData.insights.summary.recentActivity.trend} 
                        - {analysisData.insights.summary.recentActivity.last30Days} chamados nos últimos 30 dias
                      </AlertDescription>
                    </Alert>
                  </div>
                </CardContent>
              </Card>

              {/* Recomendações */}
              <Card>
                <CardHeader>
                  <CardTitle>Recomendações da IA</CardTitle>
                  <CardDescription>Sugestões para otimização do sistema</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {analysisData.insights.recommendations?.map((rec, index) => (
                      <div key={index} className="p-4 border rounded-lg">
                        <div className="flex items-start gap-3">
                          <div className={`p-2 rounded-full ${
                            rec.priority === 'high' ? 'bg-red-100 text-red-600' :
                            rec.priority === 'medium' ? 'bg-yellow-100 text-yellow-600' :
                            'bg-blue-100 text-blue-600'
                          }`}>
                            {rec.type === 'area_focus' ? <Target className="h-4 w-4" /> :
                             rec.type === 'template_optimization' ? <Zap className="h-4 w-4" /> :
                             <CheckCircle className="h-4 w-4" />}
                          </div>
                          <div className="flex-1">
                            <h3 className="font-medium">{rec.title}</h3>
                            <p className="text-sm text-gray-600 mt-1">{rec.description}</p>
                            <Badge variant="outline" className="mt-2">
                              {rec.priority} prioridade
                            </Badge>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Recomendações de Performance */}
              {performanceReport?.recommendations && (
                <Card>
                  <CardHeader>
                    <CardTitle>Recomendações de Performance</CardTitle>
                    <CardDescription>Ações sugeridas para melhorar a efetividade</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {performanceReport.recommendations.map((rec, index) => (
                        <div key={index} className="p-4 border rounded-lg">
                          <div className="flex items-start gap-3">
                            <div className={`p-2 rounded-full ${
                              rec.type === 'improvement' ? 'bg-orange-100 text-orange-600' :
                              rec.type === 'optimization' ? 'bg-blue-100 text-blue-600' :
                              'bg-green-100 text-green-600'
                            }`}>
                              {rec.type === 'improvement' ? <AlertCircle className="h-4 w-4" /> :
                               rec.type === 'optimization' ? <Settings className="h-4 w-4" /> :
                               <TrendingUp className="h-4 w-4" />}
                            </div>
                            <div className="flex-1">
                              <h3 className="font-medium">{rec.title}</h3>
                              <p className="text-sm text-gray-600 mt-1">{rec.description}</p>
                              <div className="flex gap-2 mt-3">
                                <Button size="sm" variant="outline">
                                  Ver Detalhes
                                </Button>
                                <Button size="sm">
                                  Aplicar Ação
                                </Button>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AIInsightsDashboard;

