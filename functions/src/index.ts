import * as admin from 'firebase-admin';
import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

// Inicializar Firebase Admin
admin.initializeApp();

// URL da aplicação
const APP_URL = 'https://nbzeukei.manus.space';

// URL do serviço SendGrid
const SENDGRID_SERVICE_URL = 'https://p9hwiqcl8p89.manus.space';

// Interface para dados do chamado
interface TicketData {
  id?: string;
  titulo: string;
  descricao: string;
  area: string;
  status: string;
  prioridade: string;
  projetoId: string;
  criadoPor: string;
  criadoPorNome: string;
  criadoPorFuncao: string;
  responsavelAtual?: string;
  areaDeOrigem?: string;
  createdAt: any;
  updatedAt: any;
}

// Interface para dados do projeto
interface ProjectData {
  nome: string;
  produtorId?: string;
  consultorId?: string;
  gerenteId?: string;
}

// Interface para dados do usuário
interface UserData {
  nome: string;
  email: string;
  funcao: string;
  area?: string;
}

// Função auxiliar para buscar dados do projeto
async function getProjectData(projectId: string): Promise<ProjectData | null> {
  try {
    const projectDoc = await admin.firestore()
      .collection('projetos')
      .doc(projectId)
      .get();
    
    if (projectDoc.exists) {
      return projectDoc.data() as ProjectData;
    }
    return null;
  } catch (error) {
    console.error('Erro ao buscar dados do projeto:', error);
    return null;
  }
}

// Função auxiliar para buscar dados do usuário
async function getUserData(userId: string): Promise<UserData | null> {
  try {
    const userDoc = await admin.firestore()
      .collection('usuarios')
      .doc(userId)
      .get();
    
    if (userDoc.exists) {
      return userDoc.data() as UserData;
    }
    return null;
  } catch (error) {
    console.error('Erro ao buscar dados do usuário:', error);
    return null;
  }
}

// Função auxiliar para buscar usuários por área
async function getUsersByArea(area: string): Promise<UserData[]> {
  try {
    const usersSnapshot = await admin.firestore()
      .collection('usuarios')
      .where('area', '==', area)
      .get();
    
    const users: UserData[] = [];
    usersSnapshot.forEach(doc => {
      const userData = doc.data() as UserData;
      if (userData.email) {
        users.push(userData);
      }
    });
    
    return users;
  } catch (error) {
    console.error('Erro ao buscar usuários por área:', error);
    return [];
  }
}

// Função auxiliar para buscar gerentes por função
async function getManagersByFunction(funcao: string): Promise<UserData[]> {
  try {
    const managersSnapshot = await admin.firestore()
      .collection('usuarios')
      .where('funcao', '==', funcao)
      .get();
    
    const managers: UserData[] = [];
    managersSnapshot.forEach(doc => {
      const userData = doc.data() as UserData;
      if (userData.email) {
        managers.push(userData);
      }
    });
    
    return managers;
  } catch (error) {
    console.error('Erro ao buscar gerentes:', error);
    return [];
  }
}

