import { useMemo } from 'react';
import { todayName, todayDate, getMuscleGroupsForDay } from '../data/treinoData';
import { useAuth } from '../context/useAuth';
import { useAppConfig } from '../context/useAppConfig';
import { useWorkout } from '../context/useWorkout';
import { isFlagOn } from '../lib/appConfig';
import { fmtDate } from '../lib/utils';
import BodyAvatar from './BodyAvatar';
import LineChart from './LineChart';
import MonthlyRecap from './MonthlyRecap';
import Challenges from './Challenges';
import LeagueCard from './LeagueCard';
import ArenaCard from './ArenaCard';
import ArenaRanking from './ArenaRanking';
import Skeleton from './Skeleton';
import { Heatmap, WeeklyBars, WeekCompare, LoadHistory } from './DashCharts';
import { DiscomfortPanel } from './DiscomfortWidgets';
import MuscleVolumeCard from './MuscleVolumeCard';
import { t, tEx, tFoco } from '../lib/i18n';

// Aba "Treinos" da Evolução: resumo do mês, desafios, visão anatômica, volume,
// calendário, semanas e a evolução de carga de um exercício. A escolha da
// visão e do exercício fica na página (`selectedView`, `selectedExercise`),
// para não zerar ao trocar de aba e voltar.
export default function DashTreinosTab({
  active, toast, workouts, logs, allTimeLogs, exercises, volumePoints, loading, loadingPR, weeklyGoal,
  selectedView, onViewChange, selectedExercise, onExerciseChange,
}) {
  const { user } = useAuth();
  const { config } = useAppConfig();
  const { activePlanDays } = useWorkout();

  const day = activePlanDays.find(d => d.dia === todayName());
  const todayCompleted = workouts.find(w => w.workout_date === todayDate())?.completed ?? false;

  const { viewActiveGroups, selectedSubtitle } = useMemo(() => {
    if (selectedView === 'today') {
      const activeGroups = day && todayCompleted ? getMuscleGroupsForDay(day) : new Set();
      const subtitle = day
        ? (todayCompleted ? t('Foco: {foco}', { foco: tFoco(day.foco) }) : t('{foco} — treino de hoje ainda não concluído (sem marcações)', { foco: tFoco(day.foco) }))
        : t('Sem treino planejado para hoje');
      return { viewActiveGroups: activeGroups, selectedSubtitle: subtitle };
    }

    if (selectedView.startsWith('workout-')) {
      const wId = selectedView.replace('workout-', '');
      const w = workouts.find(x => String(x.id) === wId);
      if (w) {
        const planDay = activePlanDays.find(d => d.dia === w.day_of_week);
        const activeGroups = w.completed && planDay ? getMuscleGroupsForDay(planDay) : new Set();
        const subtitle = w.completed
          ? t('Treino concluído em {v1} (Foco: {v2})', { v1: fmtDate(w.workout_date), v2: tFoco(planDay?.foco || 'Geral') })
          : t('Treino de {day_of_week} ({v1}) não foi concluído (sem marcações)', { day_of_week: w.day_of_week, v1: fmtDate(w.workout_date) });
        return { viewActiveGroups: activeGroups, selectedSubtitle: subtitle };
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

  return (
    <>
    <MonthlyRecap userId={user.id} allTimeLogs={allTimeLogs} loadingLogs={loadingPR} />
    <ArenaCard sport="gym" />
    <ArenaRanking sport="gym" />
    {isFlagOn(config.flags, 'desafios') && <Challenges />}
    {isFlagOn(config.flags, 'desafios') && <LeagueCard />}
    <div className="dash-card">
      <div className="dash-card__title-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', marginBottom: '8px' }}>
        <div className="dash-card__title mb-0">{t('Visualização Anatômica')}</div>
        <select
          className="input input--sm"
          aria-label={t('Visualização Anatômica')}
          style={{ width: 'auto', minWidth: '180px', maxWidth: '100%', padding: '4px 8px' }}
          value={selectedView}
          onChange={e => onViewChange(e.target.value)}
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

    {isFlagOn(config.flags, 'volume_musculo') && (
      <MuscleVolumeCard userId={user.id} planDays={activePlanDays} active={active} />
    )}

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
        <select className="input input--sm" value={exercise} onChange={e => onExerciseChange(e.target.value)} aria-label={t('Exercício')}>
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
    </>
  );
}
