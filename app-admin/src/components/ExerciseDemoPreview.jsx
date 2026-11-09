import { useState } from 'react';
import { getExerciseMedia } from '../../../app-react/src/data/exerciseMedia.js';
import { youtubeEmbedUrl } from '../../../app-react/src/data/exerciseYoutube.js';

// Os vídeos e quadros do app ficam em /app/ (mesmo domínio do painel).
const APP_BASE = '/app/';

// Mídia do exercício como o usuário vê no "Ver execução" do app, ou null.
function demoFor(nome, custom) {
  return getExerciseMedia(nome, APP_BASE, custom);
}

// O que o usuário vê: vídeo próprio/padrão, player do YouTube ou os 2 quadros.
export function DemoPlayer({ media }) {
  if (media.type === 'video') {
    return <video className="media-thumb" style={{ maxWidth: 360, width: '100%' }} src={media.url} muted loop autoPlay playsInline controls />;
  }
  if (media.type === 'imagem') {
    return <img className="media-thumb" style={{ maxWidth: 360, width: '100%' }} src={media.url} alt="" />;
  }
  if (media.type === 'youtube') {
    return (
      <iframe
        title="Demonstração" style={{ width: 360, maxWidth: '100%', aspectRatio: media.youtube.vertical ? '9 / 16' : '16 / 9', border: 0 }}
        src={youtubeEmbedUrl(media.youtube, { autoplay: false })} allow="encrypted-media; picture-in-picture" allowFullScreen
      />
    );
  }
  return (
    <div className="actions-row">
      {(media.frames || []).map(src => <img key={src} className="media-thumb" style={{ maxWidth: 220 }} src={src} alt="" loading="lazy" />)}
    </div>
  );
}

// Botão "▶ Ver execução" + a mídia logo abaixo quando aberto. Sem mídia, nada.
export default function ExerciseDemoPreview({ nome, custom }) {
  const [open, setOpen] = useState(false);
  const media = demoFor(nome, custom);
  if (!media) return null;
  return (
    <>
      <button type="button" className="btn btn--ghost btn--small" onClick={() => setOpen(o => !o)} aria-expanded={open}>
        ▶ {open ? 'Ocultar execução' : 'Ver execução'}
      </button>
      {open && <div style={{ marginTop: 8 }}><DemoPlayer media={media} /></div>}
    </>
  );
}
