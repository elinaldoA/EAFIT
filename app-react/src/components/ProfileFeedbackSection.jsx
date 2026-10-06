import { useEffect, useState } from 'react';
import {
  FEEDBACK_KINDS, MAX_LENGTH, validateFeedback, friendlyFeedbackError, sendFeedback, fetchMyReplies,
} from '../lib/feedback';

// Formulário de sugestão/problema/elogio dentro do Perfil. O envio cai na
// fila "Feedback" do painel admin.
export default function ProfileFeedbackSection({ userId, toast }) {
  const [kind, setKind] = useState('sugestao');
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [replies, setReplies] = useState([]);

  useEffect(() => {
    let active = true;
    fetchMyReplies().then(rows => { if (active) setReplies(rows); });
    return () => { active = false; };
  }, []);

  async function handleSend() {
    const check = validateFeedback(kind, text);
    if (!check.ok) { setError(check.error); return; }
    setError('');
    setSending(true);
    try {
      await sendFeedback(userId, kind, check.message);
      setText('');
      toast('✅ Obrigado! Recebemos seu feedback.');
    } catch (err) {
      setError(friendlyFeedbackError(err));
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      {replies.length > 0 && (
        <div className="profile-field">
          <span className="profile-field__label">Respostas da equipe</span>
          {replies.map(r => (
            <div key={r.id} className="feedback-reply">
              <p className="profile-field__hint" style={{ margin: 0 }}>Você: {r.message}</p>
              <p className="feedback-reply__text">💬 {r.admin_reply}</p>
            </div>
          ))}
        </div>
      )}
      <p className="profile-field__hint">Conte o que você gostaria de ver no app, reporte um problema ou mande um elogio. A gente lê tudo.</p>
      <div className="profile-field">
        <label className="profile-field__label" htmlFor="feedbackKind">Tipo</label>
        <select id="feedbackKind" className="input input--sm" value={kind} onChange={e => setKind(e.target.value)}>
          {FEEDBACK_KINDS.map(k => <option key={k.value} value={k.value}>{k.label}</option>)}
        </select>
      </div>
      <div className="profile-field">
        <label className="profile-field__label" htmlFor="feedbackText">Mensagem</label>
        <textarea
          id="feedbackText" className="input input--sm" rows={4} maxLength={MAX_LENGTH}
          placeholder="Escreva aqui…" value={text} onChange={e => setText(e.target.value)}
        />
        <span className="profile-field__hint">{text.length}/{MAX_LENGTH}</span>
      </div>
      {error && <p className="profile-field__hint" role="alert" style={{ color: 'var(--error)' }}>{error}</p>}
      <button className="btn btn--primary btn--full" disabled={sending || !text.trim()} onClick={handleSend}>
        {sending ? 'Enviando…' : 'Enviar feedback'}
      </button>
    </>
  );
}
