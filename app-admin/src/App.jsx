import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext';
import { AdminAuthProvider } from './context/AdminAuthContext';
import { useAdminAuth } from './context/useAdminAuth';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout/Layout';
import Login from './pages/Login';
import ResetPassword from './pages/ResetPassword';
import Dashboard from './pages/Dashboard';
import UsersList from './pages/UsersList';
import Engagement from './pages/Engagement';
import AutoNotifications from './pages/AutoNotifications';
import SystemHealth from './pages/SystemHealth';
import Segments from './pages/Segments';
import AppSettings from './pages/AppSettings';
import ExerciseLibrary from './pages/ExerciseLibrary';
import PlanAnalytics from './pages/PlanAnalytics';
import Feedback from './pages/Feedback';
import UserDetail from './pages/UserDetail';
import Broadcast from './pages/Broadcast';
import BroadcastHistory from './pages/BroadcastHistory';
import Templates from './pages/Templates';
import AuditLog from './pages/AuditLog';
import ClientErrors from './pages/ClientErrors';
import Safety from './pages/Safety';
import Trainers from './pages/Trainers';
import Profile from './pages/Profile';
import LandingEditor from './pages/LandingEditor';
import ExerciseMedia from './pages/ExerciseMedia';

// Fora do HashRouter de propósito: o link de "esqueci minha senha" volta com
// um token no fragmento da URL (#access_token=...&type=recovery), que
// colidiria com o roteamento por hash se essa tela fosse uma <Route/> normal.
function AppShell() {
  const { recoveryMode } = useAdminAuth();
  if (recoveryMode) return <ResetPassword />;

  return (
    <HashRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route element={<ProtectedRoute />}>
          <Route element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="/users" element={<UsersList />} />
            <Route path="/users/:id" element={<UserDetail />} />
            <Route path="/analise-planos" element={<PlanAnalytics />} />
            <Route path="/feedback" element={<Feedback />} />
            <Route path="/engajamento" element={<Engagement />} />
            <Route path="/automacoes" element={<AutoNotifications />} />
            <Route path="/configuracoes" element={<AppSettings />} />
            <Route path="/saude" element={<SystemHealth />} />
            <Route path="/segmentos" element={<Segments />} />
            <Route path="/notificacoes" element={<Broadcast />} />
            <Route path="/historico-envios" element={<BroadcastHistory />} />
            <Route path="/conteudo" element={<Templates />} />
            <Route path="/auditoria" element={<AuditLog />} />
            <Route path="/erros" element={<ClientErrors />} />
            <Route path="/seguranca" element={<Safety />} />
            <Route path="/personais" element={<Trainers />} />
            <Route path="/landing" element={<LandingEditor />} />
            <Route path="/biblioteca" element={<ExerciseLibrary />} />
            <Route path="/demonstracoes" element={<ExerciseMedia />} />
            <Route path="/perfil" element={<Profile />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AdminAuthProvider>
        <AppShell />
      </AdminAuthProvider>
    </ThemeProvider>
  );
}
