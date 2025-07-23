import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Loader2 } from 'lucide-react';

const ProtectedRoute = ({ children, requiredRole = null, requiredRoles = null, requiredArea = null }) => {
  const { user, userProfile, loading } = useAuth();
  const location = useLocation();

  // DEBUG: Log para identificar o problema
  console.log('🔍 ProtectedRoute Debug:', {
    user: user ? 'Logado' : 'Não logado',
    userProfile: userProfile,
    loading: loading,
    requiredRole: requiredRole,
    requiredRoles: requiredRoles,
    currentPath: location.pathname
  });

  if (loading) {
    console.log('⏳ ProtectedRoute: Ainda carregando...');
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p>Carregando...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    console.log('❌ ProtectedRoute: Usuário não logado, redirecionando para login');
    // Redirecionar para login, salvando a localização atual
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Verificar se o perfil do usuário foi carregado
  if (!userProfile) {
    console.log('❌ ProtectedRoute: Perfil do usuário não carregado');
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600">Erro ao carregar perfil do usuário</p>
          <p className="text-sm text-gray-600 mt-2">
            Entre em contato com o administrador
          </p>
          <div className="mt-4 p-4 bg-gray-100 rounded text-left text-xs">
            <strong>Debug Info:</strong><br/>
            User: {user ? 'Existe' : 'Null'}<br/>
            UserProfile: {userProfile ? 'Existe' : 'Null'}<br/>
            Loading: {loading ? 'True' : 'False'}
          </div>
        </div>
      </div>
    );
  }

  // DEBUG: Log da verificação de permissões
  console.log('🔐 ProtectedRoute: Verificando permissões:', {
    userFunction: userProfile.funcao,
    requiredRole: requiredRole,
    requiredRoles: requiredRoles,
    hasAccess: requiredRole ? userProfile.funcao === requiredRole : true
  });

  // Verificar permissões de função (single role)
  if (requiredRole && userProfile.funcao !== requiredRole) {
    console.log(`❌ ProtectedRoute: Acesso negado - Função atual: "${userProfile.funcao}", Requerida: "${requiredRole}"`);
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600">Acesso negado. Esta página é restrita a administradores.</p>
          <p className="text-sm text-gray-600 mt-2">
            Você não tem permissão para acessar esta página
          </p>
          <div className="mt-4 p-4 bg-gray-100 rounded text-left text-xs">
            <strong>Debug Info:</strong><br/>
            Sua função: "{userProfile.funcao}"<br/>
            Função requerida: "{requiredRole}"<br/>
            Página: {location.pathname}
          </div>
        </div>
      </div>
    );
  }

  // Verificar permissões de função (multiple roles)
  if (requiredRoles && !requiredRoles.includes(userProfile.funcao)) {
    console.log(`❌ ProtectedRoute: Acesso negado - Função atual: "${userProfile.funcao}", Requeridas: [${requiredRoles.join(', ')}]`);
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600">Acesso negado</p>
          <p className="text-sm text-gray-600 mt-2">
            Você não tem permissão para acessar esta página
          </p>
          <div className="mt-4 p-4 bg-gray-100 rounded text-left text-xs">
            <strong>Debug Info:</strong><br/>
            Sua função: "{userProfile.funcao}"<br/>
            Funções requeridas: [{requiredRoles.join(', ')}]<br/>
            Página: {location.pathname}
          </div>
        </div>
      </div>
    );
  }

  // Verificar permissões de área
  if (requiredArea && userProfile.area !== requiredArea) {
    console.log(`❌ ProtectedRoute: Acesso negado - Área atual: "${userProfile.area}", Requerida: "${requiredArea}"`);
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600">Acesso negado</p>
          <p className="text-sm text-gray-600 mt-2">
            Você não tem permissão para acessar esta área
          </p>
        </div>
      </div>
    );
  }

  console.log('✅ ProtectedRoute: Acesso permitido, renderizando página');
  return children;
};

export default ProtectedRoute;

