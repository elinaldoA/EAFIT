import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/useAuth';
import { useToast } from '../context/useToast';
import {
  STATUS_LABEL, fetchMyAppointments, respondAppointment, upcomingAppointments, formatWhen, friendlyAppointmentError,
} from '../lib/trainerAppointments';

import { t } from '../lib/i18n';
// Aulas marcadas pelo personal. `onlyPending` = faixa no topo do Treino, só com
// os convites que esperam resposta; sem ele, lista completa (Perfil → Meu
// personal). Sem personal ou sem aula, não mostra nada.
export default function MyAppointments({ onlyPending = false }) {
  const { user } = useAuth();
  const toast = useToast();
  const [rows, setRows] = useState([]);
  const userId = user?.id;

  const load = useCallback(() => {
    if (!userId) return;
    fetchMyAppointments().then(setRows).catch(() => { /* sem personal / migration pendente */ });
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  async function answer(a, status) {
    try {
      await respondAppointment(a.id, status);
      toast(status === 'confirmed' ? t('✅ Aula confirmada') : t('Aula recusada'));
      load();
    } catch (err) {
      toast(`❌ ${friendlyAppointmentError(err)}`);
      load();
    }
  }

  const upcoming = upcomingAppointments(rows);
  const list = onlyPending ? upcoming.filter(a => a.status === 'pending') : rows.filter(a => a.status !== 'cancelled' || new Date(a.starts) > new Date());
  if (!list.length) return null;

  return (
    <div className={onlyPending ? 'personal-msg' : 'personal-history'} role={onlyPending ? 'status' : undefined}>
      <span className={onlyPending ? 'personal-msg__title' : 'profile-field__label'}>
        📅 {onlyPending ? t('Seu personal marcou uma aula') : t('Aulas com o personal')}
      </span>
      {list.map(a => (
        <div className="appt" key={a.id}>
          <div>
            <strong>{formatWhen(a.starts)}</strong> · {t('{n} min', { n: a.duration })}
            {a.place && <small> · {a.place}</small>}
            {a.note && <small className="appt__note">{a.note}</small>}
            {!onlyPending && <span className={`appt__status appt__status--${a.status}`}>{STATUS_LABEL[a.status]}</span>}
          </div>
          {['pending', 'confirmed', 'declined'].includes(a.status) && new Date(a.starts) > new Date() && (
            <div className="appt__actions">
              {a.status !== 'confirmed' && <button type="button" className="btn btn--primary btn--sm" onClick={() => answer(a, 'confirmed')}>{t('Confirmar')}</button>}
              {a.status !== 'declined' && <button type="button" className="btn btn--outline btn--sm" onClick={() => answer(a, 'declined')}>{t('Recusar')}</button>}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
