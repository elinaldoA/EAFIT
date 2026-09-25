import { useRef, useState } from 'react';
import { todayName } from '../data/treinoData';
import { useAuth } from '../context/useAuth';
import { useWorkout } from '../context/useWorkout';
import { useToast } from '../context/useToast';
import { getDateForWeekday, fmtDate, daysUntil } from '../lib/utils';
import { db } from '../lib/supabase';
import { countSets, gatherExerciseDetails } from '../lib/workoutSets';
import RestTimer from '../components/RestTimer';
import PlanEditorModal from '../components/PlanEditorModal';
import WorkoutSummaryModal from '../components/WorkoutSummaryModal';
import DayCard from '../components/WorkoutDayCard';

export default function TreinoPage() {
  const { user } = useAuth();
  const { dataVersion, syncStatus, syncNow, activePlanDays, planExpired, planStartDate, planEndDate, saveWorkoutRating } = useWorkout();
  const toast = useToast();
  const loading = syncStatus === 'loading';
  const [_tick, setTick] = useState(0);
  const bump = () => setTick(t => t + 1);
  const [restSession, setRestSession] = useState(null);
  const restKey = useRef(0);
  const [showPlanEditor, setShowPlanEditor] = useState(false);
  const [summary, setSummary] = useState(null);
  const [liveDay, setLiveDay] = useState(null);

  function handleRestStart(label, seconds) {
    restKey.current += 1;
    setRestSession({ key: restKey.current, label, seconds });
  }

  const workDays = activePlanDays.filter(d => d.dia !== 'Sábado' && d.dia !== 'Domingo');
  const done = workDays.filter(d => localStorage.getItem(`treino_${d.dia}`) === 'true').length;
  const total = workDays.length;
  const today = activePlanDays.find(d => d.dia === todayName());
  const todaySets = today ? countSets(gatherExerciseDetails(today)) : { done: 0, total: 0 };
  const todayDone = today && localStorage.getItem(`treino_${today.dia}`) === 'true';

  async function handleReset() {
    if (!window.confirm('Limpar todos os checks e cargas salvas?')) return;
    Object.keys(localStorage).forEach(k => {
      if (k.startsWith('treino_') || k.startsWith('carga_') || k.startsWith('set_')) localStorage.removeItem(k);
    });
    bump();
    if (user) {
      try {
        const dates = activePlanDays.map(d => getDateForWeekday(d.dia));
        const { error } = await db.from('workouts').delete().eq('user_id', user.id).in('workout_date', dates);
        if (error) throw error;
        await syncNow();
        toast('🧹 Checks e cargas limpos');
      } catch (err) {
        console.error('resetWorkouts:', err);
        toast('⚠️ Limpou localmente, mas falhou ao sincronizar com o servidor — pode voltar ao reabrir o app');
      }
    }
  }

  return (
    <section id="page-treino" className="page active">
      {planExpired && (
        <div className="plan-expired-banner">
          <span>⏳ Seu plano venceu e não tem um próximo configurado — escolha o que treinar agora.</span>
          <button type="button" className="btn btn--primary btn--sm" onClick={() => setShowPlanEditor(true)}>Escolher plano</button>
        </div>
      )}
      {today && !loading && (
        <TodayCard
          day={today} sets={todaySets} done={todayDone}
          onStart={() => setLiveDay(today.dia)}
        />
      )}
      <div className="progress-card">
        <div className="progress-card__row">
          <span className="progress-card__label">Semana atual</span>
          <span className="progress-card__count">{done}/{total} treinos</span>
        </div>
        <div className="week-strip">
          {workDays.map(d => {
            const isDone = localStorage.getItem(`treino_${d.dia}`) === 'true';
            const isToday = d.dia === todayName();
            return (
              <div
                key={d.dia}
                className={`week-strip__day${isDone ? ' week-strip__day--done' : ''}${isToday ? ' week-strip__day--today' : ''}`}
                title={`${d.dia} — ${d.foco}${isDone ? ' (concluído)' : ''}`}
              >
                <span className="week-strip__dot" aria-hidden="true">{isDone ? '✓' : ''}</span>
                <span className="week-strip__label">{d.dia.slice(0, 3)}</span>
              </div>
            );
          })}
        </div>
        {planEndDate && !planExpired && (
          <p className="progress-card__cycle">
            📅 Treino válido de {planStartDate ? fmtDate(planStartDate) : '—'} até {fmtDate(planEndDate)} ({Math.max(0, daysUntil(planEndDate))}d restantes) · atualizado automaticamente ao vencer
          </p>
        )}
      </div>
      <div className="toolbar">
        <p className="toolbar__hint">
          {loading ? 'Carregando dados salvos…' : 'Marque os treinos · salva automático'}
        </p>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn--ghost btn--sm" onClick={() => setShowPlanEditor(true)}>⚙️ Editar treino</button>
          <button className="btn btn--ghost btn--sm" onClick={handleReset} disabled={loading}>Limpar</button>
        </div>
      </div>
      <div id="treinoContainer">
        <div className={`accordion${loading ? ' accordion--loading' : ''}`} key={dataVersion}>
          {activePlanDays.map(day => (
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
      <footer className="footer">
        <strong>Progressão:</strong> aumente cargas toda semana &nbsp;·&nbsp; <strong>Deload</strong> na semana 6
      </footer>
      {restSession && (
        <RestTimer session={restSession} onClose={() => setRestSession(null)} />
      )}
      {showPlanEditor && (
        <PlanEditorModal onClose={() => setShowPlanEditor(false)} />
      )}
      {summary && (
        <WorkoutSummaryModal
          summary={summary}
          onClose={() => setSummary(null)}
          onRate={value => saveWorkoutRating(summary.day.dia, value)}
        />
      )}
    </section>
  );
}

function TodayCard({ day, sets, done, onStart }) {
  const hasSets = sets.total > 0;
  const pct = hasSets ? (sets.done / sets.total) * 100 : 0;
  let cta = '⚡ Começar treino';
  if (done) cta = '💪 Revisar treino';
  else if (sets.done > 0) cta = '⚡ Continuar treino';

  return (
    <div className={`today-card${done ? ' today-card--done' : ''}`}>
      <div className="today-card__top">
        <div>
          <span className="today-card__kicker">{done ? 'Treino de hoje concluído' : 'Treino de hoje'}</span>
          <h2 className="today-card__title">{day.foco}</h2>
          <span className="today-card__meta">
            {day.dia} · {day.exercicios.length} exercícios
            {hasSets && ` · ${sets.done}/${sets.total} séries`}
          </span>
        </div>
        {hasSets && (
          <div className="today-card__ring" style={{ '--pct': pct }} aria-label={`${Math.round(pct)}% das séries`}>
            <span>{Math.round(pct)}%</span>
          </div>
        )}
      </div>
      {hasSets ? (
        <button type="button" className="btn btn--primary btn--full" onClick={onStart}>{cta}</button>
      ) : (
        <p className="today-card__rest">Dia de recuperação — descanse bem ou faça um cardio leve. 🧘</p>
      )}
    </div>
  );
}
