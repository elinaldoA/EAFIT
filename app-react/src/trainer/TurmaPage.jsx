import MessagesPage from './MessagesPage';
import ClassPage from './ClassPage';

import { t } from '../lib/i18n';
const VIEWS = [
  { key: 'recados', label: t('💬 Recados') },
  { key: 'desafios', label: t('🏆 Desafios') },
];

// Aba Turma do personal: o que vai para vários alunos de uma vez — recados
// (com o "lido" de cada um) e desafios da turma.
export default function TurmaPage({ view, onView }) {
  const header = (
    <div className="seg" role="tablist" aria-label={t('Turma')}>
      {VIEWS.map(v => (
        <button key={v.key} type="button" role="tab" aria-selected={view === v.key}
          className={view === v.key ? 'seg__btn seg__btn--active' : 'seg__btn'} onClick={() => onView(v.key)}>{v.label}</button>
      ))}
    </div>
  );
  return view === 'desafios' ? <ClassPage header={header} /> : <MessagesPage header={header} />;
}
