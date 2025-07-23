import { 
  collection, 
  doc, 
  getDocs, 
  getDoc,
  query, 
  where, 
  orderBy,
  Timestamp 
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { ticketService } from './ticketService';
import { projectService } from './projectService';
import { userService } from './userService';
import { messageService } from './messageService';

export const reportService = {
  // Gerar relatório de projeto
  async generateProjectReport(projectId) {
    try {
      // Buscar dados do projeto
      const project = await projectService.getProjectById(projectId);
      if (!project) {
        throw new Error('Projeto não encontrado');
      }

      // Buscar chamados do projeto
      const tickets = await ticketService.getTicketsByProject(projectId);
      
      // Buscar usuários relacionados
      const users = await userService.getAllUsers();
      const usersMap = users.reduce((acc, user) => {
        acc[user.id] = user;
        return acc;
      }, {});

      // Calcular estatísticas
      const stats = this.calculateProjectStats(tickets);
      
      // Buscar mensagens de todos os chamados
      const allMessages = [];
      for (const ticket of tickets) {
        const messages = await messageService.getMessagesByTicket(ticket.id);
        allMessages.push(...messages.map(msg => ({ ...msg, ticketId: ticket.id, ticketTitle: ticket.titulo })));
      }

      return {
        project,
        tickets,
        users: usersMap,
        stats,
        messages: allMessages,
        generatedAt: new Date(),
        generatedBy: 'Sistema'
      };
    } catch (error) {
      console.error('Erro ao gerar relatório do projeto:', error);
      throw error;
    }
  },

  // Gerar relatório de chamado individual
  async generateTicketReport(ticketId) {
    try {
      // Buscar dados do chamado
      const ticket = await ticketService.getTicketById(ticketId);
      if (!ticket) {
        throw new Error('Chamado não encontrado');
      }

      // Buscar projeto relacionado
      let project = null;
      if (ticket.projetoId) {
        project = await projectService.getProjectById(ticket.projetoId);
      }

      // Buscar mensagens do chamado
      const messages = await messageService.getMessagesByTicket(ticketId);

      // Calcular SLAs e tempos
      const timeAnalysis = this.calculateTicketTimeAnalysis(ticket);

      return {
        ticket,
        project,
        messages,
        timeAnalysis,
        generatedAt: new Date(),
        generatedBy: 'Sistema'
      };
    } catch (error) {
      console.error('Erro ao gerar relatório do chamado:', error);
      throw error;
    }
  },

  // Calcular estatísticas do projeto
  calculateProjectStats(tickets) {
    const stats = {
      total: tickets.length,
      abertos: 0,
      emAnalise: 0,
      aguardandoAprovacao: 0,
      aprovados: 0,
      rejeitados: 0,
      emExecucao: 0,
      executadosAguardandoValidacao: 0,
      concluidos: 0,
      cancelados: 0,
      extras: 0,
      porArea: {},
      porPrioridade: {
        baixa: 0,
        media: 0,
        alta: 0,
        urgente: 0
      },
      tempoMedio: {
        criacao: 0,
        execucao: 0,
        validacao: 0
      }
    };

    tickets.forEach(ticket => {
      // Contar por status
      switch (ticket.status) {
        case 'aberto':
          stats.abertos++;
          break;
        case 'em_analise':
          stats.emAnalise++;
          break;
        case 'aguardando_aprovacao':
          stats.aguardandoAprovacao++;
          break;
        case 'aprovado':
          stats.aprovados++;
          break;
        case 'rejeitado':
          stats.rejeitados++;
          break;
        case 'em_execucao':
          stats.emExecucao++;
          break;
        case 'executado_aguardando_validacao':
          stats.executadosAguardandoValidacao++;
          break;
        case 'concluido':
          stats.concluidos++;
          break;
        case 'cancelado':
          stats.cancelados++;
          break;
      }

      // Contar extras
      if (ticket.isExtra) {
        stats.extras++;
      }

      // Contar por área
      if (ticket.area) {
        stats.porArea[ticket.area] = (stats.porArea[ticket.area] || 0) + 1;
      }

      // Contar por prioridade
      if (ticket.prioridade) {
        stats.porPrioridade[ticket.prioridade] = (stats.porPrioridade[ticket.prioridade] || 0) + 1;
      }
    });

    return stats;
  },

  // Calcular análise de tempo do chamado
  calculateTicketTimeAnalysis(ticket) {
    const analysis = {
      tempoTotal: null,
      tempoExecucao: null,
      tempoValidacao: null,
      slaOperacao: ticket.slaOperacao || null,
      slaValidacao: ticket.slaValidacao || null,
      slaOperacaoAtendido: null,
      slaValidacaoAtendido: null
    };

    const createdAt = ticket.createdAt?.toDate?.() || new Date(ticket.createdAt);
    const now = new Date();

    // Calcular tempo total
    if (ticket.status === 'concluido' && ticket.validadoEm) {
      const completedAt = ticket.validadoEm.toDate?.() || new Date(ticket.validadoEm);
      analysis.tempoTotal = Math.round((completedAt - createdAt) / (1000 * 60)); // em minutos
    } else {
      analysis.tempoTotal = Math.round((now - createdAt) / (1000 * 60)); // em minutos
    }

    // Calcular tempo de execução
    if (ticket.executadoEm) {
      const executedAt = ticket.executadoEm.toDate?.() || new Date(ticket.executadoEm);
      analysis.tempoExecucao = Math.round((executedAt - createdAt) / (1000 * 60)); // em minutos
      
      // Verificar SLA de operação
      if (analysis.slaOperacao) {
        analysis.slaOperacaoAtendido = analysis.tempoExecucao <= analysis.slaOperacao;
      }
    }

    // Calcular tempo de validação
    if (ticket.executadoEm && ticket.validadoEm) {
      const executedAt = ticket.executadoEm.toDate?.() || new Date(ticket.executadoEm);
      const validatedAt = ticket.validadoEm.toDate?.() || new Date(ticket.validadoEm);
      analysis.tempoValidacao = Math.round((validatedAt - executedAt) / (1000 * 60)); // em minutos
      
      // Verificar SLA de validação
      if (analysis.slaValidacao) {
        analysis.slaValidacaoAtendido = analysis.tempoValidacao <= analysis.slaValidacao;
      }
    }

    return analysis;
  },

  // Gerar relatório em formato Markdown
  generateMarkdownReport(reportData, type = 'project') {
    if (type === 'project') {
      return this.generateProjectMarkdown(reportData);
    } else if (type === 'ticket') {
      return this.generateTicketMarkdown(reportData);
    }
  },

  // Gerar Markdown para relatório de projeto
  generateProjectMarkdown(data) {
    const { project, tickets, stats, messages, generatedAt } = data;
    
    let markdown = `# Relatório do Projeto: ${project.nome}\n\n`;
    
    // Informações do projeto
    markdown += `## Informações do Projeto\n\n`;
    markdown += `**Nome:** ${project.nome}\n`;
    markdown += `**Feira:** ${project.feira}\n`;
    markdown += `**Local:** ${project.local}\n`;
    if (project.dataInicio) {
      markdown += `**Data de Início:** ${new Date(project.dataInicio.seconds * 1000).toLocaleDateString('pt-BR')}\n`;
    }
    if (project.dataFim) {
      markdown += `**Data de Fim:** ${new Date(project.dataFim.seconds * 1000).toLocaleDateString('pt-BR')}\n`;
    }
    markdown += `**Status:** ${project.status?.replace('_', ' ').toUpperCase()}\n\n`;
    
    if (project.descricao) {
      markdown += `**Descrição:** ${project.descricao}\n\n`;
    }

    // Estatísticas gerais
    markdown += `## Estatísticas Gerais\n\n`;
    markdown += `**Total de Chamados:** ${stats.total}\n`;
    markdown += `**Chamados Concluídos:** ${stats.concluidos}\n`;
    markdown += `**Chamados em Andamento:** ${stats.emExecucao + stats.executadosAguardandoValidacao}\n`;
    markdown += `**Chamados Extras:** ${stats.extras}\n`;
    markdown += `**Taxa de Conclusão:** ${stats.total > 0 ? Math.round((stats.concluidos / stats.total) * 100) : 0}%\n\n`;

    // Distribuição por status
    markdown += `## Distribuição por Status\n\n`;
    markdown += `| Status | Quantidade |\n`;
    markdown += `|--------|------------|\n`;
    markdown += `| Abertos | ${stats.abertos} |\n`;
    markdown += `| Em Análise | ${stats.emAnalise} |\n`;
    markdown += `| Aguardando Aprovação | ${stats.aguardandoAprovacao} |\n`;
    markdown += `| Aprovados | ${stats.aprovados} |\n`;
    markdown += `| Em Execução | ${stats.emExecucao} |\n`;
    markdown += `| Executados - Aguardando Validação | ${stats.executadosAguardandoValidacao} |\n`;
    markdown += `| Concluídos | ${stats.concluidos} |\n`;
    markdown += `| Rejeitados | ${stats.rejeitados} |\n`;
    markdown += `| Cancelados | ${stats.cancelados} |\n\n`;

    // Distribuição por área
    if (Object.keys(stats.porArea).length > 0) {
      markdown += `## Distribuição por Área\n\n`;
      markdown += `| Área | Quantidade |\n`;
      markdown += `|------|------------|\n`;
      Object.entries(stats.porArea).forEach(([area, count]) => {
        markdown += `| ${area.replace('_', ' ').toUpperCase()} | ${count} |\n`;
      });
      markdown += `\n`;
    }

    // Distribuição por prioridade
    markdown += `## Distribuição por Prioridade\n\n`;
    markdown += `| Prioridade | Quantidade |\n`;
    markdown += `|------------|------------|\n`;
    markdown += `| Baixa | ${stats.porPrioridade.baixa} |\n`;
    markdown += `| Média | ${stats.porPrioridade.media} |\n`;
    markdown += `| Alta | ${stats.porPrioridade.alta} |\n`;
    markdown += `| Urgente | ${stats.porPrioridade.urgente} |\n\n`;

    // Lista de chamados
    markdown += `## Lista de Chamados\n\n`;
    tickets.forEach((ticket, index) => {
      markdown += `### ${index + 1}. ${ticket.titulo}\n\n`;
      markdown += `**Status:** ${ticket.status?.replace('_', ' ').toUpperCase()}\n`;
      markdown += `**Prioridade:** ${ticket.prioridade?.toUpperCase()}\n`;
      markdown += `**Área:** ${ticket.area?.replace('_', ' ').toUpperCase()}\n`;
      markdown += `**Criado por:** ${ticket.criadoPorNome}\n`;
      markdown += `**Data de Criação:** ${ticket.createdAt?.toDate?.()?.toLocaleString('pt-BR') || 'Data não disponível'}\n`;
      if (ticket.isExtra) {
        markdown += `**Tipo:** PEDIDO EXTRA\n`;
        if (ticket.motivoExtra) {
          markdown += `**Motivo:** ${ticket.motivoExtra}\n`;
        }
      }
      markdown += `**Descrição:** ${ticket.descricao}\n\n`;
    });

    // Histórico de comunicação
    if (messages.length > 0) {
      markdown += `## Histórico de Comunicação\n\n`;
      messages.sort((a, b) => new Date(a.createdAt?.toDate?.() || a.createdAt) - new Date(b.createdAt?.toDate?.() || b.createdAt));
      
      messages.forEach(message => {
        markdown += `**${message.ticketTitle}** - ${message.autorNome} (${message.createdAt?.toDate?.()?.toLocaleString('pt-BR') || 'Data não disponível'})\n`;
        markdown += `${message.texto}\n\n`;
      });
    }

    // Rodapé
    markdown += `---\n\n`;
    markdown += `**Relatório gerado em:** ${generatedAt.toLocaleString('pt-BR')}\n`;
    markdown += `**Sistema:** Gestão de Chamados - Montagem de Stands\n`;

    return markdown;
  },

  // Gerar Markdown para relatório de chamado
  generateTicketMarkdown(data) {
    const { ticket, project, messages, timeAnalysis, generatedAt } = data;
    
    let markdown = `# Relatório do Chamado: ${ticket.titulo}\n\n`;
    
    // Informações básicas
    markdown += `## Informações Básicas\n\n`;
    markdown += `**ID:** ${ticket.id}\n`;
    markdown += `**Título:** ${ticket.titulo}\n`;
    markdown += `**Status:** ${ticket.status?.replace('_', ' ').toUpperCase()}\n`;
    markdown += `**Prioridade:** ${ticket.prioridade?.toUpperCase()}\n`;
    markdown += `**Área Responsável:** ${ticket.area?.replace('_', ' ').toUpperCase()}\n`;
    markdown += `**Tipo:** ${ticket.tipo?.replace('_', ' ').toUpperCase()}\n`;
    markdown += `**Criado por:** ${ticket.criadoPorNome}\n`;
    markdown += `**Data de Criação:** ${ticket.createdAt?.toDate?.()?.toLocaleString('pt-BR') || 'Data não disponível'}\n`;
    
    if (ticket.isExtra) {
      markdown += `**Locação Inicial:** SIM\n`;
      if (ticket.motivoExtra) {
        markdown += `**Motivo do Extra:** ${ticket.motivoExtra}\n`;
      }
    }
    markdown += `\n`;

    // Projeto relacionado
    if (project) {
      markdown += `## Projeto Relacionado\n\n`;
      markdown += `**Nome:** ${project.nome}\n`;
      markdown += `**Feira:** ${project.feira}\n`;
      markdown += `**Local:** ${project.local}\n\n`;
    }

    // Descrição
    markdown += `## Descrição\n\n`;
    markdown += `${ticket.descricao}\n\n`;

    if (ticket.observacoes) {
      markdown += `## Observações\n\n`;
      markdown += `${ticket.observacoes}\n\n`;
    }

    // Análise de tempo e SLAs
    markdown += `## Análise de Tempo e SLAs\n\n`;
    markdown += `**Tempo Total:** ${timeAnalysis.tempoTotal} minutos (${Math.round(timeAnalysis.tempoTotal / 60 * 100) / 100} horas)\n`;
    
    if (timeAnalysis.tempoExecucao) {
      markdown += `**Tempo de Execução:** ${timeAnalysis.tempoExecucao} minutos\n`;
      if (timeAnalysis.slaOperacao) {
        markdown += `**SLA de Operação:** ${timeAnalysis.slaOperacao} minutos - ${timeAnalysis.slaOperacaoAtendido ? '✅ ATENDIDO' : '❌ NÃO ATENDIDO'}\n`;
      }
    }
    
    if (timeAnalysis.tempoValidacao) {
      markdown += `**Tempo de Validação:** ${timeAnalysis.tempoValidacao} minutos\n`;
      if (timeAnalysis.slaValidacao) {
        markdown += `**SLA de Validação:** ${timeAnalysis.slaValidacao} minutos - ${timeAnalysis.slaValidacaoAtendido ? '✅ ATENDIDO' : '❌ NÃO ATENDIDO'}\n`;
      }
    }
    markdown += `\n`;

    // Histórico de comunicação
    if (messages.length > 0) {
      markdown += `## Histórico de Comunicação\n\n`;
      messages.forEach(message => {
        const autorNome = message.remetenteNome || message.autorNome || 'Usuário não identificado';
        const conteudo = message.conteudo || message.texto || 'Conteúdo não disponível';
        const dataFormatada = message.criadoEm ? 
          (message.criadoEm.toDate?.()?.toLocaleString('pt-BR') || new Date(message.criadoEm).toLocaleString('pt-BR')) :
          (message.createdAt?.toDate?.()?.toLocaleString('pt-BR') || 'Data não disponível');
        
        markdown += `**${autorNome}** (${dataFormatada})\n`;
        markdown += `${conteudo}\n\n`;
      });
    }

    // Timeline
    markdown += `## Timeline\n\n`;
    markdown += `- **Criado:** ${ticket.createdAt?.toDate?.()?.toLocaleString('pt-BR') || 'Data não disponível'}\n`;
    
    // Adicionar histórico de escalações e tratativas
    if (ticket.areaAnterior) {
      markdown += `- **Escalado de:** ${ticket.areaAnterior?.replace('_', ' ').toUpperCase()}\n`;
    }
    
    if (ticket.escaladoPara) {
      markdown += `- **Escalado para:** ${ticket.escaladoPara?.replace('_', ' ').toUpperCase()}\n`;
    }
    
    if (ticket.atualizadoPorFuncao && ticket.atualizadoEm) {
      const dataAtualizacao = ticket.atualizadoEm?.toDate?.()?.toLocaleString('pt-BR') || 
                             new Date(ticket.atualizadoEm).toLocaleString('pt-BR');
      markdown += `- **Última atualização por ${ticket.atualizadoPorFuncao}:** ${dataAtualizacao}\n`;
    }
    
    if (ticket.executadoEm) {
      markdown += `- **Executado:** ${ticket.executadoEm?.toDate?.()?.toLocaleString('pt-BR')}\n`;
    }
    if (ticket.validadoEm) {
      markdown += `- **Validado:** ${ticket.validadoEm?.toDate?.()?.toLocaleString('pt-BR')}\n`;
    } else {
      markdown += `- **Validado:** undefined\n`;
    }
    markdown += `\n`;

    // Seção de áreas que deram tratativa
    markdown += `## Áreas que Deram Tratativa\n\n`;
    
    const areasEnvolvidas = [];
    
    // Área inicial
    if (ticket.area) {
      areasEnvolvidas.push(`**${ticket.area?.replace('_', ' ').toUpperCase()}** - Área responsável atual`);
    }
    
    // Área anterior (se foi escalado)
    if (ticket.areaAnterior && ticket.areaAnterior !== ticket.area) {
      areasEnvolvidas.push(`**${ticket.areaAnterior?.replace('_', ' ').toUpperCase()}** - Área anterior (escalado)`);
    }
    
    // Gerência (se foi escalado para gerência)
    if (ticket.areaGerencia) {
      areasEnvolvidas.push(`**${ticket.areaGerencia?.replace('gerente_', '').replace('_', ' ').toUpperCase()}** - Gerência responsável`);
    }
    
    if (areasEnvolvidas.length > 0) {
      areasEnvolvidas.forEach(area => {
        markdown += `- ${area}\n`;
      });
    } else {
      markdown += `- Apenas a área **${ticket.area?.replace('_', ' ').toUpperCase()}** deu tratativa\n`;
    }
    
    markdown += `\n`;

    // Rodapé
    markdown += `---\n\n`;
    markdown += `**Relatório gerado em:** ${generatedAt.toLocaleString('pt-BR')}\n`;
    markdown += `**Sistema:** Gestão de Chamados - Montagem de Stands\n`;

    return markdown;
  }
};

