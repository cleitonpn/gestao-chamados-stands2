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
import AdminPanelPage from './pages/AdminPanelPage'];
import ChamadosFiltradosPage from './pages/ChamadosFiltradosPage';
import EventsPage from './pages/EventsPage';
import GamingPage from './pages/GamingPage';
import ProjectSummaryPage from "./pages/ProjectSummaryPage";
import ContractorProjectPage from "./pages/ContractorProjectPage";
import AllDiariesPage from './pages/AllDiariesPage';
import UserProfilePage from "./pages/UserProfilePage";

// === Logística - Romaneios ===
import RomaneiosPage from "./pages/RomaneiosPage";
import RomaneioDriverPage from "./pages/RomaneioDriverPage";

import './App.css';

// === HELPERS para Web Push ===
const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY || '';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) output[i] = raw.charCodeAt(i);
  return output;
}

async function registerServiceWorkerAndSubscribe() {
  try {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      console.warn('[push] Browser não suporta ServiceWorker/Push.');
      return;
    }

    // pede permissão
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      console.warn('[push] Permissão negada.');
      return;
    }

    // registra o SW (arquivo está em /public/firebase-messaging-sw.js)
    const reg = await navigator.serviceWorker.register('/firebase-messaging-sw.js', { scope: '/' });
    await navigator.serviceWorker.ready;

    // assinatura
    let subscription = await reg.pushManager.getSubscription();
    if (!subscription) {
      if (!VAPID_PUBLIC_KEY) {
        console.warn('[push] VITE_VAPID_PUBLIC_KEY ausente; não é possível assinar.');
        return;
      }
      subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
    }

    // envia para o backend salvar
    const json = subscription.toJSON ? subscription.toJSON() : {
      endpoint: subscription.endpoint,
      keys: subscription.keys || null,
    };
    const uid = localStorage.getItem('uid') || localStorage.getItem('userId') || '';

    await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': uid || '',
      },
      body: JSON.stringify({ ...json, userId: uid || null }),
    }).catch((e) => console.error('[push] Falha ao registrar inscrição:', e));
  } catch (err) {
    console.error('[push] Erro no registro/inscrição:', err);
  }
}

function App() {
  // registra e assina push uma única vez
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

              {/* Cronograma */}
              <Route
                path="/cronograma"
                element={
                  <ProtectedRoute>
                    <CronogramaPage />
                  </ProtectedRoute>
                }
              />

              {/* Eventos */}
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

              {/* Perfil */}
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

              {/* Painel operacional (sem header) */}
              <Route path="/painel-operacional" element={<OperationalPanel />} />

              <Route path="/empreiteiro" element={<ContractorProjectPage />} />
              <Route path="/empreiteiro/:projectId" element={<ContractorProjectPage />} />

              {/* Painel TV (sem login) */}
              <Route path="/painel-tv" element={<TVPanel />} />

              {/* Diários */}
              <Route
                path="/diarios"
                element={
                  <ProtectedRoute>
                    <AllDiariesPage />
                  </ProtectedRoute>
                }
              />

              {/* === Logística / Romaneios === */}
              <Route
                path="/logistica/romaneios"
                element={
                  <ProtectedRoute requiredArea="logistica">
                    <RomaneiosPage />
                  </ProtectedRoute>
                }
              />
              {/* Link público para motorista (via link/QR) */}
              <Route path="/logistica/romaneios/:id/driver" element={<RomaneioDriverPage />} />
              {/* Rota alternativa para administradores */}
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
        </Router>
      </NewNotificationProvider>
    </AuthProvider>
  );
}

export default App;
