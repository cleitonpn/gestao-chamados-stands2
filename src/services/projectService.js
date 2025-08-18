import { 
  collection, 
  doc, 
  getDocs, 
  getDoc, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  query, 
  where, 
  orderBy,
  or,
  and
} from 'firebase/firestore';
import { db } from '../config/firebase';

// =====================
// Helpers de Data / Fuso
// =====================
// Normaliza entradas de data: Firestore Timestamp, string ISO, 'YYYY-MM-DD', 'DD-MM-YYYY', Date
// Retorna sempre um Date válido (UTC) preservando o DIA humano quando exibido em America/Sao_Paulo.
const normalizeDateInput = (value) => {
  if (!value) return null;

  // Firestore Timestamp-like
  if (typeof value === 'object' && value.seconds) {
    return new Date(value.seconds * 1000);
  }

  // DD-MM-YYYY
  if (typeof value === 'string' && /^\d{2}-\d{2}-\d{4}$/.test(value)) {
    const [dd, mm, yyyy] = value.split('-');
    // Força como meia-noite UTC para preservar o dia quando renderizado no fuso de SP
    return new Date(`${yyyy}-${mm}-${dd}T00:00:00.000Z`);
  }

  // YYYY-MM-DD
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(`${value}T00:00:00.000Z`);
  }

  // Outros formatos aceitos pelo Date
  const d = new Date(value);
  if (isNaN(d.getTime())) return null;
  return d;
};

// Limites do dia (em UTC) com base na data normalizada
const startOfDayUTC = (value) => {
  const d = normalizeDateInput(value);
  if (!d) return null;
  const copy = new Date(d.getTime());
  copy.setUTCHours(0, 0, 0, 0);
  return copy;
};

const endOfDayUTC = (value) => {
  const d = normalizeDateInput(value);
  if (!d) return null;
  const copy = new Date(d.getTime());
  copy.setUTCHours(23, 59, 59, 999);
  return copy;
};

// Normaliza todos os campos de data conhecidos no payload do projeto
const normalizeProjectDates = (projectData = {}) => {
  const out = { ...projectData };

  const normalizePair = (obj, keyStart = 'dataInicio', keyEnd = 'dataFim') => {
    if (!obj) return obj;
    const outInner = { ...obj };
    if (outInner[keyStart] !== undefined) outInner[keyStart] = normalizeDateInput(outInner[keyStart]);
    if (outInner[keyEnd] !== undefined) outInner[keyEnd] = normalizeDateInput(outInner[keyEnd]);
    return outInner;
  };

  // Top-level datas
  if (out.dataInicio !== undefined) out.dataInicio = normalizeDateInput(out.dataInicio);
  if (out.dataFim !== undefined) out.dataFim = normalizeDateInput(out.dataFim);
  if (out.dataEncerramento !== undefined) out.dataEncerramento = normalizeDateInput(out.dataEncerramento);
  if (out.criadoEm !== undefined) out.criadoEm = normalizeDateInput(out.criadoEm);
  if (out.atualizadoEm !== undefined) out.atualizadoEm = normalizeDateInput(out.atualizadoEm);

  // Subdocumentos usuais
  if (out.montagem) out.montagem = normalizePair(out.montagem);
  if (out.evento) out.evento = normalizePair(out.evento);
  if (out.desmontagem) out.desmontagem = normalizePair(out.desmontagem);

  return out;
};

