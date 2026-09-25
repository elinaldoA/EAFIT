import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { getModalRoot } from '../lib/modalRoot';
import { getExerciseMedia, MEDIA_CREDIT } from '../data/exerciseMedia';
import { useBackToClose } from '../hooks/useBackToClose';
import { useCustomExerciseMedia } from '../hooks/useCustomExerciseMedia';

// Devagar o bastante pra acompanhar cada posição (troca com fade — ver live.css).
const FRAME_MS = 1600;
const SPEEDS = [{ rate: 1, label: 'Normal' }, { rate: 0.5, label: 'Câmera lenta' }];

function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

// iOS Safari só põe em tela cheia o próprio <video> (webkitEnterFullscreen).
function canFullscreen() {
  if (typeof document === 'undefined') return false;
  return !!document.fullscreenEnabled || 'webkitEnterFullscreen' in HTMLVideoElement.prototype;
}

async function enterFullscreen(video) {
  try {
    if (video.requestFullscreen) await video.requestFullscreen();
    else video.webkitEnterFullscreen?.();
    // Vídeos são deitados (16:9): no celular, tenta girar junto. Nem todo
    // navegador deixa travar a orientação — sem isso, só fica em tela cheia.
    await screen.orientation?.lock?.('landscape');
  } catch { /* recusado pelo navegador: segue no modal */ }
}

const OFFLINE_MSG = 'Sem conexão — a demonstração aparece quando você estiver online (depois disso ela fica salva no aparelho).';

// Padrão (Free Exercise DB): 2 quadros alternando; o toque pausa/continua.
function FramesStage({ nome, frames }) {
  const [frame, setFrame] = useState(0);
  // Com "reduzir movimento" ligado no sistema, abre parado; o toque alterna.
  const [playing, setPlaying] = useState(() => !prefersReducedMotion());
  const [loaded, setLoaded] = useState(0);
  const [failed, setFailed] = useState(false);
  const ready = loaded >= frames.length;

  useEffect(() => {
    if (!playing || !ready) return;
    const id = setInterval(() => setFrame(f => (f + 1) % frames.length), FRAME_MS);
    return () => clearInterval(id);
  }, [playing, ready, frames.length]);

  function handleTap() {
    if (playing) setPlaying(false);
    else if (prefersReducedMotion()) setFrame(f => (f + 1) % frames.length);
    else setPlaying(true);
  }

  return (
    <>
      <button
        type="button" className="demo-modal__stage"
        aria-label={playing ? 'Pausar demonstração' : 'Continuar demonstração'}
        onClick={handleTap} disabled={failed}
      >
        {frames.map((src, i) => (
          <img
            key={src} src={src} alt={`${nome} — quadro ${i + 1} de ${frames.length}`}
            className={`demo-modal__frame${i === frame ? ' demo-modal__frame--on' : ''}`}
            onLoad={() => setLoaded(n => n + 1)} onError={() => setFailed(true)}
            draggable="false"
          />
        ))}
        {!ready && !failed && <div className="demo-modal__loading skeleton" />}
        {failed && <p className="demo-modal__error">{OFFLINE_MSG}</p>}
        {ready && !failed && <span className="demo-modal__badge">{playing ? '⏸' : '▶'}</span>}
      </button>
      <div className="demo-modal__steps" aria-hidden="true">
        {/* O Free Exercise DB não garante qual quadro é o início do movimento — por isso só numera. */}
        {frames.map((src, i) => (
          <span key={src} className={frame === i ? 'is-on' : undefined}>Quadro {i + 1}</span>
        ))}
      </div>
    </>
  );
}

