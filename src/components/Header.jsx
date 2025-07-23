import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNewNotifications } from '../contexts/NewNotificationContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Bell, 
  BellRing, 
  User, 
  LogOut, 
  Settings,
  CheckCircle,
  AlertCircle,
  Clock,
  X,
  Volume2,
  VolumeX
} from 'lucide-react';

const Header = ({ title = "Gestão de Chamados" }) => {
  const { user, userProfile, logout } = useAuth();
  const { 
    notifications, 
    unreadCount, 
    soundEnabled,
    markAsRead, 
    markAllAsRead, 
    toggleSound,
    testNotification,
    getRecentNotifications,
    getStatus
  } = useNewNotifications();
  
  const [notificationOpen, setNotificationOpen] = useState(false);

  // Obter notificações recentes para exibição
  const recentNotifications = getRecentNotifications(10);

  // Marcar notificação como lida
  const handleMarkAsRead = (notificationId) => {
    markAsRead(notificationId);
  };

  // Marcar todas como lidas
  const handleMarkAllAsRead = () => {
    markAllAsRead();
  };

  // Testar sistema de notificações
  const handleTestNotifications = () => {
    testNotification();
  };

  // Alternar som das notificações
  const handleToggleSound = () => {
    toggleSound();
  };

  // Obter ícone da notificação
  const getNotificationIcon = (tipo) => {
    switch (tipo) {
      case 'status_update':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'escalation':
        return <AlertCircle className="h-4 w-4 text-orange-500" />;
      case 'assignment':
        return <User className="h-4 w-4 text-blue-500" />;
      default:
        return <Bell className="h-4 w-4 text-gray-500" />;
    }
  };

  // Formatar data
  const formatDate = (dateString) => {
    try {
      const date = new Date(dateString);
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
      return 'Data inválida';
    }
  };

  return (
    <header className="bg-white shadow-sm border-b border-gray-200 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-2 sm:px-4 lg:px-8">
        <div className="flex justify-between items-center h-14 sm:h-16">
          {/* Logo e Título */}
          <div className="flex items-center space-x-2 sm:space-x-4 min-w-0 flex-1">
            <h1 className="text-lg sm:text-xl lg:text-2xl font-bold text-gray-900 truncate">
              {title}
            </h1>
            {userProfile && (
              <span className="hidden sm:inline-block text-xs sm:text-sm text-gray-500 bg-gray-100 px-2 py-1 rounded-full">
                Bem-vindo, {userProfile.nome || 'Usuário'}!
              </span>
            )}
          </div>

          {/* Ações do usuário */}
          <div className="flex items-center space-x-1 sm:space-x-3">
            {/* Notificações */}
            <Popover open={notificationOpen} onOpenChange={setNotificationOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="relative p-2 hover:bg-gray-100"
                >
                  {unreadCount > 0 ? (
                    <BellRing className="h-4 w-4 sm:h-5 sm:w-5 text-orange-500" />
                  ) : (
                    <Bell className="h-4 w-4 sm:h-5 sm:w-5 text-gray-600" />
                  )}
                  {unreadCount > 0 && (
                    <Badge 
                      variant="destructive" 
                      className="absolute -top-1 -right-1 h-4 w-4 sm:h-5 sm:w-5 text-xs p-0 flex items-center justify-center"
                    >
                      {unreadCount > 99 ? '99+' : unreadCount}
                    </Badge>
                  )}
                </Button>
              </PopoverTrigger>
              
              <PopoverContent className="w-72 sm:w-80 p-0 mr-2 sm:mr-0" align="end">
                <Card className="border-0 shadow-lg">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm font-medium">
                        Notificações {unreadCount > 0 && `(${unreadCount})`}
                      </CardTitle>
                      <div className="flex items-center space-x-2">
                        {/* Botão de som */}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={handleToggleSound}
                          className="p-1"
                          title={soundEnabled ? "Desativar som" : "Ativar som"}
                        >
                          {soundEnabled ? (
                            <Volume2 className="h-3 w-3" />
                          ) : (
                            <VolumeX className="h-3 w-3" />
                          )}
                        </Button>
                        
                        {/* Botão de teste */}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={handleTestNotifications}
                          className="text-xs p-1"
                          title="Testar notificações"
                        >
                          🧪
                        </Button>
                        
                        {/* Marcar todas como lidas */}
                        {unreadCount > 0 && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleMarkAllAsRead}
                            className="text-xs"
                          >
                            <span className="hidden sm:inline">Marcar todas como lidas</span>
                            <span className="sm:hidden">Marcar lidas</span>
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardHeader>          
                  <CardContent className="p-0">
                    <ScrollArea className="h-80">
                      {recentNotifications.length === 0 ? (
                        <div className="flex items-center justify-center py-8">
                          <div className="text-center">
                            <Bell className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                            <div className="text-sm text-gray-500">Nenhuma notificação</div>
                          </div>
                        </div>
                      ) : (
                        <div className="divide-y divide-gray-100">
                          {recentNotifications.map((notification) => (
                            <div
                              key={notification.id}
                              className={`p-4 hover:bg-gray-50 cursor-pointer transition-colors group ${
                                !notification.read ? 'bg-blue-50 border-l-4 border-l-blue-500' : ''
                              }`}
                              onClick={() => !notification.read && handleMarkAsRead(notification.id)}
                            >
                              <div className="flex items-start space-x-3">
                                <div className="flex-shrink-0 mt-0.5">
                                  <span className="text-lg">{notification.icon || '🔔'}</span>
                                </div>
                                
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center justify-between">
                                    <p className="text-sm font-medium text-gray-900 truncate">
                                      {notification.title}
                                    </p>
                                    {!notification.read && (
                                      <div className="w-2 h-2 bg-blue-500 rounded-full flex-shrink-0"></div>
                                    )}
                                  </div>
                                  
                                  <p className="text-sm text-gray-600 mt-1">
                                    {notification.message}
                                  </p>
                                  
                                  <div className="flex items-center mt-2 text-xs text-gray-500">
                                    <Clock className="h-3 w-3 mr-1" />
                                    {formatDate(notification.timestamp)}
                                    {notification.priority && (
                                      <>
                                        <span className="mx-2">•</span>
                                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                                          notification.priority === 'urgente' ? 'bg-red-100 text-red-800' :
                                          notification.priority === 'alta' ? 'bg-orange-100 text-orange-800' :
                                          notification.priority === 'media' ? 'bg-blue-100 text-blue-800' :
                                          'bg-green-100 text-green-800'
                                        }`}>
                                          {notification.priority}
                                        </span>
                                      </>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </ScrollArea>
                  </CardContent>
                </Card>
              </PopoverContent>
            </Popover>

            {/* Perfil do usuário */}
            <div className="flex items-center space-x-2">
              <div className="text-right">
                <div className="text-sm font-medium text-gray-900">
                  {userProfile?.nome || user?.email?.split('@')[0] || 'Usuário'}
                </div>
                <div className="text-xs text-gray-500">
                  {user?.email}
                </div>
              </div>
              
              <Button
                variant="ghost"
                size="sm"
                onClick={logout}
                className="text-gray-500 hover:text-gray-700"
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;

