import { useEffect, useRef, useState } from 'react';
import { buzz } from './haptics';
import { t } from '../../lib/i18n';

export const COUNTDOWN_FROM = 3;

// Contagem 3-2-1 antes de a corrida começar: dá tempo de guardar o celular e
// se posicionar. "Começar já" pula; "Cancelar" volta sem iniciar nada.
export default function StartCountdown({ onDone, onCancel, note = '' }) {
  const [n, setN] = useState(COUNTDOWN_FROM);
  const done = useRef(onDone);
  done.current = onDone;

  useEffect(() => {
    if (n <= 0) { buzz('km'); done.current(); return undefined; }
    buzz('resume');
    const id = setTimeout(() => setN(v => v - 1), 1000);
    return () => clearTimeout(id);
  }, [n]);

  return (
    <div className="run-countdown" role="dialog" aria-modal="true" aria-label={t('Contagem para começar a corrida')}>
      <svg className="run-countdown__runner" viewBox="0 0 120 120" aria-hidden="true" focusable="false">
        <g className="run-countdown__ground">
          <line x1="0" y1="112" x2="120" y2="112" />
        </g>
        <g className="run-countdown__body">
          <line className="run-countdown__limb run-countdown__leg-a" x1="60" y1="70" x2="60" y2="102" />
          <line className="run-countdown__limb run-countdown__leg-b" x1="60" y1="70" x2="60" y2="102" />
          <g transform="rotate(10 60 70)">
            <line x1="60" y1="70" x2="60" y2="42" />
            <circle cx="60" cy="31" r="9" fill="currentColor" stroke="none" />
            <line className="run-countdown__limb run-countdown__arm-a" x1="60" y1="46" x2="60" y2="68" />
            <line className="run-countdown__limb run-countdown__arm-b" x1="60" y1="46" x2="60" y2="68" />
          </g>
        </g>
      </svg>
      <div key={n} className="run-countdown__n" role="status" aria-live="assertive">{n > 0 ? n : t('Já!')}</div>
      {note && <p className="run-countdown__note" role="status">{note}</p>}
      <div className="run-countdown__actions">
        <button type="button" className="btn btn--ghost" onClick={onCancel}>{t('Cancelar')}</button>
        <button type="button" className="btn btn--primary" onClick={() => setN(0)}>{t('Começar já')}</button>
      </div>
    </div>
  );
}
