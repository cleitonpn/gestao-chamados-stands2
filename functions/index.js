// functions/index.js
// ARQUIVO FINAL MESCLADO (Push + App) E CORRIGIDO (onProjetoCreated)

// ==========================================================
// IMPORTS
// ==========================================================
import { onRequest, onCall, HttpsError } from "firebase-functions/v2/https";
import { onDocumentCreated, onDocumentUpdated } from "firebase-functions/v2/firestore";
import * as logger from "firebase-functions/logger";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";
import { getStorage } from "firebase-admin/storage";

// ==========================================================
// INICIALIZAÇÃO DO FIREBASE
// ==========================================================
if (!getApps().length) initializeApp();
const db = getFirestore();
const storage = getStorage();

// Constantes
const APP_URL = 'https://nbzeukei.manus.space';
const SENDGRID_SERVICE_URL = 'https://p9hwiqcl8p89.manus.space';
const MESSAGES_COLLECTION = "mensagens";
const TICKETS_COLLECTION = "tickets";
const USERS_COLLECTION = "usuarios";
const NOTIFICATIONS_COLL = "notifications";
const PROJETOS_COLLECTION = "projetos";

// ==========================================================
// HELPER FUNCTIONS (Lógica do App)
// ==========================================================
async function getProjectData(projectId) {
    try {
        const projectDoc = await db.collection('projetos').doc(projectId).get();
        if (projectDoc.exists) {
            return projectDoc.data();
        }
        return null;
    } catch (error) {
        console.error('Erro ao buscar dados do projeto:', error);
        return null;
    }
}
async function getUserData(userId) {
    try {
        const userDoc = await db.collection('usuarios').doc(userId).get();
        if (userDoc.exists) {
            return userDoc.data();
        }
        return null;
    } catch (error) {
        console.error('Erro ao buscar dados do usuário:', error);
        return null;
    }
}
async function getUsersByArea(area) {
    try {
        const usersSnapshot = await db.collection('usuarios').where('area', '==', area).get();
        const users = [];
        usersSnapshot.forEach(doc => {
            const userData = doc.data();
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
async function getManagersByFunction(funcao) {
    try {
        const managersSnapshot = await db.collection('usuarios').where('funcao', '==', funcao).get();
        const managers = [];
        managersSnapshot.forEach(doc => {
            const userData = doc.data();
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
async function sendEmailViaSendGrid(recipients, subject, eventType, ticketData, projectData, additionalData = {}) {
    try {
        const emailData = { 
            recipients,
            subject,
            eventType, ticket: ticketData, project: projectData, 
            systemUrl: `${APP_URL}/chamado/${ticketData.id}`, 
            ...additionalData 
        };
        const response = await fetch(`${SENDGRID_SERVICE_URL}/send-notification`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
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

// ==========================================================
// HELPER FUNCTIONS (Push)
// ==========================================================
async function getUserTokens(uid) {
  if (!uid) return [];
  try {
    const userRef = db.collection(USERS_COLLECTION).doc(uid);
    const snap = await userRef.get();
    const uniq = new Set();
    if (snap.exists) {
      const data = snap.data() || {};
      if (Array.isArray(data.fcmTokens)) data.fcmTokens.forEach(t => t && uniq.add(t));
      if (Array.isArray(data.pushTokens)) data.pushTokens.forEach(t => t && uniq.add(t));
    }
    const tokensCol = await userRef.collection("tokens").get();
    tokensCol.forEach(d => { const t = d.get("token"); if (t) uniq.add(t); });
    const devicesCol = await userRef.collection("devices").get();
    devicesCol.forEach(d => { const t = d.get("fcmToken") || d.get("token"); if (t) uniq.add(t); });
    return [...uniq];
  } catch (e) {
    logger.error("getUserTokens error", e);
    return [];
  }
}

async function pushAndPersist({ recipientId, title, body, data }) {
  await db.collection(NOTIFICATIONS_COLL).add({
    recipientId,
    title,
    body,
    data: data || {},
    read: false,
    createdAt: new Date(),
  });
  const tokens = await getUserTokens(recipientId);
  if (!tokens.length) {
    logger.warn(`Nenhum token encontrado para o usuário: ${recipientId}`);
    return;
  }
  logger.info(`Enviando push para ${recipientId} (${tokens.length} tokens)`);
  try {
    await getMessaging().sendEachForMulticast({
      tokens,
      notification: { title, body },
      data: Object.fromEntries(Object.entries(data || {}).map(([k, v]) => [k, String(v)])),
      android: { priority: "high" },
      apns: { payload: { aps: { sound: "default" } } },
      webpush: { headers: { Urgency: "high" } },
    });
  } catch (e) {
    logger.error("FCM send error", e);
  }
}

// =================================================================
// ||        ✅ EXPORTS DAS FUNÇÕES (TODAS JUNTAS)         ||
// =================================================================

// --- Funções de Notificação Push ---

export const notify = onRequest({ cors: true }, async (req, res) => {
  try {
    const { recipientId, title, body, data } =
      req.method === "POST" ? req.body : req.query;
    if (!recipientId || !title || !body) {
      res.status(400).json({ ok: false, error: "recipientId, title e body são obrigatórios" });
      return;
    }
    await pushAndPersist({
      recipientId: String(recipientId),
      title: String(title),
      body: String(body),
      data: data || {},
    });
    res.json({ ok: true });
  } catch (e) {
    logger.error(e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

export const onMensagemCreated = onDocumentCreated(
  `${MESSAGES_COLLECTION}/{mensagemId}`,
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    const msg = snap.data();
    const ticketId = msg.ticketId || "";
    const actorId = msg.userId || "";
    let ticketOwnerId = null;
    if (ticketId) {
      const t = await db.collection(TICKETS_COLLECTION).doc(ticketId).get();
      if (t.exists) {
        const td = t.data() || {};
        ticketOwnerId = td.userId || td.createdBy || td.openedById || null;
      }
    }
    const texto = (msg.conteudo && String(msg.conteudo).replace(/\*\*/g, "")) || "Nova mensagem";
    const titulo = msg.type === "status_update" ? "Atualização no chamado" : "Nova mensagem";
    const body = ticketId ? `${texto} (Chamado: ${ticketId})` : texto;
    const ids = new Set([actorId, ticketOwnerId].filter(Boolean));
    await Promise.all(
      [...ids].map((uid) =>
        pushAndPersist({
          recipientId: uid,
          title: titulo,
          body,
          data: {
            ticketId,
            mensagemId: snap.id,
            type: msg.type || "mensagem",
            url: `/chamado/${ticketId}`
          },
        })
      )
    );
  }
);

// ⬇️⬇️ FUNÇÃO onProjetoCreated CORRIGIDA ⬇️⬇️
export const onProjetoCreated = onDocumentCreated(
  `${PROJETOS_COLLECTION}/{projetoId}`,
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    const projeto = snap.data();
    logger.info(`Novo projeto detectado: ${snap.id}`, projeto);

    // CORREÇÃO: Procurando por 'consultorId' e 'produtorId'
    const consultorId = projeto.consultorId || projeto.consultorUid;
    const produtorId = projeto.produtorId || projeto.produtorUid;

    if (!consultorId && !produtorId) {
      // Log corrigido
      logger.warn("Projeto criado sem 'consultorId' ou 'produtorId'. Nenhuma notificação enviada.");
      return;
    }
    
    const titulo = "Novo Projeto Criado!";
    const body = `Você foi associado ao projeto: ${projeto.nome || snap.id}`;
    
    const recipientIds = new Set();
    if (consultorId) recipientIds.add(consultorId);
    if (produtorId) recipientIds.add(produtorId);
    
    await Promise.all(
      [...recipientIds].map((uid) =>
        pushAndPersist({
          recipientId: uid,
          title: titulo,
          body,
          data: {
            projetoId: snap.id,
            url: `/projeto/${snap.id}`
          },
        })
      )
    );
  }
);

// --- Funções Restauradas (do index (10).js) ---

export const createFinancialTicket = onCall({ cors: true }, async (request) => {
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "Usuário não autenticado.");
    }
    const { originalTicketId, valor, condicoesPagamento, nomeMotorista, placaVeiculo, observacaoPagamento } = request.data;
    const uid = request.auth.uid;
    if (!originalTicketId || !valor || !condicoesPagamento || !nomeMotorista || !placaVeiculo) {
        throw new HttpsError("invalid-argument", "Os campos de valor, condições, motorista e placa são obrigatórios.");
    }
    try {
        const originalTicketRef = db.collection('chamados').doc(originalTicketId);
        const originalTicketSnap = await originalTicketRef.get();
        if (!originalTicketSnap.exists()) {
            throw new HttpsError("not-found", "O chamado de logística original não foi encontrado.");
        }
        const originalTicketData = originalTicketSnap.data();
        const creatorData = await getUserData(uid);
        let descricao = `**Dados para Pagamento:**\n- Valor: R$ ${valor}\n- Condições: ${condicoesPagamento}\n- Motorista: ${nomeMotorista}\n- Placa: ${placaVeiculo}\n`;
        if (observacaoPagamento && observacaoPagamento.trim() !== '') {
            descricao += `- Observação: ${observacaoPagamento}\n`;
        }
        descricao += `\n**Referente ao Chamado de Logística:** #${originalTicketId}`;
        const newFinancialTicket = {
            titulo: `Pagamento Frete: ${originalTicketData.titulo || 'Título não encontrado'}`,
            descricao: descricao,
            area: 'financeiro',
            tipo: 'pagamento_frete',
            status: 'aberto',
            prioridade: 'media',
            isConfidential: true,
            isExtra: false,
            chamadoPaiId: originalTicketId,
            projetoId: originalTicketData.projetoId || null,
            criadoPor: uid,
            criadoPorNome: creatorData?.nome || 'Operador de Logística',
            criadoPorFuncao: creatorData?.funcao || 'operador',
            areaDeOrigem: creatorData?.area || 'logistica',
            areasEnvolvidas: [creatorData?.area || 'logistica', 'financeiro'],
            atribuidoA: null,
            atribuidoEm: null,
            concluidoEm: null,
            concluidoPor: null,
            executadoEm: null,
            historicoStatus: [],
            imagens: [],
            criadoEm: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
        };
        const newTicketRef = await db.collection('chamados').add(newFinancialTicket);
        await newTicketRef.update({ id: newTicketRef.id });
        console.log(`✅ Chamado financeiro ${newTicketRef.id} criado e atualizado com seu ID.`);
        return { success: true, newTicketId: newTicketRef.id };
    } catch (error) {
        console.error("❌ Erro ao criar chamado financeiro:", error);
        throw new HttpsError("internal", "Ocorreu um erro interno ao criar o chamado financeiro.");
    }
});

export const onTicketUpdated = onDocumentUpdated('chamados/{ticketId}', async (event) => {
    const beforeSnap = event.data?.before;
    const afterSnap = event.data?.after;
    if (!beforeSnap || !afterSnap) {
        console.log('Dados de before/after não disponíveis');
        return;
    }
    const before = beforeSnap.data();
    const after = afterSnap.data();
    const ticketId = event.params.ticketId;
    after.id = ticketId;
    try {
        console.log(`🔄 Processando atualização do chamado ${ticketId}`);
        console.log(`Status: ${before.status} → ${after.status}`);
        console.log(`Área: ${before.area} → ${after.area}`);
        const projectData = await getProjectData(after.projetoId);
        if (!projectData) {
            console.error('Dados do projeto não encontrados');
            return;
        }
        if ((before.status !== 'em_tratativa' && after.status === 'em_tratativa') ||
            (before.status !== 'em_execucao' && after.status === 'em_execucao')) {
            await handleTicketStartedTreatment(after, projectData);
        }
        else if (before.area !== after.area) {
            await handleTicketEscalatedToArea(before, after, projectData);
        }
        else if (before.status !== 'aguardando_aprovacao' && after.status === 'aguardando_aprovacao') {
            await handleTicketEscalatedToManager(after, projectData);
        }
        else if (before.status === 'aguardando_aprovacao' && (after.status === 'aprovado' || after.status === 'rejeitado')) {
            await handleManagerDecision(before, after, projectData);
        }
        else if (before.status !== 'executado_aguardando_validacao' && after.status === 'executado_aguardando_validacao') {
            await handleTicketExecuted(after, projectData);
        }
        else if (before.status !== 'executado_pelo_consultor' && after.status === 'executado_pelo_consultor') {
            console.log('👨‍🎯 Processando devolução do consultor para a área de origem.');
            if (after.areaDeOrigem) {
                await db.collection('chamados').doc(ticketId).update({
                    area: after.areaDeOrigem,
                    consultorResponsavelId: null,
                });
                console.log(`✅ Chamado ${ticketId} devolvido para a área: ${after.areaDeOrigem} com status 'executado_pelo_consultor'.`);
            }
        }
        console.log(`✅ Processamento de atualização concluído para chamado ${ticketId}`);
    } catch (error) {
        console.error(`❌ Erro ao processar atualização do chamado ${ticketId}:`, error);
    }
});

// Funções auxiliares para onTicketUpdated (copiadas do index (10).js)
async function handleTicketStartedTreatment(ticket, project) {
    console.log('📋 Processando início de tratativa');
    const recipients = [];
    if (project.produtorId) {
        const producer = await getUserData(project.produtorId);
        if (producer?.email) recipients.push(producer.email);
    }
    if (project.consultorId) {
        const consultant = await getUserData(project.consultorId);
        if (consultant?.email) recipients.push(consultant.email);
    }
    if (recipients.length > 0) {
        await sendEmailViaSendGrid(recipients, `Chamado em Andamento: ${ticket.titulo}`, 'ticket_started_treatment', ticket, project);
    }
}
async function handleTicketEscalatedToArea(before, after, project) {
    console.log(`🔄 Processando escalação de área: ${before.area} → ${after.area}`);
    const recipients = [];
    const areaUsers = await getUsersByArea(after.area);
    areaUsers.forEach(user => {
        if (user.email && !recipients.includes(user.email)) recipients.push(user.email);
    });
    if (project.produtorId) {
        const producer = await getUserData(project.produtorId);
        if (producer?.email && !recipients.includes(producer.email)) recipients.push(producer.email);
    }
    if (project.consultorId) {
        const consultant = await getUserData(project.consultorId);
        if (consultant?.email && !recipients.includes(consultant.email)) recipients.push(consultant.email);
    }
    if (recipients.length > 0) {
        const areaName = after.area.replace(/_/g, ' ').toUpperCase();
        await sendEmailViaSendGrid(recipients, `Chamado Escalado para ${areaName}: ${after.titulo}`, 'ticket_escalated_to_area', after, project, {
            previousArea: before.area,
            newArea: after.area,
            areaName
        });
    }
}
async function handleTicketEscalatedToManager(ticket, project) {
    console.log('👔 Processando escalação para gerente');
    const recipients = [];
    let managerFunction = '';
    switch (ticket.area) {
        case 'compras': case 'locacao': case 'operacional': case 'logistica':
            managerFunction = 'gerente_operacional'; break;
        case 'comercial':
            managerFunction = 'gerente_comercial'; break;
        case 'producao': case 'almoxarifado':
            managerFunction = 'gerente_producao'; break;
        case 'financeiro':
            managerFunction = 'gerente_financeiro'; break;
        default: managerFunction = 'gerente';
    }
    const managers = await getManagersByFunction(managerFunction);
    managers.forEach(manager => {
        if (manager.email && !recipients.includes(manager.email)) recipients.push(manager.email);
    });
    if (project.produtorId) {
        const producer = await getUserData(project.produtorId);
        if (producer?.email && !recipients.includes(producer.email)) recipients.push(producer.email);
    }
    if (recipients.length > 0) {
        await sendEmailViaSendGrid(recipients, `Aprovação Necessária: ${ticket.titulo}`, 'ticket_escalated_to_manager', ticket, project, { managerFunction });
    }
}
async function handleManagerDecision(before, after, project) {
    console.log(`✅ Processando decisão do gerente: ${after.status}`);
    const recipients = [];
    if (project.produtorId) {
        const producer = await getUserData(project.produtorId);
        if (producer?.email) recipients.push(producer.email);
    }
    if (project.consultorId) {
        const consultant = await getUserData(project.consultorId);
        if (consultant?.email && !recipients.includes(consultant.email)) recipients.push(consultant.email);
    }
    if (recipients.length > 0) {
        const decision = after.status === 'aprovado' ? 'Aprovado' : 'Rejeitado';
        await sendEmailViaSendGrid(recipients, `Chamado ${decision}: ${after.titulo}`, 'manager_decision', after, project, {
            decision: after.status,
            previousStatus: before.status
        });
    }
}
async function handleTicketExecuted(ticket, project) {
    console.log('🎯 Processando chamado executado');
    const isCreatedByOperator = ticket.criadoPorFuncao && ticket.criadoPorFuncao.startsWith('operador_');
    if (isCreatedByOperator) {
        console.log('🔄 Chamado criado por operador - retornando para validação do operador original');
        try {
            const creatorData = await getUserData(ticket.criadoPor);
            const updateData = {
                status: 'executado_aguardando_validacao_operador',
                responsavelAtual: ticket.criadoPor,
                updatedAt: FieldValue.serverTimestamp()
            };
            if (creatorData?.area) {
                updateData.area = creatorData.area;
            } else if (ticket.areaDeOrigem) {
                updateData.area = ticket.areaDeOrigem;
            }
            await db.collection('chamados').doc(ticket.id).update(updateData);
            console.log(`✅ Chamado ${ticket.id} retornado para validação do operador ${ticket.criadoPor}`);
            if (creatorData?.email) {
                await sendEmailViaSendGrid([creatorData.email], `Chamado Concluído - Aguardando sua Validação: ${ticket.titulo}`, 'ticket_executed_operator_validation', ticket, project);
            }
        } catch (error) {
            console.error('❌ Erro ao retornar chamado para operador:', error);
            await handleTicketExecutedStandardFlow(ticket, project);
        }
    } else {
        console.log('📋 Chamado criado por produtor/consultor - seguindo fluxo padrão');
        await handleTicketExecutedStandardFlow(ticket, project);
    }
}
async function handleTicketExecutedStandardFlow(ticket, project) {
    const recipients = [];
    if (project.produtorId) {
        const producer = await getUserData(project.produtorId);
        if (producer?.email) recipients.push(producer.email);
    }
    if (project.consultorId) {
        const consultant = await getUserData(project.consultorId);
        if (consultant?.email && !recipients.includes(consultant.email)) recipients.push(consultant.email);
    }
    if (recipients.length > 0) {
        await sendEmailViaSendGrid(recipients, `Chamado Concluído - Aguardando sua Validação: ${ticket.titulo}`, 'ticket_executed', ticket, project);
    }
}

export const uploadImage = onCall(async (request) => {
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "Usuário não autenticado");
    }
    const { imageData, fileName, ticketId } = request.data;
    if (!imageData || !fileName || !ticketId) {
        throw new HttpsError("invalid-argument", "Dados inválidos");
    }
    try {
        const buffer = Buffer.from(imageData, "base64");
        const bucket = storage.bucket();
        const file = bucket.file(`chamados/${ticketId}/${fileName`);
        await file.save(buffer, {
            metadata: {
                contentType: "image/jpeg",
                metadata: { uploadedBy: request.auth.uid, ticketId: ticketId }
            }
        });
        await file.makePublic();
        const publicUrl = `https://storage.googleapis.com/${bucket.name}/${file.name}`;
        return { url: publicUrl };
    } catch (error) {
        console.error("Erro no upload da imagem:", error);
        throw new HttpsError("internal", "Erro interno do servidor");
    }
});
