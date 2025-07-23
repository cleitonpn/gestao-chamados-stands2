import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import firestoreNotificationService from '../services/firestoreNotificationService';
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
  const { user, userProfile } = useAuth();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const dropdownRef = useRef(null);

  // Carregar notificações quando o usuário estiver logado
  useEffect(() => {
    if (user?.uid) {
      loadNotifications();
      // Configurar listener em tempo real
      const unsubscribe = firestoreNotificationService.subscribeToNotifications(
        user.uid,
        (newNotifications) => {
          setNotifications(newNotifications);
          const unread = newNotifications.filter(n => !n.lida).length;
          setUnreadCount(unread);
        }
      );

      return () => {
        if (unsubscribe) {
          unsubscribe();
        }
      };
    }
  }, [user?.uid]);

  // Fechar dropdown ao clicar fora
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const loadNotifications = async () => {
    if (!user?.uid) return;
    
    try {
      setLoading(true);
      const userNotifications = await firestoreNotificationService.getUserNotifications(user.uid);
      setNotifications(userNotifications);
      
      const unread = userNotifications.filter(n => !n.lida).length;
      setUnreadCount(unread);
    } catch (error) {
      console.error('Erro ao carregar notificações:', error);
    } finally {
      setLoading(false);
    }
  };

  const markAsRead = async (notificationId) => {
    try {
      await firestoreNotificationService.markAsRead(user.uid, notificationId);
      // O listener em tempo real atualizará automaticamente o estado
    } catch (error) {
      console.error('Erro ao marcar notificação como lida:', error);
    }
  };

  const markAsUnread = async (notificationId) => {
    try {
      await firestoreNotificationService.markAsUnread(user.uid, notificationId);
      // O listener em tempo real atualizará automaticamente o estado
    } catch (error) {
      console.error('Erro ao marcar notificação como não lida:', error);
    }
  };

  const markAllAsRead = async () => {
    try {
      await firestoreNotificationService.markAllAsRead(user.uid);
      // O listener em tempo real atualizará automaticamente o estado
    } catch (error) {
      console.error('Erro ao marcar todas as notificações como lidas:', error);
    }
  };

  const deleteNotification = async (notificationId) => {
    try {
      await firestoreNotificationService.deleteNotification(user.uid, notificationId);
      // O listener em tempo real atualizará automaticamente o estado
    } catch (error) {
      console.error('Erro ao deletar notificação:', error);
    }
  };

  const handleNotificationClick = async (notification) => {
    // Marcar como lida se não estiver lida
    if (!notification.lida) {
      await markAsRead(notification.id);
    }

    // Navegar para o destino da notificação
    if (notification.link) {
      if (notification.link.startsWith('/')) {
        navigate(notification.link);
      } else {
        window.open(notification.link, '_blank');
      }
    }

    // Fechar dropdown
    setIsOpen(false);
  };

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
    // Filtro por status de leitura
    if (filter === 'unread' && notification.lida) return false;
    if (filter === 'read' && !notification.lida) return false;

    // Filtro por tipo
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
      {/* Botão de Notificações */}
      <Button
        variant="ghost"
        size="sm"
        className="relative p-2"
        onClick={() => setIsOpen(!isOpen)}
      >
        {unreadCount > 0 ? (
          <BellRing className="h-5 w-5" />
        ) : (
          <Bell className="h-5 w-5" />
        )}
        
        {/* Badge de contagem */}
        {unreadCount > 0 && (
          <Badge 
            variant="destructive" 
            className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs"
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </Badge>
        )}
      </Button>

      {/* Dropdown de Notificações */}
      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-96 max-w-[90vw] bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-[80vh] overflow-hidden">
          {/* Header */}
          <div className="p-4 border-b border-gray-200">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold">Notificações</h3>
              <div className="flex items-center gap-2">
                {unreadCount > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={markAllAsRead}
                    className="text-xs"
                  >
                    <MailOpen className="h-3 w-3 mr-1" />
                    Marcar todas como lidas
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsOpen(false)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Filtros */}
            <div className="flex gap-2 mb-2">
              <select
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="text-xs border border-gray-300 rounded px-2 py-1"
              >
                <option value="all">Todas</option>
                <option value="unread">Não lidas</option>
                <option value="read">Lidas</option>
              </select>

              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="text-xs border border-gray-300 rounded px-2 py-1"
              >
                <option value="all">Todos os tipos</option>
                <option value="ticket">Chamados</option>
                <option value="message">Mensagens</option>
                <option value="escalation">Escalações</option>
                <option value="event">Eventos</option>
              </select>
            </div>

            {/* Contador */}
            <div className="text-xs text-gray-500">
              {filteredNotifications.length} notificação(ões) 
              {unreadCount > 0 && ` • ${unreadCount} não lida(s)`}
            </div>
          </div>

          {/* Lista de Notificações */}
          <div className="max-h-96 overflow-y-auto">
            {loading ? (
              <div className="p-4 text-center text-gray-500">
                Carregando notificações...
              </div>
            ) : filteredNotifications.length === 0 ? (
              <div className="p-4 text-center text-gray-500">
                {filter === 'unread' ? 'Nenhuma notificação não lida' : 'Nenhuma notificação'}
              </div>
            ) : (
              filteredNotifications.map((notification, index) => (
                <div key={notification.id}>
                  <div
                    className={`p-3 hover:bg-gray-50 cursor-pointer transition-colors ${
                      !notification.lida ? 'bg-blue-50 border-l-4 border-l-blue-500' : ''
                    }`}
                    onClick={() => handleNotificationClick(notification)}
                  >
                    <div className="flex items-start gap-3">
                      {/* Ícone */}
                      <div className="flex-shrink-0 mt-1">
                        {getNotificationIcon(notification.tipo)}
                      </div>

                      {/* Conteúdo */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-medium text-gray-600">
                            {getNotificationTypeLabel(notification.tipo)}
                          </span>
                          {!notification.lida && (
                            <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                          )}
                        </div>

                        <h4 className="text-sm font-medium text-gray-900 mb-1 line-clamp-2">
                          {notification.titulo}
                        </h4>

                        <p className="text-xs text-gray-600 mb-2 line-clamp-2">
                          {notification.mensagem}
                        </p>

                        <div className="flex items-center justify-between">
                          <span className="text-xs text-gray-500">
                            {formatNotificationTime(notification.criadoEm)}
                          </span>

                          <div className="flex items-center gap-1">
                            {/* Botão de marcar como lida/não lida */}
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (notification.lida) {
                                  markAsUnread(notification.id);
                                } else {
                                  markAsRead(notification.id);
                                }
                              }}
                            >
                              {notification.lida ? (
                                <Mail className="h-3 w-3" />
                              ) : (
                                <MailOpen className="h-3 w-3" />
                              )}
                            </Button>

                            {/* Botão de deletar */}
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0 text-red-500 hover:text-red-700"
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteNotification(notification.id);
                              }}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  {index < filteredNotifications.length - 1 && (
                    <div className="border-b border-gray-100"></div>
                  )}
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          {filteredNotifications.length > 0 && (
            <div className="p-3 border-t border-gray-200 bg-gray-50">
              <Button
                variant="ghost"
                size="sm"
                className="w-full text-xs"
                onClick={() => {
                  navigate('/notifications');
                  setIsOpen(false);
                }}
              >
                Ver todas as notificações
                <ExternalLink className="h-3 w-3 ml-1" />
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default NotificationBadge;

