import React from 'react';
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
import ChamadosFiltradosPage from './pages/ChamadosFiltradosPage';// NOVA IMPORTAÇÃO
import EventsPage from './pages/EventsPage'; // NOVA IMPORTAÇÃO: Página de eventos
- import TemplateManagerPage from './pages/TemplateManagerPage';
+ import TemplateManagerPage from './pages/TemplateManagerPage';
+ import GamingPage from './pages/GamingPage';
import './App.css';

function App() {
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
              
              {/* NOVA ROTA: Cronograma de Eventos - Acessível a todos */}
              <Route 
                path="/cronograma" 
                element={
                  <ProtectedRoute>
                    <CronogramaPage />
                  </ProtectedRoute>
                } 
              />
              
              {/* NOVA ROTA: Eventos - Apenas administradores */}
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
                path="/relatorios" 
                element={
                  <ProtectedRoute>
                    <ReportsPage />
                  </ProtectedRoute>
                } 
              />
<Route
+   path="/gaming"
+   element={
+     <ProtectedRoute>
+       <GamingPage />
+     </ProtectedRoute>
+   }
+ />
              <Route path="/admin/painel" element={
  <ProtectedRoute requiredRole="administrador">
    <AdminPanelPage />
  </ProtectedRoute>
} />
              
              <Route 
                path="/analytics" 
                element={
                  <ProtectedRoute requiredRoles={["administrador", "gerente"]}>
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
              
              <Route path="/admin/chamados-filtrados" element={
  <ProtectedRoute requiredRole="administrador">
    <ChamadosFiltradosPage />
  </ProtectedRoute>
} />
              
              {/* Rota para painel operacional - sem header */}
              <Route 
                path="/painel-operacional" 
                element={<OperationalPanel />} 
              />
              
              {/* Rota para painel TV - sem header, sem login */}
              <Route 
                path="/painel-tv" 
                element={<TVPanel />} 
              />
              
              {/* Redirecionar raiz para dashboard */}
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              
              {/* Rota 404 - redirecionar para dashboard */}
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </div>
        </Router>
      </NewNotificationProvider>
    </AuthProvider>
  );
}

export default App;

