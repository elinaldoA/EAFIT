import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  EMPTY_TIKTOK, PLATFORMS, STATUS_LABEL, accountLabel, cancelPost, countHashtags, createPost, deletePost, editPost, editSummary, exerciseVideoList, fetchAccounts,
  fetchMedia, fetchPosts, fetchTikTokCreator, finalCaption, retryTarget, runPost, validatePost,
} from '../lib/marketing';
import { formatDate } from '../lib/userDetailHelpers';
import Loading from '../components/Loading';
import EmptyState from '../components/EmptyState';
import MarketingTikTokOptions from '../components/MarketingTikTokOptions';
import MarketingAutopost from '../components/MarketingAutopost';
import MarketingQueue from '../components/MarketingQueue';

const NO_STORIES = ['threads', 'tiktok'];

const TABS = [
  { key: 'agenda', label: 'Agenda' },
  { key: 'fila', label: 'Fila' },
  { key: 'novo', label: 'Novo post' },
  { key: 'historico', label: 'Histórico' },
];
const HISTORY_FILTERS = [
  { key: 'todos', label: 'Todos', test: () => true },
  { key: 'agendados', label: 'Agendados', test: p => Boolean(p.scheduled_at) && p.targets.some(t => t.status === 'pending') },
  { key: 'problema', label: 'Com problema', test: p => p.targets.some(t => t.status === 'failed') },
  { key: 'publicados', label: 'Publicados', test: p => p.targets.length > 0 && p.targets.every(t => t.status === 'published') },
];

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
  const [params, setParams] = useSearchParams();
  const tab = TABS.some(t => t.key === params.get('aba')) ? params.get('aba') : 'agenda';
  const setTab = key => setParams(key === 'agenda' ? {} : { aba: key }, { replace: true });
  const [historyFilter, setHistoryFilter] = useState('todos');
  const [accounts, setAccounts] = useState(null);
  const [library, setLibrary] = useState([]);
  const [posts, setPosts] = useState(null);
  const [selectedAccounts, setSelectedAccounts] = useState(() => new Set());
  const [format, setFormat] = useState('feed');
  const [caption, setCaption] = useState('');
  const [media, setMedia] = useState([]);
  const [pickerTab, setPickerTab] = useState('library');
  const [videoQuery, setVideoQuery] = useState('');
  const [when, setWhen] = useState('now');
  const [scheduleAt, setScheduleAt] = useState('');
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState('');
  const [editing, setEditing] = useState(null); // { id, text }
  const [editBusy, setEditBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [msg, setMsg] = useState('');
  const [tiktok, setTiktok] = useState(EMPTY_TIKTOK);
  const [tiktokInfo, setTiktokInfo] = useState(null); // { accountId, creator?, publicPosts?, error? }
  const [videoDuration, setVideoDuration] = useState(null);
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
      // O TikTok não vem marcado: só posta com a conta privada até a auditoria do app.
      setSelectedAccounts(new Set(list.filter(a => a.status === 'ok' && a.platform !== 'tiktok').map(a => a.id)));
    }).catch(err => { setMsg(`Erro: ${err.message}`); setAccounts([]); });
    fetchMedia().then(setLibrary).catch(() => setLibrary([]));
    loadPosts();
  }, [loadPosts]);

  const byId = useMemo(() => new Map((accounts || []).map(a => [a.id, a])), [accounts]);
  const chosenAccounts = (accounts || []).filter(a => selectedAccounts.has(a.id));
  const platforms = [...new Set(chosenAccounts.map(a => a.platform))];
  const story = format === 'story';
  const text = story ? '' : finalCaption(caption, media);
  const tiktokAccount = story ? null : chosenAccounts.find(a => a.platform === 'tiktok');
  const tiktokReady = tiktokInfo && tiktokInfo.accountId === tiktokAccount?.id;
  const errors = validatePost({
    caption, media, accounts: chosenAccounts, scheduledAt: when === 'schedule' ? scheduleAt : null, format,
    tiktok, tiktokCreator: tiktokReady ? tiktokInfo.creator : null, videoDuration,
  });
  if (tiktokAccount && !(tiktokReady && tiktokInfo.creator)) {
    errors.push(tiktokReady && tiktokInfo.error ? `TikTok: ${tiktokInfo.error}` : 'TikTok: aguarde os dados da conta.');
  }

  // Regra do TikTok: mostrar a conta e as opções dela antes de postar.
  const tiktokId = tiktokAccount?.id;
  useEffect(() => {
    if (!tiktokId) return;
    let alive = true;
    setTiktokInfo({ accountId: tiktokId });
    fetchTikTokCreator(tiktokId)
      .then(r => { if (alive) setTiktokInfo({ accountId: tiktokId, creator: r.creator, publicPosts: r.publicPosts }); })
      .catch(err => { if (alive) setTiktokInfo({ accountId: tiktokId, error: err.message }); });
    return () => { alive = false; };
  }, [tiktokId]);

  // Threads e TikTok não têm stories: ao trocar para story, saem da seleção.
  function chooseFormat(next) {
    setFormat(next);
    if (next === 'story') {
      setSelectedAccounts(sel => new Set([...sel].filter(id => !NO_STORIES.includes(byId.get(id)?.platform))));
    }
  }

  function toggleAccount(id) {
    setSelectedAccounts(sel => {
      const next = new Set(sel);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleMedia(item) {
    setVideoDuration(null);
    setMedia(list => (list.some(m => m.url === item.url) ? list.filter(m => m.url !== item.url) : [...list, item]));
  }

  async function handleSubmit() {
    if (errors.length) { setMsg(`Erro: ${errors[0]}`); return; }
    const scheduled = when === 'schedule' ? scheduleAt : null;
    const names = chosenAccounts.map(a => `${PLATFORMS[a.platform].label} ${accountLabel(a)}`).join(', ');
    const what = story ? 'story' : 'post';
    if (!window.confirm(`${scheduled ? `Agendar ${what} para ${new Date(scheduled).toLocaleString('pt-BR')}` : `Publicar ${what} agora`} em: ${names}?`)) return;
    setBusy(true);
    setMsg('');
    try {
      const postId = await createPost({
        caption, media, accountIds: chosenAccounts.map(a => a.id), scheduledAt: scheduled, format, tiktok: tiktokAccount ? tiktok : null,
      });
      if (scheduled) {
        setMsg(story ? 'Story agendado. Ele sai sozinho no horário.' : 'Post agendado. Ele sai sozinho no horário.');
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
      setTiktok(EMPTY_TIKTOK);
      setVideoDuration(null);
      setScheduleAt('');
      setWhen('now');
    } catch (err) {
      setMsg(`Erro: ${err.message}`);
    } finally {
      setBusy(false);
      loadPosts();
    }
  }

  async function handleRefresh() {
    setRefreshing(true);
    setMsg('');
    await loadPosts();
    setRefreshing(false);
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

  async function handleDelete(post) {
    const live = post.targets.filter(t => t.status === 'published').length;
    const question = live
      ? `Excluir este post? Ele será apagado em ${live} rede(s), com curtidas e comentários. Não dá para desfazer.`
      : 'Remover este post do painel?';
    if (!window.confirm(question)) return;
    setDeleting(post.id);
    setMsg('');
    try {
      const { removed, results = [] } = await deletePost(post.id);
      const failed = results.filter(r => !r.ok);
      setMsg(removed ? 'Post excluído.' : `Erro: ${failed.length} rede(s) não excluíram (${failed[0]?.error}).`);
    } catch (err) {
      setMsg(`Erro: ${err.message}`);
    } finally {
      setDeleting('');
      loadPosts();
    }
  }

  async function handleEdit(post) {
    const text = editing.text.trim();
    if (!text) { setMsg('Erro: escreva a legenda.'); return; }
    setEditBusy(true);
    setMsg('');
    try {
      const { changed, results = [] } = await editPost(post.id, text);
      setMsg(`${changed ? '' : 'Erro: '}${editSummary(post, results, byId)}`);
      if (changed) setEditing(null);
    } catch (err) {
      setMsg(`Erro: ${err.message}`);
    } finally {
      setEditBusy(false);
      loadPosts();
    }
  }

  // Instagram e Threads não deixam editar: apaga nas redes e publica de novo com a legenda nova.
  async function handleRepost(post) {
    const text = editing.text.trim();
    if (!text) { setMsg('Erro: escreva a legenda.'); return; }
    const accountIds = post.targets.map(t => t.account_id).filter(id => byId.get(id) && byId.get(id).status === 'ok' && byId.get(id).platform !== 'tiktok');
    if (!accountIds.length) { setMsg('Erro: nenhuma conta conectada para republicar.'); return; }
    const live = post.targets.filter(t => t.status === 'published').length;
    if (!window.confirm(`Excluir este post em ${live} rede(s) e publicar de novo com a legenda nova? Curtidas, comentários e visualizações do post atual serão perdidos. Não dá para desfazer.`)) return;
    setEditBusy(true);
    setMsg('');
    try {
      const { removed, results = [] } = await deletePost(post.id);
      if (!removed) {
        const failed = results.filter(r => !r.ok);
        throw new Error(`${failed.length} rede(s) não excluíram (${failed[0]?.error}). Nada foi republicado.`);
      }
      const postId = await createPost({ caption: text, media: post.media, accountIds, format: post.format });
      const { results: sent = [] } = await runPost(postId);
      const bad = sent.filter(r => r.status === 'failed');
      setMsg(bad.length ? `Erro: republicado, mas ${bad.length} conta(s) falharam (${bad[0].error}).` : 'Excluído e republicado com a legenda nova.');
      setEditing(null);
    } catch (err) {
      setMsg(`Erro: ${err.message}`);
    } finally {
      setEditBusy(false);
      loadPosts();
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

  // Ações de um post já publicado (Histórico e Agenda).
  const postButtons = p => (
    <>
      {p.targets.some(t => t.status === 'pending') && p.scheduled_at && (
        <button type="button" className="btn btn--ghost btn--small" onClick={() => handleCancel(p)}>Cancelar</button>
      )}
      {p.format !== 'story' && p.targets.some(t => t.status === 'published') && (
        <button type="button" className="btn btn--ghost btn--small" onClick={() => setEditing({ id: p.id, text: p.caption || '' })}>Editar legenda</button>
      )}
      <button type="button" className="btn btn--danger btn--small" disabled={deleting === p.id} onClick={() => handleDelete(p)}>
        {deleting === p.id ? 'Excluindo…' : 'Excluir'}
      </button>
    </>
  );

  const postEditor = p => (
    editing?.id === p.id && (
      <div className="stack mkt-edit">
        <textarea className="input" rows={6} value={editing.text} maxLength={5000} aria-label="Nova legenda"
          onChange={e => setEditing({ id: p.id, text: e.target.value })} />
        <p className="user-detail__meta">
          No Facebook a legenda muda na hora. Instagram e Threads não permitem editar um post publicado: para eles,
          use “Excluir e republicar” (as curtidas e os comentários do post atual se perdem).
        </p>
        <div className="actions-row">
          <button type="button" className="btn btn--primary btn--small" disabled={editBusy} onClick={() => handleEdit(p)}>
            {editBusy ? 'Salvando…' : 'Salvar nas redes que permitem'}
          </button>
          <button type="button" className="btn btn--danger btn--small" disabled={editBusy} onClick={() => handleRepost(p)}>Excluir e republicar</button>
          <button type="button" className="btn btn--ghost btn--small" disabled={editBusy} onClick={() => setEditing(null)}>Cancelar</button>
        </div>
      </div>
    )
  );

  if (!accounts) return <Loading />;

  const shownVideos = videos.filter(v => v.label.toLowerCase().includes(videoQuery.trim().toLowerCase()));
  const pickerItems = pickerTab === 'library'
    ? library.map(m => ({ key: m.id, type: m.kind, url: m.url, credit: m.credit || undefined, label: m.title }))
    : shownVideos.map(v => ({ key: v.slug, type: 'video', url: v.url, credit: v.credit, label: v.label }));

  const problemCount = (posts || []).filter(p => p.targets.some(t => t.status === 'failed')).length;
  const filterDef = HISTORY_FILTERS.find(f => f.key === historyFilter) || HISTORY_FILTERS[0];
  const shownPosts = (posts || []).filter(filterDef.test);

  return (
    <div className="stack">
      <div className="page-header">
        <div>
          <h1 className="page-title">Publicar</h1>
          <p className="page-subtitle">
            Veja o que vai ao ar, publique um post ou story novo e acompanhe o que já saiu. Instagram e Threads processam
            a mídia antes de publicar: vídeo pode levar alguns minutos.
          </p>
        </div>
      </div>


      <div className="tabs" role="tablist" aria-label="Publicações">
        {TABS.map(t => (
          <button key={t.key} type="button" role="tab" aria-selected={tab === t.key}
            className={`tabs__btn${tab === t.key ? ' tabs__btn--active' : ''}`} onClick={() => setTab(t.key)}>
            {t.label}
            {t.key === 'historico' && problemCount > 0 && <> <span className="badge badge--danger">{problemCount}</span></>}
          </button>
        ))}
      </div>

      {tab === 'agenda' && (
        <>
          {msg && <p className={`form-msg ${msg.startsWith('Erro') ? 'form-msg--error' : 'form-msg--ok'}`}>{msg}</p>}
          <MarketingAutopost
            posts={posts || []} accounts={accounts || []} onOpenHistory={() => setTab('historico')}
            renderTools={p => (
              <>
                <div className="actions-row">{postButtons(p)}</div>
                {postEditor(p)}
              </>
            )} />
        </>
      )}

      {tab === 'fila' && <MarketingQueue library={library} />}

      {tab === 'novo' && (accounts.length === 0 ? (
        <section className="card stack">
          <EmptyState icon="🔌" label="Conecte as redes primeiro." />
          <div className="actions-row"><Link className="btn btn--primary" to="/marketing-contas">Conectar contas</Link></div>
        </section>
      ) : (
        <>
          <section className="card mkt-step">
            <h2 className="mkt-step__title"><span className="mkt-step__n">1</span> Onde e como publicar</h2>
          <div className="field">
            <span className="field__label">Formato</span>
            <div className="actions-row">
              <label><input type="radio" name="format" checked={!story} onChange={() => chooseFormat('feed')} /> Post no feed</label>
              <label><input type="radio" name="format" checked={story} onChange={() => chooseFormat('story')} /> Story</label>
            </div>
          </div>

          <div className="field">
            <span className="field__label">Publicar em</span>
            <div className="mkt-chips">
              {accounts.map(a => {
                const blocked = a.status !== 'ok' || (story && NO_STORIES.includes(a.platform));
                return (
                  <label key={a.id} className={`mkt-chip${selectedAccounts.has(a.id) ? ' mkt-chip--on' : ''}`}
                    title={a.status !== 'ok' ? 'Precisa reconectar' : blocked ? `${PLATFORMS[a.platform].label} não tem stories` : ''}>
                    <input type="checkbox" checked={selectedAccounts.has(a.id)} disabled={blocked} onChange={() => toggleAccount(a.id)} />
                    {PLATFORMS[a.platform].label} · {accountLabel(a)}
                  </label>
                );
              })}
            </div>
          </div>
          </section>

          <section className="card mkt-step">
            <h2 className="mkt-step__title"><span className="mkt-step__n">2</span> Conteúdo</h2>
          {story ? (
            <p className="user-detail__meta">
              Story não tem legenda: o texto vai na própria arte. Use imagem ou vídeo em pé (9:16, como as artes “Story ·” e os
              Reels da biblioteca); vídeo de story no Instagram vai até 60 segundos.
            </p>
          ) : (
            <>
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
            </>
          )}

          <div className="field">
            <span className="field__label">
              Mídia ({media.length} escolhida{media.length === 1 ? '' : 's'}: {story ? '1 imagem ou 1 vídeo' : 'até 10 imagens ou 1 vídeo'})
            </span>
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

          {tiktokAccount && (
            <MarketingTikTokOptions
              creator={tiktokReady ? tiktokInfo.creator : null} publicPosts={tiktokReady ? tiktokInfo.publicPosts : true}
              error={tiktokReady ? tiktokInfo.error : ''} value={tiktok} onChange={setTiktok}
              video={media.length === 1 && media[0].type === 'video' ? media[0] : null} onDuration={setVideoDuration} />
          )}

          {text && (
            <div className="field">
              <span className="field__label">Como vai sair</span>
              <pre className="mkt-preview">{text}</pre>
            </div>
          )}
          </section>

          <section className="card mkt-step">
            <h2 className="mkt-step__title"><span className="mkt-step__n">3</span> Quando publicar</h2>
          <div className="actions-row">
            <label><input type="radio" name="when" checked={when === 'now'} onChange={() => setWhen('now')} /> Publicar agora</label>
            <label><input type="radio" name="when" checked={when === 'schedule'} onChange={() => { setWhen('schedule'); if (!scheduleAt) setScheduleAt(toLocalInputValue(new Date(Date.now() + 3600_000))); }} /> Agendar</label>
            {when === 'schedule' && (
              <input className="input" type="datetime-local" value={scheduleAt} min={toLocalInputValue(new Date())} onChange={e => setScheduleAt(e.target.value)} aria-label="Data e hora" />
            )}
          </div>

          {errors.length > 0 && (caption || media.length > 0 || story) && (
            <ul className="form-msg form-msg--error mkt-errors">{errors.map(e => <li key={e}>{e}</li>)}</ul>
          )}
          <div className="actions-row">
            <button type="button" className="btn btn--primary" disabled={busy || errors.length > 0} onClick={handleSubmit}>
              {busy ? 'Enviando…' : when === 'schedule' ? (story ? 'Agendar story' : 'Agendar post') : 'Publicar agora'}
            </button>
          </div>
          {msg && <p className={`form-msg ${msg.startsWith('Erro') ? 'form-msg--error' : 'form-msg--ok'}`}>{msg}</p>}
          </section>
        </>
      ))}

      {tab === 'historico' && (
      <section className="card stack">
          <div className="actions-row" style={{ justifyContent: 'space-between' }}>
            <h2 className="section-title">Histórico de posts</h2>
            <button type="button" className="btn btn--ghost btn--small" disabled={refreshing} onClick={handleRefresh}>
              {refreshing ? 'Atualizando…' : 'Atualizar'}
            </button>
          </div>
          {msg && <p className={`form-msg ${msg.startsWith('Erro') ? 'form-msg--error' : 'form-msg--ok'}`}>{msg}</p>}
          {posts && posts.length > 0 && (
            <div className="mkt-filter" role="group" aria-label="Filtrar posts">
              {HISTORY_FILTERS.map(f => (
                <button key={f.key} type="button" aria-pressed={historyFilter === f.key}
                  className={`btn btn--small${historyFilter === f.key ? '' : ' btn--ghost'}`} onClick={() => setHistoryFilter(f.key)}>
                  {f.label} ({posts.filter(f.test).length})
                </button>
              ))}
            </div>
          )}
          {!posts && <Loading />}
          {posts && posts.length === 0 && <EmptyState icon="📣" label="Nenhum post ainda." />}
          {posts && posts.length > 0 && shownPosts.length === 0 && <p className="user-detail__meta">Nenhum post nesta situação.</p>}
          {posts && shownPosts.map(p => (
            <article key={p.id} className="mkt-post">
              <div className="mkt-post__head">
                <span className="user-detail__meta">
                  {p.format === 'story' && <span className="badge">Story</span>}{' '}
                  {p.scheduled_at ? `agendado para ${formatDate(p.scheduled_at)}` : `criado em ${formatDate(p.created_at)}`}
                  {p.media?.length ? ` · ${p.media.length} mídia(s)` : ''}
                </span>
                <span className="actions-row">{postButtons(p)}</span>
              </div>
              {p.format !== 'story' && editing?.id !== p.id && <p className="mkt-post__caption">{p.caption || <em>(sem legenda)</em>}</p>}
              {postEditor(p)}
              <ul className="mkt-targets">
                {p.targets.map(t => {
                  const a = byId.get(t.account_id);
                  return (
                    <li key={t.id}>
                      <span>{a ? `${PLATFORMS[a.platform].label} ${accountLabel(a)}` : 'Conta removida'}</span>
                      <span className={`badge ${STATUS_BADGE[t.status] || ''}`}>{STATUS_LABEL[t.status] || t.status}</span>
                      {t.permalink && <a href={t.permalink} target="_blank" rel="noreferrer">ver post</a>}
                      {t.status === 'published' && t.error && <span className="user-detail__meta">{t.error}</span>}
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
      )}
    </div>
  );
}
