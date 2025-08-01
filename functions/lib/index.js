"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// ✅ NOVA FUNÇÃO ADICIONADA À LISTA DE EXPORTAÇÃO
exports.createFinancialTicket = exports.onNewMessageCreated = exports.cleanupDeletedTicket = exports.uploadImage = exports.onTicketUpdated = void 0;
const admin = require("firebase-admin");
const { onDocumentUpdated, onDocumentDeleted, onDocumentCreated } = require("firebase-functions/v2/firestore");
const { onCall, HttpsError } = require("firebase-functions/v2/https");

if (admin.apps.length === 0) {
    admin.initializeApp();
}

const APP_URL = 'https://nbzeukei.manus.space';
const SENDGRID_SERVICE_URL = 'https://p9hwiqcl8p89.manus.space';

// (As funções auxiliares getProjectData, getUserData, etc. permanecem as mesmas)
async function getProjectData(projectId) {
    try {
        const projectDoc = await admin.firestore().collection('projetos').doc(projectId).get();
        if (projectDoc.exists) {
            return projectDoc.data();
        }
        return null;
    }
    catch (error) {
        console.error('Erro ao buscar dados do projeto:', error);
        return null;
    }
}
async function getUserData(userId) {
    try {
        const userDoc = await admin.firestore().collection('usuarios').doc(userId).get();
        if (userDoc.exists) {
            return userDoc.data();
        }
        return null;
    }
    catch (error) {
        console.error('Erro ao buscar dados do usuário:', error);
        return null;
    }
}
async function getUsersByArea(area) {
    try {
        const usersSnapshot = await admin.firestore().collection('usuarios').where('area', '==', area).get();
        const users = [];
        usersSnapshot.forEach(doc => {
            const userData = doc.data();
            if (userData.email) {
                users.push({ id: doc.id, ...doc.data() });
            }
        });
        return users;
    }
    catch (error) {
        console.error('Erro ao buscar usuários por área:', error);
        return [];
    }
}
async function getManagersByFunction(funcao) {
    try {
        const managersSnapshot = await admin.firestore().collection('usuarios').where('funcao', '==', funcao).get();
        const managers = [];
        managersSnapshot.forEach(doc => {
            const userData = doc.data();
            if (userData.email) {
                managers.push(userData);
            }
        });
        return managers;
    }
    catch (error) {
        console.error('Erro ao buscar gerentes:', error);
        return [];
    }
}
async function sendEmailViaSendGrid(recipients, subject, eventType, ticketData, projectData, additionalData = {}) {
    try {
        const emailData = Object.assign({ recipients,
            subject,
            eventType, ticket: ticketData, project: projectData, systemUrl: `${APP_URL}/chamado/${ticketData.id}` }, additionalData);
        const response = await fetch(`${SENDGRID_SERVICE_URL}/send-notification`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', },
            body: JSON.stringify(emailData)
        });
        if (!response.ok) {
            throw new Error(`Erro HTTP: ${response.status}`);
        }
        const result = await response.json();
        console.log(`✅ E-mail enviado via SendGrid para ${recipients.length} destinatário(s):`, recipients);
        return result;
    }
    catch (error) {
        console.error('❌ Erro ao enviar e-mail via SendGrid:', error);
        throw error;
    }
}


// =================================================================
// ||        ✅ NOVA FUNÇÃO PARA CRIAR CHAMADO FINANCEIRO         ||
// =================================================================
exports.createFinancialTicket = onCall({ cors: true }, async (request) => {
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "Usuário não autenticado.");
    }

    const { originalTicketId, valor, condicoesPagamento, nomeMotorista, placaVeiculo, observacaoPagamento } = request.data;
    const uid = request.auth.uid;

    if (!originalTicketId || !valor || !condicoesPagamento || !nomeMotorista || !placaVeiculo) {
        throw new HttpsError("invalid-argument", "Os campos de valor, condições, motorista e placa são obrigatórios.");
    }

    try {
        const db = admin.firestore();
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
            chamadoPaiId: originalTicketId,
            projetoId: originalTicketData.projetoId || null,
            criadoPor: uid,
            criadoPorNome: creatorData?.nome || 'Operador de Logística',
            criadoEm: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        };

        const newTicketRef = await db.collection('chamados').add(newFinancialTicket);
        
        // CORREÇÃO: Atualiza o novo chamado com seu próprio ID para consistência
        await newTicketRef.update({ id: newTicketRef.id });

        console.log(`✅ Chamado financeiro ${newTicketRef.id} criado e atualizado com seu ID.`);
        return { success: true, newTicketId: newTicketRef.id };

    } catch (error) {
        console.error("❌ Erro ao criar chamado financeiro:", error);
        throw new HttpsError("internal", "Ocorreu um erro interno ao criar o chamado financeiro.");
    }
});


