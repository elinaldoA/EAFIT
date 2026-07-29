import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext';
import { AdminAuthProvider, useAdminAuth } from './context/AdminAuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout/Layout';
import Login from './pages/Login';
import ResetPassword from './pages/ResetPassword';
import Dashboard from './pages/Dashboard';
import UsersList from './pages/UsersList';
import UserDetail from './pages/UserDetail';
import Broadcast from './pages/Broadcast';
import Templates from './pages/Templates';
import AuditLog from './pages/AuditLog';
import Safety from './pages/Safety';
import Profile from './pages/Profile';
import LandingEditor from './pages/LandingEditor';

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
            <Route path="/notificacoes" element={<Broadcast />} />
            <Route path="/conteudo" element={<Templates />} />
            <Route path="/auditoria" element={<AuditLog />} />
            <Route path="/seguranca" element={<Safety />} />
            <Route path="/landing" element={<LandingEditor />} />
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
