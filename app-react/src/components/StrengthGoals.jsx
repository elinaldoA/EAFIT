import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../context/useAuth';
import { useToast } from '../context/useToast';
import { todayDate } from '../data/treinoData';
import { fetchExerciseSetsWithDates, estimateOneRepMax } from '../lib/records';
import { addDays } from '../lib/pause';
import { fmtDate, parseLocalDate } from '../lib/utils';
import { trackFeature } from '../lib/tracking';
import {
  MAX_GOALS, readGoals, newGoal, suggestTarget, sessionBests, projectGoal,
} from '../lib/strengthGoals';

import { t, tEx, locale } from '../lib/i18n';

const kg = v => (Math.round(v * 10) / 10).toLocaleString(locale);
const DEFAULT_WEEKS = 12;

// Gráfico da meta: 1RM estimado por sessão (linha cheia), a projeção no ritmo
// atual até o prazo (tracejada) e o alvo (linha horizontal).
function GoalChart({ goal, sessions, projection }) {
  const W = 300, H = 120, pX = 12, pY = 14, pB = 20;
  const shown = sessions.slice(-12);
  if (!shown.length) return null;
  const start = shown[0].date < goal.created ? shown[0].date : goal.created;
  const end = goal.by;
  const span = Math.max(1, (parseLocalDate(end) - parseLocalDate(start)) / 86400000);
  const x = d => pX + (((parseLocalDate(d) - parseLocalDate(start)) / 86400000) / span) * (W - pX * 2);
  const last = shown[shown.length - 1];
  const daysToEnd = (parseLocalDate(end) - parseLocalDate(last.date)) / 86400000;
  const projEnd = projection.perWeek > 0 && projection.current < goal.target && daysToEnd > 0
    ? projection.current + (projection.perWeek / 7) * daysToEnd
    : null;
  const values = [...shown.map(s => s.e1rm), goal.target, ...(projEnd ? [projEnd] : [])];
  const minV = Math.min(...values) * 0.95;
  const maxV = Math.max(...values) * 1.03;
  const y = v => pY + (H - pY - pB) - ((v - minV) / (maxV - minV || 1)) * (H - pY - pB);
  const line = shown.map(s => `${x(s.date).toFixed(1)},${y(s.e1rm).toFixed(1)}`).join(' ');

  return (
    <svg className="goal-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t('Evolução do 1RM estimado até o prazo da meta')}>
      <line x1={pX} x2={W - pX} y1={y(goal.target)} y2={y(goal.target)} className="goal-chart__target" />
      <text x={W - pX} y={y(goal.target) - 4} textAnchor="end" className="goal-chart__label">{t('meta {v} kg', { v: kg(goal.target) })}</text>
      {projEnd && (
        <line x1={x(last.date)} y1={y(projection.current)} x2={x(end)} y2={y(projEnd)} className="goal-chart__proj" />
      )}
      <polyline points={line} className="goal-chart__line" />
      {shown.map(s => <circle key={s.date} cx={x(s.date)} cy={y(s.e1rm)} r="3" className="goal-chart__dot" />)}
      <text x={pX} y={H - 5} className="goal-chart__label">{fmtDate(start)}</text>
      <text x={W - pX} y={H - 5} textAnchor="end" className="goal-chart__label">{fmtDate(end)}</text>
    </svg>
  );
}

function statusText(p, goal) {
  switch (p.status) {
    case 'achieved': return t('🏆 Meta batida! Você levantou {v} kg.', { v: kg(Math.max(p.best, goal.target)) });
    case 'expired': return t('O prazo passou. Seu máximo estimado chegou a {v} kg — que tal uma nova meta?', { v: kg(p.current) });
    case 'no_data': return t('Treine este exercício mais algumas vezes para o app calcular o seu ritmo.');
    case 'stalled': return t('A carga não subiu nas últimas semanas. Para chegar no prazo, precisa de +{need} kg por semana.', { need: kg(p.needPerWeek ?? 0) });
    case 'on_track':
      return p.current >= goal.target
        ? t('Seu máximo estimado já passa da meta — hora de testar a carga!')
        : t('✅ No ritmo: +{pace} kg por semana, chega lá por volta de {data}.', { pace: kg(p.perWeek), data: fmtDate(p.eta) });
    default:
      return t('⚠️ No ritmo atual (+{pace} kg/semana) chega em {data}. Para o prazo, precisa de +{need} kg por semana.', { pace: kg(p.perWeek), data: fmtDate(p.eta), need: kg(p.needPerWeek ?? 0) });
  }
}

