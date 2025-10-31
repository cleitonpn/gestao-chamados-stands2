// src/App.jsx
import React, { useEffect } from 'react';
import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
// ⬇️ IMPORTAMOS O 'useAuth' DO SEU CONTEXTO
import { AuthProvider, useAuth } from './contexts/AuthContext'; 
import { NewNotificationProvider } from './contexts/NewNotificationContext';

// ⬇️ IMPORTAMOS AS FUNÇÕES DO ARQUIVO QUE CORRIGIMOS
import { getOrCreateSubscription, saveSubscriptionInFirestore } from './lib/pushClient'; 

import ProtectedRoute from './components/ProtectedRoute';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import NewTicketPage from './pages/NewTicketPage';
import ProjectsPage from './pages/ProjectsPage';
import ProjectFormPage from './pages/ProjectFormPage';
import ProjectDetailPage from './pages/ProjectDetailPage';
import TicketDetailPage from './pages/TicketDetailPage';
import UsersPage from './pages/UsersPage';
import ReportsPage from './pages/ReportsPage';
import AnalyticsPage from './pages/AnalyticsPage';
import TemplateManagerPage from './pages/TemplateManagerPage';
import OperationalDashboard from './pages/OperationalDashboard';
import OperationalPanel from './pages/OperationalPanel';
import TVPanel from './pages/TVPanel';
import CronogramaPage from './pages/CronogramaPage';
import AdminPanelPage from './pages/AdminPanelPage';
import ChamadosFiltradosPage from './pages/ChamadosFiltradosPage';
import EventsPage from './pages/EventsPage';
import GamingPage from './pages/GamingPage';
import ProjectSummaryPage from "./pages/ProjectSummaryPage";
import ContractorProjectPage from "./pages/ContractorProjectPage";
import AllDiariesPage from './pages/AllDiariesPage';
import UserProfilePage from "./pages/UserProfilePage";
import RomaneiosPage from "./pages/RomaneiosPage";
import RomaneioDriverPage from "./pages/RomaneioDriverPage";

import './App.css';

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY || '';

// =================================================================
// ⬇️ HOOK DE INSCRIÇÃO (O mesmo de antes)
// =================================================================
const usePushNotificationSubscription = () => {
  const { user } = useAuth(); // Agora isso vai funcionar

  useEffect(() => {
    if (!user || !user.uid) {
      return; 
    }
    if (!VAPID_PUBLIC_KEY) {
      console.warn('[push] VITE_VAPID_PUBLIC_KEY ausente no .env. Não é possível assinar.');
      return;
    }

    const setupPushNotifications = async (userId) => {
      try {
        const subResult = await getOrCreateSubscription(VAPID_PUBLIC_KEY);
        if (subResult.ok && subResult.subscription) {
          await saveSubscriptionInFirestore({
            userId: userId,
            subscription: subResult.subscription,
          });
          console.log('[push] Inscrição de push salva com sucesso no Firestore!');
        } else if (!subResult.ok) {
          console.warn('[push] Falha ao obter inscrição:', subResult.reason);
        }
      } catch (error) {
        console.error('[push] Erro ao configurar push notifications:', error);
      }
    };

    setupPushNotifications(user.uid);
  }, [user]);
};

// =================================================================
// ⬇️ NOVO COMPONENTE INTERNO (A CORREÇÃO)
// =================================================================
/**
 * Este componente renderiza todo o conteúdo do App,
 * mas ele só é chamado DEPOIS que os Providers já existem.
 */
function AppContent() {
  // Agora o hook é chamado aqui, de forma segura,
  // pois <AppContent /> é um FILHO de <AuthProvider>
  usePushNotificationSubscription();

  return (
    <div className="App">
      <Routes>
        {/* Rota pública - Login */}
        <Route path="/login" element={<LoginPage />} />

        {/* ... (todas as suas outras rotas) ... */}
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <DashboardPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/novo-chamado"
          element={
            <ProtectedRoute>
              <NewTicketPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/projetos"
          element={
            <ProtectedRoute>
              <ProjectsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/projetos/novo"
          element={
            <ProtectedRoute requiredRole="administrador">
              <ProjectFormPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/projetos/editar/:projectId"
          element={
            <ProtectedRoute requiredRole="administrador">
              <ProjectFormPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/projeto/:projectId"
          element={
            <ProtectedRoute>
              <ProjectDetailPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/cronograma"
          element={
            <ProtectedRoute>
              <CronogramaPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/eventos"
          element={
            <ProtectedRoute requiredRole="administrador">
              <EventsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/chamado/:ticketId"
          element={
            <ProtectedRoute>
              <TicketDetailPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/usuarios"
          element={
            <ProtectedRoute requiredRole="administrador">
              <UsersPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/perfil"
          element={
            <ProtectedRoute>
              <UserProfilePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/relatorios"
          element={
            <ProtectedRoute>
              <ReportsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/gaming"
          element={
            <ProtectedRoute>
              <GamingPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/painel"
          element={
            <ProtectedRoute requiredRole="administrador">
              <AdminPanelPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/analytics"
          element={
            <ProtectedRoute requiredRoles={['administrador', 'gerente']}>
              <AnalyticsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/templates"
          element={
            <ProtectedRoute requiredRole="administrador">
              <TemplateManagerPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/chamados-filtrados"
          element={
            <ProtectedRoute requiredRole="administrador">
              <ChamadosFiltradosPage />
            </ProtectedRoute>
          }
        />
        <Route path="/resumo-projeto" element={<ProjectSummaryPage />} />
        <Route path="/painel-operacional" element={<OperationalPanel />} />
        <Route path="/empreiteiro" element={<ContractorProjectPage />} />
        <Route path="/empreiteiro/:projectId" element={<ContractorProjectPage />} />
        <Route path="/painel-tv" element={<TVPanel />} />
        <Route
          path="/diarios"
          element={
            <ProtectedRoute>
              <AllDiariesPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/logistica/romaneios"
          element={
            <ProtectedRoute requiredArea="logistica">
              <RomaneiosPage />
            </ProtectedRoute>
          }
        />
        <Route path="/logistica/romaneios/:id/driver" element={<RomaneioDriverPage />} />
        <Route path="/driver/romaneio/:token" element={<RomaneioDriverPage />} />
        <Route
          path="/admin/romaneios"
          element={
            <ProtectedRoute requiredRole="administrador">
              <RomaneiosPage />
            </ProtectedRoute>
          }
        />
        {/* Redirecionamentos */}
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </div>
  );
}

// =================================================================
// ⬇️ FUNÇÃO 'App' PRINCIPAL (AGORA SÓ CUIDA DOS PROVIDERS)
// =================================================================
function App() {
  return (
    <AuthProvider>
      <NewNotificationProvider>
        <Router>
          {/* Agora a lógica principal (rotas e o hook) está 
            dentro do <AppContent />, que é filho dos providers.
          */}
          <AppContent />
        </Router>
      </NewNotificationProvider>
    </AuthProvider>
  );
}

export default App;
