import { useEffect, useRef, useState } from 'react';
import { COVER_H, COVER_W, HIGHLIGHTS, drawCover } from '../lib/highlightCovers';
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
export default function MarketingHighlights() {
  const canvases = useRef({});
  const [logo, setLogo] = useState(null);
  const [msg, setMsg] = useState('');

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
    </div>
  );
}
