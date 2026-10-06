import { Suspense, useMemo, useState } from 'react';
import { useHashTab } from '../hooks/useHashTab';
import ErrorBoundary from '../components/ErrorBoundary';
import ThemeToggle from '../components/ThemeToggle';
import TrainerNav from './TrainerNav';
import AlunosPage from './AlunosPage';
import TrainerAccount from './TrainerAccount';
import MessagesPage from './MessagesPage';
import ClassPage from './ClassPage';

const TABS = ['alunos', 'turma', 'recados', 'conta'];

// Casca do app no modo Personal: outra navegação e outras páginas, mas o mesmo
// login, tema e visual do app de aluno.
export default function TrainerShell({ onSwitchToStudent }) {
  const [page, setPage] = useHashTab(TABS, 'alunos');
  const [attention, setAttention] = useState(0);

  const items = useMemo(() => [
    { key: 'alunos', label: 'Alunos', badge: attention },
    { key: 'turma', label: 'Turma' },
    { key: 'recados', label: 'Recados' },
    { key: 'conta', label: 'Conta' },
  ], [attention]);

  return (
    <div className="app-screen" style={{ display: 'flex' }}>
      <header className="topbar">
        <div className="trainer-topbar__title">🧑‍🏫 EAFIT <span>Personal</span></div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <ThemeToggle />
        </div>
      </header>

      <main className="pages">
        <ErrorBoundary variant="page" key={page}>
          <Suspense fallback={null}>
            {page === 'alunos' && <AlunosPage onClientsLoaded={setAttention} />}
            {page === 'turma' && <ClassPage />}
            {page === 'recados' && <MessagesPage />}
            {page === 'conta' && <TrainerAccount onSwitchToStudent={onSwitchToStudent} />}
          </Suspense>
        </ErrorBoundary>
      </main>

      <TrainerNav items={items} active={page} onChange={setPage} />
    </div>
  );
}
