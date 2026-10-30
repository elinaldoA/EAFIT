import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  PLATFORMS, STATUS_LABEL, accountLabel, cancelPost, countHashtags, createPost, exerciseVideoList, fetchAccounts, fetchMedia,
  fetchPosts, finalCaption, retryTarget, runPost, validatePost,
} from '../lib/marketing';
import { formatDate } from '../lib/userDetailHelpers';
import Loading from '../components/Loading';
import EmptyState from '../components/EmptyState';

const STATUS_BADGE = { published: 'badge--ok', failed: 'badge--danger', processing: 'badge--warning', pending: '', canceled: '' };

// Mesmo formato do campo datetime-local (fuso do navegador do admin).
function toLocalInputValue(date) {
  const pad = n => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// Marketing → Publicar: um post para várias redes, na hora ou agendado. A fila
// (marketing_post_targets) é processada pela Edge Function marketing; aqui só
// cria o post e acompanha o estado em cada conta.
export default function MarketingPublish() {
  const [accounts, setAccounts] = useState(null);
  const [library, setLibrary] = useState([]);
  const [posts, setPosts] = useState(null);
  const [selectedAccounts, setSelectedAccounts] = useState(() => new Set());
  const [caption, setCaption] = useState('');
  const [media, setMedia] = useState([]);
  const [pickerTab, setPickerTab] = useState('library');
  const [videoQuery, setVideoQuery] = useState('');
  const [when, setWhen] = useState('now');
  const [scheduleAt, setScheduleAt] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const videos = useMemo(() => exerciseVideoList(), []);

  const loadPosts = useCallback(async () => {
    try {
      setPosts(await fetchPosts());
    } catch (err) {
      setMsg(`Erro: ${err.message}`);
      setPosts([]);
    }
  }, []);

  useEffect(() => {
    fetchAccounts().then(list => {
      setAccounts(list);
      setSelectedAccounts(new Set(list.filter(a => a.status === 'ok').map(a => a.id)));
    }).catch(err => { setMsg(`Erro: ${err.message}`); setAccounts([]); });
    fetchMedia().then(setLibrary).catch(() => setLibrary([]));
    loadPosts();
  }, [loadPosts]);

  const byId = useMemo(() => new Map((accounts || []).map(a => [a.id, a])), [accounts]);
  const chosenAccounts = (accounts || []).filter(a => selectedAccounts.has(a.id));
  const platforms = [...new Set(chosenAccounts.map(a => a.platform))];
  const text = finalCaption(caption, media);
  const errors = validatePost({
    caption, media, accounts: chosenAccounts, scheduledAt: when === 'schedule' ? scheduleAt : null,
  });

  function toggleAccount(id) {
    setSelectedAccounts(sel => {
      const next = new Set(sel);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleMedia(item) {
    setMedia(list => (list.some(m => m.url === item.url) ? list.filter(m => m.url !== item.url) : [...list, item]));
  }

  async function handleSubmit() {
    if (errors.length) { setMsg(`Erro: ${errors[0]}`); return; }
    const scheduled = when === 'schedule' ? scheduleAt : null;
    const names = chosenAccounts.map(a => `${PLATFORMS[a.platform].label} ${accountLabel(a)}`).join(', ');
    if (!window.confirm(`${scheduled ? `Agendar para ${new Date(scheduled).toLocaleString('pt-BR')}` : 'Publicar agora'} em: ${names}?`)) return;
    setBusy(true);
    setMsg('');
    try {
      const postId = await createPost({ caption, media, accountIds: chosenAccounts.map(a => a.id), scheduledAt: scheduled });
      if (scheduled) {
        setMsg('Post agendado. Ele sai sozinho no horário.');
      } else {
        const { results = [] } = await runPost(postId);
        const ok = results.filter(r => r.status === 'published').length;
        const wait = results.filter(r => r.status === 'processing' || r.status === 'pending').length;
        const failed = results.filter(r => r.status === 'failed');
        setMsg(failed.length
          ? `Erro: ${failed.length} conta(s) falharam (${failed[0].error}). Publicado em ${ok}.`
          : `Publicado em ${ok} conta(s).${wait ? ` ${wait} ainda processando a mídia na rede: sai em instantes.` : ''}`);
      }
      setCaption('');
      setMedia([]);
      setScheduleAt('');
      setWhen('now');
    } catch (err) {
      setMsg(`Erro: ${err.message}`);
    } finally {
      setBusy(false);
      loadPosts();
    }
  }

  async function handleCancel(post) {
    if (!window.confirm('Cancelar este post agendado?')) return;
    try {
      await cancelPost(post.id);
      await loadPosts();
    } catch (err) {
      setMsg(`Erro: ${err.message}`);
    }
  }

  async function handleRetry(target) {
    try {
      await retryTarget(target.id);
      await runPost(target.post_id).catch(() => {}); // sem isto, o cron pega no próximo minuto
      await loadPosts();
    } catch (err) {
      setMsg(`Erro: ${err.message}`);
    }
  }

  if (!accounts) return <Loading />;

  const shownVideos = videos.filter(v => v.label.toLowerCase().includes(videoQuery.trim().toLowerCase()));
  const pickerItems = pickerTab === 'library'
    ? library.map(m => ({ key: m.id, type: m.kind, url: m.url, credit: m.credit || undefined, label: m.title }))
    : shownVideos.map(v => ({ key: v.slug, type: 'video', url: v.url, credit: v.credit, label: v.label }));

  return (
    <div className="stack">
      <div className="page-header">
        <div>
          <h1 className="page-title">Publicar</h1>
          <p className="page-subtitle">
            Um post para várias redes de uma vez, na hora ou agendado. Instagram e Threads processam a mídia antes de
            publicar: vídeo pode levar alguns minutos.
          </p>
        </div>
      </div>

      {accounts.length === 0 ? (
        <section className="card stack">
          <EmptyState icon="🔌" label="Conecte as redes primeiro." />
          <div className="actions-row"><Link className="btn btn--primary" to="/marketing-contas">Conectar contas</Link></div>
        </section>
      ) : (
        <section className="card stack">
          <div className="field">
            <span className="field__label">Publicar em</span>
            <div className="mkt-chips">
              {accounts.map(a => (
                <label key={a.id} className={`mkt-chip${selectedAccounts.has(a.id) ? ' mkt-chip--on' : ''}`} title={a.status !== 'ok' ? 'Precisa reconectar' : ''}>
                  <input type="checkbox" checked={selectedAccounts.has(a.id)} disabled={a.status !== 'ok'} onChange={() => toggleAccount(a.id)} />
                  {PLATFORMS[a.platform].label} · {accountLabel(a)}
                </label>
              ))}
            </div>
          </div>

          <label className="field">
            <span className="field__label">Legenda</span>
            <textarea className="input" rows={6} value={caption} maxLength={5000} onChange={e => setCaption(e.target.value)}
              placeholder="Conte a novidade, chame para baixar: eafit.com.br/app  #treino #academia" />
          </label>
          <div className="mkt-counters">
            {platforms.map(p => (
              <span key={p} className={text.length > PLATFORMS[p].limit ? 'mkt-over' : ''}>
                {PLATFORMS[p].label}: {text.length}/{PLATFORMS[p].limit}
              </span>
            ))}
            {platforms.includes('instagram') && <span className={countHashtags(text) > 30 ? 'mkt-over' : ''}>hashtags: {countHashtags(text)}/30</span>}
          </div>

          <div className="field">
            <span className="field__label">Mídia ({media.length} escolhida{media.length === 1 ? '' : 's'}: até 10 imagens ou 1 vídeo)</span>
            {media.length > 0 && (
              <div className="mkt-chips">
                {media.map(m => (
                  <button key={m.url} type="button" className="mkt-chip mkt-chip--on" onClick={() => toggleMedia(m)} aria-label={`Tirar ${m.label}`}>
                    {m.type === 'video' ? '🎬' : '🖼️'} {m.label} ✕
                  </button>
                ))}
              </div>
            )}
            <div className="actions-row">
              <button type="button" className={`btn btn--small${pickerTab === 'library' ? '' : ' btn--ghost'}`} onClick={() => setPickerTab('library')}>Minhas mídias ({library.length})</button>
              <button type="button" className={`btn btn--small${pickerTab === 'videos' ? '' : ' btn--ghost'}`} onClick={() => setPickerTab('videos')}>Vídeos de exercício</button>
              {pickerTab === 'videos' && <input className="input search-input" placeholder="Buscar exercício" value={videoQuery} onChange={e => setVideoQuery(e.target.value)} />}
              <Link to="/marketing-midia" className="user-detail__meta">Criar arte com print do app →</Link>
            </div>
            {pickerItems.length === 0
              ? <p className="user-detail__meta">Nada na biblioteca ainda. Crie artes com os prints em Biblioteca de mídia.</p>
              : (
                <div className="mkt-grid mkt-grid--picker">
                  {pickerItems.map(item => {
                    const on = media.some(m => m.url === item.url);
                    return (
                      <button key={item.key} type="button" className={`mkt-tile mkt-pick${on ? ' mkt-tile--active' : ''}`} onClick={() => toggleMedia(item)} aria-pressed={on}>
                        {item.type === 'video'
                          ? <video src={item.url} muted playsInline preload="none" className="mkt-tile__media" />
                          : <img src={item.url} alt="" loading="lazy" className="mkt-tile__media" />}
                        <span className="mkt-pick__label">{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              )}
          </div>

          {text && (
            <div className="field">
              <span className="field__label">Como vai sair</span>
              <pre className="mkt-preview">{text}</pre>
            </div>
          )}

          <div className="actions-row">
            <label><input type="radio" name="when" checked={when === 'now'} onChange={() => setWhen('now')} /> Publicar agora</label>
            <label><input type="radio" name="when" checked={when === 'schedule'} onChange={() => { setWhen('schedule'); if (!scheduleAt) setScheduleAt(toLocalInputValue(new Date(Date.now() + 3600_000))); }} /> Agendar</label>
            {when === 'schedule' && (
              <input className="input" type="datetime-local" value={scheduleAt} min={toLocalInputValue(new Date())} onChange={e => setScheduleAt(e.target.value)} aria-label="Data e hora" />
            )}
          </div>

          {errors.length > 0 && (caption || media.length > 0) && (
            <ul className="form-msg form-msg--error mkt-errors">{errors.map(e => <li key={e}>{e}</li>)}</ul>
          )}
          <div className="actions-row">
            <button type="button" className="btn btn--primary" disabled={busy || errors.length > 0} onClick={handleSubmit}>
              {busy ? 'Enviando…' : when === 'schedule' ? 'Agendar post' : 'Publicar agora'}
            </button>
          </div>
          {msg && <p className={`form-msg ${msg.startsWith('Erro') ? 'form-msg--error' : 'form-msg--ok'}`}>{msg}</p>}
        </section>
      )}

      <section className="card stack">
        <div className="actions-row" style={{ justifyContent: 'space-between' }}>
          <h2 className="section-title">Posts recentes</h2>
          <button type="button" className="btn btn--ghost btn--small" onClick={loadPosts}>Atualizar</button>
        </div>
        {!posts && <Loading />}
        {posts && posts.length === 0 && <EmptyState icon="📣" label="Nenhum post ainda." />}
        {posts && posts.map(p => (
          <article key={p.id} className="mkt-post">
            <div className="mkt-post__head">
              <span className="user-detail__meta">
                {p.scheduled_at ? `agendado para ${formatDate(p.scheduled_at)}` : `criado em ${formatDate(p.created_at)}`}
                {p.media?.length ? ` · ${p.media.length} mídia(s)` : ''}
              </span>
              {p.targets.some(t => t.status === 'pending') && p.scheduled_at && (
                <button type="button" className="btn btn--ghost btn--small" onClick={() => handleCancel(p)}>Cancelar</button>
              )}
            </div>
            <p className="mkt-post__caption">{p.caption || <em>(sem legenda)</em>}</p>
            <ul className="mkt-targets">
              {p.targets.map(t => {
                const a = byId.get(t.account_id);
                return (
                  <li key={t.id}>
                    <span>{a ? `${PLATFORMS[a.platform].label} ${accountLabel(a)}` : 'Conta removida'}</span>
                    <span className={`badge ${STATUS_BADGE[t.status] || ''}`}>{STATUS_LABEL[t.status] || t.status}</span>
                    {t.permalink && <a href={t.permalink} target="_blank" rel="noreferrer">ver post</a>}
                    {t.status === 'failed' && (
                      <>
                        <span className="user-detail__meta">{t.error}</span>
                        <button type="button" className="btn btn--small" onClick={() => handleRetry({ ...t, post_id: p.id })}>Tentar de novo</button>
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
          </article>
        ))}
      </section>
    </div>
  );
}
