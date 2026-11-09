import { useEffect, useState } from 'react';
import { useToast } from '../context/useToast';
import {
  MAX_QUICK_REPLIES, STARTER_REPLIES, fetchQuickReplies, addQuickReply, deleteQuickReply,
  quickLabel, insertReply, friendlyQuickReplyError,
} from '../lib/trainerQuickReplies';

import { t } from '../lib/i18n';
// Respostas prontas do personal: tocar insere o texto na caixa (que segue
// editável); "Salvar como resposta pronta" guarda o que está digitado; "Editar
// lista" apaga. Enquanto ele não salvou nenhuma, mostra 3 sugestões.
// `text`/`setText`: o estado da caixa de quem usa (recado ou conversa).
export default function QuickReplyTools({ text, setText }) {
  const toast = useToast();
  const [replies, setReplies] = useState([]);
  const [managing, setManaging] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    fetchQuickReplies()
      .then(r => { if (active) setReplies(r); })
      .catch(() => { /* migration pendente: segue só com as sugestões */ });
    return () => { active = false; };
  }, []);

  const body = text.trim();
  const alreadySaved = replies.some(r => r.body === body);

  async function handleSave() {
    setError('');
    try {
      await addQuickReply(body);
      setReplies(await fetchQuickReplies());
      toast(t('💾 Resposta pronta salva'));
    } catch (err) {
      setError(friendlyQuickReplyError(err));
    }
  }

  async function handleDelete(reply) {
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
              <button type="button" className="quick-reply__del" aria-label={t('Apagar resposta pronta: {v}', { v: quickLabel(o.body) })} onClick={() => handleDelete(o.reply)}>×</button>
            )}
          </span>
        ))}
        {replies.length > 0 && (
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => setManaging(v => !v)}>
            {managing ? t('Concluir') : t('Editar lista')}
          </button>
        )}
      </div>
      {body && !alreadySaved && replies.length < MAX_QUICK_REPLIES && (
        <button type="button" className="btn btn--ghost btn--sm" style={{ alignSelf: 'flex-start' }} onClick={handleSave}>
          {t('💾 Salvar como resposta pronta')}
        </button>
      )}
      {error && <p className="profile-field__hint text-error" role="alert">{error}</p>}
    </>
  );
}