function GoalCard({ goal, userId, onRemove, onAchieved }) {
  const [sessions, setSessions] = useState(null);
  const notified = useRef(false);

  useEffect(() => {
    let cancelled = false;
    fetchExerciseSetsWithDates(userId, goal.exercise)
      .then(sets => { if (!cancelled) setSessions(sessionBests(sets)); })
      .catch(err => { console.error('GoalCard:', err); if (!cancelled) setSessions([]); });
    return () => { cancelled = true; };
  }, [userId, goal.exercise]);

  const projection = sessions ? projectGoal(goal, sessions) : null;

  useEffect(() => {
    if (projection?.status === 'achieved' && !goal.achieved && !notified.current) {
      notified.current = true;
      onAchieved(goal);
    }
  }, [projection?.status, goal, onAchieved]);

  return (
    <div className={`goal-card goal-card--${projection?.status || 'loading'}`}>
      <div className="goal-card__head">
        <div>
          <div className="goal-card__title">{tEx(goal.exercise)}</div>
          <div className="goal-card__meta">{t('{target} kg até {data}', { target: kg(goal.target), data: fmtDate(goal.by) })}</div>
        </div>
        <button type="button" className="goal-card__remove" aria-label={t('Apagar meta')} onClick={() => onRemove(goal)}>✕</button>
      </div>
      {!projection ? <p className="goal-card__text">{t('Carregando…')}</p> : (
        <>
          <div className="goal-card__progress" aria-label={t('{pct}% do caminho', { pct: projection.pct })}>
            <span style={{ width: `${projection.pct}%` }} />
          </div>
          {sessions.length > 0 && (
            <div className="goal-card__numbers">
              <span>{t('Máximo estimado: {v} kg', { v: kg(projection.current) })}</span>
              <span>{t('Maior carga: {v} kg', { v: kg(projection.best) })}</span>
            </div>
          )}
          <GoalChart goal={goal} sessions={sessions} projection={projection} />
          <p className="goal-card__text">{statusText(projection, goal)}</p>
        </>
      )}
    </div>
  );
}

