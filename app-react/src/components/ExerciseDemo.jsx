import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { getModalRoot } from '../lib/modalRoot';
import { getExerciseMedia, MEDIA_CREDIT } from '../data/exerciseMedia';
import { useBackToClose } from '../hooks/useBackToClose';

const FRAME_MS = 900;

function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

function ExerciseDemoModal({ nome, tecnica, media, onClose }) {
  useBackToClose(onClose);
  const [frame, setFrame] = useState(0);
  // Com "reduzir movimento" ligado no sistema, abre parado; o toque alterna.
  const [playing, setPlaying] = useState(() => !prefersReducedMotion());
  const [loaded, setLoaded] = useState(0);
  const [failed, setFailed] = useState(false);
  const ready = loaded >= media.frames.length;

  useEffect(() => {
    document.body.classList.add('modal-open');
    return () => document.body.classList.remove('modal-open');
  }, []);

  useEffect(() => {
    if (!playing || !ready) return;
    const id = setInterval(() => setFrame(f => (f + 1) % media.frames.length), FRAME_MS);
    return () => clearInterval(id);
  }, [playing, ready, media.frames.length]);

  function handleTap() {
    if (playing) setPlaying(false);
    else if (prefersReducedMotion()) setFrame(f => (f + 1) % media.frames.length);
    else setPlaying(true);
  }

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

        <button
          type="button" className="demo-modal__stage"
          aria-label={playing ? 'Pausar demonstração' : 'Continuar demonstração'}
          onClick={handleTap} disabled={failed}
        >
          {media.frames.map((src, i) => (
            <img
              key={src} src={src} alt={`${nome} — quadro ${i + 1} de ${media.frames.length}`}
              className={`demo-modal__frame${i === frame ? ' demo-modal__frame--on' : ''}`}
              onLoad={() => setLoaded(n => n + 1)} onError={() => setFailed(true)}
              draggable="false"
            />
          ))}
          {!ready && !failed && <div className="demo-modal__loading skeleton" />}
          {failed && (
            <p className="demo-modal__error">
              Sem conexão — a demonstração aparece quando você estiver online (depois disso ela fica salva no aparelho).
            </p>
          )}
          {ready && !failed && (
            <span className="demo-modal__badge">{playing ? '⏸' : '▶'}</span>
          )}
        </button>

        <div className="demo-modal__steps" aria-hidden="true">
          {/* O Free Exercise DB não garante qual quadro é o início do movimento — por isso só numera. */}
          {media.frames.map((src, i) => (
            <span key={src} className={frame === i ? 'is-on' : undefined}>Quadro {i + 1}</span>
          ))}
        </div>

        {tecnica && <p className="demo-modal__tip">💡 {tecnica}</p>}
        <p className="demo-modal__credit">Imagens: {MEDIA_CREDIT}</p>
      </div>
    </div>,
    getModalRoot()
  );
}

// Botão "Ver execução" — não renderiza nada se o exercício não tem
// demonstração mapeada (data/exerciseMedia.js).
export default function ExerciseDemo({ nome, tecnica, variant = 'link' }) {
  const [open, setOpen] = useState(false);
  const media = getExerciseMedia(nome);
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
