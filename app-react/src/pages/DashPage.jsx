import { useMemo, useState } from 'react';
import { todayName, todayDate, getMuscleGroupsForDay, getWeeklyGoal } from '../data/treinoData';
import { useAuth } from '../context/useAuth';
import { useAppConfig } from '../context/useAppConfig';
import { isFlagOn } from '../lib/appConfig';
import { useWorkout } from '../context/useWorkout';
import { useToast } from '../context/useToast';
import { fmtDate, parseLocalDate, toDateStr, calcStreak } from '../lib/utils';
import { BADGES } from '../lib/achievements';
import { useDashboardData } from '../hooks/useDashboardData';
import BodyAvatar from '../components/BodyAvatar';
import LineChart from '../components/LineChart';
import ProgressPhotos from '../components/ProgressPhotos';
import MonthlyRecap from '../components/MonthlyRecap';
import Challenges from '../components/Challenges';
import Friends from '../components/Friends';
import { addDays } from '../lib/pause';
import BodyMeasurements from '../components/BodyMeasurements';
import CheckinInsights from '../components/CheckinInsights';
import Skeleton from '../components/Skeleton';
import { Heatmap, WeeklyBars, PRList, WeekCompare, LoadHistory } from '../components/DashCharts';
import { DiscomfortPanel, DiscomfortHistory } from '../components/DiscomfortWidgets';

import { t, tEx, tFoco } from '../lib/i18n';
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

