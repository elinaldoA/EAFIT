import { useEffect, useRef, useState } from 'react';
import { todayName } from '../data/treinoData';
import { useAuth } from '../context/useAuth';
import { useWorkout } from '../context/useWorkout';
import { useToast } from '../context/useToast';
import { useAppConfig } from '../context/useAppConfig';
import { isFlagOn } from '../lib/appConfig';
import { getDateForWeekday, fmtDate, daysUntil } from '../lib/utils';
import { db } from '../lib/supabase';
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
import DailyCheckin from '../components/DailyCheckin';
import PersonalMessages from '../components/PersonalMessages';
import MyAppointments from '../components/MyAppointments';
import { syncCoachPrefs } from '../lib/coach';
import QuickWorkoutModal from '../components/QuickWorkoutModal';
import ImportWorkoutsModal from '../components/ImportWorkoutsModal';
import MobilityButton from '../components/MobilityButton';
import { estimateMinutes, fitDayToTime, readQuickChoice, saveQuickChoice } from '../lib/quickWorkout';
import { trackFeature } from '../lib/tracking';

import { t, tFoco } from '../lib/i18n';
export default function TreinoPage() {
  const { user } = useAuth();
  const { config } = useAppConfig();
  const { dataVersion, syncStatus, syncNow, activePlanDays, planExpired, planByTrainer, planStartDate, planEndDate, saveWorkoutRating, refreshPlan } = useWorkout();
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

  // Fechou o resumo do treino: bom momento pra pedir a avaliação do app.
  function handleSummaryClose() {
    setSummary(null);
    if (noteWorkoutFinished() && isFlagOn(config.flags, 'avaliar_app')) setAskAppRating(true);
  }

  // Traz as preferências do treinador por voz da conta para este aparelho.
  useEffect(() => { syncCoachPrefs(user); }, [user]);

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
  const today = quickMinutes ? fitDayToTime(fullToday, quickMinutes).day : fullToday;
  const planDays = activePlanDays.map(d => (d === fullToday ? today : d));
  const todaySets = today ? countSets(gatherExerciseDetails(today)) : { done: 0, total: 0 };
  const todayDone = today && localStorage.getItem(`treino_${today.dia}`) === 'true';

  async function handleReset() {
    if (!window.confirm(t('Limpar todos os checks e cargas salvas?'))) return;
    Object.keys(localStorage).forEach(k => {
      if (['treino_', 'carga_', 'set_', 'warm_', 'hr_'].some(p => k.startsWith(p))) localStorage.removeItem(k);
    });
    bump();
    if (user) {
      try {
        const dates = activePlanDays.map(d => getDateForWeekday(d.dia));
        const { error } = await db.from('workouts').delete().eq('user_id', user.id).in('workout_date', dates);
        if (error) throw error;
        await syncNow();
        toast(t('🧹 Checks e cargas limpos'));
      } catch (err) {
        console.error('resetWorkouts:', err);
        toast(t('⚠️ Limpou localmente, mas falhou ao sincronizar com o servidor — pode voltar ao reabrir o app'));
      }
    }
  }

  return (
    <section id="page-treino" className="page active">
      <PauseBanner />
      <PersonalMessages />
      <MyAppointments onlyPending />
      {isFlagOn(config.flags, 'checkin_diario') && <DailyCheckin />}
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
          onQuick={quickOn ? () => setShowQuick(true) : null}
          mobility={isFlagOn(config.flags, 'mobilidade')}
        />
      )}
      <div className="progress-card">
        <div className="progress-card__row">
          <span className="progress-card__label">{t('Semana atual')}</span>
          <span className="progress-card__count">{t('{done}/{total} treinos', { done, total })}</span>
        </div>
        <div className="week-strip">
          {workDays.map(d => {
            const isDone = localStorage.getItem(`treino_${d.dia}`) === 'true';
            const isToday = d.dia === todayName();
            return (
              <div
                key={d.dia}
                className={`week-strip__day${isDone ? ' week-strip__day--done' : ''}${isToday ? ' week-strip__day--today' : ''}`}
                title={`${t(d.dia)} — ${tFoco(d.foco)}${isDone ? t('(concluído)') : ''}`}
              >
                <span className="week-strip__dot" aria-hidden="true">{isDone ? '✓' : ''}</span>
                <span className="week-strip__label">{t(d.dia).slice(0, 3)}</span>
              </div>
            );
          })}
        </div>
        {planEndDate && !planExpired && (
          <p className="progress-card__cycle">
            {t('📅 Treino válido de {v1} até {v2} ({v3}d restantes){v4}', { v1: planStartDate ? fmtDate(planStartDate) : '—', v2: fmtDate(planEndDate), v3: Math.max(0, daysUntil(planEndDate)), v4: planByTrainer ? '' : ' · atualizado automaticamente ao vencer' })}
          </p>
        )}
      </div>
      <div className="toolbar">
        <p className="toolbar__hint">
          {loading ? t('Carregando dados salvos…') : t('Marque os treinos · salva automático')}
        </p>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn--ghost btn--sm" onClick={() => setShowPlanEditor(true)}>{t('⚙️ Editar treino')}</button>
          <button className="btn btn--ghost btn--sm" onClick={handleReset} disabled={loading}>{t('Limpar')}</button>
        </div>
      </div>
      <div id="treinoContainer">
        <div className={`accordion${loading ? ' accordion--loading' : ''}`} key={dataVersion}>
          {planDays.map(day => (
            <DayCard
              key={day.dia} day={day} isToday={day.dia === todayName()} bump={bump}
              onRestStart={handleRestStart} onFinish={setSummary}
              liveOpen={liveDay === day.dia}
              onOpenLive={() => setLiveDay(day.dia)}
              onCloseLive={() => setLiveDay(null)}
            />
          ))}
        </div>
      </div>
      <button type="button" className="btn btn--ghost btn--full" onClick={() => setShowImport(true)}>
        {t('📥 Importar treinos de outro app')}
      </button>
      <footer className="footer">
        <strong>{t('Progressão:')}</strong> {t('aumente cargas toda semana ·')}; <strong>{t('Deload')}</strong> {t('na semana 6')}
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

