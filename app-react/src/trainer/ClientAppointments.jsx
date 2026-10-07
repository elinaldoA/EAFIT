import { useCallback, useEffect, useState } from 'react';
import { useToast } from '../context/useToast';
import {
  DURATIONS, STATUS_LABEL, fetchTrainerAppointments, createAppointment, cancelAppointment,
  localInputToIso, formatWhen, friendlyAppointmentError,
} from '../lib/trainerAppointments';

import { t } from '../lib/i18n';
// Aulas marcadas com um aluno: o personal agenda (o aluno recebe notificação e
// confirma ou recusa no app) e acompanha o status de cada uma.
export default function ClientAppointments({ client }) {
  const toast = useToast();
  const [rows, setRows] = useState(null);
  const [when, setWhen] = useState('');
  const [duration, setDuration] = useState(60);
  const [place, setPlace] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    fetchTrainerAppointments(client.id)
      .then(setRows)
      .catch(err => { console.error('fetchTrainerAppointments:', err); setRows(prev => prev || []); });
  }, [client.id]);

  useEffect(() => { load(); }, [load]);

  async function handleCreate() {
    const startsIso = localInputToIso(when);
    if (!startsIso) { setError(t('Escolha a data e a hora.')); return; }
    setBusy(true); setError('');
    try {
      await createAppointment(client.id, { startsIso, duration, place: place.trim(), note: note.trim() });
      setWhen(''); setPlace(''); setNote('');
      toast(t('📅 Aula marcada. O aluno foi avisado'));
      load();
    } catch (err) {
      setError(friendlyAppointmentError(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleCancel(a) {
    if (!window.confirm(t('Cancelar a aula de {v1}?', { v1: formatWhen(a.starts) }))) return;
    try { await cancelAppointment(a); toast(t('Aula cancelada')); load(); }
    catch (err) { toast(`❌ ${friendlyAppointmentError(err)}`); }
  }

  return (
    <div className="dash-card">
      <div className="dash-card__title">{t('📅 Aulas com {name}', { name: client.name })}</div>

      {rows && rows.length === 0 && <p className="dash-empty">{t('Nenhuma aula marcada.')}</p>}
      {(rows || []).map(a => (
        <div className="appt" key={a.id}>
          <div>
            <strong>{formatWhen(a.starts)}</strong> · {a.duration} min
            {a.place && <small> · {a.place}</small>}
            {a.note && <small className="appt__note">{a.note}</small>}
            <span className={`appt__status appt__status--${a.status}`}>{STATUS_LABEL[a.status]}</span>
          </div>
          {['pending', 'confirmed'].includes(a.status) && (
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => handleCancel(a)}>{t('Cancelar')}</button>
          )}
        </div>
      ))}

      <div className="appt-form">
        <span className="profile-field__label">{t('Marcar nova aula')}</span>
        <input type="datetime-local" className="input input--sm" aria-label={t('Data e hora')} value={when} onChange={e => setWhen(e.target.value)} />
        <select className="input input--sm" aria-label={t('Duração')} value={duration} onChange={e => setDuration(Number(e.target.value))}>
          {DURATIONS.map(d => <option key={d} value={d}>{d} min</option>)}
        </select>
        <input className="input input--sm" placeholder={t('Local (opcional)')} maxLength={120} value={place} onChange={e => setPlace(e.target.value)} />
        <input className="input input--sm" placeholder={t('Observação (opcional)')} maxLength={300} value={note} onChange={e => setNote(e.target.value)} />
        {error && <p className="profile-field__hint" role="alert" style={{ color: 'var(--error)' }}>{error}</p>}
        <button type="button" className="btn btn--primary btn--full" disabled={busy || !when} onClick={handleCreate}>
          {busy ? t('Marcando…') : t('Marcar aula e avisar o aluno')}
        </button>
      </div>
    </div>
  );
}
