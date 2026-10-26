import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../context/useAuth';
import { useToast } from '../context/useToast';
import { todayDate } from '../data/treinoData';
import {
  PROGRESSIONS, MAX_BODYWEIGHT_GOALS, readBodyweightGoals, newBodyweightGoal,
  fetchBodyweightSets, goalProgress, goalUnit,
} from '../lib/bodyweight';
import { trackFeature } from '../lib/tracking';

import { t, tEx } from '../lib/i18n';
const withUnit = (v, unit) => (unit === 's' ? `${v}s` : t('{n} reps', { n: v }));
const DEFAULT_TARGET = { reps: 10, s: 30 };

function GoalCard({ goal, userId, onRemove, onAchieved }) {
  const [progress, setProgress] = useState(null);
  const notified = useRef(false);
  const unit = goalUnit(goal.exercise);

  useEffect(() => {
    let cancelled = false;
    fetchBodyweightSets(userId, goal.exercise)
      .then(sets => { if (!cancelled) setProgress(goalProgress(goal, sets)); })
      .catch(err => { console.error('BodyweightGoals:', err); if (!cancelled) setProgress(goalProgress(goal, [])); });
    return () => { cancelled = true; };
  }, [userId, goal]);

  useEffect(() => {
    if (progress?.achieved && !goal.achieved && !notified.current) {
      notified.current = true;
      onAchieved(goal);
    }
  }, [progress?.achieved, goal, onAchieved]);

  const done = goal.achieved || progress?.achieved;
  return (
    <div className={`goal-card goal-card--${done ? 'achieved' : 'on_track'}`}>
      <div className="goal-card__head">
        <div>
          <div className="goal-card__title">{tEx(goal.exercise)}</div>
          <div className="goal-card__meta">{t('Meta: {meta}', { meta: withUnit(goal.target, unit) })}</div>
        </div>
        <button type="button" className="goal-card__remove" aria-label={t('Apagar meta')} onClick={() => onRemove(goal)}>✕</button>
      </div>
      {!progress ? <p className="goal-card__text">{t('Carregando…')}</p> : (
        <>
          <div className="goal-card__progress" aria-label={t('{pct}% do caminho', { pct: done ? 100 : progress.pct })}>
            <span style={{ width: `${done ? 100 : progress.pct}%` }} />
          </div>
          <p className="goal-card__text">
            {done
              ? t('🏆 Meta batida! Seu recorde é {v}.', { v: withUnit(Math.max(progress.current, goal.target), unit) })
              : t('Seu recorde: {v}. Faltam {falta}.', { v: withUnit(progress.current, unit), falta: withUnit(goal.target - progress.current, unit) })}
          </p>
        </>
      )}
    </div>
  );
}

// Metas de calistenia ("10 flexões", "30 s de prancha") na aba Recordes: o
// progresso vem do melhor de repetições ou de tempo já registrado, sem prazo.
// Ficam no user_metadata (bodyweightGoals), como as metas de carga.
export default function BodyweightGoals() {
  const { user, updateProfile } = useAuth();
  const toast = useToast();
  const goals = readBodyweightGoals(user);
  const [adding, setAdding] = useState(false);
  const [exercise, setExercise] = useState('');
  const [target, setTarget] = useState('');
  const [saving, setSaving] = useState(false);
  const active = goals.filter(g => !g.achieved);

  async function save(next) {
    setSaving(true);
    const { error } = await updateProfile({ bodyweightGoals: next });
    setSaving(false);
    if (error) toast(t('⚠️ Não deu para salvar a meta. Tente de novo.'));
    return !error;
  }

  function choose(name) {
    setExercise(name);
    setTarget(name ? String(DEFAULT_TARGET[goalUnit(name)]) : '');
  }

  async function handleAdd(e) {
    e.preventDefault();
    const value = parseInt(target, 10);
    if (!exercise || !(value > 0)) {
      toast(t('Escolha o exercício e a meta'));
      return;
    }
    const kept = [...goals.filter(g => g.achieved).slice(-5), ...active];
    if (await save([...kept, newBodyweightGoal(exercise, value, todayDate())])) {
      trackFeature('bodyweight_goals');
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
    const ok = await save(readBodyweightGoals(user).map(g => (g.id === goal.id ? { ...g, achieved: todayDate() } : g)));
    if (ok) toast(t('🏆 Meta batida em {nome}!', { nome: tEx(goal.exercise) }));
  };
  const onAchieved = useMemo(() => goal => handleAchieved.current(goal), []);

  const unit = exercise ? goalUnit(exercise) : 'reps';

  return (
    <div className="section-group">
      <div className="section-group__label">{t('Metas de calistenia')}</div>
      <div className="dash-card">
        {goals.length === 0 && !adding && (
          <p className="dash-card__subtitle">
            {t('Defina uma marca — ex.: 10 flexões ou 30 s de prancha. O app acompanha pelo seu melhor registro.')}
          </p>
        )}
        <div className="goal-list">
          {goals.map(g => (
            <GoalCard key={g.id} goal={g} userId={user.id} onRemove={handleRemove} onAchieved={onAchieved} />
          ))}
        </div>
        {adding ? (
          <form className="goal-form" onSubmit={handleAdd}>
            <select className="input input--sm" value={exercise} onChange={e => choose(e.target.value)} aria-label={t('Exercício')}>
              <option value="">{t('Escolha o exercício')}</option>
              {PROGRESSIONS.map(chain => (
                <optgroup key={chain.id} label={chain.label}>
                  {chain.steps.filter(n => !active.some(g => g.exercise === n)).map(n => <option key={n} value={n}>{tEx(n)}</option>)}
                </optgroup>
              ))}
            </select>
            <div className="goal-form__row">
              <label className="goal-form__field">
                <span>{unit === 's' ? t('Tempo (segundos)') : t('Repetições seguidas')}</span>
                <input className="input input--sm" type="text" inputMode="numeric" value={target} onChange={e => setTarget(e.target.value)} />
              </label>
            </div>
            <div className="goal-form__actions">
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => setAdding(false)}>{t('Cancelar')}</button>
              <button type="submit" className="btn btn--primary btn--sm" disabled={saving}>{saving ? t('Salvando…') : t('Criar meta')}</button>
            </div>
          </form>
        ) : (
          active.length < MAX_BODYWEIGHT_GOALS && (
            <button type="button" className="btn btn--outline btn--sm btn--full" onClick={() => setAdding(true)}>{t('+ Nova meta de calistenia')}</button>
          )
        )}
      </div>
    </div>
  );
}
