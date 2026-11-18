import { useEffect, useRef, useState } from 'react';
import { buzz } from './haptics';
import { t } from '../../lib/i18n';

export const COUNTDOWN_FROM = 3;

// Perna: coxa (com short) + canela + tênis. Braço: braço + antebraço + mão.
// Os dois lados usam a mesma animação, defasada em meio ciclo (ver run.css).
function RunnerLeg({ far = false }) {
  return (
    <g className={`rc-leg ${far ? 'rc-far rc-phase-b' : 'rc-phase-a'}`}>
      <line className="rc-skin-l" x1="58" y1="68" x2="58" y2="87" />
      <line className="rc-shorts" x1="58" y1="68" x2="58" y2="78" />
      <g className="rc-shin">
        <line className="rc-skin-l" x1="58" y1="87" x2="58" y2="104" />
        <line className="rc-shoe" x1="58" y1="106" x2="65" y2="106" />
      </g>
    </g>
  );
}

function RunnerArm({ far = false }) {
  return (
    <g className={`rc-arm ${far ? 'rc-far rc-phase-a' : 'rc-phase-b'}`}>
      <line className="rc-sleeve" x1="61" y1="44" x2="61" y2="56" />
      <g className="rc-fore">
        <line className="rc-skin-l" x1="61" y1="56" x2="61" y2="67" />
        <circle className="rc-skin" cx="61" cy="69" r="3.2" />
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
      <svg className="run-countdown__runner" viewBox="0 0 120 120" aria-hidden="true" focusable="false">
        <line className="run-countdown__ground" x1="0" y1="113" x2="120" y2="113" />
        <g className="run-countdown__body">
          <RunnerLeg far />
          <RunnerArm far />
          <g className="run-countdown__torso">
            <line className="rc-shirt" x1="57" y1="64" x2="63" y2="42" />
            <line className="rc-shorts" x1="57" y1="66" x2="58" y2="72" />
            <circle className="rc-skin" cx="67" cy="26" r="9" />
            <path className="rc-hair" d="M58 26 a9 9 0 0 1 17 -4 q-8 -3 -13 2 z" />
          </g>
          <RunnerLeg />
          <RunnerArm />
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
