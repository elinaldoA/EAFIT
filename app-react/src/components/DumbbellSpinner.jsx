import { useSyncExternalStore } from 'react';
import { currentSeason } from '../lib/season';

// Spinner de carregamento. Na musculação: um halter fazendo repetições (sobe e
// desce); no Dia das Bruxas as anilhas viram abóboras. No módulo Run
// (<html data-spinner="corrida">): um corredor em movimento.
export const isRunModule = () =>
  typeof document !== 'undefined' && document.documentElement.getAttribute('data-spinner') === 'corrida';

// O spinner do módulo (<html data-spinner>, lib/sportModule.js) só é marcado
// depois que a conta carrega (no login, por exemplo, o spinner já está na tela
// antes): acompanha a mudança do atributo
// para trocar o halter pelo corredor na hora.
function subscribeModule(onChange) {
  if (typeof MutationObserver === 'undefined') return () => {};
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-spinner'] });
  return () => observer.disconnect();
}

export function RunnerSvg() {
  return (
    <svg className="dumbbell__svg dumbbell__svg--runner" viewBox="0 0 48 44" aria-hidden="true">
      <g className="runner__body">
        {/* braço de trás e perna de trás ficam mais apagados: dão profundidade */}
        <g className="runner__arm runner__arm--b" opacity=".55">
          <path d="M26 15l-5 6 5 4" />
        </g>
        <g className="runner__leg runner__leg--b" opacity=".55">
          <path d="M23 26l-4 8 -6 3" />
        </g>
        <path className="runner__torso" d="M27 14l-4 12" />
        <circle className="runner__head" cx="29" cy="7" r="4.2" />
        <g className="runner__leg runner__leg--f">
          <path d="M23 26l6 6 -2 8" />
        </g>
        <g className="runner__arm runner__arm--f">
          <path d="M26 15l6 5 -1 6" />
        </g>
      </g>
    </svg>
  );
}

export default function DumbbellSpinner({ size = 'md' }) {
  const running = useSyncExternalStore(subscribeModule, isRunModule, () => false);
  if (running) {
    return (
      <span className={`dumbbell dumbbell--runner dumbbell--${size}`} aria-hidden="true">
        <RunnerSvg />
      </span>
    );
  }
  const pumpkins = currentSeason() === 'halloween';
  return (
    <span className={`dumbbell dumbbell--${size}`} aria-hidden="true">
      <svg className="dumbbell__svg" viewBox="0 0 64 32" aria-hidden="true">
        <rect x="18" y="14" width="28" height="4" rx="2" fill="currentColor" opacity=".55" />
        {pumpkins ? (
          <>
            <path d="M12 6.5l1.5-3M52 6.5l-1.5-3" stroke="#16a34a" strokeWidth="2" strokeLinecap="round" />
            <ellipse cx="12" cy="17" rx="8" ry="10" fill="var(--primary, #f97316)" />
            <ellipse cx="52" cy="17" rx="8" ry="10" fill="var(--primary, #f97316)" />
            <path d="M12 7.5c-3 3-3 16 0 19M12 7.5c3 3 3 16 0 19M52 7.5c-3 3-3 16 0 19M52 7.5c3 3 3 16 0 19" stroke="#c2410c" strokeWidth="1.2" fill="none" />
          </>
        ) : (
          <>
            <rect x="14" y="6" width="5" height="20" rx="2" fill="var(--primary, #f97316)" />
            <rect x="45" y="6" width="5" height="20" rx="2" fill="var(--primary, #f97316)" />
            <rect x="8" y="10" width="5" height="12" rx="2" fill="currentColor" />
            <rect x="51" y="10" width="5" height="12" rx="2" fill="currentColor" />
          </>
        )}
      </svg>
    </span>
  );
}