// Função auxiliar para enviar e-mail via SendGrid
async function sendEmailViaSendGrid(
  recipients: string[], 
  subject: string, 
  eventType: string, 
  ticketData: TicketData, 
  projectData: ProjectData | null,
  additionalData: any = {}
) {
  try {
    const emailData = {
      recipients,
      subject,
      eventType,
      ticket: ticketData,
      project: projectData,
      systemUrl: `${APP_URL}/chamado/${ticketData.id}`,
      ...additionalData
    };

    const response = await fetch(`${SENDGRID_SERVICE_URL}/send-notification`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(emailData)
    });

    if (!response.ok) {
      throw new Error(`Erro HTTP: ${response.status}`);
    }

    const result = await response.json();
    console.log(`✅ E-mail enviado via SendGrid para ${recipients.length} destinatário(s):`, recipients);
    return result;
  } catch (error) {
    console.error('❌ Erro ao enviar e-mail via SendGrid:', error);
    throw error;
  }
}
// Função principal para monitorar atualizações de chamados
export const onTicketUpdated = onDocumentUpdated('chamados/{ticketId}', async (event) => {
  const beforeSnap = event.data?.before;
  const afterSnap = event.data?.after;

  if (!beforeSnap || !afterSnap) {
    console.log('Dados de before/after não disponíveis');
    return;
  }

  const before = beforeSnap.data() as TicketData;
  const after = afterSnap.data() as TicketData;
  const ticketId = event.params.ticketId;

  // Adicionar ID do chamado aos dados
  after.id = ticketId;

  try {
    console.log(`🔄 Processando atualização do chamado ${ticketId}`);
    console.log(`Status: ${before.status} → ${after.status}`);
    console.log(`Área: ${before.area} → ${after.area}`);

    // Buscar dados do projeto
    const projectData = await getProjectData(after.projetoId);
    if (!projectData) {
      console.error('Dados do projeto não encontrados');
      return;
    }

    // 1. CHAMADO INICIA TRATATIVA
    if (before.status !== 'em_tratativa' && after.status === 'em_tratativa') {
      await handleTicketStartedTreatment(after, projectData);
    }
    // Também verificar se mudou para em_execucao
    else if (before.status !== 'em_execucao' && after.status === 'em_execucao') {
      await handleTicketStartedTreatment(after, projectData);
    }

    // 2. CHAMADO ESCALADO PARA UMA ÁREA
    else if (before.area !== after.area) {
      await handleTicketEscalatedToArea(before, after, projectData);
    }

    // 3. CHAMADO ESCALADO PARA GERENTE (APROVAÇÃO)
    else if (before.status !== 'aguardando_aprovacao' && after.status === 'aguardando_aprovacao') {
      await handleTicketEscalatedToManager(after, projectData);
    }

    // 4. DEVOLUTIVA DO GERENTE (APROVADO/REJEITADO)
    else if (before.status === 'aguardando_aprovacao' && 
             (after.status === 'aprovado' || after.status === 'rejeitado')) {
      await handleManagerDecision(before, after, projectData);
    }

    // 5. CHAMADO EXECUTADO PELO OPERADOR
    else if (before.status !== 'executado_aguardando_validacao' && 
             after.status === 'executado_aguardando_validacao') {
      await handleTicketExecuted(after, projectData);
    }

    console.log(`✅ Processamento de atualização concluído para chamado ${ticketId}`);

  } catch (error) {
    console.error(`❌ Erro ao processar atualização do chamado ${ticketId}:`, error);
  }
});

// 1. Função para tratar início de tratativa
async function handleTicketStartedTreatment(ticket: TicketData, project: ProjectData) {
  console.log('📋 Processando início de tratativa');
  
  const recipients: string[] = [];

  // Notificar Produtor do projeto
  if (project.produtorId) {
    const producer = await getUserData(project.produtorId);
    if (producer?.email) {
      recipients.push(producer.email);
    }
  }

  // Notificar Consultor do projeto
  if (project.consultorId) {
    const consultant = await getUserData(project.consultorId);
    if (consultant?.email) {
      recipients.push(consultant.email);
    }
  }

  if (recipients.length > 0) {
    await sendEmailViaSendGrid(
      recipients,
      `Chamado em Andamento: ${ticket.titulo}`,
      'ticket_started_treatment',
      ticket,
      project
    );
  }
}

