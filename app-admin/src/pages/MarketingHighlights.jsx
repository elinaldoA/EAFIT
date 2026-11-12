import { useEffect, useRef, useState } from 'react';
import { useAdminAuth } from '../context/useAdminAuth';
import { COVER_H, COVER_W, HIGHLIGHTS, drawCover } from '../lib/highlightCovers';
import { HIGHLIGHT_SCRIPTS } from '../lib/highlightScripts';
import { highlightSeconds } from '../lib/highlightVideo';
import { PLATFORMS, createPost, fetchAccounts, printUrl, uploadMedia, validatePost } from '../lib/marketing';
import { canRenderReels, renderHighlight } from '../lib/reelVideo';
import logoMark from '../assets/logo-mark.png';

// Pré-visualização pequena (a imagem final é 1080×1920); o círculo tracejado mostra o que
// o Instagram deixa visível na capa do destaque.
const PREVIEW_W = 180;

function loadLogo() {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = logoMark;
  });
}

function download(canvas, name) {
  return new Promise((resolve, reject) => {
    if (!canvas?.toBlob) { reject(new Error('Este navegador não gera a imagem.')); return; }
    canvas.toBlob(blob => {
      if (!blob) { reject(new Error('Não foi possível gerar a imagem.')); return; }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      resolve();
    }, 'image/png');
  });
}

// Marketing → Destaques: capas prontas (1080×1920) para os destaques do Instagram. O
// Instagram não deixa criar destaque por API: baixe a imagem e, no app, adicione-a como
// capa do destaque (Editar destaque → Editar capa → escolher da galeria).
const fmtWhen = iso => new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

