import { useCallback, useEffect, useMemo, useState } from 'react';
import { todayDate } from '../data/treinoData';
import { useToast } from '../context/useToast';
import {
  METHODS, METHOD_LABEL, STATE_LABEL, fetchTrainerCharges, createCharge, markChargePaid, reopenCharge, cancelCharge,
  chargeState, daysLate, chargeSummary, formatMoney, formatDue, formatDay, parseMoney, friendlyChargeError,
} from '../lib/trainerCharges';

import { t } from '../lib/i18n';

// Cobranças de um aluno: o personal registra o que ele deve (uma ou várias
// mensais), dá baixa ao receber (Pix, dinheiro... fora do app) e acompanha o
// que está em atraso. O aluno vê as dele em Perfil → Meu personal.
export default function ClientCharges({ client }) {
  const toast = useToast();
  const [rows, setRows] = useState(null);
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [due, setDue] = useState('');
  const [months, setMonths] = useState(1);
  const [note, setNote] = useState('');
  const [method, setMethod] = useState('pix');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const today = todayDate();

  const load = useCallback(() => {
    fetchTrainerCharges(client.id)
      .then(setRows)
      .catch(err => { console.error('fetchTrainerCharges:', err); setRows(prev => prev || []); });
  }, [client.id]);

  useEffect(() => { load(); }, [load]);

  const summary = useMemo(() => chargeSummary(rows || [], today), [rows, today]);
  const visible = (rows || []).filter(c => c.status !== 'cancelled');
  const cents = parseMoney(amount);

  async function handleCreate() {
    setBusy(true); setError('');
    try {
      await createCharge(client.id, { description: description.trim(), amountCents: cents, due, months, note: note.trim() });
      setDescription(''); setAmount(''); setDue(''); setMonths(1); setNote('');
      toast(t('💰 Cobrança registrada. O aluno foi avisado'));
      load();
    } catch (err) {
      setError(friendlyChargeError(err));
    } finally {
      setBusy(false);
    }
  }

  async function act(fn, okMsg) {
    try { await fn(); toast(okMsg); }
    catch (err) { toast(`❌ ${friendlyChargeError(err)}`); }
    load();
  }

  function handleCancel(c) {
    if (!window.confirm(t('Cancelar a cobrança "{v1}" de {v2}?', { v1: c.description, v2: formatMoney(c.amount) }))) return;
    act(() => cancelCharge(c.id), t('Cobrança cancelada'));
  }

  return (
    <div className="dash-card">
      <div className="dash-card__title">{t('💰 Cobrança de {name}', { name: client.name })}</div>
      <p className="profile-field__hint m-0">{t('Controle manual: o app não recebe nem repassa dinheiro. Registre aqui o que combinou com o aluno e dê baixa quando receber.')}</p>

      {rows && rows.length > 0 && (
        <div className="recap__grid">
          <div className="recap__stat"><span className={`recap__value${summary.overdue ? ' kpi__value--warn' : ''}`}>{formatMoney(summary.overdue)}</span><span className="recap__label">{t('em atraso')}</span></div>
          <div className="recap__stat"><span className="recap__value">{formatMoney(summary.upcoming)}</span><span className="recap__label">{t('a receber')}</span></div>
          <div className="recap__stat"><span className="recap__value">{formatMoney(summary.receivedMonth)}</span><span className="recap__label">{t('recebido no mês')}</span></div>
        </div>
      )}

      {rows && visible.length === 0 && <p className="dash-empty">{t('Nenhuma cobrança registrada.')}</p>}
      {visible.map(c => {
        const st = chargeState(c, today);
        return (
          <div className="appt charge-row" key={c.id}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
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
            {st === 'paid' ? (
              <div className="appt__actions">
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => act(() => reopenCharge(c.id), t('Baixa desfeita'))}>{t('Desfazer baixa')}</button>
              </div>
            ) : (
              <div className="appt__actions">
                <select className="input input--sm" aria-label={t('Forma de pagamento')} value={method} onChange={e => setMethod(e.target.value)}>
                  {METHODS.map(m => <option key={m} value={m}>{METHOD_LABEL[m]}</option>)}
                </select>
                <button type="button" className="btn btn--primary btn--sm" onClick={() => act(() => markChargePaid(c.id, method), t('✅ Pagamento registrado'))}>{t('Dar baixa')}</button>
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => handleCancel(c)}>{t('Cancelar')}</button>
              </div>
            )}
          </div>
        );
      })}

      <div className="appt-form">
        <span className="profile-field__label">{t('Nova cobrança')}</span>
        <input className="input input--sm" placeholder={t('Descrição (ex.: Mensalidade)')} aria-label={t('Descrição')} maxLength={80} value={description} onChange={e => setDescription(e.target.value)} />
        <div className="charge-form__row">
          <input className="input input--sm" inputMode="decimal" placeholder={t('Valor (R$)')} aria-label={t('Valor')} value={amount} onChange={e => setAmount(e.target.value)} />
          <input type="date" className="input input--sm" aria-label={t('Vencimento')} value={due} onChange={e => setDue(e.target.value)} />
        </div>
        <select className="input input--sm" aria-label={t('Repetir')} value={months} onChange={e => setMonths(Number(e.target.value))}>
          <option value={1}>{t('Só esta vez')}</option>
          {[2, 3, 4, 5, 6, 12].map(n => <option key={n} value={n}>{t('Mensal, {n} meses', { n })}</option>)}
        </select>
        <input className="input input--sm" placeholder={t('Observação (opcional): ex. chave Pix')} aria-label={t('Observação')} maxLength={300} value={note} onChange={e => setNote(e.target.value)} />
        {error && <p className="profile-field__hint text-error" role="alert">{error}</p>}
        <button type="button" className="btn btn--primary btn--full" disabled={busy || !description.trim() || !cents || !due} onClick={handleCreate}>
          {busy ? t('Registrando…') : t('Registrar cobrança e avisar o aluno')}
        </button>
      </div>
    </div>
  );
}
