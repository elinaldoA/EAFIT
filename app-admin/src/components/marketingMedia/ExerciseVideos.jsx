import { useMemo, useState } from 'react';
import { exerciseVideoList } from '../../lib/marketing';
import { Paged } from '../ShowMore';

// Vídeos de exercício do site, com o crédito que a licença de cada um pede.
export default function ExerciseVideos() {
  const [videoQuery, setVideoQuery] = useState('');
  const videos = useMemo(() => exerciseVideoList(), []);
  const shownVideos = videos.filter(v => v.label.toLowerCase().includes(videoQuery.trim().toLowerCase()));

  return (
    <section className="card stack">
      <div className="actions-row" style={{ justifyContent: 'space-between' }}>
        <h2 className="section-title">Vídeos de exercício ({videos.length})</h2>
        <input className="input search-input" placeholder="Buscar exercício" aria-label="Buscar exercício" value={videoQuery} onChange={e => setVideoQuery(e.target.value)} />
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
  );
}
