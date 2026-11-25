import { useEffect, useRef, useState } from 'react';
import { todayName, todayDate } from '../data/treinoData';
import { useAuth } from '../context/useAuth';
import { useWorkout } from '../context/useWorkout';
import { useToast } from '../context/useToast';
import { useAppConfig } from '../context/useAppConfig';
import { isFlagOn } from '../lib/appConfig';
import { toDateStr } from '../lib/utils';
import { countSets, gatherExerciseDetails } from '../lib/workoutSets';
import RestTimer from '../components/RestTimer';
import PlanEditorModal from '../components/PlanEditorModal';
import WorkoutSummaryModal from '../components/WorkoutSummaryModal';
import AppRatingModal from '../components/AppRatingModal';
import { noteWorkoutFinished } from '../lib/appRating';
import SurveyPrompt from '../components/SurveyPrompt';
import { fetchPendingSurvey } from '../lib/surveys';
import DayCard from '../components/WorkoutDayCard';
import PauseBanner from '../components/PauseBanner';
import OverflowMenu from '../components/OverflowMenu';
import DailyCheckin from '../components/DailyCheckin';
import FirstSteps from '../components/FirstSteps';
import NamePrompt from '../components/NamePrompt';
import { isNewAccount } from '../lib/firstSteps';
import { pickFirstWorkoutDay } from '../lib/firstWorkout';
import PersonalMessages from '../components/PersonalMessages';
import MyAppointments from '../components/MyAppointments';
import { syncCoachPrefs } from '../lib/coach';
import QuickWorkoutModal from '../components/QuickWorkoutModal';
import ImportWorkoutsModal from '../components/ImportWorkoutsModal';
import TodayCard from '../components/TodayCard';
import WeekProgressCard from '../components/WeekProgressCard';
import { useWorkoutReset } from '../hooks/useWorkoutReset';
import { estimateMinutes, fitDayToTime, readQuickChoice, saveQuickChoice, QUICK_OPTIONS } from '../lib/quickWorkout';
import { trackFeature } from '../lib/tracking';
import { activePause, addDays } from '../lib/pause';
import { fetchLibraryMap, weekMuscleProgress } from '../lib/muscleVolume';
import {
  fetchRecentSets, buildTrainingCoach, sorePlannedMuscles, exerciseReadings, missedDays, weekBehind,
  weekVolume, hardWeekStreak, deloadStatus,
} from '../lib/trainingCoach';
import TrainingCoach from '../components/TrainingCoach';
import { suggestAlternativeDay } from '../lib/muscleRecovery';
import { goTo } from '../lib/appNav';

