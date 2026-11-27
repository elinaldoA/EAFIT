import { useId } from 'react';

// Cenários da EAFIT Arena, desenhados em SVG: a academia (Gym) e a pista de
// corrida (Run). Ficam atrás do herói, sem texto, só ambientação.
export default function ArenaScene({ sport }) {
  const uid = useId().replace(/:/g, '');

  if (sport === 'run') {
    return (
      <svg className="arena-scene" viewBox="0 0 320 200" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
        <defs>
          <linearGradient id={`sky-${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#38BDF8" />
            <stop offset="100%" stopColor="#FDE68A" />
          </linearGradient>
        </defs>
        <rect width="320" height="200" fill={`url(#sky-${uid})`} />
        <circle cx="252" cy="52" r="22" fill="#FEF3C7" opacity="0.95" />
        <path d="M0 128 Q60 96 120 124 T240 118 T320 126 L320 200 L0 200 Z" fill="#86EFAC" />
        <path d="M0 144 Q80 118 160 142 T320 140 L320 200 L0 200 Z" fill="#4ADE80" />
        {[34, 78, 262, 296].map((x, i) => (
          <g key={x}>
            <rect x={x - 2} y={118 + (i % 2) * 6} width="4" height="16" fill="#92400E" />
            <circle cx={x} cy={112 + (i % 2) * 6} r="12" fill="#16A34A" />
          </g>
        ))}
        <path d="M120 200 L146 150 L174 150 L200 200 Z" fill="#C2410C" />
        <path d="M-40 200 L120 150 L146 150 L60 200 Z" fill="#C2410C" opacity="0.85" />
        <path d="M200 200 L174 150 L200 150 L360 200 Z" fill="#C2410C" opacity="0.85" />
        <path d="M148 200 L158 150 M172 200 L162 150" stroke="#fff" strokeWidth="2" opacity="0.7" />
      </svg>
    );
  }

  return (
    <svg className="arena-scene" viewBox="0 0 320 200" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
      <defs>
        <linearGradient id={`wall-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1E293B" />
          <stop offset="100%" stopColor="#0F172A" />
        </linearGradient>
        <radialGradient id={`spot-${uid}`} cx="50%" cy="0%" r="75%">
          <stop offset="0%" stopColor="#FDE68A" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#FDE68A" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="320" height="200" fill={`url(#wall-${uid})`} />
      <rect x="116" y="26" width="88" height="56" rx="4" fill="#38BDF8" opacity="0.5" />
      <path d="M160 26 V82 M116 54 H204" stroke="#0F172A" strokeWidth="3" />
      <g fill="#475569">
        <rect x="14" y="70" width="6" height="84" />
        <rect x="52" y="70" width="6" height="84" />
        <rect x="14" y="74" width="44" height="5" />
        <rect x="14" y="104" width="44" height="5" />
        <rect x="262" y="70" width="6" height="84" />
        <rect x="300" y="70" width="6" height="84" />
        <rect x="262" y="74" width="44" height="5" />
        <rect x="262" y="104" width="44" height="5" />
      </g>
      <g fill="#F97316">
        <circle cx="22" cy="73" r="7" />
        <circle cx="50" cy="73" r="7" />
        <circle cx="270" cy="103" r="7" />
        <circle cx="298" cy="103" r="7" />
      </g>
      <rect y="150" width="320" height="50" fill="#334155" />
      <path d="M0 168 H320 M0 186 H320" stroke="#1E293B" strokeWidth="1.5" opacity="0.7" />
      <ellipse cx="160" cy="154" rx="120" ry="14" fill="#0F172A" opacity="0.35" />
      <rect width="320" height="200" fill={`url(#spot-${uid})`} />
    </svg>
  );
}
