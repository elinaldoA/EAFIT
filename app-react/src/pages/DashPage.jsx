import { useMemo, useState } from 'react';
import { todayName, todayDate, getMuscleGroupsForDay, getWeeklyGoal } from '../data/treinoData';
import { useAuth } from '../context/useAuth';
import { useWorkout } from '../context/useWorkout';
import { useToast } from '../context/useToast';
import { fmtDate, parseLocalDate, toDateStr, calcStreak } from '../lib/utils';
import { BADGES } from '../lib/achievements';
import { useDashboardData } from '../hooks/useDashboardData';
import BodyAvatar from '../components/BodyAvatar';
import LineChart from '../components/LineChart';
import ProgressPhotos from '../components/ProgressPhotos';
import Skeleton from '../components/Skeleton';
import { Heatmap, WeeklyBars, PRList, WeekCompare, LoadHistory } from '../components/DashCharts';
import { DiscomfortPanel, DiscomfortHistory } from '../components/DiscomfortWidgets';

const TABS = [
  { key: 'treinos', label: 'Treinos' },
  { key: 'recordes', label: 'Recordes' },
  { key: 'corpo', label: 'Corpo' },
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
  const { activePlanDays } = useWorkout();
  const toast = useToast();
  const {
    workouts, logs, allTimeLogs, loading, loadingPR, unlockedBadges, discomfortHistory, weightLogs,
    exercises, volumePoints, handleRefreshRecords,
  } = useDashboardData(active, user, toast);

  const [tab, setTabState] = useState(readTab);
  const [selectedExercise, setSelectedExercise] = useState('');

  function setTab(next) {
    setTabState(next);
    try { localStorage.setItem(TAB_STORAGE_KEY, next); } catch { /* sem storage */ }
  }
  const weeklyGoal = getWeeklyGoal(user);
  const day = activePlanDays.find(d => d.dia === todayName());
  const todayCompleted = workouts.find(w => w.workout_date === todayDate())?.completed ?? false;

  const [selectedView, setSelectedView] = useState('today');

  const { viewActiveGroups, selectedSubtitle } = useMemo(() => {
    if (selectedView === 'today') {
      const active = day && todayCompleted ? getMuscleGroupsForDay(day) : new Set();
      const subtitle = day
        ? (todayCompleted ? `Foco: ${day.foco}` : `${day.foco} — treino de hoje ainda não concluído (sem marcações)`)
        : 'Sem treino planejado para hoje';
      return { viewActiveGroups: active, selectedSubtitle: subtitle };
    }

    if (selectedView.startsWith('workout-')) {
      const wId = selectedView.replace('workout-', '');
      const w = workouts.find(x => String(x.id) === wId);
      if (w) {
        const planDay = activePlanDays.find(d => d.dia === w.day_of_week);
        const active = w.completed && planDay ? getMuscleGroupsForDay(planDay) : new Set();
        const subtitle = w.completed
          ? `Treino concluído em ${fmtDate(w.workout_date)} (Foco: ${planDay?.foco || 'Geral'})`
          : `Treino de ${w.day_of_week} (${fmtDate(w.workout_date)}) não foi concluído (sem marcações)`;
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
      streak: calcStreak(completed.map(w => w.workout_date)),
      recordes: new Set(allTimeLogs.filter(l => !isNaN(parseFloat(l.carga))).map(l => l.exercise_name)).size,
    };
  }, [workouts, allTimeLogs]);

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

  const weightPoints = useMemo(
    () => weightLogs.map(w => ({ label: fmtDate(w.log_date), value: w.peso })),
    [weightLogs]
  );

  return (
    <section id="page-dash" className="page active">
      <div className="dash-kpis">
        <div className="dash-kpi">
          <span className="dash-kpi__value">{loading ? '–' : summary.treinos30}</span>
          <span className="dash-kpi__label">Treinos<br />30 dias</span>
        </div>
        <div className="dash-kpi">
          <span className="dash-kpi__value">{loading ? '–' : `${summary.streak}d`}</span>
          <span className="dash-kpi__label">Sequência<br />atual</span>
        </div>
        <div className="dash-kpi">
          <span className="dash-kpi__value">{loadingPR ? '–' : summary.recordes}</span>
          <span className="dash-kpi__label">Exercícios<br />com recorde</span>
        </div>
        <div className="dash-kpi">
          <span className="dash-kpi__value">{unlockedBadges.size}/{BADGES.length}</span>
          <span className="dash-kpi__label">Conquistas</span>
        </div>
      </div>

      <div className="seg" role="tablist" aria-label="Seções da evolução">
        {TABS.map(t => (
          <button
            key={t.key} type="button" role="tab" aria-selected={tab === t.key}
            className={`seg__btn${tab === t.key ? ' seg__btn--active' : ''}`}
            onClick={() => setTab(t.key)}
          >{t.label}</button>
        ))}
      </div>

      {tab === 'treinos' && (<>
      <div className="dash-card">
        <div className="dash-card__title-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', marginBottom: '8px' }}>
          <div className="dash-card__title" style={{ marginBottom: 0 }}>Visualização Anatômica</div>
          <select
            className="input input--sm"
            style={{ width: 'auto', minWidth: '180px', padding: '4px 8px' }}
            value={selectedView}
            onChange={e => setSelectedView(e.target.value)}
          >
            <option value="today">Hoje ({day ? day.dia : 'Sem treino'})</option>
            {workouts.filter(w => w.completed).reverse().map(w => {
              const planDay = activePlanDays.find(d => d.dia === w.day_of_week);
              return (
                <option key={w.id} value={`workout-${w.id}`}>
                  {fmtDate(w.workout_date)} · {w.day_of_week}{planDay ? ` (${planDay.foco})` : ''}
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
          <div className="dash-card__title">Soma de cargas por treino</div>
          <p className="dash-card__subtitle">Soma do peso de todas as séries concluídas em cada treino (não considera repetições)</p>
          <div className="line-chart-wrap">
            {loading ? <Skeleton height={130} /> : (
              <LineChart
                points={volumePoints}
                valueSuffix="kg"
                singleMsg={v => `1 treino registrado: ${v}kg — treine mais vezes para ver a evolução`}
                emptyMsg="Nenhum volume registrado ainda. Marque séries como concluídas na aba Treino."
              />
            )}
          </div>
        </div>

        <div className="dash-card">
          <div className="dash-card__title">Últimos 35 dias</div>
          {loading ? <Skeleton height={140} /> : (
            <>
              <div className="heatmap-wrap">
                <div className="heatmap-days">
                  <span>Seg</span><span>Ter</span><span>Qua</span>
                  <span>Qui</span><span>Sex</span><span>Sáb</span><span>Dom</span>
                </div>
                <Heatmap workouts={workouts} />
              </div>
              <div className="heatmap-legend">
                <span className="heatmap-legend__dot heatmap-legend__dot--done" /><span>Concluído</span>
                <span className="heatmap-legend__dot heatmap-legend__dot--miss" /><span>Não feito</span>
                <span className="heatmap-legend__dot heatmap-legend__dot--none" /><span>Sem registro</span>
              </div>
            </>
          )}
        </div>

        <div className="dash-card">
          <div className="dash-card__title">Treinos concluídos por semana</div>
          {loading ? <Skeleton height={110} /> : <WeeklyBars workouts={workouts} weeklyGoal={weeklyGoal} />}
        </div>

        <div className="dash-card">
          <div className="dash-card__title">Evolução de carga</div>
          <select className="input input--sm" value={exercise} onChange={e => setSelectedExercise(e.target.value)} aria-label="Exercício">
            {!exercise && <option value="">Selecione um exercício</option>}
            {exercises.map(name => <option key={name} value={name}>{name}</option>)}
          </select>
          <div className="line-chart-wrap">
            {loading ? <Skeleton height={130} /> : (
              <LineChart
                points={loadPoints}
                valueSuffix="kg"
                singleMsg={v => `1 registro: ${v}kg — treine mais vezes para ver a evolução`}
                emptyMsg={exercise ? 'Nenhum registro para este exercício' : 'Registre cargas na aba Treino para ver a evolução'}
              />
            )}
          </div>
          {!loading && exercise && <WeekCompare logs={logs} exercise={exercise} />}
          {!loading && exercise && <LoadHistory points={loadPoints} />}
          {!loading && exercise && <DiscomfortPanel userId={user.id} exerciseName={exercise} toast={toast} />}
        </div>
      </div>
      </>)}

      {tab === 'recordes' && (<>
      <div className="section-group">
        <div className="section-group__label">Recordes pessoais</div>
        <div className="dash-card">
          <div className="dash-card__title-row">
            <div className="dash-card__title">Maior carga por exercício</div>
            <button type="button" className="icon-btn" aria-label="Atualizar recordes" disabled={loadingPR} onClick={handleRefreshRecords}>
              ↻
            </button>
          </div>
          {loadingPR ? <Skeleton height={100} /> : <PRList logs={allTimeLogs} />}
        </div>
      </div>

      <div className="section-group">
        <div className="section-group__label">Conquistas · {unlockedBadges.size} de {BADGES.length}</div>
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
        <div className="section-group__label">Desconforto</div>
        <div className="dash-card">
          <div className="dash-card__title">Histórico de desconforto</div>
          {loading ? <Skeleton height={100} /> : <DiscomfortHistory reports={discomfortHistory} />}
        </div>
      </div>
      </>)}

      {tab === 'corpo' && (
      <div className="section-group">
        <div className="section-group__label">Peso e fotos de progresso</div>
        <div className="dash-card">
          <div className="dash-card__title">Evolução do peso</div>
          <div className="line-chart-wrap">
            {loadingPR ? <Skeleton height={130} /> : (
              <LineChart
                points={weightPoints}
                valueSuffix="kg"
                singleMsg={v => `1 registro: ${v}kg — registre seu peso novamente em outro dia para ver a evolução`}
                emptyMsg="Nenhum peso registrado ainda. Registre em Perfil para começar."
              />
            )}
          </div>
        </div>
        <div className="dash-card">
          <div className="dash-card__title">Fotos de progresso</div>
          <ProgressPhotos />
        </div>
      </div>
      )}
    </section>
  );
}