function TodayCard({ day, sets, done, onStart, quickMinutes, onQuick, mobility }) {
  const hasSets = sets.total > 0;
  const pct = hasSets ? (sets.done / sets.total) * 100 : 0;
  let cta = t('⚡ Começar treino');
  if (done) cta = t('💪 Revisar treino');
  else if (sets.done > 0) cta = t('⚡ Continuar treino');

  return (
    <div className={`today-card${done ? ' today-card--done' : ''}`}>
      <div className="today-card__top">
        <div>
          <span className="today-card__kicker">{done ? t('Treino de hoje concluído') : t('Treino de hoje')}</span>
          <h2 className="today-card__title">{tFoco(day.foco)}</h2>
          <span className="today-card__meta">
            {t('{dia} · {length} exercícios {v1}', { dia: t(day.dia), length: day.exercicios.length, v1: hasSets && ` · ${sets.done}/${sets.total} séries` })}
            {hasSets && !done && ` · ${t('~{m} min', { m: estimateMinutes(day) })}`}
          </span>
          {quickMinutes && <span className="today-card__quick">{t('⏱ Versão de {m} min', { m: quickMinutes })}</span>}
        </div>
        {hasSets && (
          <div className="today-card__ring" style={{ '--pct': pct }} aria-label={t('{v1}% das séries', { v1: Math.round(pct) })}>
            <span>{Math.round(pct)}%</span>
          </div>
        )}
      </div>
      {hasSets ? (
        <button type="button" className="btn btn--primary btn--full" onClick={onStart}>{cta}</button>
      ) : (
        <p className="today-card__rest">{t('Dia de recuperação — descanse bem ou faça um cardio leve. 🧘')}</p>
      )}
      {hasSets && !done && onQuick && (
        <button type="button" className="today-card__link" onClick={onQuick}>
          {quickMinutes ? t('Mudar o tempo ou voltar ao treino completo') : t('⏱ Pouco tempo hoje? Enxugar o treino')}
        </button>
      )}
      {!hasSets && mobility && <MobilityButton kind="rest" minutes={8} className="btn btn--outline btn--full" />}
    </div>
  );
}
