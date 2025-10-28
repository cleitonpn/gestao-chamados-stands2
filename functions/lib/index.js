"use strict";
Object.defineProperty(exports, "__esModule", { value: true });

// ✅ FUNÇÕES EXPORTADAS, INCLUINDO A createFinancialTicket E A NOVA pushOnNotification
// Eu adicionei 'pushOnNotification' a esta linha
exports.pushOnNotification = exports.createFinancialTicket = exports.onTicketUpdated = exports.uploadImage = void 0;

// Importações do arquivo original (v2)
const admin = require("firebase-admin");
const { onDocumentUpdated } = require("firebase-functions/v2/firestore");
const { onCall, HttpsError } = require("firebase-functions/v2/https");

// Importações do novo código (v1 e webpush)
const functions = require("firebase-functions");
const webpush = require("web-push");

// Inicializar Firebase Admin (APENAS UMA VEZ)
admin.initializeApp();

// =================================================================
// ||        CONFIGURAÇÕES E CONSTANTES DE AMBOS ARQUIVOS       ||
// =================================================================

// Constantes do arquivo original
const APP_URL = 'https://nbzeukei.manus.space';
const SENDGRID_SERVICE_URL = 'https://p9hwiqcl8p89.manus.space';

// Constantes e config do novo arquivo (Web Push)
const REGION = "southamerica-east1"; // ajuste se sua base estiver em outra região
const cfg = functions.config();

// Configuração do WebPush com checagem de segurança
if (cfg.webpush && cfg.webpush.public_key && cfg.webpush.private_key && cfg.webpush.subject) {
    webpush.setVapidDetails(cfg.webpush.subject, cfg.webpush.public_key, cfg.webpush.private_key);
} else {
    console.warn("[webpush] runtime config ausente. Configure via functions:config:set");
    // As notificações push não funcionarão até que a config seja definida.
}


// =================================================================
// ||        FUNÇÕES AUXILIARES DO ARQUIVO ORIGINAL             ||
// =================================================================

