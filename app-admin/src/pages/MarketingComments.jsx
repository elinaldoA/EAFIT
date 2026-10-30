import { useCallback, useEffect, useState } from 'react';
import {
  PLATFORMS, QUICK_REPLIES, accountLabel, fetchComments, fillReply, hideComment, replyComment, syncComments,
} from '../lib/marketing';
import { formatDate } from '../lib/userDetailHelpers';
import Loading from '../components/Loading';
import EmptyState from '../components/EmptyState';

const FILTERS = [
  { key: 'open', label: 'Sem resposta' },
  { key: 'all', label: 'Todos' },
  { key: 'hidden', label: 'Ocultos' },
];

// Marketing → Comentários: o que chegou nos últimos posts de cada rede
// (sincroniza a cada 15 min ou no botão), com resposta e ocultar direto daqui.
export default function MarketingComments() {
  const [filter, setFilter] = useState('open');
  const [platform, setPlatform] = useState('');
  const [comments, setComments] = useState(null);
  const [drafts, setDrafts] = useState({});
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    setComments(null);
    try {
      setComments(await fetchComments({ filter, platform }));
    } catch (err) {
      setMsg(`Erro: ${err.message}`);
      setComments([]);
    }
  }, [filter, platform]);
  useEffect(() => { load(); }, [load]);

  async function handleSync() {
    setBusy('sync');
    setMsg('');
    try {
      const { results = [] } = await syncComments();
      const failed = results.filter(r => r.error);
      setMsg(failed.length ? `Erro: ${failed.length} conta(s) não atualizaram (${failed[0].error}).` : 'Comentários atualizados.');
      await load();
    } catch (err) {
      setMsg(`Erro: ${err.message}`);
    } finally {
      setBusy('');
    }
  }

  async function handleReply(c) {
    const text = (drafts[c.id] || '').trim();
    if (!text) return;
    setBusy(c.id);
    setMsg('');
    try {
      await replyComment(c.id, text);
      setDrafts(d => ({ ...d, [c.id]: '' }));
      setMsg(`Resposta publicada para ${c.author}.`);
      await load();
    } catch (err) {
      setMsg(`Erro: ${err.message}`);
    } finally {
      setBusy('');
    }
  }

  async function handleHide(c) {
    setBusy(c.id);
    setMsg('');
    try {
      await hideComment(c.id, !c.hidden);
      await load();
    } catch (err) {
      setMsg(`Erro: ${err.message}`);
    } finally {
      setBusy('');
    }
  }

  return (
    <div className="stack">
      <div className="page-header">
        <div>
          <h1 className="page-title">Comentários</h1>
          <p className="page-subtitle">
            Comentários dos últimos 10 posts de cada rede conectada. Atualiza sozinho a cada 15 minutos. Ocultar some o
            comentário para o público, mas quem escreveu continua vendo.
          </p>
        </div>
        <button type="button" className="btn" disabled={busy === 'sync'} onClick={handleSync}>
          {busy === 'sync' ? 'Atualizando…' : 'Atualizar agora'}
        </button>
      </div>

      <div className="actions-row">
        {FILTERS.map(f => (
          <button key={f.key} type="button" className={`btn btn--small${filter === f.key ? '' : ' btn--ghost'}`} onClick={() => setFilter(f.key)}>
            {f.label}
          </button>
        ))}
        <select className="input" value={platform} onChange={e => setPlatform(e.target.value)} aria-label="Rede">
          <option value="">Todas as redes</option>
          {Object.entries(PLATFORMS).map(([k, p]) => <option key={k} value={k}>{p.label}</option>)}
        </select>
      </div>

      {msg && <p className={`form-msg ${msg.startsWith('Erro') ? 'form-msg--error' : 'form-msg--ok'}`}>{msg}</p>}
      {!comments && <Loading />}
      {comments && comments.length === 0 && (
        <EmptyState icon="💬" label={filter === 'open' ? 'Tudo respondido por aqui.' : 'Nenhum comentário.'} />
      )}

      {comments && comments.map(c => (
        <article key={c.id} className="card stack mkt-comment">
          <div className="mkt-post__head">
            <span>
              <strong>{c.author || 'Alguém'}</strong>
              <span className="user-detail__meta"> · {PLATFORMS[c.account?.platform]?.label} {accountLabel(c.account)} · {formatDate(c.commented_at)}</span>
            </span>
            <span className="actions-row">
              {c.answered && <span className="badge badge--ok">Respondido</span>}
              {c.hidden && <span className="badge badge--warning">Oculto</span>}
            </span>
          </div>
          <p className="mkt-comment__text">{c.text}</p>
          <p className="user-detail__meta">
            No post: “{(c.post_caption || '').slice(0, 120)}{(c.post_caption || '').length > 120 ? '…' : ''}”
            {c.post_permalink && <> · <a href={c.post_permalink} target="_blank" rel="noreferrer">abrir na rede</a></>}
          </p>
          {c.reply_text && <p className="mkt-reply">↳ {c.reply_text} <span className="user-detail__meta">({formatDate(c.replied_at)})</span></p>}

          <div className="mkt-chips">
            {QUICK_REPLIES.map(t => (
              <button key={t} type="button" className="mkt-chip" onClick={() => setDrafts(d => ({ ...d, [c.id]: fillReply(t, c.author) }))}>
                {fillReply(t, c.author).slice(0, 40)}…
              </button>
            ))}
          </div>
          <textarea className="input" rows={2} maxLength={2000} placeholder="Escreva a resposta" aria-label={`Resposta para ${c.author}`}
            value={drafts[c.id] || ''} onChange={e => setDrafts(d => ({ ...d, [c.id]: e.target.value }))} />
          <div className="actions-row">
            <button type="button" className="btn btn--primary btn--small" disabled={busy === c.id || !(drafts[c.id] || '').trim()} onClick={() => handleReply(c)}>
              Responder
            </button>
            <button type="button" className="btn btn--ghost btn--small" disabled={busy === c.id} onClick={() => handleHide(c)}>
              {c.hidden ? 'Mostrar de novo' : 'Ocultar'}
            </button>
          </div>
        </article>
      ))}
    </div>
  );
}