// Horário no formato do campo datetime-local: `daysAhead` dias depois de hoje, às 9h.
function startAt(daysAhead) {
  const d = new Date(Date.now() + daysAhead * 86_400_000);
  d.setHours(9, 0, 0, 0);
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export default function MarketingHighlights() {
  const { adminUser } = useAdminAuth();
  const canvases = useRef({});
  const [logo, setLogo] = useState(null);
  const [msg, setMsg] = useState('');
  const [accounts, setAccounts] = useState([]);
  const [picked, setPicked] = useState([]);
  const [when, setWhen] = useState({}); // key -> datetime-local
  const [videos, setVideos] = useState({}); // key -> { blob, url, seconds, width, height }
  const [busy, setBusy] = useState('');
  const [progress, setProgress] = useState('');
  const videosRef = useRef({});
  videosRef.current = videos;

  useEffect(() => {
    let alive = true;
    fetchAccounts().then(list => {
      if (!alive) return;
      const usable = (list || []).filter(a => (a.platform === 'instagram' || a.platform === 'facebook') && a.status === 'ok');
      setAccounts(usable);
      setPicked(usable.filter(a => a.platform === 'instagram').map(a => a.id));
    }).catch(() => { if (alive) setAccounts([]); });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    let alive = true;
    loadLogo().then(img => { if (alive) setLogo(img); });
    return () => { alive = false; };
  }, []);

  useEffect(() => () => {
    Object.values(videosRef.current).forEach(v => URL.revokeObjectURL(v.url));
  }, []);

  useEffect(() => {
    for (const h of HIGHLIGHTS) {
      const ctx = canvases.current[h.key]?.getContext?.('2d');
      if (ctx) drawCover(ctx, h.key, { logo });
    }
  }, [logo]);

  async function save(h) {
    setMsg('');
    try {
      await download(canvases.current[h.key], `destaque-${h.key}.png`);
    } catch (err) {
      setMsg(`Erro: ${err.message}`);
    }
  }

  async function saveAll() {
    setMsg('');
    try {
      for (const h of HIGHLIGHTS) {
        await download(canvases.current[h.key], `destaque-${h.key}.png`);
        await new Promise(r => setTimeout(r, 350)); // o navegador barra downloads em rajada
      }
      setMsg('Capas baixadas.');
    } catch (err) {
      setMsg(`Erro: ${err.message}`);
    }
  }

  const keys = HIGHLIGHTS.filter(h => HIGHLIGHT_SCRIPTS[h.key]).map(h => h.key);
  const whenOf = key => when[key] || startAt(1 + keys.indexOf(key));

  async function generate(h) {
    const script = HIGHLIGHT_SCRIPTS[h.key] || [];
    setBusy(h.key);
    setMsg('');
    try {
      const out = await renderHighlight({
        scenes: script.map(item => ({ ...item, print: item.print ? printUrl(item.print) : null })),
        onProgress: v => setProgress(`Gerando o vídeo de “${h.label}”… ${Math.round(v * 100)}%`),
      });
      const url = URL.createObjectURL(out.blob);
      setVideos(prev => {
        if (prev[h.key]) URL.revokeObjectURL(prev[h.key].url);
        return { ...prev, [h.key]: { ...out, url } };
      });
      setMsg(`Vídeo de “${h.label}” pronto (${out.seconds} s). Confira a prévia e agende.`);
    } catch (err) {
      setMsg(`Erro: ${err.message}`);
    } finally {
      setBusy('');
      setProgress('');
    }
  }

  async function schedule(h) {
    const video = videos[h.key];
    const chosen = accounts.filter(a => picked.includes(a.id));
    const at = new Date(whenOf(h.key)).toISOString();
    const errors = validatePost({ format: 'story', media: [{ type: 'video', url: 'x' }], accounts: chosen, scheduledAt: at });
    if (errors.length) { setMsg(`Erro: ${errors[0]}`); return; }
    const where = chosen.map(a => `${PLATFORMS[a.platform].label}${a.username ? ` @${a.username}` : ''}`).join(' e ');
    if (!window.confirm(`Agendar o vídeo do destaque “${h.label}” (${video.seconds} s) em ${where} para ${fmtWhen(at)}? Ele sai sozinho nesse horário.`)) return;
    setBusy(h.key);
    setMsg('');
    try {
      setProgress('Enviando o vídeo…');
      const { url } = await uploadMedia({
        file: new File([video.blob], `destaque-${h.key}.mp4`, { type: 'video/mp4' }),
        title: `Destaque · ${h.label}`, width: video.width, height: video.height, adminId: adminUser?.id,
      });
      await createPost({ caption: '', media: [{ type: 'video', url }], accountIds: chosen.map(a => a.id), scheduledAt: at, format: 'story' });
      setMsg(`Vídeo de “${h.label}” agendado para ${fmtWhen(at)}. Acompanhe e cancele, se precisar, em Marketing → Publicar.`);
    } catch (err) {
      setMsg(`Erro: ${err.message}`);
    } finally {
      setBusy('');
      setProgress('');
    }
  }

  return (
    <div className="stack">
      <div className="page-header">
        <div>
          <h1 className="page-title">Destaques do Instagram</h1>
          <p className="page-subtitle">
            Capas prontas com a marca EAFIT. O Instagram não permite criar destaque pelo painel: baixe a imagem e, no app, em
            Editar destaque → Editar capa, escolha da galeria.
          </p>
        </div>
        <button type="button" className="btn" onClick={saveAll}>Baixar todas</button>
      </div>
      {msg && <p className={`form-msg ${msg.startsWith('Erro') ? 'form-msg--error' : 'form-msg--ok'}`}>{msg}</p>}

      <section className="card stack" aria-label="Capas dos destaques">
        <div className="actions-row" style={{ alignItems: 'flex-start', flexWrap: 'wrap', gap: 24 }}>
          {HIGHLIGHTS.map(h => (
            <figure key={h.key} className="stack" style={{ margin: 0, width: PREVIEW_W }}>
              <div style={{ position: 'relative', width: PREVIEW_W, height: Math.round(PREVIEW_W * COVER_H / COVER_W) }}>
                <canvas
                  ref={el => { canvases.current[h.key] = el; }}
                  width={COVER_W} height={COVER_H} aria-label={`Capa ${h.label}`}
                  style={{ width: '100%', height: '100%', borderRadius: 8, display: 'block' }}
                />
                <span aria-hidden="true" style={{
                  position: 'absolute', left: '50%', top: '50%', width: '100%', aspectRatio: '1', transform: 'translate(-50%, -50%)',
                  border: '2px dashed rgba(255,255,255,.55)', borderRadius: '50%', pointerEvents: 'none',
                }} />
              </div>
              <figcaption>
                <strong>{h.label}</strong>
                <span className="user-detail__meta" style={{ display: 'block' }}>{h.hint}</span>
              </figcaption>
              <button type="button" className="btn btn--small" onClick={() => save(h)}>Baixar capa</button>
            </figure>
          ))}
        </div>
        <p className="user-detail__meta">
          O círculo tracejado é a parte que aparece no perfil. Corrida entra aqui quando o módulo for liberado.
        </p>
      </section>

      <section className="card stack" aria-label="Roteiro dos destaques">
        <h2 className="section-title">Roteiro e agendamento dos stories</h2>
        <p className="user-detail__meta">
          Cada destaque vira um vídeo só (story vertical): as telas do app, uma a uma, com título e música. “Gerar vídeo” monta no navegador
          (leva cerca de um minuto; use o Chrome ou o Edge no computador), você confere a prévia e agenda. Depois de publicado, adicione o story ao
          destaque pelo Arquivo do Instagram. Depoimentos fica de fora: só vale com relato real e autorizado.
        </p>
        {!canRenderReels() && (
          <p className="form-msg form-msg--error">Este navegador não gera vídeo. Abra o painel no Chrome ou no Edge, no computador.</p>
        )}
        <div className="actions-row" style={{ flexWrap: 'wrap', gap: 16, alignItems: 'flex-end' }}>
          <div className="stack" style={{ gap: 4 }} role="group" aria-label="Contas">
            <span className="user-detail__meta">Publicar em</span>
            <div className="actions-row">
              {accounts.map(a => (
                <label key={a.id} className="actions-row" style={{ gap: 6 }}>
                  <input type="checkbox" checked={picked.includes(a.id)}
                    onChange={e => setPicked(p => (e.target.checked ? [...p, a.id] : p.filter(x => x !== a.id)))} />
                  {PLATFORMS[a.platform].label}{a.username ? ` @${a.username}` : ''}
                </label>
              ))}
              {accounts.length === 0 && <span className="user-detail__meta">Nenhuma conta conectada.</span>}
            </div>
          </div>
        </div>
        {progress && <p className="form-msg" role="status">{progress}</p>}

        {HIGHLIGHTS.filter(h => HIGHLIGHT_SCRIPTS[h.key]).map(h => (
          <details key={h.key} className="card stack" aria-label={`Roteiro ${h.label}`}>
            <summary><strong>{h.label}</strong> · {HIGHLIGHT_SCRIPTS[h.key].length} stories</summary>
            <ol>
              {HIGHLIGHT_SCRIPTS[h.key].map(item => (
                <li key={item.headline}>
                  <strong>{item.headline}</strong> — {item.subline}
                  <span className="user-detail__meta"> {item.print ? `(print: ${item.print})` : '(só texto)'}</span>
                </li>
              ))}
            </ol>
            <div className="actions-row" style={{ flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
              <button type="button" className="btn btn--small" disabled={!!busy || !canRenderReels()} onClick={() => generate(h)}>
                {busy === h.key && progress.startsWith('Gerando') ? 'Gerando…' : videos[h.key] ? 'Gerar de novo' : `Gerar vídeo (${highlightSeconds(HIGHLIGHT_SCRIPTS[h.key].length)} s)`}
              </button>
            </div>
            {videos[h.key] && (
              <div className="stack">
                <video src={videos[h.key].url} controls playsInline style={{ maxWidth: 220, borderRadius: 8 }} aria-label={`Prévia ${h.label}`} />
                <div className="actions-row" style={{ flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
                  <label className="stack" style={{ gap: 4 }}>
                    <span className="user-detail__meta">Sai em</span>
                    <input className="input" type="datetime-local" value={whenOf(h.key)} aria-label={`Horário ${h.label}`}
                      onChange={e => setWhen(w => ({ ...w, [h.key]: e.target.value }))} />
                  </label>
                  <a className="btn btn--ghost btn--small" href={videos[h.key].url} download={`destaque-${h.key}.mp4`}>Baixar vídeo</a>
                  <button type="button" className="btn btn--primary btn--small" disabled={!!busy || !picked.length} onClick={() => schedule(h)}>
                    Agendar vídeo
                  </button>
                </div>
              </div>
            )}
          </details>
        ))}
      </section>
    </div>
  );
}
