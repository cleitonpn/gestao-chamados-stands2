// ===== Firestore -> WebPush: espelhar coleção "mensagens" =====
exports.onMensagemCreated = functions
  .region('us-central1') // mantenha igual ao resto das suas Functions
  .firestore
  .document('mensagens/{mensagemId}')
  .onCreate(async (snap, ctx) => {
    try {
      const msg = snap.data() || {};
      const {
        userId,                 // <<-- DESTINATÁRIO
        conteudo = '',          // texto da mensagem
        remetenteNome = 'Sistema',
        type = 'mensagem',
        ticketId = null,
        url: urlDoDoc           // se você já salva uma URL no doc
      } = msg;

      // sem userId não dá pra endereçar push
      if (!userId) {
        console.warn('[onMensagemCreated] mensagem sem userId', ctx.params.mensagemId);
        return null;
      }

      // Monte título/corpo da notificação (ajuste ao seu gosto)
      const title = type === 'status_update'
        ? `Atualização de status`
        : `Nova mensagem de ${remetenteNome}`;

      const body = String(conteudo || '').slice(0, 180); // corta só por segurança
      const url  = urlDoDoc || (ticketId ? `/tickets/${ticketId}` : '/');

      // Busque as subs do DESTINATÁRIO
      const db = admin.firestore();
      const q = await db.collection('push_subscriptions')
        .where('userId', '==', userId)
        .where('enabled', '==', true)
        .get();

      const subs = q.docs.map(d => {
        const { endpoint, keys } = d.data();
        return { endpoint, keys };
      });

      if (!subs.length) {
        console.log(`[onMensagemCreated] sem subs ativas para userId=${userId}`);
        // Marque que tentamos (evita reprocesso em algum retry)
        await snap.ref.update({
          pushStatus: { sent: 0, failed: 0, at: admin.firestore.FieldValue.serverTimestamp() }
        });
        return null;
      }

      const payload = {
        title,
        body,
        url,
        tag: `msg-${userId}`,   // agrupa por usuário
        badgeCount: 1,          // opcional: o SW usa p/ bolinha
        meta: { type, ticketId, mensagemId: ctx.params.mensagemId }
      };

      const out = await sendWebPushToSubs(subs, payload);

      await snap.ref.update({
        pushed: true,
        pushStatus: {
          sent: out.sent,
          failed: out.failed,
          at: admin.firestore.FieldValue.serverTimestamp()
        }
      });

      console.log(`[onMensagemCreated] push -> userId=${userId}`, out);
      return null;
    } catch (err) {
      console.error('[onMensagemCreated] erro', err);
      // marque falha no doc para auditoria
      try {
        await snap.ref.update({
          pushed: false,
          pushStatus: {
            error: String(err?.message || err),
            at: admin.firestore.FieldValue.serverTimestamp()
          }
        });
      } catch (_) {}
      return null;
    }
  });
