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

// Ciclo de corrida em 4 quadros (passada, apoio, passada com as pernas trocadas,
// apoio): cada quadro é um desenho completo e o CSS (loading.css) mostra um de
// cada vez, então o corredor corre de verdade em vez de só balançar os membros.
// Mesmo padrão do halter: corpo e cabeça na cor do módulo, membros em
// currentColor (os do lado de trás mais apagados) e tênis na cor do módulo.
// Os mesmos quadros estão em index.html (splash estática).
const RUN_POSES = [
  { y: -1.2,
    far: { limbs: ["M23 26l-6 7 -9 -2", "M27 15l5 6 6 -3"], foot: "M8 31l-3 2.5" },
    near: { limbs: ["M23 26l8 4 3 9", "M27 15l-6 5 -5 -5"], foot: "M34 39l4 1" } },
  { y: 0,
    far: { limbs: ["M23 26l5 5 -7 3", "M27 15l2 6 5 -1"], foot: "M21 34l4 2" },
    near: { limbs: ["M23 26l2 8 -2 8", "M27 15l-1 6 5 2"], foot: "M23 42l4.5 0" } },
  { y: -1.2,
    far: { limbs: ["M23 26l8 4 3 9", "M27 15l-6 5 -5 -5"], foot: "M34 39l4 1" },
    near: { limbs: ["M23 26l-6 7 -9 -2", "M27 15l5 6 6 -3"], foot: "M8 31l-3 2.5" } },
  { y: 0,
    far: { limbs: ["M23 26l2 8 -2 8", "M27 15l-1 6 5 2"], foot: "M23 42l4.5 0" },
    near: { limbs: ["M23 26l5 5 -7 3", "M27 15l2 6 5 -1"], foot: "M21 34l4 2" } },
];

function RunLimbs({ limbs, foot }) {
  return (
    <>
      {limbs.map(d => <path key={d} d={d} />)}
      <path className="runner__shoe" d={foot} />
    </>
  );
}

export function RunnerSvg() {
  return (
    <svg className="dumbbell__svg dumbbell__svg--runner" viewBox="0 0 48 44" aria-hidden="true">
      <ellipse className="runner__shadow" cx="24" cy="43.5" rx="14" ry="1.6" />
      {RUN_POSES.map((pose, i) => (
        <g key={i} className={`runner__frame runner__frame--${i + 1}`} transform={`translate(0 ${pose.y})`}>
          <g className="runner__far" opacity=".55"><RunLimbs {...pose.far} /></g>
          <path className="runner__torso" d="M28 14l-5 12" />
          <circle className="runner__head" cx="30" cy="7" r="4.6" />
          <RunLimbs {...pose.near} />
        </g>
      ))}
    </svg>
  );
}

export default function DumbbellSpinner({ size = 'md' }) {
  const running = useRunSpinner();
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
