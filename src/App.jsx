// src/App.jsx
import React, { useEffect } from 'react';
import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { NewNotificationProvider } from './contexts/NewNotificationContext';
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

import './App.css';

// ---------- PUSH / SERVICE WORKER ----------
const urlB64ToUint8Array = (b64) => {
  const padding = '='.repeat((4 - (b64.length % 4)) % 4);
  const base64 = (b64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) arr[i] = raw.charCodeAt(i);
  return arr;
};

async function registerServiceWorkerAndSubscribe() {
  try {
    // checagens básicas
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      console.warn('[push] SW/Push não suportado neste navegador.');
      return;
    }

    // registra o SW do Firebase Messaging (está em /public)
    const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js', { scope: '/' });
    await navigator.serviceWorker.ready; // garante que está pronto

    // pede permissão se necessário
    if ('Notification' in window && Notification.permission !== 'granted') {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') {
        console.warn('[push] Permissão negada ou ignorada.');
        return;
      }
    }

    // assina (caso ainda não exista)
    const existing = await registration.pushManager.getSubscription();
    if (existing) {
      window.__PUSH_DEBUG__ = { hasSubscription: true };
      return; // já está assinado
    }

    const publicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
    if (!publicKey) {
      console.warn('[push] VITE_VAPID_PUBLIC_KEY ausente; não vou assinar.');
      return;
    }

    const sub = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlB64ToUint8Array(publicKey),
    });

    // envia a inscrição para o backend salvar
    await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sub),
    });

    window.__PUSH_DEBUG__ = { hasSubscription: true, endpoint: sub?.endpoint };
    console.log('[push] Inscrição criada e enviada ao servidor.');
  } catch (err) {
    console.error('[push] Falha ao registrar/assinar:', err);
  }
}

function App() {
  // registra o SW e tenta assinar na montagem do app
  useEffect(() => {
    registerServiceWorkerAndSubscribe();
  }, []);

  return (
    <AuthProvider>
      <NewNotificationProvider>
        <Router>
          <div className="App">
            <Routes>
              {/* Rota pública - Login */}
              <Route path="/login" element={<LoginPage />} />

              {/* Rotas protegidas */}
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

              {/* Cronograma de Eventos */}
              <Route
                path="/cronograma"
                element={
                  <ProtectedRoute>
                    <CronogramaPage />
                  </ProtectedRoute>
                }
              />

              {/* Eventos - apenas administradores */}
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

              {/* Perfil do Usuário */}
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

              {/* Painéis sem header */}
              <Route path="/painel-operacional" element={<OperationalPanel />} />
              <Route path="/empreiteiro" element={<ContractorProjectPage />} />
              <Route path="/empreiteiro/:projectId" element={<ContractorProjectPage />} />
              <Route path="/painel-tv" element={<TVPanel />} />

              {/* Feed de diários */}
              <Route
                path="/diarios"
                element={
                  <ProtectedRoute>
                    <AllDiariesPage />
                  </ProtectedRoute>
                }
              />

              {/* Redirecionamentos */}
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </div>
        </Router>
      </NewNotificationProvider>
    </AuthProvider>
  );
}

export default App;