export default function DashPage({ active }) {
  const { user } = useAuth();
  const { config } = useAppConfig();
  const { activePlanDays } = useWorkout();
  const toast = useToast();
  const {
    workouts, logs, allTimeLogs, loading, loadingPR, unlockedBadges, discomfortHistory, weightLogs,
    exercises, volumePoints, handleRefreshRecords,
  } = useDashboardData(active, user, toast);

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
  const day = activePlanDays.find(d => d.dia === todayName());
  const weekStart = addDays(todayDate(), -6);
  const myWeek = new Set(workouts.filter(w => w.completed && w.workout_date >= weekStart).map(w => w.workout_date)).size;
  const todayCompleted = workouts.find(w => w.workout_date === todayDate())?.completed ?? false;

  const [selectedView, setSelectedView] = useState('today');

  const { viewActiveGroups, selectedSubtitle } = useMemo(() => {
    if (selectedView === 'today') {
      const active = day && todayCompleted ? getMuscleGroupsForDay(day) : new Set();
      const subtitle = day
        ? (todayCompleted ? t('Foco: {foco}', { foco: tFoco(day.foco) }) : t('{foco} — treino de hoje ainda não concluído (sem marcações)', { foco: tFoco(day.foco) }))
        : t('Sem treino planejado para hoje');
      return { viewActiveGroups: active, selectedSubtitle: subtitle };
    }

    if (selectedView.startsWith('workout-')) {
      const wId = selectedView.replace('workout-', '');
      const w = workouts.find(x => String(x.id) === wId);
      if (w) {
        const planDay = activePlanDays.find(d => d.dia === w.day_of_week);
        const active = w.completed && planDay ? getMuscleGroupsForDay(planDay) : new Set();
        const subtitle = w.completed
          ? t('Treino concluído em {v1} (Foco: {v2})', { v1: fmtDate(w.workout_date), v2: tFoco(planDay?.foco || 'Geral') })
          : t('Treino de {day_of_week} ({v1}) não foi concluído (sem marcações)', { day_of_week: w.day_of_week, v1: fmtDate(w.workout_date) });
        return { viewActiveGroups: active, selectedSubtitle: subtitle };
      }
    }

    return { viewActiveGroups: new Set(), selectedSubtitle: '–' };
  }, [selectedView, workouts, activePlanDays, day, todayCompleted]);

  // Sem escolha do usuário, o gráfico abre no exercício treinado mais
  // recentemente, em vez de começar vazio.
  const defaultExercise = useMemo(() => {
    const withCarga = logs.filter(l => !isNaN(parseFloat(l.carga)));
    if (!withCarga.length) return exercises[0] || '';
    return withCarga.reduce((a, b) => (b.workout_date > a.workout_date ? b : a)).exercise_name;
  }, [logs, exercises]);
  const exercise = selectedExercise || defaultExercise;

  const summary = useMemo(() => {
    const since = parseLocalDate(todayDate());
    since.setDate(since.getDate() - 29);
    const sinceStr = toDateStr(since);
    const completed = workouts.filter(w => w.completed);
    return {
      treinos30: completed.filter(w => w.workout_date >= sinceStr).length,
      streak: calcStreak(completed.map(w => w.workout_date), user?.user_metadata?.pauses),
      recordes: new Set(allTimeLogs.filter(l => !isNaN(parseFloat(l.carga))).map(l => l.exercise_name)).size,
    };
  }, [workouts, allTimeLogs, user?.user_metadata?.pauses]);

  const loadPoints = useMemo(() => {
    if (!exercise) return [];
    // Se o exercício não tem registro nos últimos 60 dias (só apareceu no
    // seletor por causa de allTimeLogs), cai pro histórico completo — senão
    // o gráfico ficaria vazio pra um exercício que a lista de recordes ao
    // lado mostra ter PR.
    const hasRecentData = logs.some(l => l.exercise_name === exercise);
    const source = hasRecentData ? logs : allTimeLogs;
    return source
      .filter(l => l.exercise_name === exercise && !isNaN(parseFloat(l.carga)))
      .sort((a, b) => a.workout_date.localeCompare(b.workout_date))
      .map(l => ({ value: parseFloat(l.carga), label: fmtDate(l.workout_date) }));
  }, [logs, allTimeLogs, exercise]);

  const trainedDates = useMemo(() => workouts.filter(w => w.completed).map(w => w.workout_date), [workouts]);

  const weightPoints = useMemo(
    () => weightLogs.map(w => ({ label: fmtDate(w.log_date), value: w.peso })),
    [weightLogs]
  );

  return (
    <section id="page-dash" className="page active">
      <div className="dash-kpis">
        <div className="dash-kpi">
          <span className="dash-kpi__value">{loading ? '–' : summary.treinos30}</span>
          <span className="dash-kpi__label">{t('Treinos')}<br />{t('30 dias')}</span>
        </div>
        <div className="dash-kpi">
          <span className="dash-kpi__value">{loading ? '–' : `${summary.streak}d`}</span>
          <span className="dash-kpi__label">{t('Sequência')}<br />{t('atual')}</span>
        </div>
        <div className="dash-kpi">
          <span className="dash-kpi__value">{loadingPR ? '–' : summary.recordes}</span>
          <span className="dash-kpi__label">{t('Exercícios')}<br />{t('com recorde')}</span>
        </div>
        <div className="dash-kpi">
          <span className="dash-kpi__value">{unlockedBadges.size}/{BADGES.length}</span>
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

      {tab === 'treinos' && (<>
      <MonthlyRecap userId={user.id} allTimeLogs={allTimeLogs} loadingLogs={loadingPR} />
      {isFlagOn(config.flags, 'desafios') && <Challenges />}
      <div className="dash-card">
        <div className="dash-card__title-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', marginBottom: '8px' }}>
          <div className="dash-card__title" style={{ marginBottom: 0 }}>{t('Visualização Anatômica')}</div>
          <select
            className="input input--sm"
            style={{ width: 'auto', minWidth: '180px', maxWidth: '100%', padding: '4px 8px' }}
            value={selectedView}
            onChange={e => setSelectedView(e.target.value)}
          >
            <option value="today">{t('Hoje ({v1})', { v1: day ? t(day.dia) : t('Sem treino') })}</option>
            {workouts.filter(w => w.completed).reverse().map(w => {
              const planDay = activePlanDays.find(d => d.dia === w.day_of_week);
              return (
                <option key={w.id} value={`workout-${w.id}`}>
                  {fmtDate(w.workout_date)} · {w.day_of_week}{planDay ? ` (${tFoco(planDay.foco)})` : ''}
                </option>
              );
            })}
          </select>
        </div>
        <div className="dash-card__subtitle" style={{ marginBottom: '12px' }}>
          {selectedSubtitle}
        </div>
        <BodyAvatar activeGroups={viewActiveGroups} />
      </div>

      <div className="section-group">
        <div className="dash-card">
          <div className="dash-card__title">{t('Soma de cargas por treino')}</div>
          <p className="dash-card__subtitle">{t('Soma do peso de todas as séries concluídas em cada treino (não considera repetições)')}</p>
          <div className="line-chart-wrap">
            {loading ? <Skeleton height={130} /> : (
              <LineChart
                points={volumePoints}
                valueSuffix="kg"
                singleMsg={v => t('1 treino registrado: {v}kg — treine mais vezes para ver a evolução', { v })}
                emptyMsg={t('Nenhum volume registrado ainda. Marque séries como concluídas na aba Treino.')}
              />
            )}
          </div>
        </div>

        <div className="dash-card">
          <div className="dash-card__title">{t('Últimos 35 dias')}</div>
          {loading ? <Skeleton height={140} /> : (
            <>
              <div className="heatmap-wrap">
                <div className="heatmap-days">
                  <span>{t('Seg')}</span><span>{t('Ter')}</span><span>{t('Qua')}</span>
                  <span>{t('Qui')}</span><span>{t('Sex')}</span><span>{t('Sáb')}</span><span>{t('Dom')}</span>
                </div>
                <Heatmap workouts={workouts} />
              </div>
              <div className="heatmap-legend">
                <span className="heatmap-legend__dot heatmap-legend__dot--done" /><span>{t('Concluído')}</span>
                <span className="heatmap-legend__dot heatmap-legend__dot--miss" /><span>{t('Não feito')}</span>
                <span className="heatmap-legend__dot heatmap-legend__dot--none" /><span>{t('Sem registro')}</span>
              </div>
            </>
          )}
        </div>

        <div className="dash-card">
          <div className="dash-card__title">{t('Treinos concluídos por semana')}</div>
          {loading ? <Skeleton height={110} /> : <WeeklyBars workouts={workouts} weeklyGoal={weeklyGoal} />}
        </div>

        <div className="dash-card">
          <div className="dash-card__title">{t('Evolução de carga')}</div>
          <select className="input input--sm" value={exercise} onChange={e => setSelectedExercise(e.target.value)} aria-label={t('Exercício')}>
            {!exercise && <option value="">{t('Selecione um exercício')}</option>}
            {exercises.map(name => <option key={name} value={name}>{tEx(name)}</option>)}
          </select>
          <div className="line-chart-wrap">
            {loading ? <Skeleton height={130} /> : (
              <LineChart
                points={loadPoints}
                valueSuffix="kg"
                singleMsg={v => t('1 registro: {v}kg — treine mais vezes para ver a evolução', { v })}
                emptyMsg={exercise ? t('Nenhum registro para este exercício') : t('Registre cargas na aba Treino para ver a evolução')}
              />
            )}
          </div>
          {!loading && exercise && <WeekCompare logs={logs} exercise={exercise} />}
          {!loading && exercise && <LoadHistory points={loadPoints} />}
          {!loading && exercise && <DiscomfortPanel userId={user.id} exerciseName={exercise} toast={toast} />}
        </div>
      </div>
      </>)}

      {tab === 'amigos' && <Friends myWeek={myWeek} />}

      {tab === 'recordes' && (<>
      <div className="section-group">
        <div className="section-group__label">{t('Recordes pessoais')}</div>
        <div className="dash-card">
          <div className="dash-card__title-row">
            <div className="dash-card__title">{t('Maior carga por exercício')}</div>
            <button type="button" className="icon-btn" aria-label={t('Atualizar recordes')} disabled={loadingPR} onClick={handleRefreshRecords}>
              ↻
            </button>
          </div>
          {loadingPR ? <Skeleton height={100} /> : <PRList logs={allTimeLogs} />}
        </div>
      </div>

      <div className="section-group">
        <div className="section-group__label">{t('Conquistas · {size} de {length}', { size: unlockedBadges.size, length: BADGES.length })}</div>
        <div className="dash-card">
          <div className="badge-grid">
            {BADGES.map(b => {
              const unlocked = unlockedBadges.has(b.id);
              return (
                <div key={b.id} className={`badge-card${unlocked ? ' badge-card--unlocked' : ''}`} title={b.desc}>
                  <span className="badge-card__emoji">{b.emoji}</span>
                  <span className="badge-card__title">{b.title}</span>
                  {!unlocked && <span className="badge-card__desc">{b.desc}</span>}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="section-group">
        <div className="section-group__label">{t('Desconforto')}</div>
        <div className="dash-card">
          <div className="dash-card__title">{t('Histórico de desconforto')}</div>
          {loading ? <Skeleton height={100} /> : <DiscomfortHistory reports={discomfortHistory} />}
        </div>
      </div>
      </>)}

      {tab === 'corpo' && (
      <div className="section-group">
        <div className="section-group__label">{t('Peso e fotos de progresso')}</div>
        <div className="dash-card">
          <div className="dash-card__title">{t('Evolução do peso')}</div>
          <div className="line-chart-wrap">
            {loadingPR ? <Skeleton height={130} /> : (
              <LineChart
                points={weightPoints}
                valueSuffix="kg"
                singleMsg={v => t('1 registro: {v}kg — registre seu peso novamente em outro dia para ver a evolução', { v })}
                emptyMsg={t('Nenhum peso registrado ainda. Registre em Perfil para começar.')}
              />
            )}
          </div>
        </div>
        {isFlagOn(config.flags, 'fotos_progresso') && (
          <div className="dash-card">
            <div className="dash-card__title">{t('Fotos de progresso')}</div>
            <ProgressPhotos />
          </div>
        )}
        {isFlagOn(config.flags, 'medidas_corporais') && <BodyMeasurements userId={user.id} />}
        {isFlagOn(config.flags, 'checkin_diario') && <CheckinInsights userId={user.id} trainedDates={trainedDates} />}
      </div>
      )}
    </section>
  );
}
