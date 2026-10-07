import { useEffect, useState } from 'react';
import { useToast } from '../context/useToast';
import { fetchGoals, setGoals, friendlyInsightError } from '../lib/trainerInsights';

import { t } from '../lib/i18n';
const WEEKLY = [1, 2, 3, 4, 5, 6, 7];

// Metas que o personal combina com o aluno: treinos por semana e peso alvo.
// O aluno vê no Perfil (Meu personal) e as metas dele passam a valer no app.
export default function ClientGoals({ clientId, onSaved }) {
  const toast = useToast();
  const [loaded, setLoaded] = useState(false);
  const [weekly, setWeekly] = useState('');
  const [weight, setWeight] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    fetchGoals(clientId)
      .then(g => {
        if (!active) return;
        if (g) { setWeekly(g.weekly ? String(g.weekly) : ''); setWeight(g.weight ? String(g.weight).replace('.', ',') : ''); setNote(g.note); }
        setLoaded(true);
      })
      .catch(err => { console.error('fetchGoals:', err); if (active) setLoaded(true); });
    return () => { active = false; };
  }, [clientId]);

  async function handleSave() {
    const w = weight.trim() === '' ? null : Number(weight.replace(',', '.'));
    if (w !== null && !Number.isFinite(w)) { setError(t('Peso alvo inválido.')); return; }
    if (!weekly && w === null) { setError(t('Defina ao menos uma meta.')); return; }
    setBusy(true); setError('');
    try {
      await setGoals(clientId, { weekly: weekly ? Number(weekly) : null, weight: w, note: note.trim() });
      toast(t('🎯 Metas enviadas para o aluno'));
      onSaved?.();
    } catch (err) {
      setError(friendlyInsightError(err));
    } finally {
      setBusy(false);
    }
  }

  if (!loaded) return null;

  return (
    <div className="dash-card">
      <div className="dash-card__title">{t('🎯 Metas do aluno')}</div>
      <div className="profile-field">
        <label className="profile-field__label" htmlFor="goalWeekly">{t('Treinos por semana')}</label>
        <select id="goalWeekly" className="input input--sm" value={weekly} onChange={e => setWeekly(e.target.value)}>
          <option value="">{t('Não definir')}</option>
          {WEEKLY.map(n => <option key={n} value={n}>{n}</option>)}
        </select>
      </div>
      <div className="profile-field">
        <label className="profile-field__label" htmlFor="goalWeight">{t('Peso alvo (kg)')}</label>
        <input id="goalWeight" className="input input--sm" inputMode="decimal" placeholder={t('Ex: 78')} value={weight} onChange={e => setWeight(e.target.value)} />
      </div>
      <div className="profile-field">
        <label className="profile-field__label" htmlFor="goalNote">{t('Recado sobre a meta (opcional)')}</label>
        <input id="goalNote" className="input input--sm" maxLength={300} placeholder={t('Ex: foco em constância neste ciclo')} value={note} onChange={e => setNote(e.target.value)} />
      </div>
      {error && <p className="profile-field__hint" role="alert" style={{ color: 'var(--error)' }}>{error}</p>}
      <button type="button" className="btn btn--primary btn--sm" disabled={busy} onClick={handleSave}>{busy ? t('Enviando…') : t('Salvar e enviar ao aluno')}</button>
    </div>
  );
}
