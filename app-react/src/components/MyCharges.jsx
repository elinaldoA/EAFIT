import { useEffect, useState } from 'react';
import { useAuth } from '../context/useAuth';
import { todayDate } from '../data/treinoData';
import {
  METHOD_LABEL, STATE_LABEL, fetchMyCharges, chargeState, daysLate, formatMoney, formatDue, formatDay,
} from '../lib/trainerCharges';

import { t } from '../lib/i18n';
// Cobranças registradas pelo personal (somente leitura). Quem paga e como é
// combinado entre os dois: o app não recebe pagamento. Sem cobrança, não mostra nada.
export default function MyCharges() {
  const { user } = useAuth();
  const [rows, setRows] = useState([]);
  const userId = user?.id;

  useEffect(() => {
    if (!userId) return;
    fetchMyCharges().then(setRows).catch(() => { /* sem personal / migration pendente */ });
  }, [userId]);

  if (!rows.length) return null;
  const today = todayDate();

  return (
    <div className="personal-history">
      <span className="profile-field__label">{t('💰 Pagamentos ao personal')}</span>
      {rows.map(c => {
        const st = chargeState(c, today);
        return (
          <div className="appt" key={c.id}>
            <div>
              <strong>{c.description}</strong>
              <small>
                {st === 'paid' ? t('Pago em {v1} · {v2}', { v1: formatDay(c.paidAt), v2: METHOD_LABEL[c.method] || '' }) : t('Vence em {v1}', { v1: formatDue(c.due) })}
                {st === 'overdue' && ` · ${t('{n} dia(s) de atraso', { n: daysLate(c, today) })}`}
              </small>
              {c.note && <small className="appt__note">{c.note}</small>}
              <span className={`appt__status appt__status--${st}`}>{STATE_LABEL[st]}</span>
            </div>
            <strong className="charge__amount">{formatMoney(c.amount)}</strong>
          </div>
        );
      })}
      <small className="profile-field__hint">{t('O pagamento é combinado direto com o seu personal; o EAFIT não recebe nem repassa dinheiro.')}</small>
    </div>
  );
}
