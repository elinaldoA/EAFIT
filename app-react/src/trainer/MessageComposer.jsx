import { useState } from 'react';
import { useToast } from '../context/useToast';
import { MAX_MESSAGE, sendMessage, friendlyMessageError } from '../lib/trainerMessages';
import { scheduleMessage, scheduleToIso, whenLabel, friendlyScheduleError } from '../lib/trainerScheduled';
import QuickReplyTools from './QuickReplyTools';
import SchedulePicker from './SchedulePicker';

import { t } from '../lib/i18n';
// Caixa de recado do personal. `clientIds` = destinatários fixos (ficha do
// aluno) ou a seleção da tela de Recados; vazio/nulo = todos os alunos.
// Acima da caixa ficam as respostas prontas; abaixo, "Agendar para depois".
export default function MessageComposer({ clientIds, label, onSent, initialText = '' }) {
  const toast = useToast();
  const [text, setText] = useState(initialText);
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [scheduling, setScheduling] = useState(false);
  const [when, setWhen] = useState('');

  const body = text.trim();

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

  return (
    <>
      <QuickReplyTools text={text} setText={setText} />
      <textarea
        className="input input--sm" rows={3} maxLength={MAX_MESSAGE} aria-label={t('Mensagem')}
        placeholder={t('Escreva um recado, incentivo ou orientação…')}
        value={text} onChange={e => setText(e.target.value)}
      />
      <span className="profile-field__hint">{t('{length}/{MAX_MESSAGE} · o aluno recebe uma notificação', { length: text.length, MAX_MESSAGE })}</span>
      <SchedulePicker open={scheduling} onToggle={() => setScheduling(v => !v)} when={when} onChange={setWhen} />
      {error && <p className="profile-field__hint text-error" role="alert">{error}</p>}
      <button type="button" className="btn btn--primary btn--full" disabled={sending || !body || (scheduling && !when)} onClick={handleSend}>
        {sending ? t('Enviando…') : scheduling ? t('Agendar recado') : label}
      </button>
    </>
  );
}
