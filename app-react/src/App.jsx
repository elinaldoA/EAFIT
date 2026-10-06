import { lazy, Suspense, useEffect } from 'react';
import { AuthProvider } from './context/AuthContext';
import { useAuth } from './context/useAuth';
import { ThemeProvider } from './context/ThemeContext';
import { ToastProvider } from './context/ToastContext';
import { WorkoutProvider } from './context/WorkoutContext';
import { AppConfigProvider } from './context/AppConfigContext';
import { useAppConfig } from './context/useAppConfig';
import { AvatarProvider } from './context/AvatarContext';
import AuthScreen from './components/AuthScreen';
import { markKnownUser } from './lib/knownUser';
import OnboardingScreen from './components/OnboardingScreen';
import ThemeToggle from './components/ThemeToggle';
import UserChip from './components/UserChip';
import TopbarProfile from './components/TopbarProfile';
import BottomNav from './components/BottomNav';
import UpdatePrompt from './components/UpdatePrompt';
import ReminderScheduler from './components/ReminderScheduler';
import { useDayRollover } from './hooks/useDayRollover';
import { useHashTab } from './hooks/useHashTab';
import ErrorBoundary from './components/ErrorBoundary';
import BootSplash from './components/BootSplash';
import PasswordRecoveryScreen from './components/PasswordRecoveryScreen';
import MaintenanceScreen from './components/MaintenanceScreen';
import AnnouncementBanner from './components/AnnouncementBanner';
import TrainerShell from './trainer/TrainerShell';
import { useTrainerMode } from './hooks/useTrainerMode';

const TreinoPage = lazy(() => import('./pages/TreinoPage'));
const HistoricoPage = lazy(() => import('./pages/HistoricoPage'));
const HidratacaoPage = lazy(() => import('./pages/HidratacaoPage'));
const DashPage = lazy(() => import('./pages/DashPage'));
const PerfilPage = lazy(() => import('./pages/PerfilPage'));

function PageFallback() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 16 }}>
      <div className="skeleton" style={{ height: 130 }} />
      <div className="skeleton" style={{ height: 130 }} />
      <div className="skeleton" style={{ height: 130 }} />
    </div>
  );
}

const TABS = ['treino', 'historico', 'hidratacao', 'dash', 'perfil'];

function Shell() {
  const { user, authLoading, recoveryMode } = useAuth();
  const { config } = useAppConfig();
  const [page, setPage] = useHashTab(TABS, 'treino');
  const { isTrainer, mode, setMode } = useTrainerMode(user?.id);
  useDayRollover();

  // Este aparelho já teve conta logada: a tela de acesso abre em "Entrar".
  useEffect(() => {
    if (user) markKnownUser();
  }, [user]);

  // Manutenção ligada no painel admin: bloqueia o app inteiro (antes até do login).
  if (config.maintenance.enabled) return <MaintenanceScreen message={config.maintenance.message} />;

  if (authLoading) return <BootSplash />;
  if (user && recoveryMode) return <div className="shell"><PasswordRecoveryScreen /></div>;

  const trainerView = !!user && isTrainer && mode === 'trainer';
  const needsOnboarding = user && !trainerView && !user.user_metadata?.peso;

  return (
    <div className="shell">
      <AnnouncementBanner />
      <UpdatePrompt aboveNav={!!user && !needsOnboarding} />
      {!user && <AuthScreen />}
      {user && needsOnboarding && <OnboardingScreen />}
      {trainerView && <TrainerShell onSwitchToStudent={() => setMode('aluno')} />}

      {user && !needsOnboarding && !trainerView && (
        <AvatarProvider>
          <WorkoutProvider>
            <ReminderScheduler />
            <div className="app-screen" style={{ display: 'flex' }}>
              <header className="topbar">
                <TopbarProfile />
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {isTrainer && (
                    <button type="button" className="btn btn--ghost btn--sm" onClick={() => setMode('trainer')}>🧑‍🏫 Personal</button>
                  )}
                  <ThemeToggle />
                  <div className="topbar__auth"><UserChip /></div>
                </div>
              </header>

              <main className="pages">
                {/* key={page}: trocar de aba limpa o erro da aba anterior */}
                <ErrorBoundary variant="page" key={page}>
                <Suspense fallback={<PageFallback />}>
                  {page === 'treino' && <TreinoPage />}
                  {page === 'historico' && <HistoricoPage />}
                  {page === 'hidratacao' && <HidratacaoPage active={page === 'hidratacao'} />}
                  {page === 'dash' && <DashPage active={page === 'dash'} />}
                  {page === 'perfil' && <PerfilPage active={page === 'perfil'} />}
                </Suspense>
                </ErrorBoundary>
              </main>

              <BottomNav active={page} onChange={setPage} />
            </div>
          </WorkoutProvider>
        </AvatarProvider>
      )}
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <AppConfigProvider>
          <AuthProvider>
            <Shell />
          </AuthProvider>
        </AppConfigProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}
