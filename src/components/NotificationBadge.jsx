import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
// ✅ IMPORTAÇÃO CORRIGIDA PARA USAR O SERVIÇO DE ALTO NÍVEL
import notificationService from '../services/notificationService';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Bell, 
  BellRing, 
  X, 
  MessageSquare, 
  AlertTriangle, 
  CheckCircle, 
  Calendar,
  ExternalLink,
  Trash2,
  Mail,
  MailOpen,
  Clock,
  User,
  FileText
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const NotificationBadge = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const dropdownRef = useRef(null);

  useEffect(() => {
    if (user?.uid) {
      setLoading(true);
      // ✅ Agora usa o serviço correto, que foi corrigido para expor este método
      const unsubscribe = notificationService.subscribeToNotifications(
        user.uid,
        (newNotifications) => {
          setNotifications(newNotifications);
          const unread = newNotifications.filter(n => !n.lida).length;
          setUnreadCount(unread);
          setLoading(false);
        }
      );

      return () => {
        if (unsubscribe) {
          unsubscribe();
        }
      };
    }
  }, [user?.uid]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // ✅ Todas as funções abaixo agora chamam o serviço de alto nível,
  // que por sua vez chama o serviço de baixo nível. A arquitetura está correta.

  const markAsRead = async (notificationId) => {
    try {
      await notificationService.markAsRead(user.uid, notificationId);
    } catch (error) {
      console.error('Erro ao marcar notificação como lida:', error);
    }
  };

  const markAsUnread = async (notificationId) => {
    try {
      await notificationService.markAsUnread(user.uid, notificationId);
    } catch (error) {
      console.error('Erro ao marcar notificação como não lida:', error);
    }
  };

  const markAllAsRead = async () => {
    try {
      await notificationService.markAllAsRead(user.uid);
    } catch (error) {
      console.error('Erro ao marcar todas as notificações como lidas:', error);
    }
  };

  const deleteNotification = async (notificationId) => {
    try {
      await notificationService.deleteNotification(user.uid, notificationId);
    } catch (error) {
      console.error('Erro ao deletar notificação:', error);
    }
  };

  const handleNotificationClick = async (notification) => {
    if (!notification.lida) {
      await markAsRead(notification.id);
    }
    if (notification.link) {
      if (notification.link.startsWith('/')) {
        navigate(notification.link);
      } else {
        window.open(notification.link, '_blank');
      }
    }
    setIsOpen(false);
  };
  
  // O resto do componente (getNotificationIcon, formatNotificationTime, JSX)
  // já estava usando os nomes de campo corretos ('lida', 'titulo', 'tipo'),
  // então não precisa de mais alterações.
  
  // ... (o resto do código do componente permanece o mesmo)
  const getNotificationIcon = (type) => {
    switch (type) {
      case 'new_ticket':
        return <FileText className="h-4 w-4 text-blue-500" />;
      case 'new_message':
        return <MessageSquare className="h-4 w-4 text-green-500" />;
      case 'ticket_escalated':
        return <AlertTriangle className="h-4 w-4 text-orange-500" />;
      case 'escalated_to_manager':
        return <User className="h-4 w-4 text-purple-500" />;
      case 'status_changed':
        return <CheckCircle className="h-4 w-4 text-indigo-500" />;
      case 'new_event':
        return <Calendar className="h-4 w-4 text-pink-500" />;
      default:
        return <Bell className="h-4 w-4 text-gray-500" />;
    }
  };

  const getNotificationTypeLabel = (type) => {
    switch (type) {
      case 'new_ticket':
        return 'Novo Chamado';
      case 'new_message':
        return 'Nova Mensagem';
      case 'ticket_escalated':
        return 'Escalação';
      case 'escalated_to_manager':
        return 'Escalação Gerencial';
      case 'status_changed':
        return 'Mudança de Status';
      case 'new_event':
        return 'Novo Evento';
      default:
        return 'Notificação';
    }
  };

  const formatNotificationTime = (timestamp) => {
    if (!timestamp) return '';
    
    try {
      const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
      const now = new Date();
      const diffMs = now - date;
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMs / 3600000);
      const diffDays = Math.floor(diffMs / 86400000);

      if (diffMins < 1) return 'Agora';
      if (diffMins < 60) return `${diffMins}m atrás`;
      if (diffHours < 24) return `${diffHours}h atrás`;
      if (diffDays < 7) return `${diffDays}d atrás`;
      
      return date.toLocaleDateString('pt-BR');
    } catch (error) {
      return '';
    }
  };

  const filteredNotifications = notifications.filter(notification => {
    if (filter === 'unread' && notification.lida) return false;
    if (filter === 'read' && !notification.lida) return false;

    if (typeFilter !== 'all') {
      if (typeFilter === 'ticket' && !['new_ticket', 'status_changed'].includes(notification.tipo)) return false;
      if (typeFilter === 'message' && notification.tipo !== 'new_message') return false;
      if (typeFilter === 'escalation' && !['ticket_escalated', 'escalated_to_manager'].includes(notification.tipo)) return false;
      if (typeFilter === 'event' && notification.tipo !== 'new_event') return false;
    }

    return true;
  });

  return (
    <div className="relative" ref={dropdownRef}>
      {/* ... (código JSX do return permanece idêntico) ... */}
    </div>
  );
};

export default NotificationBadge;
