import { useCallback, useEffect, useRef, useState } from 'react';
import { MAX_MESSAGE } from '../lib/trainerMessages';
import { fmtDate } from '../lib/utils';
import Loading from './Loading';
import SchedulePicker from '../trainer/SchedulePicker';
import { scheduleToIso, friendlyScheduleError } from '../lib/trainerScheduled';

import { t } from '../lib/i18n';
// Conversa entre personal e aluno. `me` = 'trainer' ou 'client' (de que lado
// está quem vê); `load` busca as mensagens e `send(texto)` grava a resposta.
// O personal usa o MessageComposer da ficha para recados com push; aqui o
// campo de resposta é o mesmo nos dois lados.
//
// Opcionais (só o personal usa; o aluno não passa nenhum):
//  - tools({ text, setText }): ferramentas acima da caixa (respostas prontas);
//  - schedule = { send(body, iso), onDone(iso) }: habilita "Agendar para depois".
export default function ChatThread({ me, onError, load, send, onLoaded, sendLabel = t('Responder'), placeholder = t('Escreva uma mensagem…'), tools, schedule }) {
  const [items, setItems] = useState(null);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [scheduling, setScheduling] = useState(false);
  const [when, setWhen] = useState('');
  const endRef = useRef(null);

  const refresh = useCallback(() => {
    load()
      .then(rows => { setItems(rows); onLoaded?.(rows); })
      .catch(err => { console.error('chat load:', err); setItems(prev => prev || []); });
  }, [load, onLoaded]);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => { endRef.current?.scrollIntoView?.({ block: 'nearest' }); }, [items]);

  async function handleSend() {
    const body = text.trim();
    if (!body) return;
    if (scheduling) { await handleSchedule(body); return; }
    setSending(true); setError('');
    try {
      await send(body);
      setText('');
      refresh();
    } catch (err) {
      setError(onError ? onError(err) : t('Não foi possível enviar. Tente de novo.'));
    } finally {
      setSending(false);
    }
  }

  async function handleSchedule(body) {
    const iso = scheduleToIso(when);
    if (!iso) { setError(friendlyScheduleError(new Error('invalid_when'))); return; }
    setSending(true); setError('');
    try {
      await schedule.send(body, iso);
      setText(''); setWhen(''); setScheduling(false);
      schedule.onDone?.(iso);
    } catch (err) {
      setError(friendlyScheduleError(err));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="chat">
      <div className="chat__list" role="log" aria-label={t('Conversa')}>
        {!items && <Loading />}
        {items && items.length === 0 && <p className="dash-empty">{t('Nenhuma mensagem ainda.')}</p>}
        {(items || []).map(m => (
          <div key={m.id} className={m.from === me ? 'chat__msg chat__msg--mine' : 'chat__msg'}>
            <p>{m.kind === 'treino' ? '📋 ' : ''}{m.body}</p>
            <small>{fmtDate(String(m.at).slice(0, 10))} {String(m.at).slice(11, 16)}</small>
          </div>
        ))}
        <div ref={endRef} />
      </div>
      {tools?.({ text, setText })}
      <textarea
        className="input input--sm" rows={2} maxLength={MAX_MESSAGE} aria-label={t('Resposta')}
        placeholder={placeholder} value={text} onChange={e => setText(e.target.value)}
      />
      {schedule && <SchedulePicker open={scheduling} onToggle={() => setScheduling(v => !v)} when={when} onChange={setWhen} />}
      {error && <p className="profile-field__hint text-error" role="alert">{error}</p>}
      <button type="button" className="btn btn--primary btn--full" disabled={sending || !text.trim() || (scheduling && !when)} onClick={handleSend}>
        {sending ? t('Enviando…') : scheduling ? t('Agendar recado') : sendLabel}
      </button>
    </div>
  );
}
