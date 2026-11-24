import { useEffect, useRef, useState } from 'react';
import { trackFeature } from '../lib/tracking';
import { createPortal } from 'react-dom';
import { playRestDoneSound } from '../lib/sound';
import { getModalRoot } from '../lib/modalRoot';
import { useBackToClose } from '../hooks/useBackToClose';

import { t } from '../lib/i18n';
const RADIUS = 90;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export default function RestTimer({ session, onClose }) {
  useBackToClose(onClose);
  const [left, setLeft] = useState(session.seconds);
  // Duração total do descanso (cresce com +15s e com o ajuste pelo RIR) para o anel não passar de 100%.
  const [total, setTotal] = useState(session.seconds);
  const [paused, setPaused] = useState(false);
  const doneRef = useRef(false);

  useEffect(() => {
    setLeft(session.seconds);
    setTotal(session.seconds);
    doneRef.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.key]);

  useEffect(() => {
    if (paused) return;
    const id = setInterval(() => {
      setLeft(l => {
        if (l <= 1) {
          clearInterval(id);
          if (!doneRef.current) { doneRef.current = true; playRestDoneSound(); }
          return 0;
        }
        return l - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [paused, session.key]);

  // Ajuste vindo do RIR da série (lib/restAdapt.js): só enquanto o descanso corre.
  const adjustId = session.adjust?.id;
  useEffect(() => {
    if (!adjustId || doneRef.current) return;
    const delta = session.adjust.delta;
    setLeft(l => (l > 0 ? Math.max(1, l + delta) : l));
    setTotal(tt => Math.max(1, tt + delta));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adjustId]);

  // Prevent the page behind the modal from scrolling while it's open.
  useEffect(() => {
    trackFeature('rest_timer');
    document.body.classList.add('modal-open');
    return () => document.body.classList.remove('modal-open');
  }, []);

  const finished = left <= 0;

  // Auto-close once the rest is over, giving a beat for the beep/checkmark to register.
  useEffect(() => {
    if (!finished) return;
    const id = setTimeout(onClose, 1200);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finished, session.key]);

  const mm = String(Math.floor(left / 60)).padStart(2, '0');
  const ss = String(left % 60).padStart(2, '0');
  const pct = total ? Math.min(1, Math.max(0, (total - left) / total)) : 1;
  const dashoffset = CIRCUMFERENCE * (1 - pct);

  return createPortal(
    <div className="rest-modal" role="dialog" aria-modal="true">
      <div className="rest-modal__backdrop" />
      <div className="rest-modal__panel">
        <button type="button" className="rest-modal__close" aria-label={t('Fechar timer')} onClick={onClose}>✕</button>
        <span className="rest-modal__label">{t('Descanso · {label}', { label: session.label })}</span>

        <div className="rest-modal__ring">
          <svg viewBox="0 0 200 200" className="rest-modal__svg">
            <circle className="rest-modal__track" cx="100" cy="100" r={RADIUS} />
            <circle
              className={`rest-modal__progress${finished ? ' rest-modal__progress--done' : ''}`}
              cx="100" cy="100" r={RADIUS}
              strokeDasharray={CIRCUMFERENCE}
              strokeDashoffset={dashoffset}
            />
          </svg>
          <div className="rest-modal__clock">
            {finished ? '✓' : `${mm}:${ss}`}
          </div>
        </div>

        <div className="rest-modal__actions">
          {!finished && (
            <>
              <button type="button" className="rest-modal__btn" aria-label={t('Mais 15 segundos de descanso')} onClick={() => { setLeft(l => l + 15); setTotal(tt => tt + 15); }}>+15s</button>
              <button type="button" className="rest-modal__btn" onClick={() => setPaused(p => !p)}>
                {paused ? t('▶ Continuar') : t('⏸ Pausar')}
              </button>
            </>
          )}
        </div>

        <button
          type="button"
          className="rest-modal__release"
          disabled={!finished}
          onClick={onClose}
        >
          {finished ? t('Continuando…') : t('Aguarde o descanso terminar')}
        </button>
      </div>
    </div>,
    getModalRoot()
  );
}