// 2. Função para tratar escalação para área
async function handleTicketEscalatedToArea(before: TicketData, after: TicketData, project: ProjectData) {
  console.log(`🔄 Processando escalação de área: ${before.area} → ${after.area}`);
  
  const recipients: string[] = [];

  // Notificar todos os operadores da nova área de destino
  const areaUsers = await getUsersByArea(after.area);
  areaUsers.forEach(user => {
    if (user.email && !recipients.includes(user.email)) {
      recipients.push(user.email);
    }
  });

  // Notificar Produtor do projeto
  if (project.produtorId) {
    const producer = await getUserData(project.produtorId);
    if (producer?.email && !recipients.includes(producer.email)) {
      recipients.push(producer.email);
    }
  }

  // Notificar Consultor do projeto
  if (project.consultorId) {
    const consultant = await getUserData(project.consultorId);
    if (consultant?.email && !recipients.includes(consultant.email)) {
      recipients.push(consultant.email);
    }
  }

  if (recipients.length > 0) {
    const areaName = after.area.replace('_', ' ').toUpperCase();
    await sendEmailViaSendGrid(
      recipients,
      `Chamado Escalado para ${areaName}: ${after.titulo}`,
      'ticket_escalated_to_area',
      after,
      project,
      { 
        previousArea: before.area,
        newArea: after.area,
        areaName 
      }
    );
  }
}

// 3. Função para tratar escalação para gerente
async function handleTicketEscalatedToManager(ticket: TicketData, project: ProjectData) {
  console.log('👔 Processando escalação para gerente');
  
  const recipients: string[] = [];

  // Notificar o gerente da área responsável pela aprovação
  // Mapear área para tipo de gerente
  let managerFunction = '';
  switch (ticket.area) {
    case 'compras':
    case 'locacao':
    case 'operacional':
    case 'logistica':
      managerFunction = 'gerente_operacional';
      break;
    case 'comercial':
      managerFunction = 'gerente_comercial';
      break;
    case 'producao':
    case 'almoxarifado':
      managerFunction = 'gerente_producao';
      break;
    case 'financeiro':
      managerFunction = 'gerente_financeiro';
      break;
    default:
      managerFunction = 'gerente'; // Fallback para gerente genérico
  }

  const managers = await getManagersByFunction(managerFunction);
  managers.forEach(manager => {
    if (manager.email && !recipients.includes(manager.email)) {
      recipients.push(manager.email);
    }
  });

  // Notificar Produtor do projeto
  if (project.produtorId) {
    const producer = await getUserData(project.produtorId);
    if (producer?.email && !recipients.includes(producer.email)) {
      recipients.push(producer.email);
    }
  }

  // Notificar Consultor do projeto
  if (project.consultorId) {
    const consultant = await getUserData(project.consultorId);
    if (consultant?.email && !recipients.includes(consultant.email)) {
      recipients.push(consultant.email);
    }
  }

  if (recipients.length > 0) {
    await sendEmailViaSendGrid(
      recipients,
      `Aprovação Necessária: ${ticket.titulo}`,
      'ticket_escalated_to_manager',
      ticket,
      project,
      { managerFunction }
    );
  }
}

