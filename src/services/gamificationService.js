import { collection, getDocs, query, where, orderBy } from 'firebase/firestore';
import { db } from '../config/firebase';
import { userService } from './userService';

// pesos (ajuste se quiser)
const WEIGHTS = { ticket: 3, message: 1, diary: 2 };

export const gamificationService = {
  /**
   * days: 7 | 30 | 90 | 365 | 'all'
   */
  async getLeaderboard({ days = 30 } = {}) {
    const start = (days && days !== 'all')
      ? new Date(Date.now() - days * 24 * 60 * 60 * 1000)
      : null;

    // mapa de usuários
    const users = await userService.getAllUsers().catch(() => []);
    const userMap = new Map(users.map(u => [u.id, u]));

    const counts = {}; // { [userId]: { tickets, messages, diary } }
    const bump = (uid, key, inc = 1) => {
      if (!uid) return;
      counts[uid] = counts[uid] || { tickets: 0, messages: 0, diary: 0 };
      counts[uid][key] += inc;
    };

    // ---- chamados criados ----
    try {
      let snap;
      if (start) {
        snap = await getDocs(
          query(
            collection(db, 'chamados'),
            where('criadoEm', '>=', start),
            orderBy('criadoEm', 'desc')
          )
        );
      } else {
        snap = await getDocs(collection(db, 'chamados'));
      }
      snap.forEach(doc => {
        const d = doc.data();
        bump(d.criadoPor, 'tickets', 1);
      });
    } catch (e) {
      console.error('Gamification(tickets):', e);
    }

    // ---- mensagens no chat de chamados ----
    try {
      let snap;
      if (start) {
        snap = await getDocs(
          query(
            collection(db, 'mensagens'),
            where('createdAt', '>=', start),
            orderBy('createdAt', 'desc')
          )
        );
      } else {
        snap = await getDocs(collection(db, 'mensagens'));
      }

      snap.forEach(doc => {
        const m = doc.data();
        // fallback: alguns pontos antigos podem ter só `criadoEm`
        if (start) {
          const createdAt =
            m.createdAt?.toDate?.() ||
            (m.createdAt instanceof Date ? m.createdAt : null) ||
            m.criadoEm?.toDate?.() ||
            (m.criadoEm instanceof Date ? m.criadoEm : null);
          if (createdAt && createdAt < start) return;
        }
        bump(m.userId, 'messages', 1);
      });
    } catch (e) {
      console.error('Gamification(messages):', e);
    }

    // ---- entradas no diário dos projetos ----
    try {
      const projSnap = await getDocs(collection(db, 'projetos'));
      projSnap.forEach(doc => {
        const p = doc.data();
        const list = Array.isArray(p.diario) ? p.diario : [];
        for (const e of list) {
          let ok = true;
          if (start && e?.createdAt) {
            const dt =
              (typeof e.createdAt === 'string' ? new Date(e.createdAt) : null) ||
              e.createdAt?.toDate?.() ||
              null;
            if (dt && dt < start) ok = false;
          }
          if (ok) bump(e.authorId, 'diary', 1);
        }
      });
    } catch (e) {
      console.error('Gamification(diary):', e);
    }

    // monta ranking
    const rows = Object.entries(counts).map(([uid, c]) => {
      const u = userMap.get(uid) || {};
      const score = c.tickets * WEIGHTS.ticket + c.messages * WEIGHTS.message + c.diary * WEIGHTS.diary;
      return {
        userId: uid,
        nome: u.nome || u.displayName || u.email || uid,
        funcao: u.funcao || '—',
        tickets: c.tickets,
        messages: c.messages,
        diary: c.diary,
        score,
      };
    }).sort((a, b) => b.score - a.score);

    return { rows, weights: WEIGHTS, generatedAt: new Date().toISOString(), days };
  }
};

export default gamificationService;