// Vídeo (padrão ou do admin) em loop, mudo, com o toque pausando/continuando e
// opção de câmera lenta; GIF/imagem do admin mostrada como veio.
function MediaStage({ nome, media }) {
  const videoRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [playing, setPlaying] = useState(() => !prefersReducedMotion());
  const [rate, setRate] = useState(1);
  const isVideo = media.type === 'video';

  useEffect(() => {
    if (videoRef.current) videoRef.current.playbackRate = rate;
  }, [rate, ready]);

  // Ao sair da tela cheia, libera a orientação travada.
  useEffect(() => {
    const onChange = () => { if (!document.fullscreenElement) screen.orientation?.unlock?.(); };
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  function handleTap() {
    const v = videoRef.current;
    if (!isVideo || !v) return;
    if (v.paused) { v.play().catch(() => {}); setPlaying(true); }
    else { v.pause(); setPlaying(false); }
  }

  return (
    <>
    <div className="demo-modal__stage-wrap">
    <button
      type="button" className={`demo-modal__stage demo-modal__stage--custom${ready ? '' : ' demo-modal__stage--loading'}`}
      aria-label={isVideo ? (playing ? 'Pausar vídeo' : 'Continuar vídeo') : `Demonstração de ${nome}`}
      onClick={handleTap} disabled={failed || !isVideo}
    >
      {isVideo ? (
        <video
          ref={videoRef} className="demo-modal__media" src={media.url}
          autoPlay={playing} loop muted playsInline preload="auto"
          onLoadedData={() => setReady(true)} onError={() => setFailed(true)}
        />
      ) : (
        <img
          className="demo-modal__media" src={media.url} alt={`Demonstração de ${nome}`}
          onLoad={() => setReady(true)} onError={() => setFailed(true)} draggable="false"
        />
      )}
      {!ready && !failed && <div className="demo-modal__loading skeleton" />}
      {failed && <p className="demo-modal__error">{OFFLINE_MSG}</p>}
      {isVideo && ready && !failed && <span className="demo-modal__badge">{playing ? '⏸' : '▶'}</span>}
    </button>
    {isVideo && ready && !failed && canFullscreen() && (
      <button
        type="button" className="demo-modal__fullscreen" aria-label="Ver em tela cheia"
        onClick={() => enterFullscreen(videoRef.current)}
      >⛶</button>
    )}
    </div>
    {isVideo && (
      <div className="demo-modal__steps demo-modal__speed" role="group" aria-label="Velocidade do vídeo">
        {SPEEDS.map(s => (
          <button
            key={s.rate} type="button" aria-pressed={rate === s.rate}
            className={rate === s.rate ? 'is-on' : undefined} onClick={() => setRate(s.rate)}
          >{s.label}</button>
        ))}
      </div>
    )}
    </>
  );
}

function ExerciseDemoModal({ nome, tecnica, media, onClose }) {
  useBackToClose(onClose);

  useEffect(() => {
    document.body.classList.add('modal-open');
    return () => document.body.classList.remove('modal-open');
  }, []);

  return createPortal(
    <div className="demo-modal" role="dialog" aria-modal="true" aria-label={`Execução: ${nome}`}>
      <div className="demo-modal__backdrop" onClick={onClose} />
      <div className="demo-modal__panel">
        <div className="demo-modal__header">
          <div className="demo-modal__titles">
            <span className="demo-modal__kicker">Como executar</span>
            <h2 className="demo-modal__title">{nome}</h2>
          </div>
          <button type="button" className="summary-modal__close" aria-label="Fechar" onClick={onClose}>✕</button>
        </div>

        {media.frames ? <FramesStage nome={nome} frames={media.frames} /> : <MediaStage nome={nome} media={media} />}

        {tecnica && <p className="demo-modal__tip">💡 {tecnica}</p>}
        <p className="demo-modal__credit">
          {media.custom ? 'Demonstração da equipe EAFIT' : media.stock ? media.credit : `Imagens: ${MEDIA_CREDIT}`}
        </p>
      </div>
    </div>,
    getModalRoot()
  );
}

// Botão "Ver execução" — não renderiza nada se o exercício não tem mídia
// própria (admin), vídeo nem quadros padrão (data/exerciseMedia.js).
export default function ExerciseDemo({ nome, tecnica, variant = 'link' }) {
  const [open, setOpen] = useState(false);
  const custom = useCustomExerciseMedia();
  const media = getExerciseMedia(nome, undefined, custom);
  if (!media) return null;

  return (
    <>
      <button type="button" className={`demo-btn demo-btn--${variant}`} onClick={() => setOpen(true)}>
        <span aria-hidden="true">▶</span> Ver execução
      </button>
      {open && <ExerciseDemoModal nome={nome} tecnica={tecnica} media={media} onClose={() => setOpen(false)} />}
    </>
  );
}
