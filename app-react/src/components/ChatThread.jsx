import { useCallback, useEffect, useRef, useState } from 'react';
import { MAX_MESSAGE } from '../lib/trainerMessages';
import { fmtDate } from '../lib/utils';

// Conversa entre personal e aluno. `me` = 'trainer' ou 'client' (de que lado
// está quem vê); `load` busca as mensagens e `send(texto)` grava a resposta.
// O personal usa o MessageComposer da ficha para recados com push; aqui o
// campo de resposta é o mesmo nos dois lados.
export default function ChatThread({ me, onError, load, send, onLoaded, sendLabel = 'Responder', placeholder = 'Escreva uma mensagem…' }) {
  const [items, setItems] = useState(null);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
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
    setSending(true); setError('');
    try {
      await send(body);
      setText('');
      refresh();
    } catch (err) {
      setError(onError ? onError(err) : 'Não foi possível enviar. Tente de novo.');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="chat">
      <div className="chat__list" role="log" aria-label="Conversa">
        {!items && <p className="dash-empty">Carregando…</p>}
        {items && items.length === 0 && <p className="dash-empty">Nenhuma mensagem ainda.</p>}
        {(items || []).map(m => (
          <div key={m.id} className={m.from === me ? 'chat__msg chat__msg--mine' : 'chat__msg'}>
            <p>{m.kind === 'treino' ? '📋 ' : ''}{m.body}</p>
            <small>{fmtDate(String(m.at).slice(0, 10))} {String(m.at).slice(11, 16)}</small>
          </div>
        ))}
        <div ref={endRef} />
      </div>
      <textarea
        className="input input--sm" rows={2} maxLength={MAX_MESSAGE} aria-label="Resposta"
        placeholder={placeholder} value={text} onChange={e => setText(e.target.value)}
      />
      {error && <p className="profile-field__hint" role="alert" style={{ color: 'var(--error)' }}>{error}</p>}
      <button type="button" className="btn btn--primary btn--full" disabled={sending || !text.trim()} onClick={handleSend}>
        {sending ? 'Enviando…' : sendLabel}
      </button>
    </div>
  );
}
