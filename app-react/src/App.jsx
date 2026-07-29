import { lazy, Suspense, useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
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

function Shell() {
  const { user, authLoading } = useAuth();
  const [page, setPage] = useState('treino');

  if (authLoading) return null;

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
                <Suspense fallback={<PageFallback />}>
                  {page === 'treino' && <TreinoPage />}
                  {page === 'hidratacao' && <HidratacaoPage active={page === 'hidratacao'} />}
                  {page === 'dash' && <DashPage active={page === 'dash'} />}
                  {page === 'perfil' && <PerfilPage active={page === 'perfil'} />}
                </Suspense>
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