// =================================================================
// ||        FUNÇÃO DE NOTIFICAÇÃO DE MENSAGENS - VERSÃO CORRIGIDA     ||
// =================================================================
exports.onNewMessageCreated = onDocumentCreated('mensagens/{messageId}', async (event) => {
    var _a;
    const messageSnap = (_a = event.data) === null || _a === void 0 ? void 0 : _a;
    if (!messageSnap) {
        console.log('Dados da nova mensagem não disponíveis.');
        return;
    }

    const messageData = messageSnap.data();
    
    const ticketId = messageData.ticketId;
    const senderId = messageData.remetenteId; 

    if (!ticketId || !senderId) {
        console.error('Mensagem não possui ticketId ou remetenteId. Abortando notificação.', messageData);
        return;
    }

    console.log(`💬 Nova mensagem no chamado ${ticketId} por ${senderId}. Iniciando notificação.`);

    try {
        const ticketDoc = await admin.firestore().collection('chamados').doc(ticketId).get();
        if (!ticketDoc.exists) {
            console.error(`Chamado ${ticketId} não encontrado.`);
            return;
        }
        const ticketData = ticketDoc.data();
        ticketData.id = ticketId;

        const recipients = new Set();
        if (ticketData.criadoPor && ticketData.criadoPor !== senderId) {
            recipients.add(ticketData.criadoPor);
        }
        if (ticketData.area) {
            const areaUsers = await getUsersByArea(ticketData.area);
            areaUsers.forEach(user => {
                if (user.id !== senderId) {
                    recipients.add(user.id);
                }
            });
        }
        
        if (recipients.size === 0) {
            console.log("Nenhum destinatário para notificar.");
            return;
        }

        const notificationData = {
            tipo: 'new_message',
            titulo: `Nova mensagem no chamado #${ticketId.slice(-6)}`,
            mensagem: `${messageData.remetenteNome}: ${messageData.conteudo.substring(0, 50)}...`,
            link: `/chamado/${ticketId}`,
            ticketId: ticketId,
        };

        const batch = admin.firestore().batch();
        const uniqueUserIds = Array.from(recipients);

        uniqueUserIds.forEach(userId => {
            const userNotificationsRef = admin.firestore().collection('notifications').doc(userId).collection('notifications');
            const notificationRef = userNotificationsRef.doc();
            batch.set(notificationRef, {
                ...notificationData,
                lida: false,
                criadoEm: new Date(),
            });
        });
    
        await batch.commit();
        console.log(`🔔 Notificação de nova mensagem enviada para ${uniqueUserIds.length} usuários.`);

    } catch (error) {
        console.error(`❌ Erro ao notificar nova mensagem para o chamado ${ticketId}:`, error);
    }
});


