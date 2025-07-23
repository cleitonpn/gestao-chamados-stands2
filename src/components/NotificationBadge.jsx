import React from 'react';

/**
 * Componente de badge de notificação para chamados
 * Versão SEM dependência do lucide-react
 * Mostra um círculo vermelho com número quando há atualizações não visualizadas
 */
const NotificationBadge = ({ 
  unreadCount = 0, 
  onClick, 
  className = "",
  size = "default" // "small", "default", "large"
}) => {
  const sizeClasses = {
    small: "w-4 h-4",
    default: "w-5 h-5", 
    large: "w-6 h-6"
  };

  const badgeSizeClasses = {
    small: "w-3 h-3 text-[8px]",
    default: "w-4 h-4 text-[10px]",
    large: "w-5 h-5 text-xs"
  };

  const badgePositionClasses = {
    small: "-top-1 -right-1",
    default: "-top-1.5 -right-1.5",
    large: "-top-2 -right-2"
  };

  return (
    <div className={`relative inline-flex items-center justify-center ${className}`}>
      {/* Ícone do olho usando SVG */}
      <div 
        className={`${sizeClasses[size]} text-gray-600 hover:text-gray-800 cursor-pointer transition-colors flex items-center justify-center`}
        onClick={onClick}
        title="Visualizar chamado"
      >
        <svg 
          viewBox="0 0 24 24" 
          fill="none" 
          stroke="currentColor" 
          strokeWidth="2" 
          strokeLinecap="round" 
          strokeLinejoin="round"
          className="w-full h-full"
        >
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
          <circle cx="12" cy="12" r="3"/>
        </svg>
      </div>
      
      {/* Badge de notificação */}
      {unreadCount > 0 && (
        <div 
          className={`
            absolute ${badgePositionClasses[size]} ${badgeSizeClasses[size]}
            bg-red-500 text-white rounded-full 
            flex items-center justify-center
            font-bold leading-none
            animate-pulse
            shadow-lg
            border border-white
            z-10
          `}
          title={`${unreadCount} atualização${unreadCount > 1 ? 'ões' : ''} não vista${unreadCount > 1 ? 's' : ''}`}
        >
          {unreadCount > 99 ? '99+' : unreadCount}
        </div>
      )}
    </div>
  );
};

export default NotificationBadge;

