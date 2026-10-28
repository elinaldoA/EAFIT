import { lazy, Suspense } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext';
import SeasonTheme from './components/SeasonTheme';
import { AdminAuthProvider } from './context/AdminAuthContext';
import { useAdminAuth } from './context/useAdminAuth';
import ProtectedRoute from './components/ProtectedRoute';
import RequireArea from './components/RequireArea';
import Layout from './components/Layout/Layout';
import Login from './pages/Login';
import ResetPassword from './pages/ResetPassword';
const Dashboard = lazy(() => import('./pages/Dashboard'));
const MyReport = lazy(() => import('./pages/MyReport'));
const UsersList = lazy(() => import('./pages/UsersList'));
const Engagement = lazy(() => import('./pages/Engagement'));
const AutoNotifications = lazy(() => import('./pages/AutoNotifications'));
const SystemHealth = lazy(() => import('./pages/SystemHealth'));
const Costs = lazy(() => import('./pages/Costs'));
const DigestAlerts = lazy(() => import('./pages/DigestAlerts'));
const Segments = lazy(() => import('./pages/Segments'));
const AppSettings = lazy(() => import('./pages/AppSettings'));
const Experiments = lazy(() => import('./pages/Experiments'));
const ExerciseLibrary = lazy(() => import('./pages/ExerciseLibrary'));
const PlanAnalytics = lazy(() => import('./pages/PlanAnalytics'));
const Behavior = lazy(() => import('./pages/Behavior'));
const Campaigns = lazy(() => import('./pages/Campaigns'));
const Feedback = lazy(() => import('./pages/Feedback'));
const Inactivity = lazy(() => import('./pages/Inactivity'));
const Surveys = lazy(() => import('./pages/Surveys'));
const ContactMessages = lazy(() => import('./pages/ContactMessages'));
const Support = lazy(() => import('./pages/Support'));
const UserDetail = lazy(() => import('./pages/UserDetail'));
const Broadcast = lazy(() => import('./pages/Broadcast'));
const BroadcastHistory = lazy(() => import('./pages/BroadcastHistory'));
const CampaignResults = lazy(() => import('./pages/CampaignResults'));
const EditorialCalendar = lazy(() => import('./pages/EditorialCalendar'));
const Templates = lazy(() => import('./pages/Templates'));
const AuditLog = lazy(() => import('./pages/AuditLog'));
const ClientErrors = lazy(() => import('./pages/ClientErrors'));
const Safety = lazy(() => import('./pages/Safety'));
const Trainers = lazy(() => import('./pages/Trainers'));
const TrainerVerification = lazy(() => import('./pages/TrainerVerification'));
const Ambassadors = lazy(() => import('./pages/Ambassadors'));
const Commissions = lazy(() => import('./pages/Commissions'));
const PartnerCampaigns = lazy(() => import('./pages/PartnerCampaigns'));
const Profile = lazy(() => import('./pages/Profile'));
const LandingEditor = lazy(() => import('./pages/LandingEditor'));
const ExerciseMedia = lazy(() => import('./pages/ExerciseMedia'));
const ContentRanking = lazy(() => import('./pages/ContentRanking'));
const Challenges = lazy(() => import('./pages/Challenges'));
const Leagues = lazy(() => import('./pages/Leagues'));
const SocialFeed = lazy(() => import('./pages/SocialFeed'));
const Moderation = lazy(() => import('./pages/Moderation'));
const Wellbeing = lazy(() => import('./pages/Wellbeing'));
const Achievements = lazy(() => import('./pages/Achievements'));
const Admins = lazy(() => import('./pages/Admins'));
const AccountDeletions = lazy(() => import('./pages/AccountDeletions'));
const PrivacyRequests = lazy(() => import('./pages/PrivacyRequests'));
const Legal = lazy(() => import('./pages/Legal'));

// Fora do HashRouter de propósito: o link de "esqueci minha senha" volta com
// um token no fragmento da URL (#access_token=...&type=recovery), que
// colidiria com o roteamento por hash se essa tela fosse uma <Route/> normal.
function AppShell() {
  const { recoveryMode } = useAdminAuth();
  if (recoveryMode) return <ResetPassword />;

  return (
    <HashRouter>
      <Suspense fallback={null}>
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
            <Route path="/configuracoes" element={<RequireArea area="settings"><AppSettings /></RequireArea>} />
            <Route path="/experimentos" element={<Experiments />} />
            <Route path="/saude" element={<SystemHealth />} />
            <Route path="/custos" element={<Costs />} />
            <Route path="/relatorios" element={<DigestAlerts />} />
            <Route path="/segmentos" element={<RequireArea area="segments"><Segments /></RequireArea>} />
            <Route path="/notificacoes" element={<RequireArea area="notifications"><Broadcast /></RequireArea>} />
            <Route path="/historico-envios" element={<BroadcastHistory />} />
            <Route path="/resultados-envios" element={<CampaignResults />} />
            <Route path="/calendario" element={<EditorialCalendar />} />
            <Route path="/conteudo" element={<RequireArea area="content"><Templates /></RequireArea>} />
            <Route path="/auditoria" element={<AuditLog />} />
            <Route path="/erros" element={<ClientErrors />} />
            <Route path="/seguranca" element={<Safety />} />
            <Route path="/personais" element={<RequireArea area="users"><Trainers /></RequireArea>} />
            <Route path="/verificacao-cref" element={<TrainerVerification />} />
            <Route path="/embaixadores" element={<RequireArea area="users"><Ambassadors /></RequireArea>} />
            <Route path="/comissoes" element={<RequireArea area="users"><Commissions /></RequireArea>} />
            <Route path="/campanhas-parceiros" element={<PartnerCampaigns />} />
            <Route path="/landing" element={<RequireArea area="content"><LandingEditor /></RequireArea>} />
            <Route path="/biblioteca" element={<RequireArea area="content"><ExerciseLibrary /></RequireArea>} />
            <Route path="/demonstracoes" element={<RequireArea area="content"><ExerciseMedia /></RequireArea>} />
            <Route path="/ranking-conteudo" element={<ContentRanking />} />
            <Route path="/desafios" element={<RequireArea area="content"><Challenges /></RequireArea>} />
            <Route path="/ligas" element={<RequireArea area="content"><Leagues /></RequireArea>} />
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
      </Suspense>
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
