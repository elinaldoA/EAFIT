import { useEffect, useState } from 'react';
import { fetchExerciseNote, saveExerciseNote, readLocalNote, NOTE_MAX } from '../lib/exerciseNotes';

import { t } from '../lib/i18n';
// Nota do exercício ("banco na posição 4", "ombro incomodou"): fica salva e
// reaparece em todo treino seguinte. Com nota, o texto já aparece aberto.
export default function ExerciseNote({ userId, nome, started = true }) {
  const [note, setNote] = useState(() => readLocalNote(userId, nome));
  const [open, setOpen] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!userId || !nome) return undefined;
    let cancelled = false;
    setNote(readLocalNote(userId, nome));
    fetchExerciseNote(userId, nome)
      .then(n => { if (!cancelled) setNote(n); })
      .catch(err => console.warn('fetchExerciseNote:', err));
    return () => { cancelled = true; };
  }, [userId, nome]);

  async function commit() {
    try {
      const saved = await saveExerciseNote(userId, nome, note);
      setNote(saved);
      setError(false);
    } catch (err) {
      console.warn('saveExerciseNote:', err);
      setError(true);
    }
    setOpen(false);
  }

  if (open) {
    return (
      <div className="ex-note ex-note--edit">
        <textarea
          className="ex-note__input" rows={2} maxLength={NOTE_MAX} autoFocus
          aria-label={t('Nota do exercício')}
          placeholder={t('Ex.: banco na posição 4, ombro incomodou')}
          value={note} onChange={e => setNote(e.target.value)} onBlur={commit}
        />
      </div>
    );
  }
  return (
    <div className="ex-note">
      {note && <p className="ex-note__text">📝 {note}</p>}
      <button type="button" className="ex-note__btn" disabled={!started && !note} onClick={() => setOpen(true)}>
        {note ? t('✏️ Editar nota') : t('📝 Nota')}
      </button>
      {error && <span className="ex-note__err">{t('Salva só neste aparelho')}</span>}
    </div>
  );
}
