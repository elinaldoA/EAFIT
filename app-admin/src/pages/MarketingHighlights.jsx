import { useEffect, useRef, useState } from 'react';
import { useAdminAuth } from '../context/useAdminAuth';
import { COVER_H, COVER_W, HIGHLIGHTS, drawCover } from '../lib/highlightCovers';
import { HIGHLIGHT_SCRIPTS, highlightSchedule } from '../lib/highlightScripts';
import { PLATFORMS, createArt, createPost, createTextArt, fetchAccounts, printUrl, uploadMedia, validatePost } from '../lib/marketing';
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
const GAPS = [{ min: 30, label: '30 min' }, { min: 60, label: '1 hora' }, { min: 120, label: '2 horas' }];
const fmtWhen = iso => new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

// Amanhã às 9h no horário local, no formato do campo datetime-local.
function defaultStart() {
  const d = new Date(Date.now() + 86_400_000);
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
  const [start, setStart] = useState(defaultStart);
  const [gap, setGap] = useState(60);
  const [busy, setBusy] = useState('');
  const [progress, setProgress] = useState('');

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

  async function schedule(h) {
    const script = HIGHLIGHT_SCRIPTS[h.key] || [];
    const chosen = accounts.filter(a => picked.includes(a.id));
    const times = highlightSchedule(new Date(start).toISOString(), script.length, gap);
    const errors = validatePost({ format: 'story', media: [{ type: 'image', url: 'x' }], accounts: chosen, scheduledAt: times[0] });
    if (errors.length) { setMsg(`Erro: ${errors[0]}`); return; }
    const where = chosen.map(a => `${PLATFORMS[a.platform].label}${a.username ? ` @${a.username}` : ''}`).join(' e ');
    if (!window.confirm(`Agendar ${script.length} stories do destaque “${h.label}” em ${where}, de ${fmtWhen(times[0])} a ${fmtWhen(times[times.length - 1])}? Eles saem sozinhos nesses horários.`)) return;
    setBusy(h.key);
    setMsg('');
    let done = 0;
    try {
      for (const [i, item] of script.entries()) {
        setProgress(`Criando story ${i + 1} de ${script.length}…`);
        const art = item.print
          ? await createArt({ imageUrl: printUrl(item.print), headline: item.headline, subline: item.subline, format: 'story' })
          : await createTextArt({ headline: item.headline, subline: item.subline, format: 'story' });
        const { url } = await uploadMedia({
          file: new File([art.blob], `destaque-${h.key}-${i + 1}.jpg`, { type: 'image/jpeg' }),
          title: `Destaque · ${h.label} · ${i + 1}`, width: art.width, height: art.height, adminId: adminUser?.id,
        });
        await createPost({ caption: '', media: [{ type: 'image', url }], accountIds: chosen.map(a => a.id), scheduledAt: times[i], format: 'story' });
        done += 1;
      }
      setMsg(`${done} stories de “${h.label}” agendados. Acompanhe e cancele, se precisar, em Marketing → Publicar.`);
    } catch (err) {
      setMsg(`Erro: ${err.message}${done ? ` (${done} de ${script.length} já foram agendados: veja Marketing → Publicar)` : ''}`);
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
          Cada destaque tem uma sequência de stories pronta (print do app com texto, ou só texto). “Agendar” cria a arte, guarda na biblioteca
          e agenda os stories nos horários escolhidos; eles saem sozinhos. Depois de publicados, adicione-os ao destaque pelo Arquivo do Instagram.
          Depoimentos fica de fora: só vale com relato real e autorizado.
        </p>
        <div className="actions-row" style={{ flexWrap: 'wrap', gap: 16, alignItems: 'flex-end' }}>
          <label className="stack" style={{ gap: 4 }}>
            <span className="user-detail__meta">Primeiro story</span>
            <input className="input" type="datetime-local" value={start} onChange={e => setStart(e.target.value)} aria-label="Primeiro story" />
          </label>
          <label className="stack" style={{ gap: 4 }}>
            <span className="user-detail__meta">Intervalo</span>
            <select className="input" value={gap} onChange={e => setGap(Number(e.target.value))} aria-label="Intervalo entre stories">
              {GAPS.map(g => <option key={g.min} value={g.min}>{g.label}</option>)}
            </select>
          </label>
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
            <div className="actions-row">
              <button type="button" className="btn btn--primary btn--small" disabled={!!busy || !picked.length} onClick={() => schedule(h)}>
                {busy === h.key ? 'Agendando…' : `Agendar ${HIGHLIGHT_SCRIPTS[h.key].length} stories`}
              </button>
            </div>
          </details>
        ))}
      </section>
    </div>
  );
}
