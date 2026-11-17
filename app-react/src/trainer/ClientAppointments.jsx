import { useCallback, useEffect, useState } from 'react';
import { useToast } from '../context/useToast';
import {
  DURATIONS, STATUS_LABEL, fetchTrainerAppointments, createAppointment, cancelAppointment,
  localInputToIso, formatWhen, friendlyAppointmentError,
} from '../lib/trainerAppointments';

import { useDeferredRemoval } from '../lib/useDeferredRemoval';
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
  const removal = useDeferredRemoval();

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

  // A aula já aparece como cancelada; o cancelamento (e o aviso ao aluno) só vão
  // ao servidor em 6s ou ao sair da tela, a não ser que desfaça. O aluno não
  // recebe nada de uma aula que voltou.
  function handleCancel(a) {
    removal.schedule(a.id, async () => {
      try { await cancelAppointment(a); } catch (err) { toast(`❌ ${friendlyAppointmentError(err)}`); }
      load();
    });
    toast(t('Aula de {v1} cancelada', { v1: formatWhen(a.starts) }), 6000, {
      action: { label: t('Desfazer'), onClick: () => removal.undo(a.id) },
    });
  }

  return (
    <div className="dash-card">
      <div className="dash-card__title">{t('📅 Aulas com {name}', { name: client.name })}</div>

      {rows && rows.length === 0 && <p className="dash-empty">{t('Nenhuma aula marcada.')}</p>}
      {(rows || []).map(row => {
        const a = removal.hidden.has(row.id) ? { ...row, status: 'cancelled' } : row;
        return (
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
        );
      })}

      <div className="appt-form">
        <span className="profile-field__label">{t('Marcar nova aula')}</span>
        <input type="datetime-local" className="input input--sm" aria-label={t('Data e hora')} value={when} onChange={e => setWhen(e.target.value)} />
        <select className="input input--sm" aria-label={t('Duração')} value={duration} onChange={e => setDuration(Number(e.target.value))}>
          {DURATIONS.map(d => <option key={d} value={d}>{d} min</option>)}
        </select>
        <input className="input input--sm" placeholder={t('Local (opcional)')} maxLength={120} value={place} onChange={e => setPlace(e.target.value)} />
        <input className="input input--sm" placeholder={t('Observação (opcional)')} maxLength={300} value={note} onChange={e => setNote(e.target.value)} />
        {error && <p className="profile-field__hint text-error" role="alert">{error}</p>}
        <button type="button" className="btn btn--primary btn--full" disabled={busy || !when} onClick={handleCreate}>
          {busy ? t('Marcando…') : t('Marcar aula e avisar o aluno')}
        </button>
      </div>
    </div>
  );
}
