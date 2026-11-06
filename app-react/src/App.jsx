import { lazy, Suspense, useEffect, useState, useSyncExternalStore } from 'react';
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
import { setTrackingUser, trackClient, trackAccess, startSession, trackScreen, trackEvent, trackInstall, flushPushOpen, markVisitor } from './lib/tracking';
import { detectDisplayMode } from './lib/clientInfo';
import OnboardingScreen from './components/OnboardingScreen';
import TopbarProfile from './components/TopbarProfile';
import TopbarMenu from './components/TopbarMenu';
import BottomNav from './components/BottomNav';
import Tutorial from './components/Tutorial';
import UpdatePrompt from './components/UpdatePrompt';
import ReminderScheduler from './components/ReminderScheduler';
import { useDayRollover } from './hooks/useDayRollover';
import { useHashTab } from './hooks/useHashTab';
import ErrorBoundary from './components/ErrorBoundary';
import BootSplash from './components/BootSplash';
import BiometricLockScreen from './components/BiometricLockScreen';
import { useBiometricLock } from './hooks/useBiometricLock';
import PasswordRecoveryScreen from './components/PasswordRecoveryScreen';
import MaintenanceScreen from './components/MaintenanceScreen';
import { ForceUpdateScreen, UpdateWarnBar } from './components/ForceUpdate';
import { isOutdated } from './lib/appVersion';
import MovedScreen from './components/MovedScreen';
import EmailUnsubscribeScreen from './components/EmailUnsubscribeScreen';
import { takeUnsubscribeToken } from './lib/emailUnsubscribe';
import InactivitySurveyScreen from './components/InactivitySurveyScreen';
import { takeSurveyLink } from './lib/inactivitySurvey';
import { movedTarget } from './lib/appConfig';
import { cameFromOldAddress } from './lib/installPrompt';
import AnnouncementBanner from './components/AnnouncementBanner';
import SeasonBanner, { SeasonDecor } from './components/SeasonBanner';
import TermsUpdateScreen from './components/TermsUpdateScreen';
import InstallScreen from './components/InstallScreen';
import TrainerInvitePrompt from './components/TrainerInvitePrompt';
import TrainerShell from './trainer/TrainerShell';
import ProgramShell from './program/ProgramShell';
import { useTrainerMode } from './hooks/useTrainerMode';
import { useProgram } from './hooks/useProgram';
import { programLabels } from './lib/programLabels';
import { useUnreadMessages } from './hooks/useUnreadMessages';
import { useTrainerGoalsSync } from './hooks/useTrainerGoalsSync';
import { useSyncLang } from './hooks/useSyncLang';
import { NAV_EVENT } from './lib/appNav';
import { useSportModule } from './hooks/useSportModule';
import { applyModuleTheme, brandName } from './lib/sportModule';

import { t } from './lib/i18n';
import { importPage } from './lib/chunkReload';
const TreinoPage = lazy(() => importPage(() => import('./pages/TreinoPage')));
const HistoricoPage = lazy(() => importPage(() => import('./pages/HistoricoPage')));
const HidratacaoPage = lazy(() => importPage(() => import('./pages/HidratacaoPage')));
const NutricaoPage = lazy(() => importPage(() => import('./pages/NutricaoPage')));
const DashPage = lazy(() => importPage(() => import('./pages/DashPage')));
const PerfilPage = lazy(() => importPage(() => import('./pages/PerfilPage')));

