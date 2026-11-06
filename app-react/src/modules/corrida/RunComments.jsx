import { useEffect, useState } from 'react';
import { useToast } from '../../context/useToast';
import { timeAgo } from '../../lib/inbox';
import { trackEvent } from '../../lib/tracking';
import { fetchRunComments, addRunComment, deleteRunComment, reportRunComment, commentError, COMMENT_MAX } from './runs';
import { t } from '../../lib/i18n';

// Comentários de uma corrida do feed. onCount(n) avisa o cartão do total.
export default function RunComments({ run, onCount }) {
  const toast = useToast();
  const [list, setList] = useState(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(null); // { id, action }

  useEffect(() => {
    let alive = true;
    fetchRunComments(run.id)
      .then(rows => { if (alive) { setList(rows); onCount?.(rows.length); } })
      .catch(err => { console.error('fetchRunComments:', err); if (alive) setList([]); });
    return () => { alive = false; };
    // onCount muda a cada render do cartão; a lista só depende da corrida.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run.id]);

  async function handleSend(e) {
    e.preventDefault();
    const body = text.trim();
    if (!body || busy) return;
    setBusy(true);
    try {
      const c = await addRunComment(run.id, body);
      const next = [...(list || []), c];
      setList(next);
      onCount?.(next.length);
      setText('');
      trackEvent('run_comment', run.isMe ? 'propria' : 'amigo');
    } catch (err) {
      console.error('addRunComment:', err);
      toast(commentError(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleAction(c, action) {
    if (confirm?.id !== c.id || confirm.action !== action) { setConfirm({ id: c.id, action }); return; }
    setConfirm(null);
    try {
      if (action === 'delete') {
        await deleteRunComment(c.id);
        const next = list.filter(x => x.id !== c.id);
        setList(next);
        onCount?.(next.length);
      } else {
        await reportRunComment(c.id);
        toast(t('Denúncia enviada. Obrigado por avisar.'));
      }
    } catch (err) {
      console.error('RunComments:', err);
      toast(t('⚠️ Não deu certo agora — tente de novo'));
    }
  }

  return (
    <div className="run-comments">
      {list === null ? <p className="profile-field__hint">{t('Carregando…')}</p> : (
        <>
          {list.length === 0 && <p className="profile-field__hint">{t('Nenhum comentário ainda.')}</p>}
          <ul className="run-comments__list">
            {list.map(c => (
              <li key={c.id} className="run-comments__item">
                <div className="run-comments__head">
                  <strong>{c.isMe ? t('Você') : c.name}</strong>
                  <span>{timeAgo(c.created_at)}</span>
                </div>
                <p className="run-comments__body">{c.body}</p>
                <div className="run-comments__actions">
                  {c.canDelete && (
                    <button type="button" className="run-comments__link" onClick={() => handleAction(c, 'delete')}>
                      {confirm?.id === c.id && confirm.action === 'delete' ? t('Toque de novo para apagar') : t('Apagar')}
                    </button>
                  )}
                  {!c.isMe && (
                    <button type="button" className="run-comments__link" onClick={() => handleAction(c, 'report')}>
                      {confirm?.id === c.id && confirm.action === 'report' ? t('Toque de novo para denunciar') : t('Denunciar')}
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
      <form className="run-comments__form" onSubmit={handleSend}>
        <input
          className="input" maxLength={COMMENT_MAX} value={text} onChange={e => setText(e.target.value)}
          placeholder={run.isMe ? t('Responder…') : t('Comentar a corrida de {v1}…', { v1: run.name })}
          aria-label={t('Escrever comentário')}
        />
        <button type="submit" className="btn btn--primary btn--sm" disabled={busy || !text.trim()}>{busy ? '…' : t('Enviar')}</button>
      </form>
    </div>
  );
}
