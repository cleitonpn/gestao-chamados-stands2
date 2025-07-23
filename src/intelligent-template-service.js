// ===================================
// 🤖 SERVIÇO DE TEMPLATES INTELIGENTES
// Sistema de Geração e Gerenciamento de Templates IA
// ===================================

import { collection, doc, setDoc, getDocs, query, where, orderBy, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../../config/firebase';

class IntelligentTemplateService {
  constructor() {
    this.collectionName = 'aiTemplates';
    this.analysisCollectionName = 'aiAnalysis';
  }

  // ===================================
  // 💾 PERSISTÊNCIA DE DADOS
  // ===================================

  // Salvar templates gerados pela IA
  async saveAITemplates(templates, analysisId = null) {
    try {
      console.log('💾 Salvando templates da IA no Firebase...');
      
      const batch = [];
      const timestamp = new Date();
      
      for (const template of templates) {
        const templateDoc = {
          ...template,
          analysisId: analysisId || `analysis_${timestamp.getTime()}`,
          createdAt: timestamp,
          updatedAt: timestamp,
          status: 'generated', // generated, approved, rejected, active
          usage: {
            timesUsed: 0,
            lastUsed: null,
            userFeedback: []
          },
          metadata: {
            generatedBy: 'AI_SYSTEM',
            version: '1.0',
            algorithm: 'pattern_analysis'
          }
        };
        
        const docRef = doc(collection(db, this.collectionName), template.id);
        batch.push(setDoc(docRef, templateDoc));
      }
      
      // Executar todas as operações
      await Promise.all(batch);
      
      console.log(`✅ ${templates.length} templates salvos com sucesso`);
      return true;
      
    } catch (error) {
      console.error('❌ Erro ao salvar templates:', error);
      throw error;
    }
  }

  // Salvar análise completa
  async saveAnalysisResults(analysisResults) {
    try {
      console.log('💾 Salvando resultados da análise...');
      
      const analysisDoc = {
        ...analysisResults,
        id: `analysis_${Date.now()}`,
        createdAt: new Date(),
        status: 'completed',
        metadata: {
          version: '1.0',
          algorithm: 'pattern_analysis',
          dataSource: 'firebase_tickets'
        }
      };
      
      const docRef = doc(collection(db, this.analysisCollectionName), analysisDoc.id);
      await setDoc(docRef, analysisDoc);
      
      console.log('✅ Análise salva com sucesso');
      return analysisDoc.id;
      
    } catch (error) {
      console.error('❌ Erro ao salvar análise:', error);
      throw error;
    }
  }

  // ===================================
  // 📊 RECUPERAÇÃO DE DADOS
  // ===================================

  // Obter templates ativos da IA
  async getActiveAITemplates(area = null) {
    try {
      let q = collection(db, this.collectionName);
      
      if (area) {
        q = query(q, 
          where('area', '==', area),
          where('status', 'in', ['generated', 'approved', 'active']),
          orderBy('confidence', 'desc')
        );
      } else {
        q = query(q,
          where('status', 'in', ['generated', 'approved', 'active']),
          orderBy('confidence', 'desc')
        );
      }
      
      const snapshot = await getDocs(q);
      const templates = [];
      
      snapshot.forEach(doc => {
        templates.push({
          id: doc.id,
          ...doc.data()
        });
      });
      
      return templates;
      
    } catch (error) {
      console.error('❌ Erro ao carregar templates da IA:', error);
      return [];
    }
  }

  // Obter templates por confiança
  async getTemplatesByConfidence(minConfidence = 0.7) {
    try {
      const q = query(
        collection(db, this.collectionName),
        where('confidence', '>=', minConfidence),
        where('status', 'in', ['generated', 'approved', 'active']),
        orderBy('confidence', 'desc')
      );
      
      const snapshot = await getDocs(q);
      const templates = [];
      
      snapshot.forEach(doc => {
        templates.push({
          id: doc.id,
          ...doc.data()
        });
      });
      
      return templates;
      
    } catch (error) {
      console.error('❌ Erro ao carregar templates por confiança:', error);
      return [];
    }
  }

  // Obter última análise
  async getLatestAnalysis() {
    try {
      const q = query(
        collection(db, this.analysisCollectionName),
        orderBy('createdAt', 'desc')
      );
      
      const snapshot = await getDocs(q);
      
      if (!snapshot.empty) {
        const doc = snapshot.docs[0];
        return {
          id: doc.id,
          ...doc.data()
        };
      }
      
      return null;
      
    } catch (error) {
      console.error('❌ Erro ao carregar última análise:', error);
      return null;
    }
  }

  // ===================================
  // 🎯 SISTEMA DE RECOMENDAÇÃO
  // ===================================

  // Recomendar templates baseado no contexto
  async recommendTemplates(context) {
    try {
      const { area, tipo, userHistory = [] } = context;
      
      // 1. Buscar templates da área específica
      let areaTemplates = await this.getActiveAITemplates(area);
      
      // 2. Filtrar por tipo se especificado
      if (tipo) {
        areaTemplates = areaTemplates.filter(template => 
          template.tipo === tipo || template.tipo === 'geral'
        );
      }
      
      // 3. Aplicar scoring baseado em múltiplos fatores
      const scoredTemplates = areaTemplates.map(template => ({
        ...template,
        score: this.calculateRecommendationScore(template, context)
      }));
      
      // 4. Ordenar por score e retornar top 5
      return scoredTemplates
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);
      
    } catch (error) {
      console.error('❌ Erro ao recomendar templates:', error);
      return [];
    }
  }

  // Calcular score de recomendação
  calculateRecommendationScore(template, context) {
    let score = 0;
    
    // 1. Confiança base (40% do score)
    score += template.confidence * 0.4;
    
    // 2. Frequência de uso (30% do score)
    const usageScore = Math.min(template.usage?.timesUsed || 0, 50) / 50;
    score += usageScore * 0.3;
    
    // 3. Correspondência exata de área e tipo (20% do score)
    if (template.area === context.area) score += 0.15;
    if (template.tipo === context.tipo) score += 0.15;
    
    // 4. Feedback positivo (10% do score)
    const feedback = template.usage?.userFeedback || [];
    const positiveRatio = feedback.length > 0 
      ? feedback.filter(f => f.rating >= 4).length / feedback.length 
      : 0.5;
    score += positiveRatio * 0.1;
    
    // 5. Recência da última análise (bonus)
    if (template.createdAt) {
      const daysSinceCreation = (Date.now() - new Date(template.createdAt).getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceCreation < 7) score += 0.05; // Bonus para templates recentes
    }
    
    return Math.min(score, 1); // Normalizar para 0-1
  }

  // ===================================
  // 📈 SISTEMA DE FEEDBACK E APRENDIZADO
  // ===================================

  // Registrar uso de template
  async recordTemplateUsage(templateId, userId, feedback = null) {
    try {
      const templateRef = doc(db, this.collectionName, templateId);
      
      const updateData = {
        'usage.timesUsed': (await this.getTemplate(templateId))?.usage?.timesUsed + 1 || 1,
        'usage.lastUsed': new Date(),
        updatedAt: new Date()
      };
      
      // Adicionar feedback se fornecido
      if (feedback) {
        const currentTemplate = await this.getTemplate(templateId);
        const currentFeedback = currentTemplate?.usage?.userFeedback || [];
        
        updateData['usage.userFeedback'] = [
          ...currentFeedback,
          {
            userId,
            rating: feedback.rating,
            comment: feedback.comment,
            timestamp: new Date()
          }
        ];
      }
      
      await updateDoc(templateRef, updateData);
      
      console.log(`✅ Uso do template ${templateId} registrado`);
      return true;
      
    } catch (error) {
      console.error('❌ Erro ao registrar uso do template:', error);
      return false;
    }
  }

  // Obter template específico
  async getTemplate(templateId) {
    try {
      const docRef = doc(db, this.collectionName, templateId);
      const docSnap = await getDoc(docRef);
      
      if (docSnap.exists()) {
        return {
          id: docSnap.id,
          ...docSnap.data()
        };
      }
      
      return null;
      
    } catch (error) {
      console.error('❌ Erro ao buscar template:', error);
      return null;
    }
  }

  // Aprovar template (admin)
  async approveTemplate(templateId, adminUserId) {
    try {
      const templateRef = doc(db, this.collectionName, templateId);
      
      await updateDoc(templateRef, {
        status: 'approved',
        approvedBy: adminUserId,
        approvedAt: new Date(),
        updatedAt: new Date()
      });
      
      console.log(`✅ Template ${templateId} aprovado`);
      return true;
      
    } catch (error) {
      console.error('❌ Erro ao aprovar template:', error);
      return false;
    }
  }

  // Rejeitar template (admin)
  async rejectTemplate(templateId, adminUserId, reason = '') {
    try {
      const templateRef = doc(db, this.collectionName, templateId);
      
      await updateDoc(templateRef, {
        status: 'rejected',
        rejectedBy: adminUserId,
        rejectedAt: new Date(),
        rejectionReason: reason,
        updatedAt: new Date()
      });
      
      console.log(`✅ Template ${templateId} rejeitado`);
      return true;
      
    } catch (error) {
      console.error('❌ Erro ao rejeitar template:', error);
      return false;
    }
  }

  // ===================================
  // 🔄 ATUALIZAÇÃO AUTOMÁTICA
  // ===================================

  // Executar nova análise e atualizar templates
  async runIncrementalUpdate() {
    try {
      console.log('🔄 Executando atualização incremental...');
      
      // 1. Importar e executar análise
      const { TicketAnalyzer } = await import('./ticket-ai-analyzer.js');
      const analyzer = new TicketAnalyzer();
      
      // 2. Executar análise apenas dos últimos 30 dias
      const results = await analyzer.runIncrementalAnalysis(30);
      
      // 3. Salvar nova análise
      const analysisId = await this.saveAnalysisResults(results);
      
      // 4. Salvar novos templates
      await this.saveAITemplates(results.templates, analysisId);
      
      // 5. Atualizar templates existentes com novos dados
      await this.updateExistingTemplates(results);
      
      console.log('✅ Atualização incremental concluída');
      return true;
      
    } catch (error) {
      console.error('❌ Erro na atualização incremental:', error);
      return false;
    }
  }

  // Atualizar templates existentes
  async updateExistingTemplates(newAnalysis) {
    try {
      const existingTemplates = await this.getActiveAITemplates();
      
      for (const existingTemplate of existingTemplates) {
        // Encontrar template correspondente na nova análise
        const newTemplate = newAnalysis.templates.find(t => 
          t.area === existingTemplate.area && t.tipo === existingTemplate.tipo
        );
        
        if (newTemplate) {
          // Atualizar confiança e frequência
          const templateRef = doc(db, this.collectionName, existingTemplate.id);
          
          await updateDoc(templateRef, {
            frequency: newTemplate.frequency,
            confidence: newTemplate.confidence,
            examples: newTemplate.examples,
            updatedAt: new Date(),
            'metadata.lastAnalysisUpdate': new Date()
          });
        }
      }
      
      console.log('✅ Templates existentes atualizados');
      
    } catch (error) {
      console.error('❌ Erro ao atualizar templates existentes:', error);
    }
  }

  // ===================================
  // 📊 MÉTRICAS E RELATÓRIOS
  // ===================================

  // Obter métricas dos templates
  async getTemplateMetrics() {
    try {
      const templates = await this.getActiveAITemplates();
      
      const metrics = {
        total: templates.length,
        byStatus: {},
        byArea: {},
        byConfidence: {
          high: 0, // >= 0.8
          medium: 0, // 0.6 - 0.79
          low: 0 // < 0.6
        },
        usage: {
          totalUsage: 0,
          averageUsage: 0,
          mostUsed: null,
          leastUsed: null
        },
        feedback: {
          totalRatings: 0,
          averageRating: 0,
          positiveRatio: 0
        }
      };
      
      let totalUsage = 0;
      let totalRatings = 0;
      let totalRatingSum = 0;
      let positiveRatings = 0;
      
      templates.forEach(template => {
        // Status
        metrics.byStatus[template.status] = (metrics.byStatus[template.status] || 0) + 1;
        
        // Área
        metrics.byArea[template.area] = (metrics.byArea[template.area] || 0) + 1;
        
        // Confiança
        if (template.confidence >= 0.8) metrics.byConfidence.high++;
        else if (template.confidence >= 0.6) metrics.byConfidence.medium++;
        else metrics.byConfidence.low++;
        
        // Uso
        const usage = template.usage?.timesUsed || 0;
        totalUsage += usage;
        
        if (!metrics.usage.mostUsed || usage > metrics.usage.mostUsed.usage) {
          metrics.usage.mostUsed = { id: template.id, nome: template.nome, usage };
        }
        
        if (!metrics.usage.leastUsed || usage < metrics.usage.leastUsed.usage) {
          metrics.usage.leastUsed = { id: template.id, nome: template.nome, usage };
        }
        
        // Feedback
        const feedback = template.usage?.userFeedback || [];
        feedback.forEach(f => {
          totalRatings++;
          totalRatingSum += f.rating;
          if (f.rating >= 4) positiveRatings++;
        });
      });
      
      metrics.usage.totalUsage = totalUsage;
      metrics.usage.averageUsage = templates.length > 0 ? totalUsage / templates.length : 0;
      
      metrics.feedback.totalRatings = totalRatings;
      metrics.feedback.averageRating = totalRatings > 0 ? totalRatingSum / totalRatings : 0;
      metrics.feedback.positiveRatio = totalRatings > 0 ? positiveRatings / totalRatings : 0;
      
      return metrics;
      
    } catch (error) {
      console.error('❌ Erro ao calcular métricas:', error);
      return null;
    }
  }

  // Obter relatório de performance
  async getPerformanceReport(days = 30) {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      
      const templates = await this.getActiveAITemplates();
      
      const report = {
        period: `${days} dias`,
        summary: {
          templatesActive: templates.length,
          totalUsage: 0,
          averageRating: 0,
          adoptionRate: 0
        },
        topPerformers: [],
        lowPerformers: [],
        recommendations: []
      };
      
      // Calcular métricas de performance
      const performanceData = templates.map(template => {
        const usage = template.usage?.timesUsed || 0;
        const feedback = template.usage?.userFeedback || [];
        const recentFeedback = feedback.filter(f => 
          new Date(f.timestamp) >= startDate
        );
        
        const avgRating = recentFeedback.length > 0
          ? recentFeedback.reduce((sum, f) => sum + f.rating, 0) / recentFeedback.length
          : 0;
        
        return {
          ...template,
          performanceScore: this.calculatePerformanceScore(template, days),
          recentUsage: usage, // Simplificado - idealmente seria uso recente
          avgRating,
          feedbackCount: recentFeedback.length
        };
      });
      
      // Ordenar por performance
      performanceData.sort((a, b) => b.performanceScore - a.performanceScore);
      
      report.topPerformers = performanceData.slice(0, 5);
      report.lowPerformers = performanceData.slice(-5).reverse();
      
      // Calcular totais
      report.summary.totalUsage = performanceData.reduce((sum, t) => sum + t.recentUsage, 0);
      report.summary.averageRating = performanceData.length > 0
        ? performanceData.reduce((sum, t) => sum + t.avgRating, 0) / performanceData.length
        : 0;
      
      // Gerar recomendações
      report.recommendations = this.generatePerformanceRecommendations(performanceData);
      
      return report;
      
    } catch (error) {
      console.error('❌ Erro ao gerar relatório de performance:', error);
      return null;
    }
  }

  // Calcular score de performance
  calculatePerformanceScore(template, days) {
    const usage = template.usage?.timesUsed || 0;
    const confidence = template.confidence || 0;
    const feedback = template.usage?.userFeedback || [];
    
    const avgRating = feedback.length > 0
      ? feedback.reduce((sum, f) => sum + f.rating, 0) / feedback.length
      : 3; // Rating neutro se não há feedback
    
    // Score baseado em uso, confiança e feedback
    const usageScore = Math.min(usage / 10, 1); // Normalizar uso
    const ratingScore = avgRating / 5; // Normalizar rating
    
    return (usageScore * 0.4) + (confidence * 0.4) + (ratingScore * 0.2);
  }

  // Gerar recomendações de performance
  generatePerformanceRecommendations(performanceData) {
    const recommendations = [];
    
    // Templates com baixa performance
    const lowPerformers = performanceData.filter(t => t.performanceScore < 0.3);
    if (lowPerformers.length > 0) {
      recommendations.push({
        type: 'improvement',
        title: 'Templates com baixa performance',
        description: `${lowPerformers.length} templates precisam de revisão ou podem ser removidos`,
        action: 'review_templates',
        templates: lowPerformers.map(t => t.id)
      });
    }
    
    // Templates sem uso
    const unusedTemplates = performanceData.filter(t => t.recentUsage === 0);
    if (unusedTemplates.length > 0) {
      recommendations.push({
        type: 'optimization',
        title: 'Templates não utilizados',
        description: `${unusedTemplates.length} templates não foram usados recentemente`,
        action: 'promote_or_remove',
        templates: unusedTemplates.map(t => t.id)
      });
    }
    
    // Áreas com poucos templates
    const areaCount = {};
    performanceData.forEach(t => {
      areaCount[t.area] = (areaCount[t.area] || 0) + 1;
    });
    
    const underservedAreas = Object.entries(areaCount).filter(([area, count]) => count < 2);
    if (underservedAreas.length > 0) {
      recommendations.push({
        type: 'expansion',
        title: 'Áreas com poucos templates',
        description: `Considere gerar mais templates para: ${underservedAreas.map(([area]) => area).join(', ')}`,
        action: 'generate_more_templates',
        areas: underservedAreas.map(([area]) => area)
      });
    }
    
    return recommendations;
  }
}

// ===================================
// 🎯 INSTÂNCIA SINGLETON
// ===================================

const intelligentTemplateService = new IntelligentTemplateService();

export default intelligentTemplateService;
export { IntelligentTemplateService };

