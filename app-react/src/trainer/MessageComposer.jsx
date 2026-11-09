import { useEffect, useState } from 'react';
import { useToast } from '../context/useToast';
import { MAX_MESSAGE, sendMessage, friendlyMessageError } from '../lib/trainerMessages';
import {
  MAX_QUICK_REPLIES, STARTER_REPLIES, fetchQuickReplies, addQuickReply, deleteQuickReply,
  quickLabel, insertReply, friendlyQuickReplyError,
} from '../lib/trainerQuickReplies';

import {
  scheduleMessage, scheduleToIso, minScheduleValue, maxScheduleValue, whenLabel, friendlyScheduleError,
} from '../lib/trainerScheduled';

import { t } from '../lib/i18n';
// Caixa de recado do personal. `clientIds` = destinatários fixos (ficha do
// aluno) ou a seleção da tela de Recados; vazio/nulo = todos os alunos.
// Acima da caixa ficam as respostas prontas do personal (ou sugestões, se ele
// ainda não salvou nenhuma): tocar insere o texto, que pode ser editado.
export default function MessageComposer({ clientIds, label, onSent, initialText = '' }) {
  const toast = useToast();
  const [text, setText] = useState(initialText);
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [replies, setReplies] = useState([]);
  const [managing, setManaging] = useState(false);
  const [scheduling, setScheduling] = useState(false);
  const [when, setWhen] = useState('');

  useEffect(() => {
    let active = true;
    fetchQuickReplies()
      .then(r => { if (active) setReplies(r); })
      .catch(() => { /* migration pendente: segue só com as sugestões */ });
    return () => { active = false; };
  }, []);

  const body = text.trim();
  const alreadySaved = replies.some(r => r.body === body);

  async function handleSend() {
    if (!body) { setError(t('Escreva a mensagem.')); return; }
    if (scheduling) { await handleSchedule(); return; }
    setSending(true); setError('');
    try {
      const n = await sendMessage(clientIds, body);
      setText('');
      toast(t('✅ Recado enviado para {n} aluno(s)', { n }));
      onSent?.();
    } catch (err) {
      setError(friendlyMessageError(err));
    } finally {
      setSending(false);
    }
  }

  async function handleSchedule() {
    const iso = scheduleToIso(when);
    if (!iso) { setError(friendlyScheduleError(new Error('invalid_when'))); return; }
    setSending(true); setError('');
    try {
      await scheduleMessage(clientIds, body, iso);
      setText(''); setWhen(''); setScheduling(false);
      toast(t('🕒 Recado agendado para {v}', { v: whenLabel(iso) }));
      onSent?.();
    } catch (err) {
      setError(friendlyScheduleError(err));
    } finally {
      setSending(false);
    }
  }

  async function handleSaveReply() {
    setError('');
    try {
      await addQuickReply(body);
      setReplies(await fetchQuickReplies());
      toast(t('💾 Resposta pronta salva'));
    } catch (err) {
      setError(friendlyQuickReplyError(err));
    }
  }

  async function handleDeleteReply(reply) {
    setError('');
    try {
      await deleteQuickReply(reply.id);
      setReplies(list => list.filter(r => r.id !== reply.id));
    } catch (err) {
      setError(friendlyQuickReplyError(err));
    }
  }

  const options = replies.length
    ? replies.map(r => ({ key: r.id, body: r.body, reply: r }))
    : STARTER_REPLIES.map(b => ({ key: b, body: b, reply: null }));

  return (
    <>
      <div className="quick-replies" role="group" aria-label={t('Respostas prontas')}>
        {options.map(o => (
          <span className="quick-reply" key={o.key}>
            <button type="button" className="quick-reply__use" title={o.body} onClick={() => setText(cur => insertReply(cur, o.body))}>
              {quickLabel(o.body)}
            </button>
            {managing && o.reply && (
              <button type="button" className="quick-reply__del" aria-label={t('Apagar resposta pronta: {v}', { v: quickLabel(o.body) })} onClick={() => handleDeleteReply(o.reply)}>×</button>
            )}
          </span>
        ))}
        {replies.length > 0 && (
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => setManaging(v => !v)}>
            {managing ? t('Concluir') : t('Editar lista')}
          </button>
        )}
      </div>
      <textarea
        className="input input--sm" rows={3} maxLength={MAX_MESSAGE} aria-label={t('Mensagem')}
        placeholder={t('Escreva um recado, incentivo ou orientação…')}
        value={text} onChange={e => setText(e.target.value)}
      />
      <span className="profile-field__hint">{t('{length}/{MAX_MESSAGE} · o aluno recebe uma notificação', { length: text.length, MAX_MESSAGE })}</span>
      {body && !alreadySaved && replies.length < MAX_QUICK_REPLIES && (
        <button type="button" className="btn btn--ghost btn--sm" style={{ alignSelf: 'flex-start' }} onClick={handleSaveReply}>
          {t('💾 Salvar como resposta pronta')}
        </button>
      )}
      <button type="button" className="btn btn--ghost btn--sm" style={{ alignSelf: 'flex-start' }} aria-pressed={scheduling}
        onClick={() => setScheduling(v => !v)}>
        {scheduling ? t('Enviar agora') : t('🕒 Agendar para depois')}
      </button>
      {scheduling && (
        <div className="profile-field">
          <label className="profile-field__label" htmlFor="schedWhen">{t('Enviar em')}</label>
          <input id="schedWhen" type="datetime-local" className="input input--sm" value={when}
            min={minScheduleValue()} max={maxScheduleValue()} onChange={e => setWhen(e.target.value)} />
        </div>
      )}
      {error && <p className="profile-field__hint text-error" role="alert">{error}</p>}
      <button type="button" className="btn btn--primary btn--full" disabled={sending || !body || (scheduling && !when)} onClick={handleSend}>
        {sending ? t('Enviando…') : scheduling ? t('Agendar recado') : label}
      </button>
    </>
  );
}
