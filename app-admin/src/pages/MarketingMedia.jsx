import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAdminAuth } from '../context/useAdminAuth';
import {
  APP_PRINTS, ART_FORMATS, REEL_DEFAULTS, createArt, exerciseVideoList, fetchMedia, printUrl, removeMedia, uploadMedia, validateUpload,
} from '../lib/marketing';
import { canRenderReels, renderReel, renderStory } from '../lib/reelVideo';
import { STORY_VARIANTS } from '../lib/reelRender';
import {
  PROMO_AUDIENCES, audienceLabel, fetchPromoMaterials, formatHint, formatSize, partnerTitle, sendMediaToPartners,
} from '../lib/promoMaterials';
import Loading from '../components/Loading';
import EmptyState from '../components/EmptyState';
import { Paged } from '../components/ShowMore';

// Marketing → Biblioteca de mídia: o que pode ir para as redes. Arquivos
// próprios e artes feitas dos prints do app ficam no bucket público
// marketing-media; os vídeos de exercício vêm do próprio site, com o crédito
// que a licença pede (entra sozinho na legenda). Cada item também pode ir para
// embaixadores e influenciadores (material de divulgação no app, com texto pronto).
export default function MarketingMedia() {
  const { adminUser } = useAdminAuth();
  const [items, setItems] = useState(null);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [file, setFile] = useState(null);
  const [title, setTitle] = useState('');
  const fileRef = useRef(null);

  const [lang, setLang] = useState('pt');
  const [art, setArt] = useState(null); // { slug, label, headline, subline, format, preview }
  const [story, setStory] = useState(null); // { slug, label, pill, title, sub, style, progress, preview, saved }
  const [reel, setReel] = useState(null); // { slug, label, hook, title, sub, progress, preview, saved }
  const [videoQuery, setVideoQuery] = useState('');
  const videos = useMemo(() => exerciseVideoList(), []);
  const shownVideos = videos.filter(v => v.label.toLowerCase().includes(videoQuery.trim().toLowerCase()));

  // Material de parceiros que veio da biblioteca: id da mídia → públicos.
  const [shared, setShared] = useState(() => new Map());
  const [share, setShare] = useState(null); // { media, title, description, audience, caption }

  const load = useCallback(async () => {
    try {
      setItems(await fetchMedia());
    } catch (err) {
      setMsg(`Erro: ${err.message}`);
      setItems([]);
    }
    try {
      const map = new Map();
      for (const p of await fetchPromoMaterials()) {
        if (p.source_media_id) map.set(p.source_media_id, [...(map.get(p.source_media_id) || []), p.audience]);
      }
      setShared(map);
    } catch {
      setShared(new Map()); // sem acesso ao material de parceiros: só não marca
    }
  }, []);

  const shareRef = useRef(null);
  const msgRef = useRef(null);

  function openShare(m) {
    setMsg('');
    setShare({ media: m, title: partnerTitle(m.title), description: formatHint(m), audience: 'todos', caption: '' });
  }

  // O formulário abre abaixo da lista: leva a tela até ele, senão o botão parece morto.
  useEffect(() => {
    if (share) shareRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
  }, [share?.media?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // O resultado (ok ou erro) aparece no topo: garante que ele fique à vista.
  useEffect(() => {
    if (msg && !share) msgRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
  }, [msg, share]);

  async function handleShare(e) {
    e.preventDefault();
    setBusy(true);
    setMsg('');
    try {
      await sendMediaToPartners({ ...share, adminId: adminUser?.id });
      setMsg(`“${share.title}” enviado para ${audienceLabel(share.audience).toLowerCase()}. Já aparece no app, em Divulgar.`);
      setShare(null);
      await load();
    } catch (err) {
      setMsg(`Erro: ${err.message}`);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => { load(); }, [load]);

  // Libera a prévia do story da memória.
  useEffect(() => () => { if (story?.preview) URL.revokeObjectURL(story.preview.url); }, [story?.preview]);

  // Libera a prévia do Reel da memória.
  useEffect(() => () => { if (reel?.preview) URL.revokeObjectURL(reel.preview.url); }, [reel?.preview]);

  // Libera a prévia anterior da memória.
  useEffect(() => () => { if (art?.preview) URL.revokeObjectURL(art.preview.url); }, [art?.preview]);

  async function handleUpload(e) {
    e.preventDefault();
    const err = validateUpload(file);
    if (err) { setMsg(`Erro: ${err}`); return; }
    setBusy(true);
    setMsg('');
    try {
      await uploadMedia({ file, title: title || file.name, adminId: adminUser?.id });
      setMsg('Arquivo adicionado à biblioteca.');
      setFile(null);
      setTitle('');
      if (fileRef.current) fileRef.current.value = '';
      await load();
    } catch (error) {
      setMsg(`Erro: ${error.message}`);
    } finally {
      setBusy(false);
    }
  }

  function openArt(p) {
    setArt({ slug: p.slug, label: p.label, headline: p.label, subline: 'Treino, nutrição e evolução num app só. Comece agora grátis.', format: 'feed', preview: null });
  }

  async function previewArt() {
    setBusy(true);
    setMsg('');
    try {
      const out = await createArt({ imageUrl: printUrl(art.slug, lang), headline: art.headline, subline: art.subline, format: art.format });
      setArt(a => ({ ...a, preview: { ...out, url: URL.createObjectURL(out.blob) } }));
    } catch (err) {
      setMsg(`Erro: ${err.message}`);
    } finally {
      setBusy(false);
    }
  }

  async function saveArt() {
    setBusy(true);
    setMsg('');
    try {
      const { blob, width, height } = art.preview;
      const name = `${art.headline || art.label} ${ART_FORMATS[art.format].label}`;
      await uploadMedia({ file: new File([blob], `${art.slug}.jpg`, { type: 'image/jpeg' }), title: name, width, height, adminId: adminUser?.id });
      setMsg(`Arte “${name}” salva. Já dá para usar em Publicar.`);
      setArt(null);
      await load();
    } catch (err) {
      setMsg(`Erro: ${err.message}`);
    } finally {
      setBusy(false);
    }
  }

  function openReel(p) {
    const d = REEL_DEFAULTS[p.slug] || { hook: p.label, title: p.label, sub: '' };
    setArt(null);
    setReel({ slug: p.slug, label: p.label, ...d, progress: 0, preview: null, saved: false });
  }

  async function makeReel() {
    setBusy(true);
    setMsg('');
    setReel(r => ({ ...r, progress: 0, preview: null, saved: false }));
    try {
      const out = await renderReel({
        imageUrl: printUrl(reel.slug, lang), hook: reel.hook, title: reel.title, sub: reel.sub,
        onProgress: progress => setReel(r => (r ? { ...r, progress } : r)),
      });
      setReel(r => ({ ...r, progress: 1, preview: { ...out, url: URL.createObjectURL(out.blob) } }));
    } catch (err) {
      setMsg(`Erro: ${err.message}`);
      setReel(r => (r ? { ...r, progress: 0 } : r));
    } finally {
      setBusy(false);
    }
  }

  async function saveReel() {
    setBusy(true);
    setMsg('');
    try {
      const { blob, width, height } = reel.preview;
      await uploadMedia({ file: new File([blob], `reel-${reel.slug}.mp4`, { type: 'video/mp4' }), title: `Reel · ${reel.title}`, width, height, adminId: adminUser?.id });
      setReel(r => ({ ...r, saved: true }));
      setMsg(`Reel “${reel.title}” salvo na biblioteca.`);
      await load();
    } catch (err) {
      setMsg(`Erro: ${err.message}`);
    } finally {
      setBusy(false);
    }
  }

  function openStory(p) {
    const d = REEL_DEFAULTS[p.slug] || { title: p.label, sub: '' };
    setArt(null);
    setReel(null);
    setStory({ slug: p.slug, label: p.label, pill: '', title: d.title, sub: d.sub, style: 'electric', variant: 0, progress: 0, preview: null, saved: false });
  }

  const editStory = patch => setStory(s => ({ ...s, ...patch, preview: null, saved: false }));

  async function makeStory() {
    setBusy(true);
    setMsg('');
    setStory(s => ({ ...s, progress: 0, preview: null, saved: false }));
    try {
      const out = await renderStory({
        imageUrl: printUrl(story.slug, lang), pill: story.pill.trim(), title: story.title, sub: story.sub, style: story.style, variant: story.variant,
        onProgress: progress => setStory(s => (s ? { ...s, progress } : s)),
      });
      setStory(s => ({ ...s, progress: 1, preview: { ...out, url: URL.createObjectURL(out.blob) } }));
    } catch (err) {
      setMsg(`Erro: ${err.message}`);
      setStory(s => (s ? { ...s, progress: 0 } : s));
    } finally {
      setBusy(false);
    }
  }

  async function saveStory() {
    setBusy(true);
    setMsg('');
    try {
      const { blob, width, height } = story.preview;
      await uploadMedia({ file: new File([blob], `story-${story.slug}.mp4`, { type: 'video/mp4' }), title: `Story · ${story.title}`, width, height, adminId: adminUser?.id });
      setStory(s => ({ ...s, saved: true }));
      setMsg(`Story “${story.title}” salvo na biblioteca.`);
      await load();
    } catch (err) {
      setMsg(`Erro: ${err.message}`);
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove(item) {
    if (!window.confirm(`Remover “${item.title || item.storage_path}” da biblioteca? Posts já publicados não mudam.`)) return;
    try {
      await removeMedia(item);
      await load();
    } catch (err) {
      setMsg(`Erro: ${err.message}`);
    }
  }

  return (
    <div className="stack">
      <div className="page-header">
        <div>
          <h1 className="page-title">Biblioteca de mídia</h1>
          <p className="page-subtitle">
            Imagens e vídeos prontos para postar. Os prints do app viram artes no tamanho certo de cada formato; os
            vídeos de exercício entram com o crédito do autor na legenda.
          </p>
        </div>
      </div>


      {msg && !share && <p ref={msgRef} className={`form-msg ${msg.startsWith('Erro') ? 'form-msg--error' : 'form-msg--ok'}`}>{msg}</p>}

      <section className="card stack">
        <h2 className="section-title">Minhas mídias</h2>
        <form className="form-grid" onSubmit={handleUpload}>
          <label className="field">
            <span className="field__label">Arquivo (JPG, PNG, MP4 ou MOV, até 100 MB)</span>
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,video/mp4,video/quicktime" onChange={e => setFile(e.target.files?.[0] || null)} />
          </label>
          <label className="field">
            <span className="field__label">Nome na biblioteca</span>
            <input className="input" value={title} maxLength={120} onChange={e => setTitle(e.target.value)} placeholder="ex.: Vídeo de lançamento" />
          </label>
          <div className="form-grid__actions">
            <button type="submit" className="btn btn--primary" disabled={busy || !file}>{busy ? 'Enviando…' : 'Adicionar'}</button>
          </div>
        </form>
        {!items && <Loading />}
        {items && items.length === 0 && <EmptyState icon="🖼️" label="Nada aqui ainda: envie um arquivo ou crie uma arte com um print." />}
        {items && items.length > 0 && (
          <Paged items={items} size={24}>{visible => (
          <div className="mkt-grid">
            {visible.map(m => (
              <figure key={m.id} className="mkt-tile">
                {m.kind === 'video'
                  ? <video src={m.url} muted playsInline preload="metadata" className="mkt-tile__media" />
                  : <img src={m.url} alt="" loading="lazy" className="mkt-tile__media" />}
                <figcaption>
                  <strong>{m.title || 'Sem nome'}</strong>
                  <span className="user-detail__meta">
                    {m.kind === 'video' ? 'vídeo' : 'imagem'}{m.width ? ` · ${m.width}×${m.height}` : ''}{m.size_bytes ? ` · ${formatSize(m.size_bytes)}` : ''}
                  </span>
                  {shared.has(m.id) && (
                    <span className="badge badge--ok" title={shared.get(m.id).map(audienceLabel).join(' · ')}>Com os parceiros</span>
                  )}
                  <button type="button" className="btn btn--small" onClick={() => openShare(m)}>Enviar aos parceiros</button>
                  <button type="button" className="btn btn--ghost btn--small" onClick={() => handleRemove(m)}>Remover</button>
                </figcaption>
              </figure>
            ))}
          </div>
          )}</Paged>
        )}

        {share && (
          <form ref={shareRef} className="mkt-art" onSubmit={handleShare}>
            <div className="stack">
              <h3 className="section-title">Enviar aos parceiros</h3>
              <p className="user-detail__meta">
                Vira material de divulgação no app de embaixadores e influenciadores (Divulgar). O texto pronto aparece com
                o botão “Copiar texto”, já com o link de quem copia.
              </p>
              <label className="field">
                <span className="field__label">Título no app</span>
                <input className="input" value={share.title} maxLength={80} required onChange={e => setShare({ ...share, title: e.target.value })} />
              </label>
              <label className="field">
                <span className="field__label">Descrição</span>
                <input className="input" value={share.description} maxLength={300} onChange={e => setShare({ ...share, description: e.target.value })} />
              </label>
              <label className="field">
                <span className="field__label">Para</span>
                <select className="input" value={share.audience} onChange={e => setShare({ ...share, audience: e.target.value })}>
                  {PROMO_AUDIENCES.map(a => <option key={a.key} value={a.key}>{a.label}</option>)}
                </select>
              </label>
              <label className="field">
                <span className="field__label">Texto pronto (opcional; o link do parceiro entra no fim)</span>
                <textarea className="input" rows={4} value={share.caption} maxLength={1000}
                  placeholder="Ex.: Meu treino agora fala comigo 🎧 Comece agora grátis:"
                  onChange={e => setShare({ ...share, caption: e.target.value })} />
              </label>
              {msg && <p className={`form-msg ${msg.startsWith('Erro') ? 'form-msg--error' : 'form-msg--ok'}`}>{msg}</p>}
              <div className="actions-row">
                <button type="submit" className="btn btn--primary" disabled={busy || !share.title.trim()}>{busy ? 'Enviando…' : 'Enviar'}</button>
                <button type="button" className="btn btn--ghost" onClick={() => setShare(null)}>Fechar</button>
              </div>
            </div>
            {share.media.kind === 'video'
              ? <video src={share.media.url} muted playsInline controls className="mkt-art__preview" />
              : <img src={share.media.url} alt="" className="mkt-art__preview" />}
          </form>
        )}
      </section>

      <section className="card stack">
        <div className="actions-row" style={{ justifyContent: 'space-between' }}>
          <h2 className="section-title">Prints do app</h2>
          <label className="field">
            <span className="field__label">Idioma do print</span>
            <select className="input" value={lang} onChange={e => {
              setLang(e.target.value);
              // Prévia pronta está no idioma antigo: some, para não salvar o print errado.
              setArt(a => (a ? { ...a, preview: null } : a));
              setStory(s => (s ? { ...s, preview: null, saved: false } : s));
              setReel(r => (r ? { ...r, preview: null, saved: false } : r));
            }}>
              <option value="pt">Português</option>
              <option value="en">Inglês</option>
            </select>
          </label>
        </div>
        <div className="mkt-grid">
          {APP_PRINTS.map(p => (
            <figure key={p.slug} className={`mkt-tile${art?.slug === p.slug ? ' mkt-tile--active' : ''}`}>
              <img src={printUrl(p.slug, lang)} alt={p.label} loading="lazy" className="mkt-tile__media mkt-tile__media--phone" />
              <figcaption>
                <strong>{p.label}</strong>
                <button type="button" className="btn btn--small" onClick={() => { setReel(null); setStory(null); openArt(p); }}>Criar arte</button>
                <button type="button" className="btn btn--small" onClick={() => { setStory(null); openReel(p); }}>Criar Reel</button>
                <button type="button" className="btn btn--small" onClick={() => openStory(p)}>Criar story</button>
              </figcaption>
            </figure>
          ))}
        </div>

        {art && (
          <div className="mkt-art">
            <div className="stack">
              <h3 className="section-title">Arte: {art.label}</h3>
              <label className="field">
                <span className="field__label">Título</span>
                <input className="input" value={art.headline} maxLength={60} onChange={e => setArt({ ...art, headline: e.target.value, preview: null })} />
              </label>
              <label className="field">
                <span className="field__label">Subtítulo</span>
                <input className="input" value={art.subline} maxLength={90} onChange={e => setArt({ ...art, subline: e.target.value, preview: null })} />
              </label>
              <label className="field">
                <span className="field__label">Formato</span>
                <select className="input" value={art.format} onChange={e => setArt({ ...art, format: e.target.value, preview: null })}>
                  {Object.entries(ART_FORMATS).map(([k, f]) => <option key={k} value={k}>{f.label}</option>)}
                </select>
              </label>
              <div className="actions-row">
                <button type="button" className="btn" disabled={busy} onClick={previewArt}>Gerar prévia</button>
                <button type="button" className="btn btn--primary" disabled={busy || !art.preview} onClick={saveArt}>Salvar na biblioteca</button>
                <button type="button" className="btn btn--ghost" onClick={() => setArt(null)}>Fechar</button>
              </div>
            </div>
            {art.preview && <img src={art.preview.url} alt="Prévia da arte" className="mkt-art__preview" />}
          </div>
        )}

        {story && (
          <div className="mkt-art">
            <div className="stack">
              <h3 className="section-title">Story em vídeo: {story.label}</h3>
              <p className="user-detail__meta">
                Vídeo de 8 segundos, na vertical, com música eletrônica: título animado, fundo em movimento e o print do app caindo no "drop". Troque o visual para stories do mesmo tema não ficarem iguais.
                Leva cerca de 6 segundos para gerar.
              </p>
              {!canRenderReels() && (
                <p className="form-msg form-msg--error">Este navegador não gera vídeo. Use o Chrome ou o Edge no computador.</p>
              )}
              <label className="field">
                <span className="field__label">Etiqueta (opcional, ex.: HIDRATAÇÃO)</span>
                <input className="input" value={story.pill} maxLength={24} onChange={e => editStory({ pill: e.target.value })} />
              </label>
              <label className="field">
                <span className="field__label">Título</span>
                <input className="input" value={story.title} maxLength={60} onChange={e => editStory({ title: e.target.value })} />
              </label>
              <label className="field">
                <span className="field__label">Subtítulo</span>
                <input className="input" value={story.sub} maxLength={70} onChange={e => editStory({ sub: e.target.value })} />
              </label>
              <label className="field">
                <span className="field__label">Visual</span>
                <select className="input" value={story.variant} onChange={e => editStory({ variant: Number(e.target.value) })}>
                  {STORY_VARIANTS.map((vr, i) => <option key={vr.name} value={i}>{vr.name}</option>)}
                </select>
              </label>
              <label className="field">
                <span className="field__label">Música</span>
                <select className="input" value={story.style} onChange={e => editStory({ style: e.target.value })}>
                  <option value="electric">Eletrônica (treino)</option>
                  <option value="energy">Energia</option>
                  <option value="bright">Leve (manhã e dia)</option>
                  <option value="calm">Calma (noite)</option>
                </select>
              </label>
              {busy && story.progress > 0 && story.progress < 1 && (
                <progress value={story.progress} max="1" aria-label="Gerando o story">{Math.round(story.progress * 100)}%</progress>
              )}
              <div className="actions-row">
                <button type="button" className="btn" disabled={busy || !canRenderReels() || !story.title.trim()} onClick={makeStory}>
                  {busy && !story.preview ? 'Gerando…' : 'Gerar story'}
                </button>
                <button type="button" className="btn btn--primary" disabled={busy || !story.preview || story.saved} onClick={saveStory}>Salvar na biblioteca</button>
                <button type="button" className="btn btn--ghost" onClick={() => setStory(null)}>Fechar</button>
              </div>
              {story.saved && (
                <p className="form-msg form-msg--ok">
                  Pronto. Agora <Link to="/marketing?aba=fila">adicione à fila da publicação automática</Link> (formato Story, no horário que quiser) ou publique em Publicar → Novo post.
                </p>
              )}
            </div>
            {story.preview && <video src={story.preview.url} controls playsInline className="mkt-art__preview" aria-label="Prévia do story" />}
          </div>
        )}
        {reel && (
          <div className="mkt-art">
            <div className="stack">
              <h3 className="section-title">Reel: {reel.label}</h3>
              <p className="user-detail__meta">
                Vídeo de 12 segundos, na vertical, com a trilha original do painel: gancho em texto, o print do app entrando
                e a chamada para o link da bio. Leva cerca de 10 segundos para gerar.
              </p>
              {!canRenderReels() && (
                <p className="form-msg form-msg--error">Este navegador não gera vídeo. Use o Chrome ou o Edge no computador.</p>
              )}
              <label className="field">
                <span className="field__label">Gancho (abre o vídeo)</span>
                <input className="input" value={reel.hook} maxLength={60} onChange={e => setReel({ ...reel, hook: e.target.value, preview: null, saved: false })} />
              </label>
              <label className="field">
                <span className="field__label">Título (junto do print)</span>
                <input className="input" value={reel.title} maxLength={50} onChange={e => setReel({ ...reel, title: e.target.value, preview: null, saved: false })} />
              </label>
              <label className="field">
                <span className="field__label">Subtítulo</span>
                <input className="input" value={reel.sub} maxLength={70} onChange={e => setReel({ ...reel, sub: e.target.value, preview: null, saved: false })} />
              </label>
              {busy && reel.progress > 0 && reel.progress < 1 && (
                <progress value={reel.progress} max="1" aria-label="Gerando o Reel">{Math.round(reel.progress * 100)}%</progress>
              )}
              <div className="actions-row">
                <button type="button" className="btn" disabled={busy || !canRenderReels() || !reel.hook.trim() || !reel.title.trim()} onClick={makeReel}>
                  {busy && !reel.preview ? 'Gerando…' : 'Gerar Reel'}
                </button>
                <button type="button" className="btn btn--primary" disabled={busy || !reel.preview || reel.saved} onClick={saveReel}>Salvar na biblioteca</button>
                <button type="button" className="btn btn--ghost" onClick={() => setReel(null)}>Fechar</button>
              </div>
              {reel.saved && (
                <p className="form-msg form-msg--ok">
                  Pronto. Agora <Link to="/marketing?aba=fila">adicione à fila da publicação automática</Link> (formato Reel) ou publique em Publicar → Novo post.
                </p>
              )}
            </div>
            {reel.preview && <video src={reel.preview.url} controls playsInline className="mkt-art__preview" aria-label="Prévia do Reel" />}
          </div>
        )}
      </section>

      <section className="card stack">
        <div className="actions-row" style={{ justifyContent: 'space-between' }}>
          <h2 className="section-title">Vídeos de exercício ({videos.length})</h2>
          <input className="input search-input" placeholder="Buscar exercício" value={videoQuery} onChange={e => setVideoQuery(e.target.value)} />
        </div>
        <p className="user-detail__meta">
          Vídeos de terceiros (wger, Wikimedia Commons, Pixabay). Ao usar num post, o crédito vai na legenda. Os marcados
          “CC BY-SA” exigem que a peça derivada saia na mesma licença: use em posts, não em anúncios pagos.
        </p>
        <Paged items={shownVideos} size={24} resetKey={videoQuery}>{visible => (
        <div className="mkt-grid">
          {visible.map(v => (
            <figure key={v.slug} className="mkt-tile">
              <video src={v.url} muted loop playsInline preload="none" className="mkt-tile__media"
                onMouseEnter={e => e.currentTarget.play().catch(() => {})} onMouseLeave={e => e.currentTarget.pause()} />
              <figcaption>
                <strong>{v.label}</strong>
                <span className="user-detail__meta">{v.credit}</span>
                {v.shareAlike && <span className="badge badge--warning">CC BY-SA: só posts</span>}
              </figcaption>
            </figure>
          ))}
        </div>
        )}</Paged>
      </section>
    </div>
  );
}
