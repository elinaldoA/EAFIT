import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { MAX_SEC, MIN_SEC, formatSec, mediaDuration, storyDuration } from '../lib/storyMusic';

// Publicar → story: música opcional. Escolhe a música da biblioteca e o trecho;
// quem monta o vídeo é a página (renderStoryWithMusic) na hora de publicar ou
// na prévia. Durações lidas aqui sobem por onLengths.
export default function MarketingStoryMusic({ media, tracks, value, onChange, lengths, onLengths, preview, progress, onPreview, busy }) {
  const track = tracks.find(t => t.id === value.id) || null;
  const isVideo = media?.type === 'video';
  const duration = storyDuration({ mediaType: media?.type, videoSec: lengths.videoSec, imageSec: value.imageSec });
  const maxStart = Math.max(0, (lengths.musicSec || 0) - (duration || 0));
  const player = useRef(null);
  const stopAt = useRef(null);

  const mediaUrl = isVideo ? media.url : '';
  useEffect(() => {
    if (!mediaUrl) { onLengths(l => ({ ...l, videoSec: null })); return undefined; }
    let alive = true;
    onLengths(l => ({ ...l, videoSec: null }));
    mediaDuration(mediaUrl, 'video').then(sec => { if (alive) onLengths(l => ({ ...l, videoSec: sec })); }).catch(() => {});
    return () => { alive = false; };
  }, [mediaUrl, onLengths]);

  const trackUrl = track?.url || '';
  useEffect(() => {
    if (!trackUrl) return undefined;
    let alive = true;
    onLengths(l => ({ ...l, musicSec: null }));
    mediaDuration(trackUrl, 'audio').then(sec => { if (alive) onLengths(l => ({ ...l, musicSec: sec })); }).catch(() => {});
    return () => { alive = false; };
  }, [trackUrl, onLengths]);

  useEffect(() => () => clearTimeout(stopAt.current), []);

  function listen() {
    const el = player.current;
    if (!el) return;
    clearTimeout(stopAt.current);
    el.currentTime = value.start;
    el.play().catch(() => {});
    stopAt.current = setTimeout(() => el.pause(), (duration || 0) * 1000);
  }

  return (
    <fieldset className="mkt-music stack">
      <legend className="field__label">Música (opcional)</legend>
      {tracks.length === 0 ? (
        <p className="user-detail__meta">
          Nenhuma música na biblioteca. Suba um MP3 ou M4A em <Link to="/marketing-midia">Biblioteca de mídia</Link>.
        </p>
      ) : (
        <label className="field">
          <span className="field__label">Música</span>
          <select className="input" value={value.id} onChange={e => onChange({ ...value, id: e.target.value, start: 0 })}>
            <option value="">Sem música</option>
            {tracks.map(t => <option key={t.id} value={t.id}>{t.title || 'Sem nome'}</option>)}
          </select>
        </label>
      )}

      {track && (
        <>
          {media && !isVideo && (
            <label className="field">
              <span className="field__label">Duração do story (segundos)</span>
              <input className="input" type="number" min={MIN_SEC} max={MAX_SEC} value={value.imageSec}
                onChange={e => onChange({ ...value, imageSec: Number(e.target.value) })} />
            </label>
          )}
          {isVideo && (
            <p className="user-detail__meta">
              O story fica com a duração do vídeo{lengths.videoSec ? ` (${formatSec(duration)})` : ''}, até {MAX_SEC} segundos. O
              som original do vídeo sai: fica só a música.
            </p>
          )}
          {lengths.musicSec ? (
            <label className="field">
              <span className="field__label">
                Começar a música em {formatSec(value.start)} (a música tem {formatSec(lengths.musicSec)})
              </span>
              <input className="mkt-music__range" type="range" min={0} max={maxStart} step={0.5} value={Math.min(value.start, maxStart)}
                onChange={e => onChange({ ...value, start: Number(e.target.value) })} />
            </label>
          ) : <p className="user-detail__meta">Lendo a música…</p>}
          <audio ref={player} src={track.url} preload="auto" />
          <div className="actions-row">
            <button type="button" className="btn btn--small" disabled={!duration || !lengths.musicSec} onClick={listen}>▶ Ouvir o trecho</button>
            <button type="button" className="btn btn--small" disabled={busy || !media} onClick={onPreview}>Gerar prévia do vídeo</button>
            {progress != null && <span className="user-detail__meta">Montando o vídeo… {Math.round(progress * 100)}%</span>}
          </div>
          {!media && <p className="user-detail__meta">Escolha acima a imagem ou o vídeo do story.</p>}
          {preview && <video src={preview} controls playsInline className="mkt-tiktok__preview" />}
          <p className="user-detail__meta">
            Pela API não dá para usar o adesivo de música do Instagram: a música vai dentro do vídeo. Imagem vira um vídeo
            parado com a música.
          </p>
        </>
      )}
    </fieldset>
  );
}
