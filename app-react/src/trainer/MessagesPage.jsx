import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchClients } from '../lib/trainer';
import { fetchSentMessages, groupSent, recipientsLabel } from '../lib/trainerMessages';
import { fetchScheduled, cancelScheduled, friendlyScheduleError, whenLabel, scheduledTarget } from '../lib/trainerScheduled';
import { useToast } from '../context/useToast';
import { fmtDate } from '../lib/utils';
import MessageComposer from './MessageComposer';
import Loading from '../components/Loading';
import { useDeferredRemoval } from '../lib/useDeferredRemoval';

import { t } from '../lib/i18n';
// Aba Recados do personal: escolhe quem recebe (todos ou alunos específicos),
// envia e acompanha o histórico com o "lido" de cada aluno.
export default function MessagesPage({ header }) {
  const toast = useToast();
  const [clients, setClients] = useState(null);
  const [selected, setSelected] = useState([]); // vazio = todos
  const [sent, setSent] = useState(null);
  const [scheduled, setScheduled] = useState([]);
  const removal = useDeferredRemoval();
  const liveScheduled = useMemo(() => scheduled.filter(s => !removal.hidden.has(s.id)), [scheduled, removal.hidden]);

  const loadSent = useCallback(() => {
    fetchSentMessages().then(setSent).catch(err => { console.error('fetchSentMessages:', err); setSent([]); });
  }, []);

  const loadScheduled = useCallback(() => {
    fetchScheduled().then(setScheduled).catch(() => setScheduled([])); // migration pendente: sem lista
  }, []);

  const reload = useCallback(() => { loadSent(); loadScheduled(); }, [loadSent, loadScheduled]);

  // Some na hora; o cancelamento só vai ao servidor em 6s (ou ao sair da tela),
  // a não ser que desfaça. Se o horário chegar nesse intervalo, o servidor avisa
  // que o recado já foi enviado.
  function handleCancel(item) {
    removal.schedule(item.id, async () => {
      try { await cancelScheduled(item.id); } catch (err) { toast(`❌ ${friendlyScheduleError(err)}`); }
      loadScheduled();
    });
    toast(t('Agendamento cancelado'), 6000, {
      action: { label: t('Desfazer'), onClick: () => removal.undo(item.id) },
    });
  }

  useEffect(() => {
    fetchClients().then(setClients).catch(err => { console.error('fetchClients:', err); setClients([]); });
    loadSent();
    loadScheduled();
  }, [loadSent, loadScheduled]);

  const groups = useMemo(() => (sent ? groupSent(sent) : []), [sent]);
  const toggle = id => setSelected(s => (s.includes(id) ? s.filter(x => x !== id) : [...s, id]));

  return (
    <section className="page active trainer-page">
      {header}
      <div className="dash-card">
        <div className="dash-card__title">{t('💬 Enviar recado')}</div>
        {clients && clients.length === 0 ? (
          <p className="dash-empty">{t('Você ainda não tem alunos vinculados.')}</p>
        ) : (
          <>
            <span className="profile-field__label">{t('Para quem?')}</span>
            <div className="measure-chips" role="group" aria-label={t('Destinatários')}>
              <button type="button" aria-pressed={selected.length === 0}
                className={selected.length === 0 ? 'recap__btn recap__btn--active' : 'recap__btn'}
                onClick={() => setSelected([])}>{t('Todos os alunos')}</button>
              {(clients || []).map(c => (
                <button key={c.id} type="button" aria-pressed={selected.includes(c.id)}
                  className={selected.includes(c.id) ? 'recap__btn recap__btn--active' : 'recap__btn'}
                  onClick={() => toggle(c.id)}>{c.name}</button>
              ))}
            </div>
            <MessageComposer
              clientIds={selected}
              label={selected.length ? t('Enviar para {length} aluno(s)', { length: selected.length }) : t('Enviar para todos')}
              onSent={reload}
            />
          </>
        )}
      </div>

      {liveScheduled.length > 0 && (
        <div className="dash-card">
          <div className="dash-card__title">{t('🕒 Agendados')}</div>
          {liveScheduled.map(s => (
            <div className="sent-msg" key={s.id}>
              <div className="sent-msg__head">
                <span>{scheduledTarget(s)}</span>
                <small>{whenLabel(s.at)}</small>
              </div>
              <p className="sent-msg__body">{s.body}</p>
              <button type="button" className="btn btn--ghost btn--sm" aria-label={t('Cancelar recado agendado: {v}', { v: s.body.slice(0, 30) })} onClick={() => handleCancel(s)}>
                {t('Cancelar envio')}
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="dash-card">
        <div className="dash-card__title">{t('Enviados')}</div>
        {!sent && <Loading />}
        {sent && groups.length === 0 && <p className="dash-empty">{t('Nenhum recado enviado ainda.')}</p>}
        {groups.map(g => {
          const read = g.recipients.filter(r => r.read).length;
          return (
            <div className="sent-msg" key={g.key}>
              <div className="sent-msg__head">
                <span>{g.kind === 'treino' ? '📋 ' : ''}{recipientsLabel(g.recipients)}</span>
                <small>{fmtDate(String(g.at).slice(0, 10))}</small>
              </div>
              <p className="sent-msg__body">{g.body}</p>
              <small className="sent-msg__read">{t('{read}/{total} leram', { read, total: g.recipients.length })}</small>
            </div>
          );
        })}
      </div>
    </section>
  );
}
