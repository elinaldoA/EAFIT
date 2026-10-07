import { useEffect, useState } from 'react';
import { useAuth } from '../context/useAuth';
import { useToast } from '../context/useToast';
import { todayDate } from '../data/treinoData';
import { CHECKIN_FIELDS, fetchCheckins, saveCheckin, checkinTip } from '../lib/checkin';

import { t } from '../lib/i18n';
// Check-in de 3 toques no topo do Treino: energia, sono e humor de 1 a 5.
// Depois de respondido vira uma linha com a dica do dia (dá pra refazer).
export default function DailyCheckin() {
  const { user } = useAuth();
  const toast = useToast();
  const [loaded, setLoaded] = useState(false);
  const [saved, setSaved] = useState(null);
  const [draft, setDraft] = useState({});
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const userId = user?.id;

  useEffect(() => {
    if (!userId) return undefined;
    let active = true;
    const today = todayDate();
    fetchCheckins(userId, today)
      .then(rows => { if (active) setSaved(rows.find(r => r.checkin_date === today) || null); })
      .catch(err => console.error('fetchCheckins:', err))
      .finally(() => { if (active) setLoaded(true); });
    return () => { active = false; };
  }, [userId]);

  if (!userId || !loaded) return null;

  const complete = CHECKIN_FIELDS.every(({ key }) => draft[key]);

  async function handleSave() {
    setBusy(true);
    try {
      await saveCheckin(userId, todayDate(), draft);
      setSaved({ ...draft });
      setEditing(false);
      toast(t('✅ Check-in registrado'));
    } catch (err) {
      console.error('saveCheckin:', err);
      toast(t('❌ Não foi possível salvar o check-in'));
    } finally {
      setBusy(false);
    }
  }

  if (saved && !editing) {
    return (
      <div className="checkin checkin--done" role="status">
        <span>{checkinTip(saved)}</span>
        <button type="button" className="btn btn--outline btn--sm" onClick={() => { setDraft({ ...saved }); setEditing(true); }}>{t('Refazer')}</button>
      </div>
    );
  }

  return (
    <div className="checkin">
      <div className="checkin__title">{t('Como você está hoje?')}</div>
      {CHECKIN_FIELDS.map(({ key, label, emojis }) => (
        <div className="checkin__row" key={key}>
          <span className="checkin__label">{label}</span>
          <div className="checkin__scale" role="radiogroup" aria-label={label}>
            {emojis.map((emoji, i) => (
              <button
                key={i} type="button" role="radio" aria-checked={draft[key] === i + 1}
                aria-label={`${label} ${i + 1} de 5`}
                className={draft[key] === i + 1 ? 'checkin__opt checkin__opt--on' : 'checkin__opt'}
                onClick={() => setDraft(d => ({ ...d, [key]: i + 1 }))}
              >{emoji}</button>
            ))}
          </div>
        </div>
      ))}
      <button type="button" className="btn btn--primary btn--sm" disabled={!complete || busy} onClick={handleSave}>
        {busy ? t('Salvando…') : t('Registrar')}
      </button>
    </div>
  );
}
