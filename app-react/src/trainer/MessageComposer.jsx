import { useState } from 'react';
import { useToast } from '../context/useToast';
import { MAX_MESSAGE, sendMessage, friendlyMessageError } from '../lib/trainerMessages';

// Caixa de recado do personal. `clientIds` = destinatários fixos (ficha do
// aluno) ou a seleção da tela de Recados; vazio/nulo = todos os alunos.
export default function MessageComposer({ clientIds, label, onSent }) {
  const toast = useToast();
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);

  async function handleSend() {
    const body = text.trim();
    if (!body) { setError('Escreva a mensagem.'); return; }
    setSending(true); setError('');
    try {
      const n = await sendMessage(clientIds, body);
      setText('');
      toast(`✅ Recado enviado para ${n} aluno(s)`);
      onSent?.();
    } catch (err) {
      setError(friendlyMessageError(err));
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <textarea
        className="input input--sm" rows={3} maxLength={MAX_MESSAGE} aria-label="Mensagem"
        placeholder="Escreva um recado, incentivo ou orientação…"
        value={text} onChange={e => setText(e.target.value)}
      />
      <span className="profile-field__hint">{text.length}/{MAX_MESSAGE} · o aluno recebe uma notificação</span>
      {error && <p className="profile-field__hint" role="alert" style={{ color: 'var(--error)' }}>{error}</p>}
      <button type="button" className="btn btn--primary btn--full" disabled={sending || !text.trim()} onClick={handleSend}>
        {sending ? 'Enviando…' : label}
      </button>
    </>
  );
}
