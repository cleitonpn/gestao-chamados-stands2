// ===================================
// 🤖 SISTEMA DE IA PARA TEMPLATES INTELIGENTES
// Script de Análise de Dados dos Chamados
// ===================================

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query, orderBy } from 'firebase/firestore';

// Configuração do Firebase (usar as mesmas configurações do projeto)
const firebaseConfig = {
  // Configurações serão carregadas das variáveis de ambiente
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FIREBASE_APP_ID
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// ===================================
// 📊 CLASSES DE ANÁLISE
// ===================================

class TicketAnalyzer {
  constructor() {
    this.tickets = [];
    this.patterns = {};
    this.insights = {};
    this.generatedTemplates = [];
  }

  // Carregar todos os chamados do Firebase
  async loadTickets() {
    try {
      console.log('🔄 Carregando chamados do Firebase...');
      const ticketsRef = collection(db, 'tickets');
      const q = query(ticketsRef, orderBy('createdAt', 'desc'));
      const snapshot = await getDocs(q);
      
      this.tickets = [];
      snapshot.forEach((doc) => {
        this.tickets.push({
          id: doc.id,
          ...doc.data()
        });
      });
      
      console.log(`✅ ${this.tickets.length} chamados carregados`);
      return this.tickets;
    } catch (error) {
      console.error('❌ Erro ao carregar chamados:', error);
      throw error;
    }
  }

  // Analisar padrões por área
  analyzeByArea() {
    console.log('🔍 Analisando padrões por área...');
    
    const areaStats = {};
    
    this.tickets.forEach(ticket => {
      const area = ticket.area || 'sem_area';
      
      if (!areaStats[area]) {
        areaStats[area] = {
          total: 0,
          tipos: {},
          prioridades: {},
          titulos: [],
          descricoes: [],
          tempoMedio: 0,
          statusDistribution: {}
        };
      }
      
      areaStats[area].total++;
      
      // Análise de tipos
      const tipo = ticket.tipo || 'sem_tipo';
      areaStats[area].tipos[tipo] = (areaStats[area].tipos[tipo] || 0) + 1;
      
      // Análise de prioridades
      const prioridade = ticket.prioridade || 'media';
      areaStats[area].prioridades[prioridade] = (areaStats[area].prioridades[prioridade] || 0) + 1;
      
      // Coleta de títulos e descrições para análise de texto
      if (ticket.titulo) areaStats[area].titulos.push(ticket.titulo);
      if (ticket.descricao) areaStats[area].descricoes.push(ticket.descricao);
      
      // Análise de status
      const status = ticket.status || 'aberto';
      areaStats[area].statusDistribution[status] = (areaStats[area].statusDistribution[status] || 0) + 1;
    });
    
    this.patterns.byArea = areaStats;
    return areaStats;
  }

  // Analisar padrões de texto
  analyzeTextPatterns() {
    console.log('📝 Analisando padrões de texto...');
    
    const textPatterns = {};
    
    Object.keys(this.patterns.byArea).forEach(area => {
      const areaData = this.patterns.byArea[area];
      
      textPatterns[area] = {
        commonTitleWords: this.extractCommonWords(areaData.titulos),
        commonDescriptionPhrases: this.extractCommonPhrases(areaData.descricoes),
        titleTemplates: this.generateTitleTemplates(areaData.titulos),
        descriptionTemplates: this.generateDescriptionTemplates(areaData.descricoes)
      };
    });
    
    this.patterns.textPatterns = textPatterns;
    return textPatterns;
  }

  // Extrair palavras mais comuns
  extractCommonWords(texts, minFrequency = 3) {
    const wordCount = {};
    const stopWords = ['de', 'da', 'do', 'em', 'na', 'no', 'para', 'por', 'com', 'um', 'uma', 'o', 'a', 'e', 'ou', 'que', 'se', 'é', 'foi', 'ser', 'ter', 'seu', 'sua'];
    
    texts.forEach(text => {
      if (!text) return;
      
      const words = text.toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .split(/\s+/)
        .filter(word => word.length > 2 && !stopWords.includes(word));
      
      words.forEach(word => {
        wordCount[word] = (wordCount[word] || 0) + 1;
      });
    });
    
    return Object.entries(wordCount)
      .filter(([word, count]) => count >= minFrequency)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([word, count]) => ({ word, count }));
  }

  // Extrair frases mais comuns
  extractCommonPhrases(texts, minFrequency = 2) {
    const phraseCount = {};
    
    texts.forEach(text => {
      if (!text) return;
      
      // Extrair frases de 2-4 palavras
      const words = text.toLowerCase().replace(/[^\w\s]/g, ' ').split(/\s+/);
      
      for (let i = 0; i < words.length - 1; i++) {
        for (let len = 2; len <= Math.min(4, words.length - i); len++) {
          const phrase = words.slice(i, i + len).join(' ');
          if (phrase.length > 5) {
            phraseCount[phrase] = (phraseCount[phrase] || 0) + 1;
          }
        }
      }
    });
    
    return Object.entries(phraseCount)
      .filter(([phrase, count]) => count >= minFrequency)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([phrase, count]) => ({ phrase, count }));
  }

  // Gerar templates de título
  generateTitleTemplates(titles) {
    const templates = [];
    const commonWords = this.extractCommonWords(titles, 2);
    
    // Analisar padrões estruturais
    const patterns = {};
    
    titles.forEach(title => {
      if (!title) return;
      
      // Identificar padrões como "Troca de X", "Problema em Y", etc.
      const normalized = title.toLowerCase();
      
      if (normalized.includes('troca')) {
        patterns['troca'] = (patterns['troca'] || 0) + 1;
      }
      if (normalized.includes('problema')) {
        patterns['problema'] = (patterns['problema'] || 0) + 1;
      }
      if (normalized.includes('solicitação') || normalized.includes('solicitacao')) {
        patterns['solicitacao'] = (patterns['solicitacao'] || 0) + 1;
      }
      if (normalized.includes('manutenção') || normalized.includes('manutencao')) {
        patterns['manutencao'] = (patterns['manutencao'] || 0) + 1;
      }
    });
    
    // Gerar templates baseados nos padrões
    Object.entries(patterns)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .forEach(([pattern, count]) => {
        switch (pattern) {
          case 'troca':
            templates.push({
              template: 'Troca de [ITEM] - [LOCAL]',
              frequency: count,
              examples: titles.filter(t => t.toLowerCase().includes('troca')).slice(0, 3)
            });
            break;
          case 'problema':
            templates.push({
              template: 'Problema [TIPO] em [LOCAL]',
              frequency: count,
              examples: titles.filter(t => t.toLowerCase().includes('problema')).slice(0, 3)
            });
            break;
          case 'solicitacao':
            templates.push({
              template: 'Solicitação de [ITEM/SERVIÇO]',
              frequency: count,
              examples: titles.filter(t => t.toLowerCase().includes('solicit')).slice(0, 3)
            });
            break;
          case 'manutencao':
            templates.push({
              template: 'Manutenção [TIPO] - [EQUIPAMENTO]',
              frequency: count,
              examples: titles.filter(t => t.toLowerCase().includes('manuten')).slice(0, 3)
            });
            break;
        }
      });
    
    return templates;
  }

  // Gerar templates de descrição
  generateDescriptionTemplates(descriptions) {
    const templates = [];
    const commonPhrases = this.extractCommonPhrases(descriptions, 2);
    
    // Analisar estruturas comuns de descrição
    const structures = {
      'problema_identificado': [],
      'solicitacao_material': [],
      'alteracao_layout': [],
      'manutencao_preventiva': []
    };
    
    descriptions.forEach(desc => {
      if (!desc) return;
      
      const normalized = desc.toLowerCase();
      
      if (normalized.includes('problema') || normalized.includes('defeito')) {
        structures.problema_identificado.push(desc);
      }
      if (normalized.includes('material') || normalized.includes('pedido')) {
        structures.solicitacao_material.push(desc);
      }
      if (normalized.includes('layout') || normalized.includes('alteração')) {
        structures.alteracao_layout.push(desc);
      }
      if (normalized.includes('manutenção') || normalized.includes('preventiva')) {
        structures.manutencao_preventiva.push(desc);
      }
    });
    
    // Gerar templates para cada estrutura
    Object.entries(structures).forEach(([type, examples]) => {
      if (examples.length >= 2) {
        templates.push({
          type,
          template: this.generateDescriptionTemplate(type, examples),
          frequency: examples.length,
          examples: examples.slice(0, 2)
        });
      }
    });
    
    return templates;
  }

  // Gerar template de descrição específico
  generateDescriptionTemplate(type, examples) {
    switch (type) {
      case 'problema_identificado':
        return `Problema identificado:\n\n- Localização: [LOCAL]\n- Tipo do problema: [ESPECIFICAR]\n- Descrição: [DETALHAR]\n- Impacto: [ALTO/MÉDIO/BAIXO]\n\nAção necessária:\n[ESPECIFICAR SOLUÇÃO]`;
      
      case 'solicitacao_material':
        return `Solicitação de material:\n\n- Item: [ESPECIFICAR]\n- Quantidade: [NÚMERO]\n- Local de entrega: [LOCAL]\n- Prazo: [DATA]\n\nJustificativa:\n[MOTIVO DA SOLICITAÇÃO]`;
      
      case 'alteracao_layout':
        return `Solicitação de alteração:\n\n- Stand/Área: [IDENTIFICAR]\n- Alteração solicitada: [DETALHAR]\n- Motivo: [JUSTIFICAR]\n- Prazo desejado: [DATA]\n\nObservações:\n[INFORMAÇÕES ADICIONAIS]`;
      
      case 'manutencao_preventiva':
        return `Manutenção solicitada:\n\n- Equipamento/Estrutura: [IDENTIFICAR]\n- Tipo de manutenção: [ESPECIFICAR]\n- Periodicidade: [FREQUÊNCIA]\n- Última manutenção: [DATA]\n\nChecklist:\n- [ ] Item 1\n- [ ] Item 2\n- [ ] Item 3`;
      
      default:
        return `[DESCRIÇÃO DETALHADA]\n\n- Item/Serviço: [ESPECIFICAR]\n- Local: [IDENTIFICAR]\n- Prazo: [DATA]\n\nObservações:\n[INFORMAÇÕES ADICIONAIS]`;
    }
  }

  // Gerar templates inteligentes
  generateIntelligentTemplates() {
    console.log('🤖 Gerando templates inteligentes...');
    
    this.generatedTemplates = [];
    
    Object.entries(this.patterns.byArea).forEach(([area, areaData]) => {
      // Pegar os 3 tipos mais comuns por área
      const topTypes = Object.entries(areaData.tipos)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3);
      
      // Pegar a prioridade mais comum
      const topPriority = Object.entries(areaData.prioridades)
        .sort((a, b) => b[1] - a[1])[0];
      
      // Pegar templates de texto para esta área
      const textPatterns = this.patterns.textPatterns[area] || {};
      
      topTypes.forEach(([tipo, frequency]) => {
        // Gerar template baseado nos padrões
        const template = {
          id: `ai_${area}_${tipo}_${Date.now()}`,
          nome: this.generateTemplateName(area, tipo, frequency),
          area: area,
          tipo: tipo,
          prioridade: topPriority ? topPriority[0] : 'media',
          titulo: this.generateTemplateTitle(area, tipo, textPatterns),
          descricao: this.generateTemplateDescription(area, tipo, textPatterns),
          frequency: frequency,
          confidence: this.calculateConfidence(frequency, areaData.total),
          createdBy: 'AI_SYSTEM',
          createdAt: new Date().toISOString(),
          source: 'pattern_analysis',
          examples: this.getExamplesForTemplate(area, tipo)
        };
        
        this.generatedTemplates.push(template);
      });
    });
    
    // Ordenar por confiança
    this.generatedTemplates.sort((a, b) => b.confidence - a.confidence);
    
    console.log(`✅ ${this.generatedTemplates.length} templates inteligentes gerados`);
    return this.generatedTemplates;
  }

  // Gerar nome do template
  generateTemplateName(area, tipo, frequency) {
    const areaNames = {
      'comunicacao_visual': 'Comunicação Visual',
      'locacao': 'Locação',
      'almoxarifado': 'Almoxarifado',
      'operacional': 'Operacional',
      'producao': 'Produção',
      'logistica': 'Logística'
    };
    
    const tipoNames = {
      'troca_lona_cliente': 'Troca de Lona',
      'pedido_extra': 'Pedido Extra',
      'troca_por_avaria': 'Troca por Avaria',
      'informacoes': 'Informações',
      'manutencao_eletrica': 'Manutenção Elétrica'
    };
    
    const areaName = areaNames[area] || area;
    const tipoName = tipoNames[tipo] || tipo.replace('_', ' ');
    
    return `${areaName} - ${tipoName} (${frequency}x)`;
  }

  // Gerar título do template
  generateTemplateTitle(area, tipo, textPatterns) {
    const titleTemplates = textPatterns.titleTemplates || [];
    
    if (titleTemplates.length > 0) {
      return titleTemplates[0].template;
    }
    
    // Fallback baseado no tipo
    const fallbacks = {
      'troca_lona_cliente': 'Troca de Lona - [CLIENTE/LOCAL]',
      'pedido_extra': 'Pedido Extra - [ESPECIFICAR]',
      'troca_por_avaria': 'Troca por Avaria - [ITEM]',
      'informacoes': 'Informação - [ASSUNTO]',
      'manutencao_eletrica': 'Manutenção Elétrica - [EQUIPAMENTO]'
    };
    
    return fallbacks[tipo] || `${tipo.replace('_', ' ')} - [ESPECIFICAR]`;
  }

  // Gerar descrição do template
  generateTemplateDescription(area, tipo, textPatterns) {
    const descTemplates = textPatterns.descriptionTemplates || [];
    
    if (descTemplates.length > 0) {
      return descTemplates[0].template;
    }
    
    // Fallback baseado no tipo
    const fallbacks = {
      'troca_lona_cliente': 'Solicitação de troca de lona:\n\n- Cliente: [NOME]\n- Local: [STAND/PAREDE]\n- Motivo: [ESPECIFICAR]\n- Prazo: [DATA]\n\nObservações:\n[INFORMAÇÕES ADICIONAIS]',
      'pedido_extra': 'Pedido extra solicitado:\n\n- Item/Serviço: [ESPECIFICAR]\n- Quantidade: [NÚMERO]\n- Justificativa: [MOTIVO]\n- Prazo: [DATA]\n\nObservações:\n[DETALHES ADICIONAIS]',
      'troca_por_avaria': 'Troca necessária por avaria:\n\n- Item avariado: [ESPECIFICAR]\n- Local: [IDENTIFICAR]\n- Tipo de avaria: [DETALHAR]\n- Urgência: [ALTA/MÉDIA/BAIXA]\n\nAção necessária:\n[ESPECIFICAR SOLUÇÃO]'
    };
    
    return fallbacks[tipo] || `Solicitação relacionada a ${tipo.replace('_', ' ')}:\n\n- Detalhes: [ESPECIFICAR]\n- Local: [IDENTIFICAR]\n- Prazo: [DATA]\n\nObservações:\n[INFORMAÇÕES ADICIONAIS]`;
  }

  // Calcular confiança do template
  calculateConfidence(frequency, total) {
    const percentage = (frequency / total) * 100;
    
    if (percentage >= 20) return 0.95;
    if (percentage >= 15) return 0.85;
    if (percentage >= 10) return 0.75;
    if (percentage >= 5) return 0.65;
    return 0.5;
  }

  // Obter exemplos para o template
  getExamplesForTemplate(area, tipo) {
    return this.tickets
      .filter(ticket => ticket.area === area && ticket.tipo === tipo)
      .slice(0, 3)
      .map(ticket => ({
        titulo: ticket.titulo,
        descricao: ticket.descricao?.substring(0, 100) + '...',
        prioridade: ticket.prioridade,
        status: ticket.status
      }));
  }

  // Gerar insights gerais
  generateInsights() {
    console.log('💡 Gerando insights...');
    
    const totalTickets = this.tickets.length;
    const areas = Object.keys(this.patterns.byArea);
    const mostActiveArea = Object.entries(this.patterns.byArea)
      .sort((a, b) => b[1].total - a[1].total)[0];
    
    // Análise temporal (últimos 30 dias vs anteriores)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const recentTickets = this.tickets.filter(ticket => 
      ticket.createdAt && new Date(ticket.createdAt.seconds * 1000) > thirtyDaysAgo
    );
    
    const olderTickets = this.tickets.filter(ticket => 
      ticket.createdAt && new Date(ticket.createdAt.seconds * 1000) <= thirtyDaysAgo
    );
    
    this.insights = {
      summary: {
        totalTickets,
        totalAreas: areas.length,
        mostActiveArea: mostActiveArea ? {
          name: mostActiveArea[0],
          count: mostActiveArea[1].total,
          percentage: ((mostActiveArea[1].total / totalTickets) * 100).toFixed(1)
        } : null,
        recentActivity: {
          last30Days: recentTickets.length,
          before30Days: olderTickets.length,
          trend: recentTickets.length > olderTickets.length ? 'crescente' : 'decrescente'
        }
      },
      recommendations: this.generateRecommendations(),
      templatesGenerated: this.generatedTemplates.length,
      confidence: this.calculateOverallConfidence()
    };
    
    return this.insights;
  }

  // Gerar recomendações
  generateRecommendations() {
    const recommendations = [];
    
    // Recomendação baseada na área mais ativa
    const areaStats = Object.entries(this.patterns.byArea)
      .sort((a, b) => b[1].total - a[1].total);
    
    if (areaStats.length > 0) {
      const topArea = areaStats[0];
      recommendations.push({
        type: 'area_focus',
        title: `Foco na área ${topArea[0]}`,
        description: `Esta área representa ${((topArea[1].total / this.tickets.length) * 100).toFixed(1)}% dos chamados. Considere otimizar templates para esta área.`,
        priority: 'high'
      });
    }
    
    // Recomendação baseada em tipos frequentes
    const allTypes = {};
    Object.values(this.patterns.byArea).forEach(area => {
      Object.entries(area.tipos).forEach(([tipo, count]) => {
        allTypes[tipo] = (allTypes[tipo] || 0) + count;
      });
    });
    
    const topType = Object.entries(allTypes).sort((a, b) => b[1] - a[1])[0];
    if (topType) {
      recommendations.push({
        type: 'template_optimization',
        title: `Otimizar template para ${topType[0]}`,
        description: `Este tipo de chamado aparece ${topType[1]} vezes. Um template otimizado pode acelerar a criação.`,
        priority: 'medium'
      });
    }
    
    return recommendations;
  }

  // Calcular confiança geral
  calculateOverallConfidence() {
    if (this.generatedTemplates.length === 0) return 0;
    
    const avgConfidence = this.generatedTemplates.reduce((sum, template) => 
      sum + template.confidence, 0) / this.generatedTemplates.length;
    
    return Math.round(avgConfidence * 100);
  }

  // Executar análise completa
  async runCompleteAnalysis() {
    console.log('🚀 Iniciando análise completa...');
    
    try {
      // 1. Carregar dados
      await this.loadTickets();
      
      // 2. Analisar padrões
      this.analyzeByArea();
      
      // 3. Analisar texto
      this.analyzeTextPatterns();
      
      // 4. Gerar templates
      this.generateIntelligentTemplates();
      
      // 5. Gerar insights
      this.generateInsights();
      
      console.log('✅ Análise completa finalizada!');
      
      return {
        tickets: this.tickets.length,
        patterns: this.patterns,
        templates: this.generatedTemplates,
        insights: this.insights
      };
      
    } catch (error) {
      console.error('❌ Erro na análise:', error);
      throw error;
    }
  }
}

// ===================================
// 🎯 FUNÇÃO PRINCIPAL
// ===================================

async function runAnalysis() {
  const analyzer = new TicketAnalyzer();
  
  try {
    const results = await analyzer.runCompleteAnalysis();
    
    // Salvar resultados em arquivo JSON
    const fs = require('fs').promises;
    await fs.writeFile(
      'ticket_analysis_results.json', 
      JSON.stringify(results, null, 2)
    );
    
    console.log('📊 Resultados salvos em ticket_analysis_results.json');
    
    // Exibir resumo
    console.log('\n🎯 RESUMO DA ANÁLISE:');
    console.log(`📋 Total de chamados analisados: ${results.tickets}`);
    console.log(`🤖 Templates inteligentes gerados: ${results.templates.length}`);
    console.log(`💡 Confiança geral: ${results.insights.confidence}%`);
    console.log(`🏆 Área mais ativa: ${results.insights.summary.mostActiveArea?.name}`);
    
    return results;
    
  } catch (error) {
    console.error('❌ Falha na análise:', error);
    process.exit(1);
  }
}

// Executar se chamado diretamente
if (require.main === module) {
  runAnalysis();
}

export { TicketAnalyzer, runAnalysis };

