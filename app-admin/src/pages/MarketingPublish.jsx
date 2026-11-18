import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useConfirm } from '../context/confirmContext';
import {
  EMPTY_TIKTOK,
  PLATFORMS,
  accountLabel,
  cancelPost,
  createPost,
  deletePost,
  editPost,
  editSummary,
  exerciseVideoList,
  fetchAccounts,
  fetchMedia,
  fetchPosts,
  fetchScheduledPosts,
  fetchTikTokCreator,
  finalCaption,
  retryTarget,
  runPost,
  validatePost,
} from '../lib/marketing';
import Loading from '../components/Loading';
import EmptyState from '../components/EmptyState';
import MarketingAutopost from '../components/MarketingAutopost';
import MarketingQueue from '../components/MarketingQueue';
import { NO_STORIES, POSTS_PAGE, TABS, HISTORY_FILTERS } from '../components/marketingPublish/constants';
import { PostButtons, PostEditor } from '../components/marketingPublish/PostTools';
import PostCard from '../components/marketingPublish/PostCard';
import StepWhere from '../components/marketingPublish/StepWhere';
import StepContent from '../components/marketingPublish/StepContent';
import StepWhen from '../components/marketingPublish/StepWhen';
import HistoryTab from '../components/marketingPublish/HistoryTab';

// Marketing → Publicar: um post para várias redes, na hora ou agendado. A fila
// (marketing_post_targets) é processada pela Edge Function marketing; aqui só
// cria o post e acompanha o estado em cada conta.
export default function MarketingPublish() {
  const ask = useConfirm();
  const [params, setParams] = useSearchParams();
  const tab = TABS.some(t => t.key === params.get('aba')) ? params.get('aba') : 'agenda';
  const setTab = key => { setMsg(''); setParams(key === 'agenda' ? {} : { aba: key }, { replace: true }); };
  const [historyFilter, setHistoryFilter] = useState('todos');
  const [accounts, setAccounts] = useState(null);
  const [library, setLibrary] = useState([]);
  const [posts, setPosts] = useState(null);
  const [postLimit, setPostLimit] = useState(POSTS_PAGE);
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
      // Os mais recentes (histórico) + todos os agendados ainda por sair: a agenda não pode
      // perder um agendamento só porque depois dele foram criados muitos outros posts.
      const [recent, scheduled] = await Promise.all([fetchPosts(postLimit), fetchScheduledPosts().catch(() => [])]);
      const seen = new Set(recent.map(p => p.id));
      setPosts([...recent, ...scheduled.filter(p => !seen.has(p.id))].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)));
    } catch (err) {
      setMsg(`Erro: ${err.message}`);
      setPosts([]);
    }
  }, [postLimit]);

  useEffect(() => {
    fetchAccounts().then(list => {
      setAccounts(list);
      // O TikTok não vem marcado: só posta com a conta privada até a auditoria do app.
      setSelectedAccounts(new Set(list.filter(a => a.status === 'ok' && a.platform !== 'tiktok').map(a => a.id)));
    }).catch(err => { setMsg(`Erro: ${err.message}`); setAccounts([]); });
  }, []);

  // A biblioteca é a busca mais pesada e só serve a Novo post e à Fila: não carrega na Agenda.
  const needsLibrary = tab === 'novo' || tab === 'fila';
  const [libraryLoaded, setLibraryLoaded] = useState(false);
  useEffect(() => {
    if (!needsLibrary || libraryLoaded) return;
    setLibraryLoaded(true);
    fetchMedia().then(setLibrary).catch(() => setLibrary([]));
  }, [needsLibrary, libraryLoaded]);

  useEffect(() => { loadPosts(); }, [loadPosts]);

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

  // O TikTok não tem stories pelo painel: ao trocar para story, sai da seleção.
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
    if (!await ask(`${scheduled ? `Agendar ${what} para ${new Date(scheduled).toLocaleString('pt-BR')}` : `Publicar ${what} agora`} em: ${names}?`)) return;
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
    if (!await ask('Cancelar este post agendado?')) return;
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
    if (!await ask(question)) return;
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

  // O Instagram não deixa editar: apaga na rede e publica de novo com a legenda nova.
  async function handleRepost(post) {
    const text = editing.text.trim();
    if (!text) { setMsg('Erro: escreva a legenda.'); return; }
    const accountIds = post.targets.map(t => t.account_id).filter(id => byId.get(id) && byId.get(id).status === 'ok' && byId.get(id).platform !== 'tiktok');
    if (!accountIds.length) { setMsg('Erro: nenhuma conta conectada para republicar.'); return; }
    const live = post.targets.filter(t => t.status === 'published').length;
    if (!await ask(`Excluir este post em ${live} rede(s) e publicar de novo com a legenda nova? Curtidas, comentários e visualizações do post atual serão perdidos. Não dá para desfazer.`)) return;
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


  // Ações e editor de um post já publicado (Histórico e Agenda).
  const postButtons = p => (
    <PostButtons p={p} deleting={deleting} setEditing={setEditing} onCancel={handleCancel} onDelete={handleDelete} />
  );

  const postEditor = p => (
    <PostEditor p={p} editing={editing} setEditing={setEditing} editBusy={editBusy} onEdit={handleEdit} onRepost={handleRepost} />
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
            Veja o que vai ao ar, publique um post ou story novo e acompanhe o que já saiu. O Instagram processa
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
          {msg && <p className={`form-msg ${msg.startsWith('Erro') ? 'form-msg--error' : 'form-msg--ok'}`} role={msg.startsWith('Erro') ? 'alert' : 'status'}>{msg}</p>}
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
          <StepWhere accounts={accounts} story={story} selectedAccounts={selectedAccounts} toggleAccount={toggleAccount} chooseFormat={chooseFormat} />
          <StepContent
            story={story} caption={caption} setCaption={setCaption} platforms={platforms} text={text} media={media}
            tiktokAccount={tiktokAccount} tiktokReady={tiktokReady} tiktokInfo={tiktokInfo} tiktok={tiktok} setTiktok={setTiktok}
            setVideoDuration={setVideoDuration}
            picker={{ pickerTab, setPickerTab, library, pickerItems, videoQuery, setVideoQuery, toggleMedia }}
          />
          <StepWhen
            when={when} setWhen={setWhen} scheduleAt={scheduleAt} setScheduleAt={setScheduleAt} errors={errors} caption={caption}
            media={media} story={story} busy={busy} onSubmit={handleSubmit} msg={msg}
          />
        </>
      ))}

      {tab === 'historico' && (
        <HistoryTab
          posts={posts} shownPosts={shownPosts} historyFilter={historyFilter} setHistoryFilter={setHistoryFilter}
          refreshing={refreshing} onRefresh={handleRefresh} msg={msg} postLimit={postLimit}
          onMore={() => setPostLimit(n => n + POSTS_PAGE)}
          renderPost={p => (
            <PostCard key={p.id} p={p} byId={byId} editing={editing} tools={postButtons(p)} editor={postEditor(p)} onRetry={handleRetry} />
          )}
        />
      )}
    </div>
  );
}
