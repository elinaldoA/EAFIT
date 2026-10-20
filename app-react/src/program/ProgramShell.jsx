import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useHashTab } from '../hooks/useHashTab';
import ErrorBoundary from '../components/ErrorBoundary';
import ThemeToggle from '../components/ThemeToggle';
import Tutorial from '../components/Tutorial';
import TrainerNav from '../trainer/TrainerNav';
import { useAuth } from '../context/useAuth';
import { fetchMyAmbassador } from '../lib/ambassador';
import { countUnreadProgramMessages } from '../lib/inbox';
import { programLabels } from '../lib/programLabels';
import { NAV_EVENT } from '../lib/appNav';
import ResultsPage from './ResultsPage';
import SharePage from './SharePage';
import MessagesPage from './MessagesPage';
import ProgramAccount from './ProgramAccount';

import { t } from '../lib/i18n';
const TABS = ['resultados', 'divulgar', 'recados', 'conta'];

const ICONS = {
  resultados: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3v18h18" /><path d="M7 16v-5" /><path d="M12 16V8" /><path d="M17 16v-9" />
    </svg>
  ),
  divulgar: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1z" /><path d="M15.5 8.5a5 5 0 0 1 0 7" /><path d="M18.5 5.5a9 9 0 0 1 0 13" />
    </svg>
  ),
  recados: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  ),
};

// Casca do app no modo do programa (Embaixador ou Influenciador — o mesmo
// programa com nomes diferentes, ambassadors.kind): outra navegação e outras
// páginas, mas o mesmo login, tema e visual do app de aluno (como o modo
// Personal). `kind` vem do App (hooks/useProgram.js) e só muda os nomes.
export default function ProgramShell({ kind, onSwitchToStudent }) {
  const labels = programLabels(kind);
  const { user } = useAuth();
  const [page, setPage] = useHashTab(TABS, 'resultados');
  // undefined = carregando; null = a conta saiu do programa
  const [amb, setAmb] = useState(undefined);
  const [failed, setFailed] = useState(false);
  const [unread, setUnread] = useState(0);
  const [navSeq, setNavSeq] = useState(0);

  // Recados novos: conta ao abrir e a cada toque numa notificação com o app
  // aberto (NAV_EVENT), que também recarrega a aba — quem já estava em
  // Recados vê o recado que acabou de chegar.
  const refreshUnread = useCallback(() => {
    countUnreadProgramMessages().then(setUnread).catch(err => console.error('countUnreadProgramMessages:', err));
  }, []);
  useEffect(() => {
    refreshUnread();
    const onNav = () => { setNavSeq(n => n + 1); refreshUnread(); };
    window.addEventListener(NAV_EVENT, onNav);
    return () => window.removeEventListener(NAV_EVENT, onNav);
  }, [refreshUnread]);
  const handleRead = useCallback(() => setUnread(0), []);

  useEffect(() => {
    let active = true;
    fetchMyAmbassador(30)
      .then(a => { if (active) setAmb(a); })
      .catch(err => { console.error('fetchMyAmbassador:', err); if (active) setFailed(true); });
    return () => { active = false; };
  }, []);

  const items = useMemo(() => [
    { key: 'resultados', label: t('Resultados'), icon: ICONS.resultados },
    { key: 'divulgar', label: t('Divulgar'), icon: ICONS.divulgar },
    { key: 'recados', label: t('Recados'), icon: ICONS.recados, badge: unread },
    { key: 'conta', label: t('Conta') },
  ], [unread]);

  return (
    <div className="app-screen" style={{ display: 'flex' }}>
      <header className="topbar">
        <div className="trainer-topbar__title">{t('📣 EAFIT')} <span>{labels.role}</span></div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <ThemeToggle />
        </div>
      </header>

      <main className="pages">
        <ErrorBoundary variant="page" key={`${page}:${navSeq}`}>
          <Suspense fallback={null}>
            {page === 'conta' && <ProgramAccount amb={amb} labels={labels} onSwitchToStudent={onSwitchToStudent} />}
            {page === 'recados' && <MessagesPage onRead={handleRead} />}
            {(page === 'resultados' || page === 'divulgar') && (
              <ProgramContent page={page} amb={amb} labels={labels} failed={failed} onSwitchToStudent={onSwitchToStudent} />
            )}
          </Suspense>
        </ErrorBoundary>
      </main>

      <TrainerNav items={items} active={page} onChange={setPage} label={labels.nav} />
      <Tutorial role={labels.tutorialRole} userId={user?.id} onNavigate={setPage} />
    </div>
  );
}

function ProgramContent({ page, amb, labels, failed, onSwitchToStudent }) {
  if (failed && amb === undefined) {
    return (
      <section className="page active trainer-page">
        <div className="dash-card">
          <p className="profile-field__hint" style={{ margin: 0 }}>{t('Não foi possível carregar seu painel agora. Confira a conexão e abra de novo.')}</p>
        </div>
      </section>
    );
  }
  if (amb === undefined) {
    return (
      <section className="page active trainer-page">
        <div className="skeleton" style={{ height: 130 }} />
        <div className="skeleton" style={{ height: 130 }} />
      </section>
    );
  }
  if (!amb) {
    return (
      <section className="page active trainer-page">
        <div className="dash-card">
          <div className="dash-card__title">{labels.mode}</div>
          <p className="profile-field__hint" style={{ marginTop: 0 }}>{t('Sua conta não está mais no programa de divulgação do EAFIT. Fale com a equipe EAFIT se isso for um engano.')}</p>
          <button type="button" className="btn btn--primary btn--full" onClick={onSwitchToStudent}>{t('Usar como aluno')}</button>
        </div>
      </section>
    );
  }
  return page === 'divulgar' ? <SharePage amb={amb} /> : <ResultsPage amb={amb} labels={labels} />;
}
