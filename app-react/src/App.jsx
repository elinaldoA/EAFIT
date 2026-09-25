import { lazy, Suspense } from 'react';
import { AuthProvider } from './context/AuthContext';
import { useAuth } from './context/useAuth';
import { ThemeProvider } from './context/ThemeContext';
import { ToastProvider } from './context/ToastContext';
import { WorkoutProvider } from './context/WorkoutContext';
import { AvatarProvider } from './context/AvatarContext';
import AuthScreen from './components/AuthScreen';
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

const TreinoPage = lazy(() => import('./pages/TreinoPage'));
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

const TABS = ['treino', 'hidratacao', 'dash', 'perfil'];

function Shell() {
  const { user, authLoading, recoveryMode } = useAuth();
  const [page, setPage] = useHashTab(TABS, 'treino');
  useDayRollover();

  if (authLoading) return <BootSplash />;
  if (user && recoveryMode) return <div className="shell"><PasswordRecoveryScreen /></div>;

  const needsOnboarding = user && !user.user_metadata?.peso;

  return (
    <div className="shell">
      <UpdatePrompt />
      {!user && <AuthScreen />}
      {user && needsOnboarding && <OnboardingScreen />}

      {user && !needsOnboarding && (
        <AvatarProvider>
          <WorkoutProvider>
            <ReminderScheduler />
            <div className="app-screen" style={{ display: 'flex' }}>
              <header className="topbar">
                <TopbarProfile />
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <ThemeToggle />
                  <div className="topbar__auth"><UserChip /></div>
                </div>
              </header>

              <main className="pages">
                {/* key={page}: trocar de aba limpa o erro da aba anterior */}
                <ErrorBoundary variant="page" key={page}>
                <Suspense fallback={<PageFallback />}>
                  {page === 'treino' && <TreinoPage />}
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
        <AuthProvider>
          <Shell />
        </AuthProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}
