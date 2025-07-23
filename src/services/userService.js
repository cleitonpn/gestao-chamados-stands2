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
  orderBy 
} from 'firebase/firestore';
import { db } from '../config/firebase';

// Perfis de usuário disponíveis
export const USER_ROLES = {
  ADMIN: 'administrador',
  PRODUCER: 'produtor',
  CONSULTANT: 'consultor',
  MANAGER: 'gerente',
  OPERATOR: 'operador',
  COMMERCIAL: 'comercial'
};

// Áreas de atuação
export const AREAS = {
  LOGISTICS: 'logistica',
  WAREHOUSE: 'almoxarifado',
  VISUAL_COMMUNICATION: 'comunicacao_visual',
  RENTAL: 'locacao',
  PURCHASES: 'compras',
  PRODUCTION: 'producao',
  COMMERCIAL: 'comercial',
  OPERATIONS: 'operacional',
  FINANCIAL: 'financeiro',
  PROJECTS: 'projetos',
  LOGOTIPIA: 'logotipia',
  // NOVAS ÁREAS ADICIONADAS
  TECHNICAL_DETAILING: 'detalhamento_tecnico',
  SUB_RENTAL: 'sub_locacao'
};

export const userService = {
  // Criar usuário
  async createUser(userData) {
    try {
      const docRef = await addDoc(collection(db, 'usuarios'), {
        ...userData,
        createdAt: new Date(),
        updatedAt: new Date()
      });
      return docRef.id;
    } catch (error) {
      console.error('Erro ao criar usuário:', error);
      throw error;
    }
  },

  // Obter todos os usuários
  async getAllUsers() {
    try {
      const querySnapshot = await getDocs(collection(db, 'usuarios'));
      const users = [];
      querySnapshot.forEach((doc) => {
        users.push({ id: doc.id, ...doc.data() });
      });
      return users;
    } catch (error) {
      console.error('Erro ao buscar usuários:', error);
      throw error;
    }
  },

  // Obter usuário por ID
  async getUserById(userId) {
    try {
      const docRef = doc(db, 'usuarios', userId);
      const docSnap = await getDoc(docRef);
      
      if (docSnap.exists()) {
        return { id: docSnap.id, ...docSnap.data() };
      } else {
        return null;
      }
    } catch (error) {
      console.error('Erro ao buscar usuário:', error);
      throw error;
    }
  },

  // Obter usuário por email
  async getUserByEmail(email) {
    try {
      const q = query(collection(db, 'usuarios'), where('email', '==', email));
      const querySnapshot = await getDocs(q);
      
      if (!querySnapshot.empty) {
        const doc = querySnapshot.docs[0];
        return { id: doc.id, ...doc.data() };
      } else {
        return null;
      }
    } catch (error) {
      console.error('Erro ao buscar usuário por email:', error);
      throw error;
    }
  },

  // Atualizar usuário
  async updateUser(userId, userData) {
    try {
      const docRef = doc(db, 'usuarios', userId);
      await updateDoc(docRef, {
        ...userData,
        updatedAt: new Date()
      });
      return true;
    } catch (error) {
      console.error('Erro ao atualizar usuário:', error);
      throw error;
    }
  },

  // Deletar usuário
  async deleteUser(userId) {
    try {
      await deleteDoc(doc(db, 'usuarios', userId));
      return true;
    } catch (error) {
      console.error('Erro ao deletar usuário:', error);
      throw error;
    }
  },

  // Obter usuários por função
  async getUsersByRole(role) {
    try {
      const q = query(collection(db, 'usuarios'), where('funcao', '==', role));
      const querySnapshot = await getDocs(q);
      const users = [];
      querySnapshot.forEach((doc) => {
        users.push({ id: doc.id, ...doc.data() });
      });
      return users;
    } catch (error) {
      console.error('Erro ao buscar usuários por função:', error);
      throw error;
    }
  },

  // Obter usuários por área
  async getUsersByArea(area) {
    try {
      const q = query(collection(db, 'usuarios'), where('area', '==', area));
      const querySnapshot = await getDocs(q);
      const users = [];
      querySnapshot.forEach((doc) => {
        users.push({ id: doc.id, ...doc.data() });
      });
      return users;
    } catch (error) {
      console.error('Erro ao buscar usuários por área:', error);
      throw error;
    }
  },

  // Obter operadores por área específica
  async getOperatorsByArea(area) {
    try {
      const q = query(
        collection(db, 'usuarios'), 
        where('funcao', '==', 'operador'),
        where('area', '==', area)
      );
      const querySnapshot = await getDocs(q);
      const operators = [];
      querySnapshot.forEach((doc) => {
        operators.push({ id: doc.id, ...doc.data() });
      });
      return operators;
    } catch (error) {
      console.error('Erro ao buscar operadores por área:', error);
      throw error;
    }
  },

  // Verificar se usuário existe
  async userExists(email) {
    try {
      const user = await this.getUserByEmail(email);
      return user !== null;
    } catch (error) {
      console.error('Erro ao verificar se usuário existe:', error);
      throw error;
    }
  },

  // Obter usuários ativos
  async getActiveUsers() {
    try {
      const q = query(collection(db, 'usuarios'), where('ativo', '==', true));
      const querySnapshot = await getDocs(q);
      const users = [];
      querySnapshot.forEach((doc) => {
        users.push({ id: doc.id, ...doc.data() });
      });
      return users;
    } catch (error) {
      console.error('Erro ao buscar usuários ativos:', error);
      throw error;
    }
  }
};

