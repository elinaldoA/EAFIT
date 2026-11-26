import { useMemo, useState } from 'react';
import { todayDate, getWeeklyGoal } from '../data/treinoData';
import { useAuth } from '../context/useAuth';
import { useAppConfig } from '../context/useAppConfig';
import { isFlagOn } from '../lib/appConfig';
import { useToast } from '../context/useToast';
import { parseLocalDate, toDateStr, calcStreak, getWeekStart } from '../lib/utils';
import { visibleBadges } from '../lib/achievements';
import { useSeason } from '../hooks/useSeason';
import { useDashboardData } from '../hooks/useDashboardData';
import Friends from '../components/Friends';
import DashTreinosTab from '../components/DashTreinosTab';
import DashRecordesTab from '../components/DashRecordesTab';
import DashCorpoTab from '../components/DashCorpoTab';
import { addDays } from '../lib/pause';

import { t } from '../lib/i18n';
const TABS = [
  { key: 'treinos', label: t('Treinos') },
  { key: 'recordes', label: t('Recordes') },
  { key: 'corpo', label: t('Corpo') },
  { key: 'amigos', label: t('Amigos') },
];
const TAB_STORAGE_KEY = 'dash_tab';

// Aba lembrada entre visitas (e usada pelo atalho "Peso e fotos" do Perfil,
// que grava 'corpo' aqui antes de navegar). localStorage pode lançar em aba
// privada — sem ele, só abre sempre em Treinos.
function readTab() {
  try {
    const t = localStorage.getItem(TAB_STORAGE_KEY);
    return TABS.some(x => x.key === t) ? t : 'treinos';
  } catch {
    return 'treinos';
  }
}

// Treinos concluídos por semana nas últimas 8 semanas; a semana atual em destaque
// e a meta semanal como referência (barras que a atingem ficam cheias).
function WeeklyWorkoutsCard({ workouts, goal }) {
  const weeks = useMemo(() => {
    const done = workouts.filter(w => w.completed).map(w => w.workout_date);
    return Array.from({ length: 8 }, (_, k) => {
      const start = getWeekStart(7 - k);
      const end = addDays(start, 6);
      return { start, count: done.filter(d => d >= start && d <= end).length, current: k === 7 };
    });
  }, [workouts]);
  const max = Math.max(goal || 0, ...weeks.map(w => w.count), 1);
  return (
    <div className="dash-card weekly-card">
      <h3 className="weekly-card__title">{t('Treinos por semana')}</h3>
      <p className="weekly-card__sub">{t('Concluídos nas últimas 8 semanas')}{goal ? ` · ${t('meta {n}', { n: goal })}` : ''}</p>
      <div className="weekly-bars" role="img" aria-label={t('Treinos por semana: {v}', { v: weeks.map(w => w.count).join(', ') })}>
        {weeks.map(w => (
          <i key={w.start}
            className={`${w.current ? 'weekly-bars__bar--now' : ''}${goal && w.count >= goal ? ' weekly-bars__bar--hit' : ''}`}
            style={{ height: `${Math.max(6, (w.count / max) * 100)}%` }} title={String(w.count)} />
        ))}
      </div>
      <div className="weekly-bars__labels">{weeks.map((w, i) => <span key={w.start}>{i === 7 ? t('Esta') : `S${i + 1}`}</span>)}</div>
    </div>
  );
}

