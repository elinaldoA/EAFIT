// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

const h = vi.hoisted(() => ({
  auth: {},
  config: { maintenance: { enabled: false, message: '' } },
  tab: { page: 'treino', setPage: vi.fn() },
  trainer: { isTrainer: false, mode: 'aluno', setMode: vi.fn() },
  unread: 0,
  markKnownUser: vi.fn(),
  hooks: { goalsSync: vi.fn(), syncLang: vi.fn(), rollover: vi.fn() },
}));

vi.mock('./lib/supabase', () => ({ db: {} }));
vi.mock('./context/AuthContext', () => ({ AuthProvider: ({ children }) => <>{children}</> }));
vi.mock('./context/useAuth', () => ({ useAuth: () => h.auth }));
vi.mock('./context/ThemeContext', () => ({ ThemeProvider: ({ children }) => <>{children}</> }));
vi.mock('./context/ToastContext', () => ({ ToastProvider: ({ children }) => <>{children}</> }));
vi.mock('./context/WorkoutContext', () => ({ WorkoutProvider: ({ children }) => <div data-testid="workout-provider">{children}</div> }));
vi.mock('./context/AppConfigContext', () => ({ AppConfigProvider: ({ children }) => <>{children}</> }));
vi.mock('./context/useAppConfig', () => ({ useAppConfig: () => ({ config: h.config }) }));
vi.mock('./context/AvatarContext', () => ({ AvatarProvider: ({ children }) => <>{children}</> }));
// O jsdom roda em localhost, que o movedTarget de verdade ignora (dev).
vi.mock('./lib/appConfig', () => ({ movedTarget: moved => (moved?.enabled ? moved.url : '') }));
vi.mock('./lib/knownUser', () => ({ markKnownUser: (...a) => h.markKnownUser(...a) }));
vi.mock('./hooks/useHashTab', () => ({ useHashTab: () => [h.tab.page, h.tab.setPage] }));
vi.mock('./hooks/useTrainerMode', () => ({ useTrainerMode: () => h.trainer }));
vi.mock('./hooks/useUnreadMessages', () => ({ useUnreadMessages: () => h.unread }));
vi.mock('./hooks/useTrainerGoalsSync', () => ({ useTrainerGoalsSync: (...a) => h.hooks.goalsSync(...a) }));
vi.mock('./hooks/useSyncLang', () => ({ useSyncLang: (...a) => h.hooks.syncLang(...a) }));
vi.mock('./hooks/useDayRollover', () => ({ useDayRollover: () => h.hooks.rollover() }));

vi.mock('./components/AuthScreen', () => ({ default: () => <div>tela-auth</div> }));
vi.mock('./components/OnboardingScreen', () => ({ default: () => <div>tela-onboarding</div> }));
vi.mock('./components/ThemeToggle', () => ({ default: () => <div>theme-toggle</div> }));
vi.mock('./components/TopbarProfile', () => ({ default: () => <div>topbar-profile</div> }));
vi.mock('./components/BottomNav', () => ({
  default: ({ active, onChange, badges }) => (
    <nav>
      <span>nav-ativo:{active}</span>
      <span>badge-perfil:{badges.perfil}</span>
      <button onClick={() => onChange('perfil')}>ir-perfil</button>
    </nav>
  ),
}));
vi.mock('./components/Tutorial', () => ({ default: ({ role, userId }) => <div>tutorial:{role}:{userId}</div> }));
vi.mock('./components/InboxBell', () => ({ default: () => <div>inbox-bell</div> }));
vi.mock('./components/UpdatePrompt', () => ({ default: ({ aboveNav }) => <div>update-prompt:{String(aboveNav)}</div> }));
vi.mock('./components/ReminderScheduler', () => ({ default: () => <div>reminders</div> }));
vi.mock('./components/BootSplash', () => ({ default: () => <div>splash</div> }));
vi.mock('./components/PasswordRecoveryScreen', () => ({ default: () => <div>tela-recuperacao</div> }));
vi.mock('./components/MaintenanceScreen', () => ({ default: ({ message }) => <div>manutencao:{message}</div> }));
vi.mock('./components/AnnouncementBanner', () => ({ default: () => <div>aviso</div> }));
vi.mock('./components/InstallScreen', () => ({ default: () => <div>tela-instalar</div> }));
vi.mock('./trainer/TrainerShell', () => ({
  default: ({ onSwitchToStudent }) => <div>painel-personal<button onClick={onSwitchToStudent}>usar-como-aluno</button></div>,
}));
vi.mock('./pages/TreinoPage', () => ({ default: () => <div>pg-treino</div> }));
vi.mock('./pages/HistoricoPage', () => ({ default: () => <div>pg-historico</div> }));
vi.mock('./pages/HidratacaoPage', () => ({ default: ({ active }) => <div>pg-hidratacao:{String(active)}</div> }));
vi.mock('./pages/DashPage', () => ({ default: () => <div>pg-dash</div> }));
vi.mock('./pages/PerfilPage', () => ({ default: () => <div>pg-perfil</div> }));