export const projectService = {
  // Criar projeto
  async createProject(projectData) {
    try {
      console.log('💾 Criando projeto:', projectData);

      const payload = {
        ...normalizeProjectDates(projectData),
        status: 'ativo',
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      const docRef = await addDoc(collection(db, 'projetos'), payload);
      
      console.log('✅ Projeto criado com ID:', docRef.id);
      return docRef.id;
    } catch (error) {
      console.error('❌ Erro ao criar projeto:', error);
      throw error;
    }
  },

  // Atualizar projeto
  async updateProject(projectId, projectData) {
    try {
      console.log('🔄 Atualizando projeto:', projectId, projectData);

      const payload = {
        ...normalizeProjectDates(projectData),
        updatedAt: new Date()
      };
      
      const projectRef = doc(db, 'projetos', projectId);
      await updateDoc(projectRef, payload);
      
      console.log('✅ Projeto atualizado:', projectId);
    } catch (error) {
      console.error('❌ Erro ao atualizar projeto:', error);
      throw error;
    }
  },

  // Buscar projeto por ID
  async getProjectById(projectId) {
    try {
      const projectRef = doc(db, 'projetos', projectId);
      const projectSnap = await getDoc(projectRef);
      
      if (projectSnap.exists()) {
        return { id: projectSnap.id, ...projectSnap.data() };
      } else {
        console.warn('Projeto não encontrado:', projectId);
        return null;
      }
    } catch (error) {
      console.error('Erro ao buscar projeto:', error);
      throw error;
    }
  },

  // 🔧 CORREÇÃO: Buscar projetos por usuário com múltiplos campos
  async getProjectsByUser(userUid) {
    try {
      console.log('🔍 Buscando projetos para usuário:', userUid);
      
      // Buscar usuário para obter todos os dados
      const usersQuery = query(collection(db, 'usuarios'), where('uid', '==', userUid));
      const usersSnapshot = await getDocs(usersQuery);
      
      if (usersSnapshot.empty) {
        console.warn('❌ Usuário não encontrado:', userUid);
        return [];
      }
      
      const userData = usersSnapshot.docs[0];
      const userDocId = userData.id;
      const userInfo = userData.data();
      
      console.log('👤 Dados do usuário:', {
        uid: userUid,
        docId: userDocId,
        nome: userInfo.nome,
        email: userInfo.email,
        funcao: userInfo.funcao
      });

      // 🔧 BUSCA MÚLTIPLA: Buscar projetos por todos os campos possíveis
      const projectsQuery = query(
        collection(db, 'projetos'),
        or(
          // Busca por UID (novo formato)
          where('produtorUid', '==', userUid),
          where('consultorUid', '==', userUid),
          
          // Busca por ID do documento (formato atual)
          where('produtorId', '==', userDocId),
          where('consultorId', '==', userDocId),
          
          // Busca por email (fallback)
          where('produtorEmail', '==', userInfo.email),
          where('consultorEmail', '==', userInfo.email),
          
          // Busca por nome (formato legado)
          where('produtor', '==', userInfo.nome),
          where('consultor', '==', userInfo.nome)
        ),
        orderBy('createdAt', 'desc')
      );

      const snapshot = await getDocs(projectsQuery);
      const projects = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      console.log(`✅ Encontrados ${projects.length} projetos para o usuário:`, projects.map(p => ({
        id: p.id,
        nome: p.nome,
        produtorId: p.produtorId,
        produtorUid: p.produtorUid,
        produtorNome: p.produtorNome,
        consultorId: p.consultorId,
        consultorUid: p.consultorUid,
        consultorNome: p.consultorNome
      })));

      return projects;
    } catch (error) {
      console.error('❌ Erro ao buscar projetos por usuário:', error);
      
      // Fallback: busca simples se a busca complexa falhar
      try {
        console.log('🔄 Tentando busca simples...');
        const simpleQuery = query(
          collection(db, 'projetos'),
          orderBy('createdAt', 'desc')
        );
        
        const snapshot = await getDocs(simpleQuery);
        const allProjects = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        
        // Filtrar manualmente
        const userProjects = allProjects.filter(project => {
          return project.produtorUid === userUid ||
                 project.consultorUid === userUid ||
                 project.produtorId === userUid ||
                 project.consultorId === userUid;
        });
        
        console.log(`✅ Busca simples encontrou ${userProjects.length} projetos`);
        return userProjects;
      } catch (fallbackError) {
        console.error('❌ Erro na busca simples também:', fallbackError);
        throw error;
      }
    }
  },

  // Buscar todos os projetos (apenas para administradores)
  async getAllProjects() {
    try {
      console.log('🔍 Buscando todos os projetos (admin)');
      
      const q = query(collection(db, 'projetos'), orderBy('createdAt', 'desc'));
      const snapshot = await getDocs(q);
      
      const projects = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      console.log(`✅ Encontrados ${projects.length} projetos totais`);
      return projects;
    } catch (error) {
      console.error('❌ Erro ao buscar todos os projetos:', error);
      throw error;
    }
  },

  // Buscar projetos ativos
  async getActiveProjects() {
    try {
      const q = query(
        collection(db, 'projetos'), 
        where('status', '==', 'ativo'),
        orderBy('createdAt', 'desc')
      );
      const snapshot = await getDocs(q);
      
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
    } catch (error) {
      console.error('Erro ao buscar projetos ativos:', error);
      throw error;
    }
  },

  // Arquivar projeto
  async archiveProject(projectId) {
    try {
      const projectRef = doc(db, 'projetos', projectId);
      await updateDoc(projectRef, {
        status: 'arquivado',
        archivedAt: new Date(),
        updatedAt: new Date()
      });
    } catch (error) {
      console.error('Erro ao arquivar projeto:', error);
      throw error;
    }
  },

  // Restaurar projeto
  async restoreProject(projectId) {
    try {
      const projectRef = doc(db, 'projetos', projectId);
      await updateDoc(projectRef, {
        status: 'ativo',
        archivedAt: null,
        updatedAt: new Date()
      });
    } catch (error) {
      console.error('Erro ao restaurar projeto:', error);
      throw error;
    }
  },

  // Excluir projeto
  async deleteProject(projectId) {
    try {
      await deleteDoc(doc(db, 'projetos', projectId));
    } catch (error) {
      console.error('Erro ao excluir projeto:', error);
      throw error;
    }
  },

  // Buscar projetos por status
  async getProjectsByStatus(status) {
    try {
      const q = query(
        collection(db, 'projetos'), 
        where('status', '==', status),
        orderBy('createdAt', 'desc')
      );
      const snapshot = await getDocs(q);
      
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
    } catch (error) {
      console.error('Erro ao buscar projetos por status:', error);
      throw error;
    }
  },

  // Buscar projetos por data (aceita Date/string 'YYYY-MM-DD'/'DD-MM-YYYY')
  async getProjectsByDateRange(startDate, endDate) {
    try {
      const start = startOfDayUTC(startDate);
      const end = endOfDayUTC(endDate);

      if (!start || !end) {
        throw new Error('Datas inválidas para filtro. Use DD-MM-YYYY, YYYY-MM-DD, ISO ou Date.');
      }

      const q = query(
        collection(db, 'projetos'),
        where('dataInicio', '>=', start),
        where('dataInicio', '<=', end),
        orderBy('dataInicio', 'asc')
      );
      const snapshot = await getDocs(q);
      
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
    } catch (error) {
      console.error('Erro ao buscar projetos por data:', error);
      throw error;
    }
  },

  // 🔧 NOVA FUNÇÃO: Migrar projetos antigos para novo formato
  async migrateOldProjects() {
    try {
      console.log('🔄 Iniciando migração de projetos antigos...');
      
      // Buscar todos os projetos
      const allProjects = await this.getAllProjects();
      
      // Buscar todos os usuários para fazer o mapeamento
      const usersSnapshot = await getDocs(collection(db, 'usuarios'));
      const users = usersSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      let migratedCount = 0;
      
      for (const project of allProjects) {
        let needsUpdate = false;
        const updates = {};
        
        // Migrar produtor
        if (project.produtorId && !project.produtorUid) {
          const producer = users.find(u => u.id === project.produtorId);
          if (producer) {
            updates.produtorUid = producer.uid;
            updates.produtorNome = producer.nome;
            updates.produtorEmail = producer.email;
            needsUpdate = true;
          }
        }
        
        // Migrar consultor
        if (project.consultorId && !project.consultorUid) {
          const consultant = users.find(u => u.id === project.consultorId);
          if (consultant) {
            updates.consultorUid = consultant.uid;
            updates.consultorNome = consultant.nome;
            updates.consultorEmail = consultant.email;
            needsUpdate = true;
          }
        }
        
        // Migrar campos legados (nome para ID)
        if (project.produtor && !project.produtorId) {
          const producer = users.find(u => u.nome === project.produtor);
          if (producer) {
            updates.produtorId = producer.id;
            updates.produtorUid = producer.uid;
            updates.produtorNome = producer.nome;
            updates.produtorEmail = producer.email;
            needsUpdate = true;
          }
        }
        
        if (project.consultor && !project.consultorId) {
          const consultant = users.find(u => u.nome === project.consultor);
          if (consultant) {
            updates.consultorId = consultant.id;
            updates.consultorUid = consultant.uid;
            updates.consultorNome = consultant.nome;
            updates.consultorEmail = consultant.email;
            needsUpdate = true;
          }
        }
        
        if (needsUpdate) {
          await this.updateProject(project.id, updates);
          migratedCount++;
          console.log(`✅ Projeto migrado: ${project.nome}`);
        }
      }
      
      console.log(`🎉 Migração concluída! ${migratedCount} projetos atualizados.`);
      return migratedCount;
    } catch (error) {
      console.error('❌ Erro na migração:', error);
      throw error;
    }
  }
};
