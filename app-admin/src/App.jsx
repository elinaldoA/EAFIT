import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext';
import SeasonTheme from './components/SeasonTheme';
import { AdminAuthProvider } from './context/AdminAuthContext';
import { useAdminAuth } from './context/useAdminAuth';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout/Layout';
import Login from './pages/Login';
import ResetPassword from './pages/ResetPassword';
import Dashboard from './pages/Dashboard';
import MyReport from './pages/MyReport';
import UsersList from './pages/UsersList';
import Engagement from './pages/Engagement';
import AutoNotifications from './pages/AutoNotifications';
import SystemHealth from './pages/SystemHealth';
import Costs from './pages/Costs';
import DigestAlerts from './pages/DigestAlerts';
import Segments from './pages/Segments';
import AppSettings from './pages/AppSettings';
import Experiments from './pages/Experiments';
import ExerciseLibrary from './pages/ExerciseLibrary';
import PlanAnalytics from './pages/PlanAnalytics';
import Behavior from './pages/Behavior';
import Campaigns from './pages/Campaigns';
import Feedback from './pages/Feedback';
import Inactivity from './pages/Inactivity';
import Surveys from './pages/Surveys';
import ContactMessages from './pages/ContactMessages';
import Support from './pages/Support';
import UserDetail from './pages/UserDetail';
import Broadcast from './pages/Broadcast';
import BroadcastHistory from './pages/BroadcastHistory';
import CampaignResults from './pages/CampaignResults';
import EditorialCalendar from './pages/EditorialCalendar';
import Templates from './pages/Templates';
import AuditLog from './pages/AuditLog';
import ClientErrors from './pages/ClientErrors';
import Safety from './pages/Safety';
import Trainers from './pages/Trainers';
import TrainerVerification from './pages/TrainerVerification';
import Ambassadors from './pages/Ambassadors';
import Commissions from './pages/Commissions';
import Profile from './pages/Profile';
import LandingEditor from './pages/LandingEditor';
import ExerciseMedia from './pages/ExerciseMedia';
import ContentRanking from './pages/ContentRanking';
import Challenges from './pages/Challenges';
import Leagues from './pages/Leagues';
import SocialFeed from './pages/SocialFeed';
import Moderation from './pages/Moderation';
import Wellbeing from './pages/Wellbeing';
import Achievements from './pages/Achievements';
import Admins from './pages/Admins';
import AccountDeletions from './pages/AccountDeletions';
import PrivacyRequests from './pages/PrivacyRequests';
import Legal from './pages/Legal';

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
            <Route path="/meu-relatorio" element={<MyReport />} />
            <Route path="/users" element={<UsersList />} />
            <Route path="/users/:id" element={<UserDetail />} />
            <Route path="/analise-planos" element={<PlanAnalytics />} />
            <Route path="/comportamento" element={<Behavior />} />
            <Route path="/campanhas" element={<Campaigns />} />
            <Route path="/suporte" element={<Support />} />
            <Route path="/feedback" element={<Feedback />} />
            <Route path="/inatividade" element={<Inactivity />} />
            <Route path="/pesquisas" element={<Surveys />} />
            <Route path="/contato" element={<ContactMessages />} />
            <Route path="/engajamento" element={<Engagement />} />
            <Route path="/automacoes" element={<AutoNotifications />} />
            <Route path="/configuracoes" element={<AppSettings />} />
            <Route path="/experimentos" element={<Experiments />} />
            <Route path="/saude" element={<SystemHealth />} />
            <Route path="/custos" element={<Costs />} />
            <Route path="/relatorios" element={<DigestAlerts />} />
            <Route path="/segmentos" element={<Segments />} />
            <Route path="/notificacoes" element={<Broadcast />} />
            <Route path="/historico-envios" element={<BroadcastHistory />} />
            <Route path="/resultados-envios" element={<CampaignResults />} />
            <Route path="/calendario" element={<EditorialCalendar />} />
            <Route path="/conteudo" element={<Templates />} />
            <Route path="/auditoria" element={<AuditLog />} />
            <Route path="/erros" element={<ClientErrors />} />
            <Route path="/seguranca" element={<Safety />} />
            <Route path="/personais" element={<Trainers />} />
            <Route path="/verificacao-cref" element={<TrainerVerification />} />
            <Route path="/embaixadores" element={<Ambassadors />} />
            <Route path="/comissoes" element={<Commissions />} />
            <Route path="/landing" element={<LandingEditor />} />
            <Route path="/biblioteca" element={<ExerciseLibrary />} />
            <Route path="/demonstracoes" element={<ExerciseMedia />} />
            <Route path="/ranking-conteudo" element={<ContentRanking />} />
            <Route path="/desafios" element={<Challenges />} />
            <Route path="/ligas" element={<Leagues />} />
            <Route path="/amigos" element={<SocialFeed />} />
            <Route path="/moderacao" element={<Moderation />} />
            <Route path="/bem-estar" element={<Wellbeing />} />
            <Route path="/conquistas" element={<Achievements />} />
            <Route path="/admins" element={<Admins />} />
            <Route path="/exclusoes" element={<AccountDeletions />} />
            <Route path="/lgpd" element={<PrivacyRequests />} />
            <Route path="/termos" element={<Legal />} />
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
      <SeasonTheme />
      <AdminAuthProvider>
        <AppShell />
      </AdminAuthProvider>
    </ThemeProvider>
  );
}
