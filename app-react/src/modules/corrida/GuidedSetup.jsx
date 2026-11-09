import { useState } from 'react';
import { useToast } from '../../context/useToast';
import { formatPace } from './runs';
import { parsePace, normalizeWorkout, describeWorkout, needsGps, PRESETS, presetLabel, isPreset } from './workout';
import { t } from '../../lib/i18n';

const KEY = 'eafit_run_guided';

function readSaved() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY));
    return v && typeof v === 'object' ? v : null;
  } catch {
    return null;
  }
}

function initialForm() {
  const saved = readSaved();
  const w = normalizeWorkout(saved?.workout);
  return {
    mode: saved?.mode === 'pace' ? 'pace' : 'intervals',
    pace: saved?.pace ? formatPace(saved.pace) : '',
    reps: String(w.reps),
    workValue: String(w.work.value), workUnit: w.work.unit,
    restValue: String(w.rest.value), restUnit: w.rest.unit,
    warmupMin: String(w.warmupMin), cooldownMin: String(w.cooldownMin),
    workPace: w.targetPace ? formatPace(w.targetPace) : '',
  };
}

// Treino guiado montado pela pessoa: só um ritmo alvo, ou um intervalado com
// tiros, trote, aquecimento e desaquecimento. Lembra a última escolha.
// onStart(session) começa a corrida com a sessão pronta.
export default function GuidedSetup({ gps, onStart, onCancel }) {
  const toast = useToast();
  const [f, setF] = useState(initialForm);
  const set = (key, value) => setF(prev => ({ ...prev, [key]: value }));
  const digits = (key, max = 5) => e => set(key, e.target.value.replace(/\D/g, '').slice(0, max));

  const workPace = f.workPace.trim() ? parsePace(f.workPace) : null;
  const workout = normalizeWorkout({
    reps: f.reps, warmupMin: f.warmupMin, cooldownMin: f.cooldownMin,
    work: { unit: f.workUnit, value: f.workValue }, rest: { unit: f.restUnit, value: f.restValue },
    targetPace: workPace,
  });

  function handleStart(e) {
    e.preventDefault();
    let session;
    if (f.mode === 'pace') {
      const pace = parsePace(f.pace);
      if (!pace) return toast(t('⚠️ Digite o ritmo como 5:30 (minutos:segundos por km)'));
      session = { type: 'livre', targetPace: pace };
      try { localStorage.setItem(KEY, JSON.stringify({ ...readSaved(), mode: 'pace', pace })); } catch { /* sem storage */ }
    } else {
      if (f.workPace.trim() && !workPace) return toast(t('⚠️ Digite o ritmo como 5:30 (minutos:segundos por km)'));
      session = { type: 'intervalado', custom: workout };
      try { localStorage.setItem(KEY, JSON.stringify({ ...readSaved(), mode: 'intervals', workout })); } catch { /* sem storage */ }
    }
    onStart(session);
  }

  function applyPreset(p) {
    setF(prev => ({
      ...prev, reps: String(p.reps),
      workValue: String(p.work.value), workUnit: p.work.unit,
      restValue: String(p.rest.value), restUnit: p.rest.unit,
    }));
  }

  const unitChips = (key, label) => (
    <div className="run-chips run-chips--sm" role="group" aria-label={label}>
      {[['m', t('metros')], ['s', t('segundos')]].map(([u, text]) => (
        <button key={u} type="button" aria-pressed={f[key] === u} className={`run-chip${f[key] === u ? ' run-chip--on' : ''}`} onClick={() => set(key, u)}>{text}</button>
      ))}
    </div>
  );

  return (
    <form className="dash-card run-setup" onSubmit={handleStart} aria-label={t('Treino guiado')}>
      <h2 className="run-setup__title">{t('Treino guiado')}</h2>
      <div className="run-chips" role="group" aria-label={t('Tipo de treino')}>
        {[['intervals', t('Intervalado')], ['pace', t('Ritmo alvo')]].map(([m, label]) => (
          <button key={m} type="button" aria-pressed={f.mode === m} className={`run-chip${f.mode === m ? ' run-chip--on' : ''}`} onClick={() => set('mode', m)}>{label}</button>
        ))}
      </div>

      {f.mode === 'pace' ? (
        <div className="profile-field">
          <label className="profile-field__label" htmlFor="guidedPace">{t('Ritmo alvo (min/km)')}</label>
          <input id="guidedPace" className="input" inputMode="decimal" placeholder="5:30" value={f.pace} onChange={e => set('pace', e.target.value.slice(0, 5))} />
          <span className="profile-field__hint">{t('A voz avisa quando você passar 15 s/km para mais ou para menos (precisa do GPS).')}</span>
        </div>
      ) : (
        <>
          <div className="run-chips run-chips--sm" role="group" aria-label={t('Treinos prontos')}>
            {PRESETS.map(p => {
              const on = isPreset(p, workout);
              return (
                <button key={p.id} type="button" aria-pressed={on} className={`run-chip${on ? ' run-chip--on' : ''}`} onClick={() => applyPreset(p)}>{presetLabel(p)}</button>
              );
            })}
          </div>
          <div className="run-manual__row">
            <div className="profile-field">
              <label className="profile-field__label" htmlFor="guidedReps">{t('Repetições')}</label>
              <input id="guidedReps" className="input" inputMode="numeric" value={f.reps} onChange={digits('reps', 2)} />
            </div>
            <div className="profile-field">
              <label className="profile-field__label" htmlFor="guidedWorkPace">{t('Ritmo dos tiros (opcional)')}</label>
              <input id="guidedWorkPace" className="input" inputMode="decimal" placeholder="4:50" value={f.workPace} onChange={e => set('workPace', e.target.value.slice(0, 5))} />
            </div>
          </div>
          <div className="profile-field">
            <label className="profile-field__label" htmlFor="guidedWork">{t('Tiro (forte)')}</label>
            <div className="run-guided__amount">
              <input id="guidedWork" className="input" inputMode="numeric" value={f.workValue} onChange={digits('workValue')} />
              {unitChips('workUnit', t('Unidade do tiro'))}
            </div>
          </div>
          <div className="profile-field">
            <label className="profile-field__label" htmlFor="guidedRest">{t('Recuperação (trote)')}</label>
            <div className="run-guided__amount">
              <input id="guidedRest" className="input" inputMode="numeric" value={f.restValue} onChange={digits('restValue')} />
              {unitChips('restUnit', t('Unidade da recuperação'))}
            </div>
          </div>
          <div className="run-manual__row">
            <div className="profile-field">
              <label className="profile-field__label" htmlFor="guidedWarm">{t('Aquecimento (min)')}</label>
              <input id="guidedWarm" className="input" inputMode="numeric" value={f.warmupMin} onChange={digits('warmupMin', 2)} />
            </div>
            <div className="profile-field">
              <label className="profile-field__label" htmlFor="guidedCool">{t('Desaquecimento (min)')}</label>
              <input id="guidedCool" className="input" inputMode="numeric" value={f.cooldownMin} onChange={digits('cooldownMin', 2)} />
            </div>
          </div>
          <p className="run-guided__summary">{describeWorkout(workout)}</p>
          {!gps && needsGps(workout) && (
            <p className="profile-field__hint">{t('Sem GPS, as etapas em metros viram tempo aproximado.')}</p>
          )}
        </>
      )}

      <div className="run-setup__actions">
        <button type="button" className="btn btn--ghost" onClick={onCancel}>{t('Cancelar')}</button>
        <button type="submit" className="btn btn--primary">{t('▶ Começar treino')}</button>
      </div>
    </form>
  );
}
