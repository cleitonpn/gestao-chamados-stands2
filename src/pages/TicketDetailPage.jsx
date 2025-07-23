import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { ticketService, TICKET_STATUS } from '../services/ticketService';
import { projectService } from '../services/projectService';
import { userService, AREAS } from '../services/userService';
import { messageService } from '../services/messageService';
// ✅ REMOVIDA A IMPORTAÇÃO CONFLITANTE
// import { firestoreNotificationService } from '../services/firestoreNotificationService';
// 🔔 IMPORTAÇÃO DO SERVIÇO DE NOTIFICAÇÕES (agora é a única fonte)
import notificationService from '../services/notificationService';
import ImageUpload from '../components/ImageUpload';
import Header from '../components/Header';
// ... (resto dos imports de componentes UI)
import { 
  ArrowLeft, 
  Clock, 
  // ... (resto dos imports de ícones)
  AtSign
} from 'lucide-react';

const TicketDetailPage = () => {
  const { ticketId } = useParams();
  const navigate = useNavigate();
  const { user, userProfile } = useAuth();
  
  // ... (todos os useState hooks permanecem os mesmos)

  const loadTicketData = async () => {
    // ... (código da função permanece o mesmo)
  };

  useEffect(() => {
    if (ticketId && user) {
      loadTicketData();
      markNotificationsAsRead();
    }
  }, [ticketId, user]);

  // ✅ Função corrigida para usar o serviço de alto nível
  const markNotificationsAsRead = async () => {
    if (!user?.uid || !ticketId) return;
    
    try {
      // Usa a função exposta pelo serviço de alto nível
      await notificationService.markTicketNotificationsAsRead(user.uid, ticketId);
      console.log('✅ Notificações marcadas como lidas para o chamado:', ticketId);
    } catch (error) {
      console.error('❌ Erro ao marcar notificações como lidas:', error);
    }
  };

  // ... (O resto do arquivo TicketDetailPage.jsx permanece exatamente o mesmo)
  // ... (As chamadas para notificationService.notify... já estavam corretas)

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ... (código JSX do return permanece idêntico) ... */}
    </div>
  );
};

export default TicketDetailPage;