export default function DashPage({ active }) {
  const { user } = useAuth();
  const { config } = useAppConfig();
  const season = useSeason();
  const toast = useToast();
  const {
    workouts, logs, allTimeLogs, loading, loadingPR, unlockedBadges, discomfortHistory, weightLogs,
    exercises, volumePoints, handleRefreshRecords,
  } = useDashboardData(active, user, toast);

  // Conquista de temporada aparece no período do tema, mesmo pra quem desligou a decoração.
  const badges = visibleBadges(unlockedBadges, { theme: season.available, year: season.year });
  const badgesUnlocked = badges.filter(b => unlockedBadges.has(b.id)).length;

  const [savedTab, setTabState] = useState(readTab);
  const [selectedExercise, setSelectedExercise] = useState('');

  // Aba Amigos desligada no painel admin: some do menu e, se era a aba
  // lembrada, a tela abre em Treinos.
  const tabs = isFlagOn(config.flags, 'amigos') ? TABS : TABS.filter(x => x.key !== 'amigos');
  const tab = tabs.some(x => x.key === savedTab) ? savedTab : 'treinos';

  function setTab(next) {
    setTabState(next);
    try { localStorage.setItem(TAB_STORAGE_KEY, next); } catch { /* sem storage */ }
  }
  const weeklyGoal = getWeeklyGoal(user);
  const weekStart = addDays(todayDate(), -6);
  const myWeek = new Set(workouts.filter(w => w.completed && w.workout_date >= weekStart).map(w => w.workout_date)).size;

  const [selectedView, setSelectedView] = useState('today');

  const summary = useMemo(() => {
    const since = parseLocalDate(todayDate());
    since.setDate(since.getDate() - 29);
    const sinceStr = toDateStr(since);
    const completed = workouts.filter(w => w.completed);
    const prevSince = parseLocalDate(todayDate());
    prevSince.setDate(prevSince.getDate() - 59);
    const prevSinceStr = toDateStr(prevSince);
    return {
      treinos30: completed.filter(w => w.workout_date >= sinceStr).length,
      treinosPrev30: completed.filter(w => w.workout_date >= prevSinceStr && w.workout_date < sinceStr).length,
      streak: calcStreak(completed.map(w => w.workout_date), user?.user_metadata?.pauses),
      recordes: new Set(allTimeLogs.filter(l => !isNaN(parseFloat(l.carga))).map(l => l.exercise_name)).size,
    };
  }, [workouts, allTimeLogs, user?.user_metadata?.pauses]);

  return (
    <section id="page-dash" className="page active">
      <div className="dash-kpis">
        <div className="dash-kpi">
          <span className="dash-kpi__value">{loading ? '–' : summary.treinos30}</span>
          <span className="dash-kpi__label">{t('Treinos')}<br />{t('30 dias')}</span>
          {!loading && summary.treinosPrev30 > 0 && (
            <span className={`dash-kpi__delta${summary.treinos30 < summary.treinosPrev30 ? ' dash-kpi__delta--down' : ''}`}>
              {summary.treinos30 >= summary.treinosPrev30 ? '▲' : '▼'} {Math.abs(summary.treinos30 - summary.treinosPrev30)} {summary.treinos30 >= summary.treinosPrev30 ? t('a mais que antes') : t('a menos que antes')}
            </span>
          )}
        </div>
        <div className="dash-kpi">
          <span className="dash-kpi__value">{loading ? '–' : `${summary.streak}d`}</span>
          <span className="dash-kpi__label">{t('Sequência atual')}</span>
        </div>
        <div className="dash-kpi">
          <span className="dash-kpi__value">{loadingPR ? '–' : summary.recordes}</span>
          <span className="dash-kpi__label">{t('Exercícios')}<br />{t('com recorde')}</span>
        </div>
        <div className="dash-kpi">
          <span className="dash-kpi__value">{badgesUnlocked}/{badges.length}</span>
          <span className="dash-kpi__label">{t('Conquistas')}</span>
        </div>
      </div>

      <div className="seg" role="tablist" aria-label={t('Seções da evolução')}>
        {tabs.map(t => (
          <button
            key={t.key} type="button" role="tab" aria-selected={tab === t.key}
            className={`seg__btn${tab === t.key ? ' seg__btn--active' : ''}`}
            onClick={() => setTab(t.key)}
          >{t.label}</button>
        ))}
      </div>

      {tab === 'treinos' && !loading && <WeeklyWorkoutsCard workouts={workouts} goal={weeklyGoal} />}

      {tab === 'treinos' && (
        <DashTreinosTab
          active={active} toast={toast} workouts={workouts} logs={logs} allTimeLogs={allTimeLogs}
          exercises={exercises} volumePoints={volumePoints} loading={loading} loadingPR={loadingPR} weeklyGoal={weeklyGoal}
          selectedView={selectedView} onViewChange={setSelectedView}
          selectedExercise={selectedExercise} onExerciseChange={setSelectedExercise}
        />
      )}

      {tab === 'amigos' && <Friends myWeek={myWeek} />}

      {tab === 'recordes' && (
        <DashRecordesTab
          exercises={exercises} allTimeLogs={allTimeLogs} loading={loading} loadingPR={loadingPR}
          onRefreshRecords={handleRefreshRecords} badges={badges} unlockedBadges={unlockedBadges}
          badgesUnlocked={badgesUnlocked} discomfortHistory={discomfortHistory}
        />
      )}

      {tab === 'corpo' && <DashCorpoTab userId={user.id} workouts={workouts} weightLogs={weightLogs} loadingPR={loadingPR} profileWeight={user?.user_metadata?.peso} />}
    </section>
  );
}