import App from './App';

const loggedIn = (md = { peso: 80 }) => ({ id: 'u1', user_metadata: md });

beforeEach(() => {
  vi.clearAllMocks();
  h.auth = { user: loggedIn(), authLoading: false, recoveryMode: false };
  h.config = { maintenance: { enabled: false, message: '' } };
  h.tab.page = 'treino';
  h.trainer = { isTrainer: false, mode: 'aluno', setMode: vi.fn() };
  h.unread = 0;
});
afterEach(cleanup);

describe('App', () => {
  it('manutenção ligada bloqueia tudo, inclusive o login', () => {
    h.config = { maintenance: { enabled: true, message: 'Voltamos às 14h' } };
    h.auth = { user: null, authLoading: false, recoveryMode: false };
    render(<App />);
    expect(screen.getByText('manutencao:Voltamos às 14h')).toBeTruthy();
    expect(screen.queryByText('tela-auth')).toBeNull();
  });

  it('mudança de endereço ligada bloqueia tudo e aponta pro endereço novo', () => {
    h.config = { maintenance: { enabled: false, message: '' }, moved: { enabled: true, url: 'https://eafit.com.br/app/' } };
    h.auth = { user: null, authLoading: false, recoveryMode: false };
    render(<App />);
    expect(screen.getByRole('link', { name: 'Abrir o novo endereço' }).getAttribute('href')).toBe('https://eafit.com.br/app/');
    expect(screen.queryByText('tela-auth')).toBeNull();
  });

  it('enquanto a sessão carrega mostra a splash', () => {
    h.auth = { user: null, authLoading: true, recoveryMode: false };
    render(<App />);
    expect(screen.getByText('splash')).toBeTruthy();
    expect(screen.queryByText('tela-auth')).toBeNull();
  });

  it('sem usuário mostra a tela de acesso', () => {
    h.auth = { user: null, authLoading: false, recoveryMode: false };
    render(<App />);
    expect(screen.getByText('tela-auth')).toBeTruthy();
    expect(screen.getByText('aviso')).toBeTruthy();
    expect(screen.getByText('update-prompt:false')).toBeTruthy();
    expect(h.markKnownUser).not.toHaveBeenCalled();
    expect(screen.queryByText('tela-instalar')).toBeNull();
  });

  it('usuário logado marca o aparelho como conhecido', () => {
    render(<App />);
    expect(h.markKnownUser).toHaveBeenCalled();
  });

  it('usuário logado recebe a tela de instalar o app; na recuperação de senha, não', () => {
    const a = render(<App />);
    expect(screen.getByText('tela-instalar')).toBeTruthy();
    a.unmount();
    h.auth = { user: loggedIn(), authLoading: false, recoveryMode: true };
    render(<App />);
    expect(screen.queryByText('tela-instalar')).toBeNull();
  });

  it('modo recuperação de senha substitui o app', () => {
    h.auth = { user: loggedIn(), authLoading: false, recoveryMode: true };
    render(<App />);
    expect(screen.getByText('tela-recuperacao')).toBeTruthy();
    expect(screen.queryByText('pg-treino')).toBeNull();
  });

  it('recoveryMode sem usuário não bloqueia a tela de acesso', () => {
    h.auth = { user: null, authLoading: false, recoveryMode: true };
    render(<App />);
    expect(screen.getByText('tela-auth')).toBeTruthy();
  });

  it('usuário sem peso cai no onboarding', () => {
    h.auth = { user: loggedIn({}), authLoading: false, recoveryMode: false };
    render(<App />);
    expect(screen.getByText('tela-onboarding')).toBeTruthy();
    expect(screen.queryByTestId('workout-provider')).toBeNull();
    expect(screen.getByText('update-prompt:false')).toBeTruthy();
  });

  it('usuário completo vê o app com provider de treino, lembretes, tutorial e navegação', async () => {
    render(<App />);
    expect(await screen.findByText('pg-treino')).toBeTruthy();
    expect(screen.getByTestId('workout-provider')).toBeTruthy();
    expect(screen.getByText('reminders')).toBeTruthy();
    expect(screen.getByText('topbar-profile')).toBeTruthy();
    expect(screen.getByText('inbox-bell')).toBeTruthy();
    expect(screen.getByText('theme-toggle')).toBeTruthy();
    expect(screen.getByText('tutorial:aluno:u1')).toBeTruthy();
    expect(screen.getByText('update-prompt:true')).toBeTruthy();
    expect(screen.getByText('nav-ativo:treino')).toBeTruthy();
    expect(screen.queryByText('🧑‍🏫 Personal')).toBeNull();
  });

  it.each([
    ['historico', 'pg-historico'],
    ['hidratacao', 'pg-hidratacao:true'],
    ['dash', 'pg-dash'],
    ['perfil', 'pg-perfil'],
  ])('aba %s renderiza a página correspondente', async (tab, text) => {
    h.tab.page = tab;
    render(<App />);
    expect(await screen.findByText(text)).toBeTruthy();
    expect(screen.queryByText('pg-treino')).toBeNull();
  });

  it('a navegação inferior troca de aba e mostra o contador de recados no perfil', () => {
    h.unread = 3;
    render(<App />);
    expect(screen.getByText('badge-perfil:3')).toBeTruthy();
    fireEvent.click(screen.getByText('ir-perfil'));
    expect(h.tab.setPage).toHaveBeenCalledWith('perfil');
  });

  it('personal no modo aluno vê o botão para o painel e troca de modo', () => {
    h.trainer = { isTrainer: true, mode: 'aluno', setMode: vi.fn() };
    render(<App />);
    fireEvent.click(screen.getByText('🧑‍🏫 Personal'));
    expect(h.trainer.setMode).toHaveBeenCalledWith('trainer');
  });

  it('personal no modo personal vê só o painel (e não precisa de peso)', () => {
    h.auth = { user: loggedIn({}), authLoading: false, recoveryMode: false };
    h.trainer = { isTrainer: true, mode: 'trainer', setMode: vi.fn() };
    render(<App />);
    expect(screen.getByText('painel-personal')).toBeTruthy();
    expect(screen.queryByText('tela-onboarding')).toBeNull();
    expect(screen.queryByTestId('workout-provider')).toBeNull();
    fireEvent.click(screen.getByText('usar-como-aluno'));
    expect(h.trainer.setMode).toHaveBeenCalledWith('aluno');
  });

  it('modo personal só vale para quem é personal', () => {
    h.trainer = { isTrainer: false, mode: 'trainer', setMode: vi.fn() };
    render(<App />);
    expect(screen.queryByText('painel-personal')).toBeNull();
  });

  it('chama os hooks de sincronização com o usuário', () => {
    render(<App />);
    expect(h.hooks.goalsSync).toHaveBeenCalledWith('u1');
    expect(h.hooks.syncLang).toHaveBeenCalledWith(h.auth.user);
    expect(h.hooks.rollover).toHaveBeenCalled();
  });
});