// Função auxiliar para buscar dados do projeto
async function getProjectData(projectId) {
    try {
        const projectDoc = await admin.firestore()
            .collection('projetos')
            .doc(projectId)
            .get();
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
// Função auxiliar para buscar dados do usuário
async function getUserData(userId) {
    try {
        const userDoc = await admin.firestore()
            .collection('usuarios')
            .doc(userId)
            .get();
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
// Função auxiliar para buscar usuários por área
async function getUsersByArea(area) {
    try {
        const usersSnapshot = await admin.firestore()
            .collection('usuarios')
            .where('area', '==', area)
            .get();
        const users = [];
        usersSnapshot.forEach(doc => {
            const userData = doc.data();
            if (userData.email) {
                users.push(userData);
            }
        });
        return users;
    }
    catch (error) {
        console.error('Erro ao buscar usuários por área:', error);
        return [];
    }
}
// Função auxiliar para buscar gerentes por função
async function getManagersByFunction(funcao) {
    try {
        const managersSnapshot = await admin.firestore()
            .collection('usuarios')
            .where('funcao', '==', funcao)
            .get();
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
// Função auxiliar para enviar e-mail via SendGrid
async function sendEmailViaSendGrid(recipients, subject, eventType, ticketData, projectData, additionalData = {}) {
    try {
        const emailData = Object.assign({ recipients,
            subject,
            eventType, ticket: ticketData, project: projectData, systemUrl: `${APP_URL}/chamado/${ticketData.id}` }, additionalData);
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
    }
    catch (error) {
        console.error('❌ Erro ao enviar e-mail via SendGrid:', error);
        throw error;
    }
}

// =================================================================
// ||        ✅ FUNÇÃO RESTAURADA PARA CRIAR CHAMADO FINANCEIRO   ||
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
            criadoEm: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        };

        const newTicketRef = await db.collection('chamados').add(newFinancialTicket);
        
        // Atualiza o novo chamado com seu próprio ID
        await newTicketRef.update({ id: newTicketRef.id });

        console.log(`✅ Chamado financeiro ${newTicketRef.id} criado e atualizado com seu ID.`);
        return { success: true, newTicketId: newTicketRef.id };

    } catch (error) {
        console.error("❌ Erro ao criar chamado financeiro:", error);
        throw new HttpsError("internal", "Ocorreu um erro interno ao criar o chamado financeiro.");
    }
});


// Função principal para monitorar atualizações de chamados
exports.onTicketUpdated = onDocumentUpdated('chamados/{ticketId}', async (event) => {
    const beforeSnap = event.data?.before;
    const afterSnap = event.data?.after;

    if (!beforeSnap || !afterSnap) {
        console.log('Dados de before/after não disponíveis');
        return;
    }

    const before = beforeSnap.data();
    const after = afterSnap.data();
    const ticketId = event.params.ticketId;
    after.id = ticketId; // Adicionar ID do chamado aos dados

    try {
        console.log(`🔄 Processando atualização do chamado ${ticketId}`);
        console.log(`Status: ${before.status} → ${after.status}`);
        console.log(`Área: ${before.area} → ${after.area}`);
        
        const projectData = await getProjectData(after.projetoId);
        if (!projectData) {
            console.error('Dados do projeto não encontrados');
            return;
        }

        // 1. CHAMADO INICIA TRATATIVA OU EXECUÇÃO
        if ((before.status !== 'em_tratativa' && after.status === 'em_tratativa') ||
            (before.status !== 'em_execucao' && after.status === 'em_execucao')) {
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
        else if (before.status === 'aguardando_aprovacao' && (after.status === 'aprovado' || after.status === 'rejeitado')) {
            await handleManagerDecision(before, after, projectData);
        }
        // 5. CHAMADO EXECUTADO PELO OPERADOR
        else if (before.status !== 'executado_aguardando_validacao' && after.status === 'executado_aguardando_validacao') {
            await handleTicketExecuted(after, projectData);
        }
        // ✅ 6. LÓGICA CORRIGIDA PARA O FLUXO DO CONSULTOR
        else if (before.status !== 'executado_pelo_consultor' && after.status === 'executado_pelo_consultor') {
            console.log('👨‍🎯 Processando devolução do consultor para a área de origem.');
            if (after.areaDeOrigem) {
                // Atualiza o status para 'executado_pelo_consultor' e devolve para a área de origem
                await admin.firestore().collection('chamados').doc(ticketId).update({
                    area: after.areaDeOrigem,
                    // O status já foi definido como 'executado_pelo_consultor' pelo frontend, aqui apenas garantimos a área.
                    // Opcional: limpar campos de consultor
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
// 1. Função para tratar início de tratativa
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
// 2. Função para tratar escalação para área
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
// 3. Função para tratar escalação para gerente
async function handleTicketEscalatedToManager(ticket, project) {
    console.log('👔 Processando escalação para gerente');
    const recipients = [];
    let managerFunction = '';
    // Lógica para determinar a função do gerente
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
    // Adicionar outros notificáveis
    if (project.produtorId) {
        const producer = await getUserData(project.produtorId);
        if (producer?.email && !recipients.includes(producer.email)) recipients.push(producer.email);
    }
    if (recipients.length > 0) {
        await sendEmailViaSendGrid(recipients, `Aprovação Necessária: ${ticket.titulo}`, 'ticket_escalated_to_manager', ticket, project, { managerFunction });
    }
}
// 4. Função para tratar decisão do gerente
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
// 5. Função para tratar chamado executado pelo operador
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
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            };
            if (creatorData?.area) {
                updateData.area = creatorData.area;
            } else if (ticket.areaDeOrigem) {
                updateData.area = ticket.areaDeOrigem;
            }
            await admin.firestore().collection('chamados').doc(ticket.id).update(updateData);
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
// Função auxiliar para fluxo padrão (produtor/consultor)
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
// Função para upload de imagens
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

// =================================================================
// ||        ✅ NOVA FUNÇÃO DE WEB PUSH (v1)                     ||
// =================================================================

/**
 * Dispara Web Push quando cria um doc em `notifications/{id}`
 * Espera no doc: { userId, titulo, mensagem, link, tipo, lida:false, criadoEm: serverTimestamp() }
 */
exports.pushOnNotification = functions
    .region(REGION) // Usando a constante REGION definida no topo
    .firestore.document("notifications/{id}")
    .onCreate(async (snap, ctx) => {
        const data = snap.data() || {};
        const {
            userId,
            titulo = "Atualização",
            mensagem = "Você tem uma nova notificação.",
            link = "/",
            tipo = "generic",
        } = data;

        if (!userId) {
            console.warn("[pushOnNotification] notification sem userId:", ctx.params.id);
            return null;
        }

        // busca inscrições do usuário
        const subsSnap = await admin.firestore()
            .collection("push_subscriptions")
            .where("userId", "==", userId)
            .get();

        if (subsSnap.empty) {
            await snap.ref.set({
                deliveredCount: 0,
                deliveredAt: admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
            console.info("[pushOnNotification] sem inscrições para", userId);
            return null;
        }

        const payload = JSON.stringify({
            title: titulo,
            body: mensagem,
            icon: "/icons/icon-192x192.png",
            badge: "/icons/badge-72x72.png",
            data: { url: link, nId: ctx.params.id, tipo }
        });

        let delivered = 0, failed = 0;

        const tasks = subsSnap.docs.map(async (d) => {
            const sub = d.data();
            if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) {
                failed++;
                await d.ref.delete().catch(() => null);
                return;
            }

            const pushSubscription = {
                endpoint: sub.endpoint,
                keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth }
            };

            try {
                await webpush.sendNotification(pushSubscription, payload, { TTL: 60 });
                delivered++;
            } catch (err) {
                const status = err?.statusCode || err?.status;
                if (status === 404 || status === 410) {
                    // Inscrição expirada ou inválida, remove do banco
                    await d.ref.delete().catch(() => null);
                } else {
                    console.error("[pushOnNotification] falha:", status, err?.message);
                }
                failed++;
            }
        });

        await Promise.allSettled(tasks);

        await snap.ref.set({
            deliveredCount: delivered,
            failedCount: failed,
            deliveredAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        console.info(`[pushOnNotification] OK: delivered=${delivered} failed=${failed} userId=${userId}`);
        return null;
    });
