// functions/index.js
import { onRequest } from "firebase-functions/v2/https";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import * as logger from "firebase-functions/logger";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";

if (!getApps().length) initializeApp();
const db = getFirestore();

// Ajuste os nomes das coleções aqui
const MESSAGES_COLLECTION = "mensagens";   // <— sua coleção de mensagens
const TICKETS_COLLECTION  = "tickets";     // <— coleção de tickets
const USERS_COLLECTION    = "usuarios";    // <— CORRIGIDO: onde ficam os tokens
const NOTIFICATIONS_COLL  = "notifications";
const PROJETOS_COLLECTION = "projetos";    // <— coleção de projetos

// Tenta achar tokens em userDoc.fcmTokens/pushTokens OU subcoleções tokens/devices
async function getUserTokens(uid) {
  if (!uid) return [];
  try {
    const userRef = db.collection(USERS_COLLECTION).doc(uid); //
    const snap = await userRef.get();
    const uniq = new Set();

    if (snap.exists) {
      const data = snap.data() || {};
      if (Array.isArray(data.fcmTokens))  data.fcmTokens.forEach(t => t && uniq.add(t));
      if (Array.isArray(data.pushTokens)) data.pushTokens.forEach(t => t && uniq.add(t));
    }
    // Busca na subcoleção 'tokens' (onde o pushClient.js vai salvar)
    const tokensCol = await userRef.collection("tokens").get();
    tokensCol.forEach(d => { const t = d.get("token"); if (t) uniq.add(t); });
    
    // Mantém a busca em 'devices' por segurança
    const devicesCol = await userRef.collection("devices").get();
    devicesCol.forEach(d => { const t = d.get("fcmToken") || d.get("token"); if (t) uniq.add(t); });

    return [...uniq];
  } catch (e) {
    logger.error("getUserTokens error", e);
    return [];
  }
}

async function pushAndPersist({ recipientId, title, body, data }) {
  // salva notificação (web/in-app)
  await db.collection(NOTIFICATIONS_COLL).add({
    recipientId,
    title,
    body,
    data: data || {},
    read: false,
    createdAt: new Date(),
  });

  // envia FCM (mobile/webpush) se tiver tokens
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
      // Converte todos os valores de 'data' para string (exigência do FCM)
      data: Object.fromEntries(Object.entries(data || {}).map(([k, v]) => [k, String(v)])),
      android: { priority: "high" },
      apns:   { payload: { aps: { sound: "default" } } },
      webpush:{ headers: { Urgency: "high" } },
    });
  } catch (e) {
    logger.error("FCM send error", e);
  }
}

// Mantive seu endpoint HTTP de compatibilidade
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

// 🔔 Dispara quando criar uma nova mensagem
export const onMensagemCreated = onDocumentCreated(
  `${MESSAGES_COLLECTION}/{mensagemId}`,
  async (event) => {
    const snap = event.data;
    if (!snap) return;

    const msg = snap.data();
    const ticketId = msg.ticketId || "";
    const actorId  = msg.userId || ""; // quem realizou a ação (remetente)

    // tenta achar o "dono" do ticket
    let ticketOwnerId = null;
    if (ticketId) {
      const t = await db.collection(TICKETS_COLLECTION).doc(ticketId).get();
      if (t.exists) {
        const td = t.data() || {};
        ticketOwnerId = td.userId || td.createdBy || td.openedById || null;
      }
    }

    // monta texto
    const texto = (msg.conteudo && String(msg.conteudo).replace(/\*\*/g, "")) || "Nova mensagem";
    const titulo = msg.type === "status_update" ? "Atualização no chamado" : "Nova mensagem";
    const body   = ticketId ? `${texto} (Chamado: ${ticketId})` : texto;

    // notifica ambos (sem duplicar se forem iguais)
    // **NOTA**: Isso vai notificar o remetente e o dono.
    // Se não quiser notificar o remetente, remova 'actorId' do Set.
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
            url: `/chamado/${ticketId}` // Ajuste a URL se necessário
          },
        })
      )
    );
  }
);


// 🔔 Dispara quando criar um novo PROJETO (NOVA FUNÇÃO)
export const onProjetoCreated = onDocumentCreated(
  `${PROJETOS_COLLECTION}/{projetoId}`,
  async (event) => {
    const snap = event.data;
    if (!snap) return;

    const projeto = snap.data();
    logger.info(`Novo projeto detectado: ${snap.id}`, projeto);

    // 1. Pegue os IDs do comercial e produtor
    // ⚠️ Ajuste os nomes dos campos se forem diferentes no seu Firestore
    const comercialId = projeto.comercialId || projeto.comercial; 
    const produtorId = projeto.produtorId || projeto.produtor;

    if (!comercialId && !produtorId) {
      logger.warn("Projeto criado sem 'comercialId' ou 'produtorId'. Nenhuma notificação enviada.");
      return;
    }

    // 2. Monte a notificação
    const titulo = "Novo Projeto Criado!";
    // ⚠️ Ajuste o campo 'nome' se for diferente
    const body = `Você foi associado ao projeto: ${projeto.nome || snap.id}`; 
    
    // 3. Crie um Set para não enviar duas vezes se forem a mesma pessoa
    const recipientIds = new Set();
    if (comercialId) recipientIds.add(comercialId);
    if (produtorId) recipientIds.add(produtorId);

    // 4. Envie o push para cada responsável
    await Promise.all(
      [...recipientIds].map((uid) =>
        pushAndPersist({
          recipientId: uid,
          title: titulo,
          body,
          data: { 
            projetoId: snap.id,
            url: `/projeto/${snap.id}` // ⚠️ Ajuste a URL para o seu app
          },
        })
      )
    );
  }
);