exports.onTicketUpdated = onDocumentUpdated('chamados/{ticketId}', async (event) => {
    var _a, _b;
    const beforeSnap = (_a = event.data) === null || _a === void 0 ? void 0 : _a.before;
    const afterSnap = (_b = event.data) === null || _b === void 0 ? void 0 : _b.after;
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
        const projectData = await getProjectData(after.projetoId);
        if (!projectData) {
            console.error('Dados do projeto não encontrados');
            return;
        }
        if (before.status !== 'em_tratativa' && after.status === 'em_tratativa') {
            await handleTicketStartedTreatment(after, projectData);
        }
        else if (before.status !== 'em_execucao' && after.status === 'em_execucao') {
            await handleTicketStartedTreatment(after, projectData);
        }
        else if (before.area !== after.area) {
            await handleTicketEscalatedToArea(before, after, projectData);
        }
        else if (before.status !== 'aguardando_aprovacao' && after.status === 'aguardando_aprovacao') {
            await handleTicketEscalatedToManager(after, projectData);
        }
        else if (before.status === 'aguardando_aprovacao' &&
            (after.status === 'aprovado' || after.status === 'rejeitado')) {
            await handleManagerDecision(before, after, projectData);
        }
        else if (before.status !== 'executado_aguardando_validacao' &&
            after.status === 'executado_aguardando_validacao') {
            await handleTicketExecuted(after, projectData);
        }
        console.log(`✅ Processamento de atualização concluído para chamado ${ticketId}`);
    }
    catch (error) {
        console.error(`❌ Erro ao processar atualização do chamado ${ticketId}:`, error);
    }
});

