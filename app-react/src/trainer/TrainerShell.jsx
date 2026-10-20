import { Suspense, useCallback, useMemo, useState } from 'react';
import { useHashTab } from '../hooks/useHashTab';
import ErrorBoundary from '../components/ErrorBoundary';
import ThemeToggle from '../components/ThemeToggle';
import Tutorial from '../components/Tutorial';
import { useAuth } from '../context/useAuth';
import { getDisplayName } from '../lib/utils';
import TrainerNav from './TrainerNav';
import PainelPage from './PainelPage';
import AlunosPage from './AlunosPage';
import TrainerAccount from './TrainerAccount';
import TurmaPage from './TurmaPage';
import TemplatesPage from './TemplatesPage';

import { t } from '../lib/i18n';
const TABS = ['painel', 'alunos', 'modelos', 'turma', 'conta'];

// Casca do app no modo Personal: outra navegação e outras páginas, mas o mesmo
// login, tema e visual do app de aluno.
export default function TrainerShell({ onSwitchToStudent }) {
  const { user } = useAuth();
  const [page, setPage] = useHashTab(TABS, 'painel');
  const [urgent, setUrgent] = useState(0);
  const [openClient, setOpenClient] = useState(null);
  const [turmaView, setTurmaView] = useState('recados');

  const items = useMemo(() => [
    { key: 'painel', label: t('Painel'), badge: urgent },
    { key: 'alunos', label: t('Alunos') },
    { key: 'modelos', label: t('Modelos') },
    { key: 'turma', label: t('Turma') },
    { key: 'conta', label: t('Conta') },
  ], [urgent]);

  const navigate = useCallback((tab, sub) => {
    if (tab === 'turma') setTurmaView(sub || 'recados');
    setPage(tab);
  }, [setPage]);

  const handleOpenClient = useCallback(client => {
    setOpenClient(client);
    setPage('alunos');
  }, [setPage]);
  const clearOpenClient = useCallback(() => setOpenClient(null), []);

  return (
    <div className="app-screen" style={{ display: 'flex' }}>
      <header className="topbar">
        <div className="trainer-topbar__title">{t('🧑‍🏫 EAFIT')} <span>{t('Personal')}</span></div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <ThemeToggle />
        </div>
      </header>

      <main className="pages">
        <ErrorBoundary variant="page" key={page}>
          <Suspense fallback={null}>
            {page === 'painel' && (
              <PainelPage userName={getDisplayName(user)} onOpenClient={handleOpenClient} onNavigate={navigate} onQueueLoaded={setUrgent} />
            )}
            {page === 'alunos' && <AlunosPage openClient={openClient} onClientOpened={clearOpenClient} />}
            {page === 'modelos' && <TemplatesPage />}
            {page === 'turma' && <TurmaPage view={turmaView} onView={setTurmaView} />}
            {page === 'conta' && <TrainerAccount onSwitchToStudent={onSwitchToStudent} />}
          </Suspense>
        </ErrorBoundary>
      </main>

      <TrainerNav items={items} active={page} onChange={setPage} />
      <Tutorial role="trainer" userId={user?.id} onNavigate={navigate} />
    </div>
  );
}
