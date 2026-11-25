import { useEffect, useState } from 'react';
import { useAuth } from '../context/useAuth';
import { useWorkout } from '../context/useWorkout';
import { todayDate } from '../data/treinoData';
import { parseLocalDate, formatDuration } from '../lib/utils';
import { MONTH_NAMES, fetchMonthSessions, fmtVolume } from '../lib/workoutHistory';
import { goTo } from '../lib/appNav';
import { trackFeature } from '../lib/tracking';
import SessionDetailModal from './SessionDetailModal';

import { t } from '../lib/i18n';

const LIMIT = 3;

// Mês anterior ao de (year, month), para completar a lista no começo do mês.
const prevMonth = ({ year, month }) => (month === 0 ? { year: year - 1, month: 11 } : { year, month: month - 1 });

// Últimos treinos feitos (do mês atual e, se faltar, do anterior), no mesmo formato do
// Histórico; tocar abre o detalhe da sessão. Sem treino nenhum, não mostra nada.
export default function RecentWorkouts() {
  const { user } = useAuth();
  const { dataVersion } = useWorkout();
  const [sessions, setSessions] = useState([]);
  const [detail, setDetail] = useState(null);
  const userId = user?.id;

  useEffect(() => {
    if (!userId) return undefined;
    let cancelled = false;
    const d = parseLocalDate(todayDate());
    const now = { year: d.getFullYear(), month: d.getMonth() };
    const prev = prevMonth(now);
    Promise.all([fetchMonthSessions(userId, now.year, now.month), fetchMonthSessions(userId, prev.year, prev.month)])
      .then(([current, before]) => {
        if (!cancelled) setSessions([...current, ...before].filter(s => s.completed || s.doneSets > 0).slice(0, LIMIT));
      })
      .catch(err => console.error('RecentWorkouts:', err));
    return () => { cancelled = true; };
  }, [userId, dataVersion]);

  if (!sessions.length) return null;
  return (
    <section className="recent" aria-label={t('Treinos recentes')}>
      <div className="recent__head">
        <h2 className="section-group__label">{t('Treinos recentes')}</h2>
        <button type="button" className="link-btn" onClick={() => { trackFeature('treinos_recentes_ver_todos'); goTo({ tab: 'dash', dashTab: 'historico' }); }}>
          {t('Ver todos')}
        </button>
      </div>
      <div className="history-list">
        {sessions.map(s => {
          const date = parseLocalDate(s.date);
          return (
            <button key={s.id} type="button" className="history-item" onClick={() => setDetail(s)}>
              <div className={`history-item__date${s.completed ? ' history-item__date--done' : ''}`}>
                <span className="history-item__day">{date.getDate()}</span>
                <span className="history-item__month">{MONTH_NAMES[date.getMonth()].slice(0, 3)}</span>
              </div>
              <div className="history-item__main">
                <div className="history-item__title">
                  {t(s.dayOfWeek)}
                  {!s.completed && <span className="history-item__tag">{t('incompleto')}</span>}
                </div>
                <div className="history-item__meta">
                  {t('{length} exerc. · {doneSets} séries {v1} {v2}', {
                    length: s.exercises.length, doneSets: s.doneSets,
                    v1: s.durationSeconds ? ` · ${formatDuration(s.durationSeconds * 1000)}` : '',
                    v2: s.volume ? ` · ${fmtVolume(s.volume)}` : '',
                  })}
                </div>
              </div>
              <span className="history-item__chevron" aria-hidden="true">›</span>
            </button>
          );
        })}
      </div>
      {detail && <SessionDetailModal session={detail} onClose={() => setDetail(null)} />}
    </section>
  );
}