// 4. Função para tratar decisão do gerente
async function handleManagerDecision(before: TicketData, after: TicketData, project: ProjectData) {
  console.log(`✅ Processando decisão do gerente: ${after.status}`);
  
  const recipients: string[] = [];

  // Notificar Produtor do projeto
  if (project.produtorId) {
    const producer = await getUserData(project.produtorId);
    if (producer?.email) {
      recipients.push(producer.email);
    }
  }

  // Notificar Consultor do projeto
  if (project.consultorId) {
    const consultant = await getUserData(project.consultorId);
    if (consultant?.email && !recipients.includes(consultant.email)) {
      recipients.push(consultant.email);
    }
  }

  if (recipients.length > 0) {
    const decision = after.status === 'aprovado' ? 'Aprovado' : 'Rejeitado';
    await sendEmailViaSendGrid(
      recipients,
      `Chamado ${decision}: ${after.titulo}`,
      'manager_decision',
      after,
      project,
      { 
        decision: after.status,
        previousStatus: before.status 
      }
    );
  }
}// 5. Função para tratar chamado executado pelo operador
async function handleTicketExecuted(ticket: TicketData, project: ProjectData) {
  console.log('🎯 Processando chamado executado');
  
  // NOVO FLUXO CONDICIONAL: Verificar se foi criado por operador
  const isCreatedByOperator = ticket.criadoPorFuncao && ticket.criadoPorFuncao.startsWith('operador_');
  
  if (isCreatedByOperator) {
    console.log('🔄 Chamado criado por operador - retornando para validação do operador original');
    
    // AÇÃO 1: Alterar status para aguardar validação do operador
    // AÇÃO 2: Alterar responsável de volta para o criador
    // AÇÃO 3: Alterar área de volta para a área do operador
    try {
      const creatorData = await getUserData(ticket.criadoPor);
      const updateData: any = {
        status: 'executado_aguardando_validacao_operador',
        responsavelAtual: ticket.criadoPor,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      };
      
      // Se conseguir buscar dados do criador, usar sua área
      if (creatorData?.area) {
        updateData.area = creatorData.area;
      } else if (ticket.areaDeOrigem) {
        // Fallback para área de origem se disponível
        updateData.area = ticket.areaDeOrigem;
      }
      
      // Atualizar o chamado no Firestore
      await admin.firestore()
        .collection('chamados')
        .doc(ticket.id!)
        .update(updateData);
      
      console.log(`✅ Chamado ${ticket.id} retornado para validação do operador ${ticket.criadoPor}`);
      
      // Notificar apenas o operador que criou o chamado
      if (creatorData?.email) {
        await sendEmailViaSendGrid(
          [creatorData.email],
          `Chamado Concluído - Aguardando sua Validação: ${ticket.titulo}`,
          'ticket_executed_operator_validation',
          ticket,
          project
        );
      }
      
    } catch (error) {
      console.error('❌ Erro ao retornar chamado para operador:', error);
      // Em caso de erro, seguir fluxo padrão
      await handleTicketExecutedStandardFlow(ticket, project);
    }
    
  } else {
    console.log('📋 Chamado criado por produtor/consultor - seguindo fluxo padrão');
    // FLUXO PADRÃO: Manter lógica atual para produtores/consultores
    await handleTicketExecutedStandardFlow(ticket, project);
  }
}

// Função auxiliar para fluxo padrão (produtor/consultor)
async function handleTicketExecutedStandardFlow(ticket: TicketData, project: ProjectData) {
  const recipients: string[] = [];

  // Notificar Produtor do projeto
  if (project.produtorId) {
    const producer = await getUserData(project.produtorId);
    if (producer?.email) {
      recipients.push(producer.email);
    }
  }

  // Notificar Consultor do projeto
  if (project.consultorId) {
    const consultant = await getUserData(project.consultorId);
    if (consultant?.email && !recipients.includes(consultant.email)) {
      recipients.push(consultant.email);
    }
  }

  if (recipients.length > 0) {
    await sendEmailViaSendGrid(
      recipients,
      `Chamado Concluído - Aguardando sua Validação: ${ticket.titulo}`,
      'ticket_executed',
      ticket,
      project
    );
  }
}

// Função para upload de imagens
export const uploadImage = onCall<{ imageData: string, fileName: string, ticketId: string }, Promise<{ url: string }>>(async (request) => {
  // Verificar autenticação
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Usuário não autenticado");
  }

  const { imageData, fileName, ticketId } = request.data;
  
  if (!imageData || !fileName || !ticketId) {
    throw new HttpsError("invalid-argument", "Dados inválidos");
  }

  try {
    // Converter base64 para buffer
    const buffer = Buffer.from(imageData, "base64");
    
    // Criar referência no Storage
    const bucket = admin.storage().bucket();
    const file = bucket.file(`chamados/${ticketId}/${fileName}`);
    
    // Upload do arquivo
    await file.save(buffer, {
      metadata: {
        contentType: "image/jpeg", // ou detectar automaticamente
        metadata: {
          uploadedBy: request.auth.uid,
          ticketId: ticketId
        }
      }
    });

    // Tornar o arquivo público (opcional)
    await file.makePublic();

    // Retornar URL pública
    const publicUrl = `https://storage.googleapis.com/${bucket.name}/${file.name}`;
    
    return { url: publicUrl };

  } catch (error) {
    console.error("Erro no upload da imagem:", error);
    throw new HttpsError("internal", "Erro interno do servidor");
  }
});