import { t } from '../lib/i18n';
export default function TreinoPage() {
  const { user } = useAuth();
  const { config } = useAppConfig();
  const { dataVersion, syncStatus, syncNow, periodization, activePlanDays, planExpired, planByTrainer, planStartDate, planEndDate, saveWorkoutRating, refreshPlan } = useWorkout();
  const toast = useToast();
  const loading = syncStatus === 'loading';
  const [_tick, setTick] = useState(0);
  const bump = () => setTick(t => t + 1);
  const [restSession, setRestSession] = useState(null);
  const restKey = useRef(0);
  const [showPlanEditor, setShowPlanEditor] = useState(false);
  const [summary, setSummary] = useState(null);
  const [liveDay, setLiveDay] = useState(null);
  const [askAppRating, setAskAppRating] = useState(false);
  const [survey, setSurvey] = useState(null);
  const [showQuick, setShowQuick] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [checkin, setCheckin] = useState(null);
  const [history, setHistory] = useState(null); // { sets, libMap } das últimas semanas

  // Fechou o resumo do treino: bom momento pra pedir a avaliação do app.
  function handleSummaryClose() {
    setSummary(null);
    if (noteWorkoutFinished() && isFlagOn(config.flags, 'avaliar_app')) setAskAppRating(true);
  }

  // Traz as preferências do treinador por voz da conta para este aparelho.
  useEffect(() => { syncCoachPrefs(user); }, [user]);

  // Histórico recente para o assistente do dia; recarrega quando o treino sincroniza.
  useEffect(() => {
    if (!user?.id) return undefined;
    let active = true;
    Promise.all([fetchRecentSets(user.id), fetchLibraryMap(user.id)])
      .then(([sets, libMap]) => { if (active) setHistory({ sets, libMap }); })
      .catch(err => console.error('fetchRecentSets:', err));
    return () => { active = false; };
  }, [user?.id, dataVersion]);

  // Pesquisa do painel (NPS etc.): uma de cada vez, um pouco depois de abrir.
  useEffect(() => {
    if (!user?.id) return undefined;
    let active = true;
    const timer = setTimeout(() => {
      fetchPendingSurvey().then(s => { if (active && s) setSurvey(s); });
    }, 2500);
    return () => { active = false; clearTimeout(timer); };
  }, [user?.id]);

  function handleQuickChoice(minutes) {
    saveQuickChoice(fullToday.dia, minutes);
    if (minutes) {
      trackFeature('quick_workout');
      toast(t('⏱ Treino de hoje ajustado para {m} min', { m: minutes }));
    } else {
      toast(t('Treino completo de volta'));
    }
    setShowQuick(false);
    bump();
  }

  // RIR anotado depois do ✓: encurta ou alonga o descanso que está rodando.
  function handleRestAdjust(delta) {
    setRestSession(s => (s ? { ...s, adjust: { id: (s.adjust?.id || 0) + 1, delta } } : s));
  }

  function handleRestStart(label, seconds) {
    restKey.current += 1;
    setRestSession({ key: restKey.current, label, seconds });
  }

  const workDays = activePlanDays.filter(d => d.dia !== 'Sábado' && d.dia !== 'Domingo');
  const done = workDays.filter(d => localStorage.getItem(`treino_${d.dia}`) === 'true').length;
  const total = workDays.length;
  // Treino no tempo disponível (lib/quickWorkout.js): só o dia de hoje muda,
  // e só nesta tela — o plano salvo continua o mesmo.
  const quickOn = isFlagOn(config.flags, 'treino_rapido');
  const fullToday = activePlanDays.find(d => d.dia === todayName());
  const quickMinutes = quickOn && fullToday ? readQuickChoice(fullToday.dia) : null;
  // Treino que já cabe no menor tempo não tem o que enxugar: sem o link (ele abria
  // uma janela só para dizer isso). Já enxugado, o link segue para voltar ao completo.
  const canQuick = quickOn && !!fullToday && (!!quickMinutes || QUICK_OPTIONS.some(m => m < estimateMinutes(fullToday)));
  const today = quickMinutes ? fitDayToTime(fullToday, quickMinutes).day : fullToday;
  const planDays = activePlanDays.map(d => (d === fullToday ? today : d));
  const todaySets = today ? countSets(gatherExerciseDetails(today)) : { done: 0, total: 0 };
  const todayDone = today && localStorage.getItem(`treino_${today.dia}`) === 'true';
  const isDayDone = dia => localStorage.getItem(`treino_${dia}`) === 'true';

  const handleReset = useWorkoutReset({ user, activePlanDays, bump, toast, syncNow });

  const todayStr = todayDate();
  const missed = missedDays(activePlanDays, todayStr, isDayDone, user?.created_at ? toDateStr(new Date(user.created_at)) : null);
  const missedSet = new Set(missed.map(d => d.dia));
  const hardWeeks = history ? hardWeekStreak(history.sets, todayStr) : null;
  const deload = deloadStatus({ periodization, hardWeeks });
  const volume = history ? weekVolume(history.sets, todayStr) : null;
  // Só com histórico anterior à semana (mesma regra do assistente): na primeira semana tudo estaria "atrás".
  const muscles = history && history.sets.some(s => s.workout_date < addDays(todayStr, -6))
    ? weekMuscleProgress(planDays, history.sets, todayStr, history.libMap) : [];
  const todayHasSets = todaySets.total > 0;
  // Primeiro treino de quem acabou de chegar: se hoje é descanso no plano, oferece o próximo dia.
  const firstDay = history && history.sets.length === 0 && isNewAccount(user)
    ? pickFirstWorkoutDay(activePlanDays, todayName(), d => countSets(gatherExerciseDetails(d)).total > 0)
    : null;
  const startFirst = firstDay ? () => { trackFeature('first_workout_start'); setLiveDay(firstDay.dia); } : null;
  const sore = history && today && todayHasSets ? sorePlannedMuscles(today, history.sets, todayStr, history.libMap) : [];
  // Dia de hoje trabalha músculo que ainda se recupera: qual outro dia do plano cabe melhor.
  const alternative = history && sore.length && !todayDone
    ? suggestAlternativeDay({ planDays: activePlanDays, todayName: todayName(), sets: history.sets, today: todayStr, libraryMap: history.libMap, isDone: isDayDone })
    : null;
  const coach = history && !planExpired && !activePause(user?.user_metadata || {}, todayStr)
    ? buildTrainingCoach({
        today: today && { hasSets: todayHasSets, done: todayDone, started: todaySets.done > 0, quick: !!quickMinutes },
        checkin,
        sore,
        alternative,
        readings: today && todayHasSets ? exerciseReadings(today, history.sets, todayStr) : null,
        missed,
        behind: weekBehind(activePlanDays, history.sets, todayStr, history.libMap),
        hardWeeks,
        deload,
      })
    : null;
  const coachEl = (
    <TrainingCoach
      coach={coach}
      onQuick={quickOn && fullToday ? () => handleQuickChoice(30) : null}
      onCatchup={dia => { trackFeature('treino_recuperado'); setLiveDay(dia); }}
      onSuggest={dia => { trackFeature('treino_dia_sugerido'); setLiveDay(dia); }}
      onSeeRecovery={() => { trackFeature('recuperacao_do_treino'); goTo({ tab: 'dash', dashTab: 'recuperacao' }); }}
    />
  );

  return (
    <section id="page-treino" className="page active">
      {/* Acima do treino de hoje só o que muda o que treinar hoje (pausa, plano vencido).
          O resto (check-in, recados, primeiros passos) vem depois dele. */}
      <PauseBanner />
      {planByTrainer && !planExpired && <p className="trainer-plan-note">{t('📋 Plano montado pelo seu personal')}</p>}
      {planExpired && (
        <div className="plan-expired-banner">
          <span>{planByTrainer
            ? t('⏳ O ciclo do plano do seu personal terminou — fale com ele para o próximo, ou escolha o que treinar agora.')
            : t('⏳ Seu plano venceu e não tem um próximo configurado — escolha o que treinar agora.')}</span>
          <button type="button" className="btn btn--primary btn--sm" onClick={() => setShowPlanEditor(true)}>{t('Escolher plano')}</button>
        </div>
      )}
      {today && !loading && (
        <TodayCard
          day={today} sets={todaySets} done={todayDone}
          onStart={() => setLiveDay(today.dia)}
          quickMinutes={quickMinutes}
          onQuick={canQuick ? () => setShowQuick(true) : null}
          mobility={isFlagOn(config.flags, 'mobilidade')}
          coach={coachEl}
          firstDay={firstDay && firstDay.dia !== today.dia ? firstDay : null}
          onStartFirst={startFirst}
        />
      )}
      {!today && !loading && coach && <div className="today-card">{coachEl}</div>}
      {isFlagOn(config.flags, 'checkin_diario') && <DailyCheckin onChange={setCheckin} />}
      <PersonalMessages />
      <MyAppointments onlyPending />
      <FirstSteps onStartWorkout={startFirst} />
      <NamePrompt />
      <WeekProgressCard
        workDays={workDays} done={done} total={total} isDayDone={isDayDone} missedSet={missedSet} volume={volume} muscles={muscles}
        planStartDate={planStartDate} planEndDate={planEndDate} planExpired={planExpired} planByTrainer={planByTrainer}
      />
      <div className="toolbar">
        <div className="section-group__label toolbar__title">
          {loading ? t('Carregando dados salvos…') : t('Treinos da semana')}
        </div>
        <div className="toolbar__actions">
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => setShowPlanEditor(true)}>{t('⚙️ Editar treino')}</button>
          {/* Limpar apaga a semana (com desfazer) e Importar é de uso raro: ficam no menu, longe do toque sem querer. */}
          <OverflowMenu
            items={[
              { label: t('Limpar a semana'), onClick: handleReset, disabled: loading },
              { label: t('Importar treinos de outro app'), onClick: () => setShowImport(true) },
            ]}
          />
        </div>
      </div>
      <div id="treinoContainer">
        <div className={`accordion${loading ? ' accordion--loading' : ''}`} key={dataVersion}>
          {planDays.map(day => (
            <DayCard
              key={day.dia} day={day} isToday={day.dia === todayName()} bump={bump}
              onRestStart={handleRestStart} onRestAdjust={handleRestAdjust} onFinish={setSummary}
              liveOpen={liveDay === day.dia}
              onOpenLive={() => setLiveDay(day.dia)}
              onCloseLive={() => setLiveDay(null)}
            />
          ))}
        </div>
      </div>
      <footer className="footer">
        <strong>{t('Progressão:')}</strong> {t('suba a carga quando bater o topo das reps')}
        {deload && (deload.active
          ? <> · <strong>{t('Deload')}</strong> {t('esta semana')}</>
          : <> · <strong>{t('Deload')}</strong> {t('em {n} semana(s)', { n: deload.weeksAway })}</>)}
      </footer>
      {restSession && (
        <RestTimer session={restSession} onClose={() => setRestSession(null)} />
      )}
      {showQuick && fullToday && (
        <QuickWorkoutModal
          day={fullToday} current={quickMinutes}
          onChoose={handleQuickChoice} onClose={() => setShowQuick(false)}
        />
      )}
      {showImport && <ImportWorkoutsModal onImported={refreshPlan} onClose={() => setShowImport(false)} />}
      {showPlanEditor && (
        <PlanEditorModal onClose={() => setShowPlanEditor(false)} />
      )}
      {summary && (
        <WorkoutSummaryModal
          summary={summary}
          onClose={handleSummaryClose}
          onRate={value => saveWorkoutRating(summary.day.dia, value)}
        />
      )}
      {askAppRating && user && (
        <AppRatingModal userId={user.id} onClose={() => setAskAppRating(false)} />
      )}
      {survey && !summary && !askAppRating && !liveDay && (
        <SurveyPrompt survey={survey} onClose={() => setSurvey(null)} />
      )}
    </section>
  );
}