async function handleTicketStartedTreatment(ticket, project) {
    const recipients = [];
    if (project.produtorId) {
        const producer = await getUserData(project.produtorId);
        if (producer === null || producer === void 0 ? void 0 : producer.email) {
            recipients.push(producer.email);
        }
    }
    if (project.consultorId) {
        const consultant = await getUserData(project.consultorId);
        if (consultant === null || consultant === void 0 ? void 0 : consultant.email) {
            recipients.push(consultant.email);
        }
    }
    if (recipients.length > 0) {
        await sendEmailViaSendGrid(recipients, `Chamado em Andamento: ${ticket.titulo}`, 'ticket_started_treatment', ticket, project);
    }
}
async function handleTicketEscalatedToArea(before, after, project) {
    const recipients = [];
    const areaUsers = await getUsersByArea(after.area);
    areaUsers.forEach(user => {
        if (user.email && !recipients.includes(user.email)) {
            recipients.push(user.email);
        }
    });
    if (project.produtorId) {
        const producer = await getUserData(project.produtorId);
        if ((producer === null || producer === void 0 ? void 0 : producer.email) && !recipients.includes(producer.email)) {
            recipients.push(producer.email);
        }
    }
    if (project.consultorId) {
        const consultant = await getUserData(project.consultorId);
        if ((consultant === null || consultant === void 0 ? void 0 : consultant.email) && !recipients.includes(consultant.email)) {
            recipients.push(consultant.email);
        }
    }
    if (recipients.length > 0) {
        const areaName = after.area.replace('_', ' ').toUpperCase();
        await sendEmailViaSendGrid(recipients, `Chamado Escalado para ${areaName}: ${after.titulo}`, 'ticket_escalated_to_area', after, project, {
            previousArea: before.area,
            newArea: after.area,
            areaName
        });
    }
}
async function handleTicketEscalatedToManager(ticket, project) {
    const recipients = [];
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
            managerFunction = 'gerente';
    }
    const managers = await getManagersByFunction(managerFunction);
    managers.forEach(manager => {
        if (manager.email && !recipients.includes(manager.email)) {
            recipients.push(manager.email);
        }
    });
    if (project.produtorId) {
        const producer = await getUserData(project.produtorId);
        if ((producer === null || producer === void 0 ? void 0 : producer.email) && !recipients.includes(producer.email)) {
            recipients.push(producer.email);
        }
    }
    if (project.consultorId) {
        const consultant = await getUserData(project.consultorId);
        if ((consultant === null || consultant === void 0 ? void 0 : consultant.email) && !recipients.includes(consultant.email)) {
            recipients.push(consultant.email);
        }
    }
    if (recipients.length > 0) {
        await sendEmailViaSendGrid(recipients, `Aprovação Necessária: ${ticket.titulo}`, 'ticket_escalated_to_manager', ticket, project, { managerFunction });
    }
}
async function handleManagerDecision(before, after, project) {
    const recipients = [];
    if (project.produtorId) {
        const producer = await getUserData(project.produtorId);
        if (producer === null || producer === void 0 ? void 0 : producer.email) {
            recipients.push(producer.email);
        }
    }
    if (project.consultorId) {
        const consultant = await getUserData(project.consultorId);
        if ((consultant === null || consultant === void 0 ? void 0 : consultant.email) && !recipients.includes(consultant.email)) {
            recipients.push(consultant.email);
        }
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
    const isCreatedByOperator = ticket.criadoPorFuncao && ticket.criadoPorFuncao.startsWith('operador_');
    if (isCreatedByOperator) {
        try {
            const creatorData = await getUserData(ticket.criadoPor);
            const updateData = {
                status: 'executado_aguardando_validacao_operador',
                responsavelAtual: ticket.criadoPor,
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            };
            if (creatorData === null || creatorData === void 0 ? void 0 : creatorData.area) {
                updateData.area = creatorData.area;
            }
            else if (ticket.areaDeOrigem) {
                updateData.area = ticket.areaDeOrigem;
            }
            await admin.firestore().collection('chamados').doc(ticket.id).update(updateData);
            if (creatorData === null || creatorData === void 0 ? void 0 : creatorData.email) {
                await sendEmailViaSendGrid([creatorData.email], `Chamado Concluído - Aguardando sua Validação: ${ticket.titulo}`, 'ticket_executed_operator_validation', ticket, project);
            }
        }
        catch (error) {
            console.error('❌ Erro ao retornar chamado para operador:', error);
            await handleTicketExecutedStandardFlow(ticket, project);
        }
    }
    else {
        await handleTicketExecutedStandardFlow(ticket, project);
    }
}
async function handleTicketExecutedStandardFlow(ticket, project) {
    const recipients = [];
    if (project.produtorId) {
        const producer = await getUserData(project.produtorId);
        if (producer === null || producer === void 0 ? void 0 : producer.email) {
            recipients.push(producer.email);
        }
    }
    if (project.consultorId) {
        const consultant = await getUserData(project.consultorId);
        if ((consultant === null || consultant === void 0 ? void 0 : consultant.email) && !recipients.includes(consultant.email)) {
            recipients.push(consultant.email);
        }
    }
    if (recipients.length > 0) {
        await sendEmailViaSendGrid(recipients, `Chamado Concluído - Aguardando sua Validação: ${ticket.titulo}`, 'ticket_executed', ticket, project);
    }
}
exports.uploadImage = onCall(async (request) => {
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "Usuário não autenticado");
    }
    const { imageData, fileName, ticketId } = request.data;
    if (!imageData || !fileName || !ticketId) {
        throw new HttpsError("invalid-argument", "Dados inválidos");
    }
    try {
        const buffer = Buffer.from(imageData, "base64");
        const bucket = admin.storage().bucket();
        const file = bucket.file(`chamados/${ticketId}/${fileName}`);
        await file.save(buffer, {
            metadata: {
                contentType: "image/jpeg",
                metadata: {
                    uploadedBy: request.auth.uid,
                    ticketId: ticketId
                }
            }
        });
        await file.makePublic();
        const publicUrl = `https://storage.googleapis.com/${bucket.name}/${file.name}`;
        return { url: publicUrl };
    }
    catch (error) {
        console.error("Erro no upload da imagem:", error);
        throw new HttpsError("internal", "Erro interno do servidor");
    }
});
exports.cleanupDeletedTicket = onDocumentDeleted('chamados/{ticketId}', async (event) => {
    const ticketId = event.params.ticketId;
    const db = admin.firestore();
    console.log(`🗑️ Iniciando limpeza de dados para o chamado deletado: ${ticketId}`);
    const notificationsRef = db.collection('notifications').where('ticketId', '==', ticketId);
    const notificationsSnapshot = await notificationsRef.get();
    if (notificationsSnapshot.empty) {
        console.log('Nenhuma notificação encontrada para este chamado. Limpeza não necessária.');
        return;
    }
    const batch = db.batch();
    notificationsSnapshot.forEach(doc => {
        console.log(`Agendando para deletar notificação órfã: ${doc.id}`);
        batch.delete(doc.ref);
    });
    try {
        await batch.commit();
        console.log(`✅ Sucesso! ${notificationsSnapshot.size} notificações órfãs foram limpas.`);
    }
    catch (error) {
        console.error('❌ Erro ao deletar notificações em lote:', error);
    }
});
//# sourceMappingURL=index.js.map
