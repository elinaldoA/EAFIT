import { useCallback, useEffect, useState } from 'react';
import {
  addQueueItem, fetchAutopost, moveQueueItem, queuePosition, removeQueueItem, restoreQueueItem, splitCaption, updateQueueCaption,
} from '../lib/marketing';
import Loading from './Loading';

const FORMATS = [
  { key: 'feed', label: 'Feed', hour: '12h' },
  { key: 'reel', label: 'Reels', hour: '17h' },
  { key: 'story', label: 'Stories', hour: '19h' },
];

function Thumb({ media = [] }) {
  const first = media[0];
  if (!first) return <span className="mkt-row__thumb mkt-row__thumb--empty" aria-hidden="true" />;
  return first.type === 'video'
    ? <video className="mkt-row__thumb" src={`${first.url}#t=1`} muted playsInline preload="metadata" />
    : <img className="mkt-row__thumb" src={first.url} alt="" loading="lazy" />;
}

// Aba "Fila": edita o que a publicação automática ainda vai publicar (legenda,
// ordem, remover, repor o que foi pulado) e adiciona itens novos ao fim.
// `library` é a biblioteca de mídia (imagens e vídeos) da página.
export default function MarketingQueue({ library = [] }) {
  const [state, setState] = useState(null);
  const [editing, setEditing] = useState(null); // { id, text }
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ format: 'feed', caption: '', media: [] });

  const load = useCallback(async () => {
    try {
      setState(await fetchAutopost());
    } catch {
      setState(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  if (state === null) return <Loading />;
  if (state === false) return <p className="user-detail__meta">A fila automática ainda não está disponível neste ambiente.</p>;

  async function run(key, fn, ok) {
    setBusy(key);
    setMsg('');
    try {
      await fn();
      if (ok) setMsg(ok);
      await load();
    } catch (err) {
      setMsg(`Erro: ${err.message}`);
    } finally {
      setBusy('');
    }
  }

  function toggleMedia(item) {
    setDraft(d => {
      const has = d.media.some(m => m.url === item.url);
      return { ...d, media: has ? d.media.filter(m => m.url !== item.url) : [...d.media, { type: item.kind, url: item.url, title: item.title }] };
    });
  }

  async function submitAdd() {
    await run('add', async () => {
      await addQueueItem(draft);
      setDraft({ format: 'feed', caption: '', media: [] });
      setAdding(false);
    }, 'Item adicionado ao fim da fila.');
  }

  const pickable = library.filter(m => (draft.format === 'reel' ? m.kind === 'video' : true));

  const itemRow = item => {
    const pos = queuePosition(state.pending, item);
    const { body, tags } = splitCaption(item.caption);
    const isEditing = editing?.id === item.id;
    return (
      <li key={item.id} className="mkt-row mkt-row--queue">
        <div className="mkt-row__time">#{pos.number}</div>
        <Thumb media={item.media} />
        <div className="mkt-row__main">
          {isEditing ? (
            <>
              <textarea className="input" rows={6} value={editing.text} maxLength={5000} aria-label="Legenda"
                onChange={e => setEditing({ id: item.id, text: e.target.value })} />
              <div className="actions-row">
                <button type="button" className="btn btn--primary btn--small" disabled={busy === item.id}
                  onClick={() => run(item.id, async () => { await updateQueueCaption(item.id, editing.text); setEditing(null); }, 'Legenda salva.')}>Salvar</button>
                <button type="button" className="btn btn--ghost btn--small" onClick={() => setEditing(null)}>Cancelar</button>
              </div>
            </>
          ) : (
            <>
              <div className="mkt-row__caption">{item.format === 'story' ? 'Story: só a imagem, sem legenda.' : (body.split('\n')[0] || '(sem legenda)')}</div>
              {item.format !== 'story' && (
                <details className="mkt-row__more">
                  <summary>Legenda e hashtags</summary>
                  <div className="mkt-planned__caption">{body}</div>
                  {tags.length > 0 && <div className="user-detail__meta">Hashtags: {tags.join(' ')}</div>}
                </details>
              )}
              {item.media?.length > 1 && <span className="user-detail__meta">carrossel de {item.media.length} imagens</span>}
              <div className="actions-row">
                <button type="button" className="btn btn--ghost btn--small" aria-label={`Subir item ${pos.number} de ${item.format}`}
                  disabled={pos.first || busy === item.id} onClick={() => run(item.id, () => moveQueueItem(item.id, 'up'))}>↑ Subir</button>
                <button type="button" className="btn btn--ghost btn--small" aria-label={`Descer item ${pos.number} de ${item.format}`}
                  disabled={pos.last || busy === item.id} onClick={() => run(item.id, () => moveQueueItem(item.id, 'down'))}>↓ Descer</button>
                {item.format !== 'story' && (
                  <button type="button" className="btn btn--ghost btn--small" onClick={() => setEditing({ id: item.id, text: item.caption })}>Editar legenda</button>
                )}
                <button type="button" className="btn btn--danger btn--small" disabled={busy === item.id}
                  onClick={() => { if (window.confirm('Remover este item da fila?')) run(item.id, () => removeQueueItem(item.id), 'Item removido.'); }}>Remover</button>
              </div>
            </>
          )}
        </div>
      </li>
    );
  };

  return (
    <div className="stack">
      <section className="card stack">
        <div className="actions-row" style={{ justifyContent: 'space-between' }}>
          <h2 className="section-title">Fila da publicação automática</h2>
          <button type="button" className="btn btn--primary btn--small" onClick={() => setAdding(a => !a)}>{adding ? 'Fechar' : 'Adicionar à fila'}</button>
        </div>
        <p className="user-detail__meta">
          O que está aqui sai sozinho, um de cada formato por dia, na ordem da lista. Só dá para mexer no que ainda não saiu.
          Os horários são fixos: feed 12h, Reel 17h e story 19h.
        </p>
        {msg && <p className={`form-msg ${msg.startsWith('Erro') ? 'form-msg--error' : 'form-msg--ok'}`}>{msg}</p>}

        {adding && (
          <div className="stack mkt-art">
            <div className="field">
              <span className="field__label">Formato</span>
              <div className="actions-row">
                {FORMATS.map(f => (
                  <label key={f.key}>
                    <input type="radio" name="queue-format" checked={draft.format === f.key}
                      onChange={() => setDraft({ format: f.key, caption: draft.caption, media: [] })} /> {f.label.replace(/s$/, '')}
                  </label>
                ))}
              </div>
            </div>
            {draft.format !== 'story' && (
              <label className="field">
                <span className="field__label">Legenda</span>
                <textarea className="input" rows={5} value={draft.caption} maxLength={5000}
                  onChange={e => setDraft({ ...draft, caption: e.target.value })} placeholder="Texto e hashtags do post" />
              </label>
            )}
            <div className="field">
              <span className="field__label">
                Mídia ({draft.media.length} escolhida{draft.media.length === 1 ? '' : 's'}:
                {draft.format === 'story' ? ' 1 imagem ou vídeo' : draft.format === 'reel' ? ' 1 vídeo' : ' até 10 imagens ou 1 vídeo'})
              </span>
              {pickable.length === 0
                ? <p className="user-detail__meta">Nada na biblioteca para este formato. Envie em “Biblioteca de mídia”.</p>
                : (
                  <div className="mkt-grid mkt-grid--picker">
                    {pickable.map(m => {
                      const on = draft.media.some(x => x.url === m.url);
                      return (
                        <button key={m.id} type="button" className={`mkt-tile mkt-pick${on ? ' mkt-tile--active' : ''}`} aria-pressed={on}
                          onClick={() => toggleMedia(m)}>
                          {m.kind === 'video'
                            ? <video src={m.url} muted playsInline preload="none" className="mkt-tile__media" />
                            : <img src={m.url} alt="" loading="lazy" className="mkt-tile__media" />}
                          <span className="mkt-pick__label">{m.title}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
            </div>
            <div className="actions-row">
              <button type="button" className="btn btn--primary" disabled={busy === 'add' || draft.media.length === 0} onClick={submitAdd}>
                {busy === 'add' ? 'Adicionando…' : 'Adicionar ao fim da fila'}
              </button>
            </div>
          </div>
        )}
      </section>

      {FORMATS.map(f => {
        const items = state.pending.filter(i => i.format === f.key);
        return (
          <section key={f.key} className="card stack" aria-label={f.label}>
            <h3 className="section-title">{f.label} · todo dia às {f.hour} ({items.length} na fila)</h3>
            {items.length === 0 && <p className="user-detail__meta">Fila vazia: nada mais sai deste formato.</p>}
            <ul className="mkt-list">{items.map(itemRow)}</ul>
          </section>
        );
      })}

      {state.skipped?.length > 0 && (
        <section className="card stack" aria-label="Pulados por repetição">
          <h3 className="section-title">Pulados por repetição ({state.skipped.length})</h3>
          <p className="user-detail__meta">Esses itens tinham a mesma mídia ou legenda de um post já feito. Mude a legenda antes de repor.</p>
          <ul className="mkt-list">
            {state.skipped.filter(i => !i.posted_at).map(item => (
              <li key={item.id} className="mkt-row mkt-row--queue">
                <div className="mkt-row__time">pulado</div>
                <Thumb media={item.media} />
                <div className="mkt-row__main">
                  <div className="mkt-row__caption">{item.format === 'story' ? 'Story' : (splitCaption(item.caption).body.split('\n')[0] || '(sem legenda)')}</div>
                  <div className="actions-row">
                    {item.format !== 'story' && (
                      <button type="button" className="btn btn--ghost btn--small" onClick={() => setEditing({ id: item.id, text: item.caption })}>Editar legenda</button>
                    )}
                    <button type="button" className="btn btn--small" disabled={busy === item.id}
                      onClick={() => run(item.id, () => restoreQueueItem(item.id), 'Item reposto no fim da fila.')}>Repor na fila</button>
                    <button type="button" className="btn btn--danger btn--small" disabled={busy === item.id}
                      onClick={() => { if (window.confirm('Remover este item?')) run(item.id, () => removeQueueItem(item.id), 'Item removido.'); }}>Remover</button>
                  </div>
                  {editing?.id === item.id && (
                    <>
                      <textarea className="input" rows={5} value={editing.text} maxLength={5000} aria-label="Legenda"
                        onChange={e => setEditing({ id: item.id, text: e.target.value })} />
                      <div className="actions-row">
                        <button type="button" className="btn btn--primary btn--small"
                          onClick={() => run(item.id, async () => { await updateQueueCaption(item.id, editing.text); setEditing(null); }, 'Legenda salva e item reposto.')}>Salvar e repor</button>
                        <button type="button" className="btn btn--ghost btn--small" onClick={() => setEditing(null)}>Cancelar</button>
                      </div>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
