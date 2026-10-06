import { useEffect, useState } from 'react';
import { useAuth } from '../context/useAuth';
import { fetchMyMessages, markMessagesRead, unreadCount } from '../lib/trainerMessages';

// Faixa no topo do Treino com os recados novos do personal. Sem recado novo,
// não aparece (o histórico fica em Perfil → Meu personal).
export default function PersonalMessages() {
  const { user } = useAuth();
  const [messages, setMessages] = useState([]);
  const userId = user?.id;

  useEffect(() => {
    if (!userId) return undefined;
    let active = true;
    fetchMyMessages(5)
      .then(rows => { if (active) setMessages(rows.filter(m => !m.read)); })
      .catch(() => { /* sem personal / migration pendente: simplesmente não mostra */ });
    return () => { active = false; };
  }, [userId]);

  if (!messages.length) return null;

  async function handleRead() {
    setMessages([]);
    try { await markMessagesRead(); } catch (err) { console.error('markMessagesRead:', err); }
  }

  return (
    <div className="personal-msg" role="status">
      <div className="personal-msg__title">💬 {unreadCount(messages) > 1 ? `${messages.length} recados do seu personal` : 'Recado do seu personal'}</div>
      {messages.slice(0, 3).map(m => <p key={m.id} className="personal-msg__body">{m.body}</p>)}
      <button type="button" className="btn btn--outline btn--sm" onClick={handleRead}>Entendi</button>
    </div>
  );
}
