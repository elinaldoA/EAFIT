import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAdminAuth } from '../context/useAdminAuth';
import {
  APP_PRINTS, ART_FORMATS, createArt, exerciseVideoList, fetchMedia, printUrl, removeMedia, uploadMedia, validateUpload,
} from '../lib/marketing';
import { formatSize } from '../lib/promoMaterials';
import Loading from '../components/Loading';
import EmptyState from '../components/EmptyState';

// Marketing → Biblioteca de mídia: o que pode ir para as redes. Arquivos
// próprios e artes feitas dos prints do app ficam no bucket público
// marketing-media; os vídeos de exercício vêm do próprio site, com o crédito
// que a licença pede (entra sozinho na legenda).
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
  const [videoQuery, setVideoQuery] = useState('');
  const videos = useMemo(() => exerciseVideoList(), []);
  const shownVideos = videos.filter(v => v.label.toLowerCase().includes(videoQuery.trim().toLowerCase()));

  const load = useCallback(async () => {
    try {
      setItems(await fetchMedia());
    } catch (err) {
      setMsg(`Erro: ${err.message}`);
      setItems([]);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

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
    setArt({ slug: p.slug, label: p.label, headline: p.label, subline: 'Treino, nutrição e evolução num app só. Grátis.', format: 'feed', preview: null });
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

      {msg && <p className={`form-msg ${msg.startsWith('Erro') ? 'form-msg--error' : 'form-msg--ok'}`}>{msg}</p>}

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
          <div className="mkt-grid">
            {items.map(m => (
              <figure key={m.id} className="mkt-tile">
                {m.kind === 'video'
                  ? <video src={m.url} muted playsInline preload="metadata" className="mkt-tile__media" />
                  : <img src={m.url} alt="" loading="lazy" className="mkt-tile__media" />}
                <figcaption>
                  <strong>{m.title || 'Sem nome'}</strong>
                  <span className="user-detail__meta">
                    {m.kind === 'video' ? 'vídeo' : 'imagem'}{m.width ? ` · ${m.width}×${m.height}` : ''}{m.size_bytes ? ` · ${formatSize(m.size_bytes)}` : ''}
                  </span>
                  <button type="button" className="btn btn--ghost btn--small" onClick={() => handleRemove(m)}>Remover</button>
                </figcaption>
              </figure>
            ))}
          </div>
        )}
      </section>

      <section className="card stack">
        <div className="actions-row" style={{ justifyContent: 'space-between' }}>
          <h2 className="section-title">Prints do app</h2>
          <label className="field">
            <span className="field__label">Idioma do print</span>
            <select className="input" value={lang} onChange={e => { setLang(e.target.value); setArt(a => (a ? { ...a, preview: null } : a)); }}>
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
                <button type="button" className="btn btn--small" onClick={() => openArt(p)}>Criar arte</button>
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
        <div className="mkt-grid">
          {shownVideos.map(v => (
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
      </section>
    </div>
  );
}