const noSubscribe = () => () => {};
const notBusy = () => false;

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
  const { user, authLoading, recoveryMode } = useAuth();
  const { config } = useAppConfig();
  // Versão do app do esporte da pessoa (modules/registry.js): abas, cores e marca.
  const { module: sport } = useSportModule();
  const [page, setPage] = useHashTab(sport.tabs, sport.defaultTab);
  useEffect(() => { applyModuleTheme(sport.id); }, [sport.id]);
  // Módulo ocupado (ex.: corrida rodando): manutenção e atualização obrigatória
  // esperam o fim — trocar a tela inteira mataria o GPS e o cronômetro.
  const moduleBusy = useSyncExternalStore(sport.busy?.subscribe || noSubscribe, sport.busy?.get || notBusy);
  const { isTrainer, mode, setMode } = useTrainerMode(user?.id);
  const programKind = useProgram(user?.id);
  const unreadMessages = useUnreadMessages(user?.id);
  useTrainerGoalsSync(user?.id);
  useSyncLang(user);
  useDayRollover();
  const [locked, unlock] = useBiometricLock(user?.id);

  // Navegação vinda de notificação ou aviso (lib/appNav.js) com aba/cartão a
  // abrir: remonta a página pra valer mesmo se já era a aba atual.
  const [navSeq, setNavSeq] = useState(0);
  const [fromOldAddress] = useState(cameFromOldAddress);
  // Aberto pelo link de descadastro de um e-mail (lib/emailUnsubscribe.js).
  const [unsubscribeToken, setUnsubscribeToken] = useState(takeUnsubscribeToken);
  // Aberto por um motivo da pesquisa de inatividade do e-mail (lib/inactivitySurvey.js).
  const [surveyLink, setSurveyLink] = useState(takeSurveyLink);
  useEffect(() => {
    const onNav = event => { if (event.detail?.remount) setNavSeq(n => n + 1); };
    window.addEventListener(NAV_EVENT, onNav);
    return () => window.removeEventListener(NAV_EVENT, onNav);
  }, []);

  // Este aparelho já teve conta logada: a tela de acesso abre em "Entrar".
  useEffect(() => {
    setTrackingUser(user?.id);
    if (!user) return;
    markKnownUser();
    trackClient();
    trackAccess();
    startSession();
    markVisitor();
    if (detectDisplayMode(window) === 'standalone') trackInstall('open');
    flushPushOpen();
  }, [user]);

  const trainerView = !!user && isTrainer && mode === 'trainer';
  const programView = !!user && !!programKind && mode === 'program';

  // Métrica de uso: qual aba cada usuário abre (1 vez por dia por aba). Antes
  // do onboarding não há aba; os modos Personal e do programa (Embaixador ou
  // Influenciador) contam como
  // uma tela só.
  const trackedPage = !user ? null
    : trainerView ? 'personal'
      : programView ? programKind
        : user.user_metadata?.peso ? page : null;
  useEffect(() => {
    if (trackedPage) {
      trackEvent('page', trackedPage);
      trackScreen();
    }
  }, [trackedPage, user]);

  // Mudança de endereço ligada no painel admin: quem está no endereço antigo
  // só vê o aviso com o link do novo.
  const movedUrl = movedTarget(config.moved);
  if (movedUrl) return <MovedScreen url={movedUrl} />;

  // Manutenção ligada no painel admin: bloqueia o app inteiro (antes até do login).
  if (config.maintenance.enabled && !moduleBusy) return <MaintenanceScreen message={config.maintenance.message} />;

  // Versão mínima do painel: abaixo dela, 'block' para tudo e 'warn' mostra a faixa.
  const outdated = isOutdated(config.minVersion?.version);
  if (outdated && config.minVersion.mode === 'block' && !moduleBusy) return <ForceUpdateScreen message={config.minVersion.message} />;

  if (unsubscribeToken) return <EmailUnsubscribeScreen token={unsubscribeToken} onClose={() => setUnsubscribeToken(null)} />;
  if (surveyLink) return <InactivitySurveyScreen token={surveyLink.token} reason={surveyLink.reason} onClose={() => setSurveyLink(null)} />;

  if (authLoading) return <BootSplash />;
  if (user && recoveryMode) return <div className="shell"><PasswordRecoveryScreen /></div>;

  const studentView = !!user && !trainerView && !programView;
  const ModulePage = sport.pages?.[page];
  const needsOnboarding = studentView && !user.user_metadata?.peso;

  return (
    <>
    {user && locked && <BiometricLockScreen user={user} onUnlock={unlock} />}
    <div className="shell" inert={user && locked ? true : undefined}>
      <SeasonDecor />
      {outdated && <UpdateWarnBar message={config.minVersion.message} />}
      <AnnouncementBanner />
      {studentView && !needsOnboarding && <SeasonBanner />}
      {user && <TermsUpdateScreen />}
      {(user || fromOldAddress) && <InstallScreen />}
      <UpdatePrompt aboveNav={!!user && !needsOnboarding} />
      {!user && <AuthScreen />}
      {user && needsOnboarding && <OnboardingScreen />}
      {trainerView && <TrainerShell onSwitchToStudent={() => setMode('aluno')} />}
      {programView && <ProgramShell kind={programKind} onSwitchToStudent={() => setMode('aluno')} />}

      {studentView && !needsOnboarding && (
        <AvatarProvider>
          <WorkoutProvider>
            {sport.workoutPlan !== false && <ReminderScheduler />}
            {sport.Host && <Suspense fallback={null}><sport.Host /></Suspense>}
            <TrainerInvitePrompt />
            <div className="app-screen" style={{ display: 'flex' }}>
              <header className="topbar">
                <TopbarProfile subtitle={sport.name ? brandName(sport) : ''} />
                <TopbarMenu
                  modes={[
                    ...(isTrainer ? [{ label: t('🧑‍🏫 Personal'), onClick: () => setMode('trainer') }] : []),
                    ...(programKind ? [{ label: programLabels(programKind).button, onClick: () => setMode('program') }] : []),
                  ]}
                />
              </header>

              <main className="pages">
                {/* key={page}: trocar de aba limpa o erro da aba anterior */}
                <ErrorBoundary variant="page" key={`${page}:${navSeq}`}>
                <Suspense fallback={<PageFallback />}>
                  {ModulePage && <ModulePage active />}
                  {page === 'treino' && <TreinoPage />}
                  {page === 'historico' && <HistoricoPage />}
                  {page === 'hidratacao' && <HidratacaoPage active={page === 'hidratacao'} />}
                  {page === 'nutricao' && <NutricaoPage active={page === 'nutricao'} />}
                  {page === 'dash' && <DashPage active={page === 'dash'} />}
                  {page === 'perfil' && <PerfilPage active={page === 'perfil'} />}
                </Suspense>
                </ErrorBoundary>
              </main>

              <BottomNav active={page} onChange={setPage} badges={{ perfil: unreadMessages }} tabs={sport.tabs} extraItems={sport.navItems} />
              {sport.tutorial && <Tutorial role="aluno" userId={user.id} onNavigate={setPage} />}
            </div>
          </WorkoutProvider>
        </AvatarProvider>
      )}
    </div>
    </>
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
