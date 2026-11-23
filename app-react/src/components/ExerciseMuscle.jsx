import { useEffect, useState } from 'react';
import { MUSCLES, muscleOfName, fetchLibraryMap } from '../lib/muscleVolume';
import { fetchMyMuscles, saveMuscle, muscleKey } from '../lib/exerciseMuscles';
import { MUSCLE_LABELS } from '../data/bodyMuscleMap';

import { t } from '../lib/i18n';
// Exercício que a biblioteca não conhece e cujo nome não diz o músculo: sem
// isso ele não entra no volume semanal. Pergunta uma vez; a resposta fica salva.
export default function ExerciseMuscle({ userId, nome }) {
  // { ask: bool, mine: músculo escolhido pela pessoa | null }
  const [info, setInfo] = useState(null);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!userId || !nome) return undefined;
    let cancelled = false;
    Promise.all([fetchLibraryMap(userId), fetchMyMuscles(userId)])
      .then(([map, mine]) => {
        if (cancelled) return;
        const key = muscleKey(nome);
        const chosen = mine.get(key) || null;
        setInfo({ mine: chosen, ask: !chosen && !map.has(key) && muscleOfName(nome, map) === null });
      })
      .catch(err => console.warn('ExerciseMuscle:', err));
    return () => { cancelled = true; };
  }, [userId, nome]);

  async function choose(muscle) {
    if (!muscle) return;
    try {
      await saveMuscle(userId, nome, muscle);
      setInfo({ mine: muscle, ask: false });
      setEditing(false);
    } catch (err) {
      console.warn('saveMuscle:', err);
    }
  }

  if (!info || (!info.ask && !info.mine)) return null;
  if (info.mine && !editing) {
    return (
      <div className="ex-note">
        <span className="ex-block__rule">{t('💪 Conta como: {musculo}', { musculo: MUSCLE_LABELS[info.mine] })}</span>
        <button type="button" className="ex-note__btn" onClick={() => setEditing(true)}>{t('alterar')}</button>
      </div>
    );
  }
  return (
    <label className="ex-note">
      <span className="ex-block__rule">{t('💪 Qual músculo este exercício trabalha?')}</span>
      <select className="input input--sm" value={info.mine || ''} onChange={e => choose(e.target.value)}>
        <option value="" disabled>{t('Escolher…')}</option>
        {MUSCLES.map(m => <option key={m} value={m}>{MUSCLE_LABELS[m]}</option>)}
      </select>
    </label>
  );
}
