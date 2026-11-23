import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { getModalRoot } from '../../lib/modalRoot';
import { useBackToClose } from '../../hooks/useBackToClose';
import { mapView, cleanRoute } from './route';
import { formatClock, formatKm } from './runs';
import { t } from '../../lib/i18n';

const W = 320;
const H = 260;
const SPEED = 20; // o replay roda 20× mais rápido que a corrida

const label = r => (r.isMe ? t('Você') : r.name || '?');

// Flyby: as duas corridas que aconteceram ao mesmo tempo, com um ponto de cada
// corredor andando pelo percurso. `candidates`: [{ other, flyby }] (runFlyby.flybyCandidates).
export default function RunFlyby({ run, candidates, onClose }) {
  useBackToClose(onClose);
  const [index, setIndex] = useState(0);
  const [pos, setPos] = useState(0); // segundos desde o começo da janela em comum
  const [playing, setPlaying] = useState(false);
  const { other, flyby } = candidates[index];

  useEffect(() => {
    document.body.classList.add('modal-open');
    return () => document.body.classList.remove('modal-open');
  }, []);

  // Troca de corredor: volta ao começo.
  useEffect(() => { setPos(0); setPlaying(false); }, [index]);

  useEffect(() => {
    if (!playing) return undefined;
    const id = setInterval(() => {
      setPos(p => {
        if (p + SPEED / 10 >= flyby.windowS) { setPlaying(false); return flyby.windowS; }
        return p + SPEED / 10;
      });
    }, 100);
    return () => clearInterval(id);
  }, [playing, flyby]);

  // Os dois percursos no mesmo quadro (sem o mapa de ruas: só as linhas e os pontos).
  const view = useMemo(() => mapView([...cleanRoute(run.route), ...cleanRoute(other.route)], W, H, 18), [run, other]);
  if (!view) return null;
  const sample = flyby.samples.reduce((best, s) => (Math.abs(s.s - pos) < Math.abs(best.s - pos) ? s : best), flyby.samples[0]);
  const pa = view.place(sample.a);
  const pb = view.place(sample.b);
  const together = sample.d <= 50;

  return createPortal(
    <div className="summary-modal" role="dialog" aria-modal="true" aria-label={t('Flyby')}>
      <div className="summary-modal__backdrop" onClick={onClose} />
      <div className="summary-modal__panel">
        <div className="summary-modal__header">
          <div>
            <h2 className="summary-modal__title">{t('🛰️ Flyby')}</h2>
            <p className="summary-modal__subtitle">{t('{v1} e {v2}, correndo ao mesmo tempo', { v1: label(run), v2: label(other) })}</p>
          </div>
          <button type="button" className="summary-modal__close" aria-label={t('Fechar')} onClick={onClose}>✕</button>
        </div>
        <div className="summary-modal__body">
          {candidates.length > 1 && (
            <div className="run-chips" role="group" aria-label={t('Com quem comparar')}>
              {candidates.map((c, i) => (
                <button key={c.other.id} type="button" aria-pressed={index === i} className={`run-chip${index === i ? ' run-chip--on' : ''}`} onClick={() => setIndex(i)}>{label(c.other)}</button>
              ))}
            </div>
          )}
          <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t('Os dois percursos com um ponto para cada corredor')} style={{ width: '100%', height: 'auto', background: 'var(--surface-2)', borderRadius: 'var(--r-lg)' }}>
            {cleanRoute(other.route).map((seg, i) => (
              <path key={`b${i}`} d={seg.map((p, j) => `${j ? 'L' : 'M'}${view.place(p).join(' ')}`).join('')} fill="none" stroke="#38bdf8" strokeOpacity=".55" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            ))}
            {cleanRoute(run.route).map((seg, i) => (
              <path key={`a${i}`} d={seg.map((p, j) => `${j ? 'L' : 'M'}${view.place(p).join(' ')}`).join('')} fill="none" stroke="var(--primary, #f97316)" strokeOpacity=".7" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            ))}
            <circle cx={pb[0]} cy={pb[1]} r="7" fill="#38bdf8" stroke="#fff" strokeWidth="2" />
            <circle cx={pa[0]} cy={pa[1]} r="7" fill="var(--primary, #f97316)" stroke="#fff" strokeWidth="2" />
          </svg>
          <div className="run-chips" aria-hidden="true">
            <span className="run-chip run-chip--on">● {label(run)}</span>
            <span className="run-chip" style={{ borderColor: '#38bdf8' }}>● {label(other)}</span>
          </div>
          <input
            type="range" min="0" max={flyby.windowS} step="1" value={Math.round(pos)}
            aria-label={t('Momento da corrida')} onChange={e => { setPlaying(false); setPos(Number(e.target.value)); }}
          />
          <p className="run-item__weather" role="status">
            {formatClock(Math.round(pos))} · {together ? t('juntos ({v1} m)', { v1: sample.d }) : t('{v1} m de distância', { v1: sample.d })}
          </p>
          <p className="profile-field__hint">
            {flyby.togetherS > 0
              ? t('Correram juntos (a menos de 50 m) por {v1}, cerca de {v2} km. A menor distância entre vocês foi {v3} m.', { v1: formatClock(flyby.togetherS), v2: formatKm(flyby.togetherM), v3: flyby.minM })
              : t('Não chegaram a correr juntos, mas passaram a {v1} m um do outro.', { v1: flyby.minM })}
          </p>
        </div>
        <div className="summary-modal__footer">
          <button type="button" className="btn btn--primary btn--full" onClick={() => { if (pos >= flyby.windowS) setPos(0); setPlaying(p => !p); }}>
            {playing ? t('⏸ Pausar') : t('▶ Reproduzir')}
          </button>
          <button type="button" className="btn btn--outline btn--full" onClick={onClose}>{t('Fechar')}</button>
        </div>
      </div>
    </div>,
    getModalRoot()
  );
}
