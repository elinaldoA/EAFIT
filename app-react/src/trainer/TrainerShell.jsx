import { Suspense, useMemo, useState } from 'react';
import { useHashTab } from '../hooks/useHashTab';
import ErrorBoundary from '../components/ErrorBoundary';
import ThemeToggle from '../components/ThemeToggle';
import Tutorial from '../components/Tutorial';
import { useAuth } from '../context/useAuth';
import TrainerNav from './TrainerNav';
import AlunosPage from './AlunosPage';
import TrainerAccount from './TrainerAccount';
import MessagesPage from './MessagesPage';
import ClassPage from './ClassPage';
import TemplatesPage from './TemplatesPage';

import { t } from '../lib/i18n';
const TABS = ['alunos', 'modelos', 'turma', 'recados', 'conta'];

// Casca do app no modo Personal: outra navegação e outras páginas, mas o mesmo
// login, tema e visual do app de aluno.
export default function TrainerShell({ onSwitchToStudent }) {
  const { user } = useAuth();
  const [page, setPage] = useHashTab(TABS, 'alunos');
  const [attention, setAttention] = useState(0);

  const items = useMemo(() => [
    { key: 'alunos', label: t('Alunos'), badge: attention },
    { key: 'modelos', label: t('Modelos') },
    { key: 'turma', label: t('Turma') },
    { key: 'recados', label: t('Recados') },
    { key: 'conta', label: t('Conta') },
  ], [attention]);

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
            {page === 'alunos' && <AlunosPage onClientsLoaded={setAttention} />}
            {page === 'modelos' && <TemplatesPage />}
            {page === 'turma' && <ClassPage />}
            {page === 'recados' && <MessagesPage />}
            {page === 'conta' && <TrainerAccount onSwitchToStudent={onSwitchToStudent} />}
          </Suspense>
        </ErrorBoundary>
      </main>

      <TrainerNav items={items} active={page} onChange={setPage} />
      <Tutorial role="trainer" userId={user?.id} onNavigate={setPage} />
    </div>
  );
}