// Metas de carga (ver lib/strengthGoals.js) na aba Recordes da Evolução.
// exercises: nomes com carga registrada; allTimeLogs: para sugerir o alvo.
export default function StrengthGoals({ exercises, allTimeLogs }) {
  const { user, updateProfile } = useAuth();
  const toast = useToast();
  const goals = readGoals(user);
  const [adding, setAdding] = useState(false);
  const [exercise, setExercise] = useState('');
  const [target, setTarget] = useState('');
  const [by, setBy] = useState(() => addDays(todayDate(), DEFAULT_WEEKS * 7));
  const [saving, setSaving] = useState(false);

  const bestByExercise = useMemo(() => {
    const out = {};
    (allTimeLogs || []).forEach(l => {
      const e = estimateOneRepMax(l.carga, l.reps);
      if (e !== null && e > (out[l.exercise_name] || 0)) out[l.exercise_name] = e;
    });
    return out;
  }, [allTimeLogs]);

  const available = exercises.filter(e => !goals.some(g => g.exercise === e && !g.achieved));

  async function save(next) {
    setSaving(true);
    const { error } = await updateProfile({ strengthGoals: next });
    setSaving(false);
    if (error) toast(t('⚠️ Não deu para salvar a meta. Tente de novo.'));
    return !error;
  }

  function chooseExercise(name) {
    setExercise(name);
    setTarget(String(suggestTarget(bestByExercise[name]) || ''));
  }

  async function handleAdd(e) {
    e.preventDefault();
    const value = parseFloat(String(target).replace(',', '.'));
    if (!exercise || !(value > 0) || !by || by <= todayDate()) {
      toast(t('Escolha o exercício, a carga e uma data futura'));
      return;
    }
    // Metas batidas ficam como histórico, só as 5 mais recentes.
    const kept = [...goals.filter(g => g.achieved).slice(-5), ...goals.filter(g => !g.achieved)];
    const ok = await save([...kept, newGoal(exercise, value, by)]);
    if (ok) {
      trackFeature('strength_goals');
      toast(t('🎯 Meta criada'));
      setAdding(false);
      setExercise('');
      setTarget('');
    }
  }

  async function handleRemove(goal) {
    if (!window.confirm(t('Apagar a meta de {nome}?', { nome: tEx(goal.exercise) }))) return;
    await save(goals.filter(g => g.id !== goal.id));
  }

  const handleAchieved = useRef(null);
  handleAchieved.current = async goal => {
    const ok = await save(readGoals(user).map(g => (g.id === goal.id ? { ...g, achieved: todayDate() } : g)));
    if (ok) toast(t('🏆 Meta batida em {nome}!', { nome: tEx(goal.exercise) }));
  };
  const onAchieved = useMemo(() => goal => handleAchieved.current(goal), []);

  const activeCount = goals.filter(g => !g.achieved).length;

  return (
    <div className="section-group">
      <div className="section-group__label">{t('Metas de carga')}</div>
      <div className="dash-card">
        {goals.length === 0 && !adding && (
          <p className="dash-card__subtitle">
            {t('Defina uma carga e um prazo — ex.: supino 100 kg até dezembro. O app mostra se você está no ritmo pelo seu histórico.')}
          </p>
        )}
        <div className="goal-list">
          {goals.map(g => (
            <GoalCard key={g.id} goal={g} userId={user.id} onRemove={handleRemove} onAchieved={onAchieved} />
          ))}
        </div>
        {adding ? (
          <form className="goal-form" onSubmit={handleAdd}>
            <select className="input input--sm" value={exercise} onChange={e => chooseExercise(e.target.value)} aria-label={t('Exercício')}>
              <option value="">{t('Escolha o exercício')}</option>
              {available.map(name => <option key={name} value={name}>{tEx(name)}</option>)}
            </select>
            <div className="goal-form__row">
              <label className="goal-form__field">
                <span>{t('Carga (kg)')}</span>
                <input className="input input--sm" type="text" inputMode="decimal" value={target} onChange={e => setTarget(e.target.value)} />
              </label>
              <label className="goal-form__field">
                <span>{t('Até')}</span>
                <input className="input input--sm" type="date" min={addDays(todayDate(), 1)} value={by} onChange={e => setBy(e.target.value)} />
              </label>
            </div>
            {exercise && bestByExercise[exercise] > 0 && (
              <p className="goal-form__hint">{t('Seu máximo estimado hoje: {v} kg', { v: kg(bestByExercise[exercise]) })}</p>
            )}
            <div className="goal-form__actions">
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => setAdding(false)}>{t('Cancelar')}</button>
              <button type="submit" className="btn btn--primary btn--sm" disabled={saving}>{saving ? t('Salvando…') : t('Criar meta')}</button>
            </div>
          </form>
        ) : (
          activeCount < MAX_GOALS && (
            available.length > 0 ? (
              <button type="button" className="btn btn--outline btn--sm btn--full" onClick={() => setAdding(true)}>{t('+ Nova meta de carga')}</button>
            ) : (
              <p className="dash-empty">{t('Registre cargas na aba Treino para criar uma meta.')}</p>
            )
          )
        )}
      </div>
    </div>
  );
}
