import { useEffect, useRef, useState } from 'react';
import { buzz } from './haptics';
import { t } from '../../lib/i18n';

export const COUNTDOWN_FROM = 3;

// Perna: coxa (com a perna do short) + canela + tênis. Braço: braço + antebraço + mão.
// Os dois lados usam a mesma animação, defasada em meio ciclo (ver run.css).
function RunnerLeg({ far = false }) {
  return (
    <g className={`rc-leg ${far ? 'rc-far rc-phase-b' : 'rc-phase-a'}`}>
      <path className="rc-skin" d="M87 112 L106 112 L104 146 L90 146 Z" />
      <path className="rc-shorts" d="M84 108 L109 108 L107 132 L86 132 Z" />
      <g className="rc-shin">
        <path className="rc-skin" d="M90 144 L104 144 L101 180 L92 180 Z" />
        <path className="rc-shoe" d="M88 177 L102 177 L113 184 Q115 190 109 190 L88 190 Q84 190 86 183 Z" />
        <path className="rc-sole" d="M86 189 L111 189" />
      </g>
    </g>
  );
}

function RunnerArm({ far = false }) {
  return (
    <g className={`rc-arm ${far ? 'rc-far rc-phase-a' : 'rc-phase-b'}`}>
      <path className="rc-skin" d="M94 58 L108 58 L106 90 L96 90 Z" />
      <g className="rc-fore">
        <path className="rc-skin" d="M95 88 L107 88 L105 114 L97 114 Z" />
        <ellipse className="rc-skin" cx="101" cy="118" rx="5.5" ry="6.5" />
      </g>
    </g>
  );
}

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
      <svg className="run-countdown__runner" viewBox="0 0 200 200" aria-hidden="true" focusable="false">
        <defs>
          <linearGradient id="rc-shirt-g" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#ff5a1f" />
            <stop offset="1" stopColor="#ff8a2a" />
          </linearGradient>
        </defs>
        <ellipse className="run-countdown__shadow" cx="100" cy="193" rx="42" ry="3.5" />
        <line className="run-countdown__ground" x1="0" y1="196" x2="200" y2="196" />
        <g className="run-countdown__body">
          <RunnerLeg far />
          <g transform="rotate(9 96 112)">
            <RunnerArm far />
            <path className="rc-shirt" d="M82 56 Q98 48 114 58 L110 114 Q96 120 82 114 Z" />
            <path className="rc-shorts" d="M80 108 L112 108 L114 124 Q96 132 80 126 Z" />
            <path className="rc-skin" d="M100 44 L112 44 L112 56 L100 58 Z" />
            <ellipse className="rc-skin" cx="108" cy="30" rx="11" ry="13" />
            <path className="rc-hair" d="M96 30 Q94 14 110 15 Q122 16 120 26 Q112 20 104 28 Q101 33 96 30 Z" />
            <RunnerArm />
          </g>
          <RunnerLeg />
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
