import { useEffect, useId, useMemo, useState } from 'react';
import { fetchLibrary } from '../lib/exerciseSwap';
import { WEEK_DAYS, MAX_EXERCISES, emptyExercise, toggleDay, moveItem } from '../lib/trainerPlan';
import ExerciseExtras from './ExerciseExtras';

import { t } from '../lib/i18n';
// Montagem dos dias de um rascunho de plano ({ days: [{ dia, foco, exercicios }] },
// ver lib/trainerPlan.js): usada pelo personal (trainer/PlanBuilder) e pelo
// influenciador (InfluencerProgramEditor). DayChips escolhe os dias;
// PlanDaysEditor edita foco e exercícios de cada um, com sugestão da biblioteca.

export function DayChips({ draft, setDraft }) {
  return (
    <>
      <span className="profile-field__label">{t('Dias de treino')}</span>
      <div className="measure-chips" role="group" aria-label={t('Dias de treino')}>
        {WEEK_DAYS.map(dia => (
          <button key={dia} type="button" aria-pressed={draft.days.some(d => d.dia === dia)}
            className={draft.days.some(d => d.dia === dia) ? 'recap__btn recap__btn--active' : 'recap__btn'}
            onClick={() => setDraft(d => toggleDay(d, dia))}>{dia.slice(0, 3)}</button>
        ))}
      </div>
    </>
  );
}

export default function PlanDaysEditor({ draft, setDraft }) {
  const listId = useId();
  const [library, setLibrary] = useState([]);

  useEffect(() => {
    let active = true;
    fetchLibrary().then(rows => { if (active) setLibrary(rows.filter(r => !r.is_post_workout)); }).catch(() => {});
    return () => { active = false; };
  }, []);

  const byName = useMemo(() => new Map(library.map(r => [r.nome.toLowerCase(), r])), [library]);

  const setDay = (idx, fn) => setDraft(d => ({ ...d, days: d.days.map((day, i) => (i === idx ? fn(day) : day)) }));
  const setEx = (di, ei, patch) => setDay(di, day => ({
    ...day, exercicios: day.exercicios.map((e, i) => (i === ei ? { ...e, ...patch } : e)),
  }));

  // Ao escolher um exercício da biblioteca, preenche séries/reps/descanso/técnica sugeridos.
  function handleName(di, ei, nome) {
    const lib = byName.get(nome.trim().toLowerCase());
    setEx(di, ei, lib
      ? { nome, series: lib.series || '3', reps: lib.reps || '10-12', descanso: lib.descanso || '60s', tecnica: lib.tecnica || '' }
      : { nome });
  }

  return (
    <>
      <datalist id={listId}>
        {library.map(r => <option key={r.nome} value={r.nome} />)}
      </datalist>

      {draft.days.map((day, di) => (
        <div className="dash-card" key={day.dia}>
          <div className="dash-card__title">{day.dia}</div>
          <input className="input input--sm" placeholder={t('Foco do dia (ex.: Peito / Ombro / Tríceps)')} value={day.foco}
            onChange={e => setDay(di, d => ({ ...d, foco: e.target.value }))} />

          {day.exercicios.map((ex, ei) => (
            <div className="plan-ex-row" key={ei}>
              <div className="plan-ex-row__move">
                <button type="button" disabled={ei === 0} aria-label={t('Subir')}
                  onClick={() => setDay(di, d => ({ ...d, exercicios: moveItem(d.exercicios, ei, -1) }))}>▲</button>
                <button type="button" disabled={ei === day.exercicios.length - 1} aria-label={t('Descer')}
                  onClick={() => setDay(di, d => ({ ...d, exercicios: moveItem(d.exercicios, ei, 1) }))}>▼</button>
              </div>
              <div className="plan-ex-row__fields">
                <input className="input input--sm plan-ex-row__name" list={listId} placeholder={t('Exercício')} value={ex.nome}
                  onChange={e => handleName(di, ei, e.target.value)} />
                <div className="plan-ex-row__nums">
                  <input className="input input--sm" placeholder={t('Séries')} value={ex.series} onChange={e => setEx(di, ei, { series: e.target.value })} />
                  <input className="input input--sm" placeholder="Reps" value={ex.reps} onChange={e => setEx(di, ei, { reps: e.target.value })} />
                  <input className="input input--sm" placeholder={t('Descanso')} value={ex.descanso} onChange={e => setEx(di, ei, { descanso: e.target.value })} />
                </div>
                <input className="input input--sm" placeholder={t('Técnica / observação (opcional)')} value={ex.tecnica}
                  onChange={e => setEx(di, ei, { tecnica: e.target.value })} />
                <ExerciseExtras grupo={ex.grupo} aquecimento={ex.aquecimento} onChange={patch => setEx(di, ei, patch)} />
              </div>
              <button type="button" className="plan-row__del" aria-label={t('Remover exercício')}
                onClick={() => setDay(di, d => ({ ...d, exercicios: d.exercicios.filter((_, i) => i !== ei) }))}>✕</button>
            </div>
          ))}

          <button type="button" className="btn btn--outline btn--sm" disabled={day.exercicios.length >= MAX_EXERCISES}
            onClick={() => setDay(di, d => ({ ...d, exercicios: [...d.exercicios, emptyExercise()] }))}>{t('+ Exercício')}</button>
        </div>
      ))}
    </>
  );
}
