import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  APP_PRINTS, ART_FORMATS, REEL_DEFAULTS, createArt, printUrl, uploadMedia,
} from '../../lib/marketing';
import { canRenderReels, renderReel, renderStory } from '../../lib/reelVideo';
import { STORY_VARIANTS } from '../../lib/reelRender';

// "Prints do app": cada print vira arte, Reel ou story em vídeo. Cada um guarda a
// prévia gerada na memória até ser salvo na biblioteca (`load` recarrega a lista).
export default function PrintStudio({ load, setMsg, busy, setBusy, adminId }) {
  const [lang, setLang] = useState('pt');
  const [art, setArt] = useState(null); // { slug, label, headline, subline, format, preview }
  const [story, setStory] = useState(null); // { slug, label, pill, title, sub, style, progress, preview, saved }
  const [reel, setReel] = useState(null); // { slug, label, hook, title, sub, progress, preview, saved }

  useEffect(() => () => { if (story?.preview) URL.revokeObjectURL(story.preview.url); }, [story?.preview]);

  // Libera a prévia do Reel da memória.
  useEffect(() => () => { if (reel?.preview) URL.revokeObjectURL(reel.preview.url); }, [reel?.preview]);

  // Libera a prévia anterior da memória.
  useEffect(() => () => { if (art?.preview) URL.revokeObjectURL(art.preview.url); }, [art?.preview]);

  function openArt(p) {
    setArt({ slug: p.slug, label: p.label, headline: p.label, subline: 'Treino, nutrição e evolução num app só. Comece agora.', format: 'feed', preview: null });
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
      await uploadMedia({ file: new File([blob], `${art.slug}.jpg`, { type: 'image/jpeg' }), title: name, width, height, adminId });
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
      await uploadMedia({ file: new File([blob], `reel-${reel.slug}.mp4`, { type: 'video/mp4' }), title: `Reel · ${reel.title}`, width, height, adminId });
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
      await uploadMedia({ file: new File([blob], `story-${story.slug}.mp4`, { type: 'video/mp4' }), title: `Story · ${story.title}`, width, height, adminId });
      setStory(s => ({ ...s, saved: true }));
      setMsg(`Story “${story.title}” salvo na biblioteca.`);
      await load();
    } catch (err) {
      setMsg(`Erro: ${err.message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
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
              <p className="form-msg form-msg--error" role="alert">Este navegador não gera vídeo. Use o Chrome ou o Edge no computador.</p>
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
              <p className="form-msg form-msg--ok" role="status">
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
              <p className="form-msg form-msg--error" role="alert">Este navegador não gera vídeo. Use o Chrome ou o Edge no computador.</p>
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
              <p className="form-msg form-msg--ok" role="status">
                Pronto. Agora <Link to="/marketing?aba=fila">adicione à fila da publicação automática</Link> (formato Reel) ou publique em Publicar → Novo post.
              </p>
            )}
          </div>
          {reel.preview && <video src={reel.preview.url} controls playsInline className="mkt-art__preview" aria-label="Prévia do Reel" />}
        </div>
      )}
    </section>
  );
}
