import { useId } from 'react';
import { HAIR_COLORS, OUTFITS, SKIN, heroTier, sanitizeHero } from '../lib/hero';

// Herói da EAFIT Arena, desenhado em SVG por camadas (sem imagem nem biblioteca):
// corpo, pele, cabelo e cor da roupa vêm das escolhas da pessoa; o equipamento
// vem do nível (lib/hero.js → heroTier):
//   1 Novato     camiseta
//   2 Dedicado   + faixa na testa e munhequeiras
//   3 Atleta     + cinto e detalhes dourados no tênis
//   4 Veterano   + ombreiras
//   5 Elite      + capa e aura
//   6 Lenda      + acabamento dourado, halo e aura dourada
// mood: 'idle' (respira e pisca), 'cheer' (pula e levanta os braços) ou 'still'.
// crop="head" mostra só a cabeça (usado nas opções de cabelo da criação).

const BODY = {
  1: { shoulder: 22, waist: 19, arm: 9, leg: 15 },
  2: { shoulder: 26, waist: 23, arm: 11, leg: 17 },
  3: { shoulder: 31, waist: 28, arm: 13, leg: 19 },
};
const PANTS = '#1F2937';
const GOLD = '#FBBF24';

function BackHair({ style, color }) {
  if (style === 3) return <path d="M74 74 Q70 44 100 44 Q130 44 126 74 L131 122 Q114 113 100 113 Q86 113 69 122 Z" fill={color} />;
  if (style === 4) return <circle cx="100" cy="64" r="35" fill={color} />;
  return null;
}

function FrontHair({ style, color }) {
  switch (style) {
    case 1: return <path d="M75 74 Q74 47 100 47 Q126 47 125 74 Q117 61 100 61 Q83 61 75 74 Z" fill={color} />;
    case 2: return <path d="M75 72 L79 49 L90 60 L96 41 L104 58 L113 44 L118 60 L125 72 Q112 59 100 59 Q88 59 75 72 Z" fill={color} />;
    case 3: return <path d="M75 72 Q86 50 100 55 Q114 50 125 72 Q113 63 100 65 Q87 63 75 72 Z" fill={color} />;
    case 4: return <path d="M77 68 Q100 52 123 68 Q112 60 100 60 Q88 60 77 68 Z" fill={color} />;
    case 5: return (
      <>
        <path d="M75 74 Q74 47 100 47 Q126 47 125 74 Q117 61 100 61 Q83 61 75 74 Z" fill={color} />
        <circle cx="100" cy="38" r="9" fill={color} />
      </>
    );
    default: return null;
  }
}

export default function HeroAvatar({ hero, level = 1, mood = 'idle', crop = 'full', className = '', label }) {
  const uid = useId().replace(/:/g, '');
  const h = sanitizeHero(hero);
  const { tier } = heroTier(level);
  const b = BODY[h.body];
  const skin = SKIN[h.skin - 1];
  const hair = HAIR_COLORS[h.hair_color - 1];
  const outfit = OUTFITS[h.outfit - 1];
  const sx = 100 - b.shoulder;
  const ex = 100 + b.shoulder;
  const aura = tier >= 6 ? GOLD : outfit;
  const viewBox = crop === 'head' ? '58 28 84 84' : '0 0 200 280';

  const arm = (side) => {
    const dir = side === 'l' ? -1 : 1;
    const x0 = 100 + dir * (b.shoulder - 2);
    const x1 = x0 + dir * 8;
    return (
      <g className={`hero__arm hero__arm--${side}`} style={{ transformOrigin: `${x0}px 114px` }}>
        <line x1={x0} y1="114" x2={x1} y2="168" stroke={skin} strokeWidth={b.arm} strokeLinecap="round" />
        <line x1={x0} y1="114" x2={x0 + dir * 3} y2="142" stroke={outfit} strokeWidth={b.arm + 4} strokeLinecap="round" />
        {tier >= 2 && <rect x={x1 - (b.arm + 4) / 2 - dir * 0.6} y="156" width={b.arm + 4} height="6" rx="3" fill="#fff" />}
        <circle cx={x1} cy="171" r={b.arm * 0.58} fill={skin} />
      </g>
    );
  };

  return (
    <svg
      className={`hero hero--${mood} hero--t${tier} ${className}`.trim()}
      viewBox={viewBox}
      role="img"
      aria-label={label || 'Herói'}
      data-tier={tier}
    >
      <defs>
        <radialGradient id={`aura-${uid}`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={aura} stopOpacity="0.55" />
          <stop offset="100%" stopColor={aura} stopOpacity="0" />
        </radialGradient>
      </defs>

      {crop === 'full' && (
        <>
          <ellipse cx="100" cy="259" rx="46" ry="7" fill="#000" opacity="0.28" />
          {tier >= 5 && <circle className="hero__aura" cx="100" cy="150" r="84" fill={`url(#aura-${uid})`} />}
        </>
      )}

      <g className="hero__body">
        {crop === 'full' && tier >= 5 && (
          <path className="hero__cape" d={`M${sx + 3} 110 Q56 176 68 238 L132 238 Q144 176 ${ex - 3} 110 Z`} fill="#B91C1C" />
        )}

        <BackHair style={h.hair_style} color={hair} />

        {crop === 'full' && (
          <>
            {/* pernas e tênis */}
            <rect x={100 - b.leg - 2} y="172" width={b.leg} height="72" rx="6" fill={PANTS} />
            <rect x="102" y="172" width={b.leg} height="72" rx="6" fill={PANTS} />
            <rect x={100 - b.leg - 6} y="238" width={b.leg + 9} height="16" rx="8" fill="#fff" />
            <rect x="97" y="238" width={b.leg + 9} height="16" rx="8" fill="#fff" />
            <rect x={100 - b.leg - 6} y="249" width={b.leg + 9} height="5" rx="2.5" fill={tier >= 3 ? GOLD : '#CBD5E1'} />
            <rect x="97" y="249" width={b.leg + 9} height="5" rx="2.5" fill={tier >= 3 ? GOLD : '#CBD5E1'} />

            {/* braços de trás e tronco */}
            {arm('l')}
            {arm('r')}
            <path
              d={`M${sx} 114 Q${sx} 106 ${sx + 9} 106 L${ex - 9} 106 Q${ex} 106 ${ex} 114 L${100 + b.waist} 178 L${100 - b.waist} 178 Z`}
              fill={outfit}
              stroke={tier >= 6 ? GOLD : 'none'}
              strokeWidth="2.5"
            />
            <path d="M92 106 L100 119 L108 106 Z" fill={skin} />
            <text x="100" y="154" textAnchor="middle" fontSize="17" fontWeight="800" fill="#fff" opacity="0.92" fontFamily="system-ui, sans-serif">E</text>
            {tier >= 3 && (
              <>
                <rect x={100 - b.waist - 1} y="171" width={b.waist * 2 + 2} height="8" rx="2" fill="#111827" />
                <rect x="95" y="170" width="10" height="10" rx="2" fill={GOLD} />
              </>
            )}
            {tier >= 4 && (
              <>
                <ellipse cx={sx + 2} cy="112" rx="12" ry="8" fill="#9CA3AF" stroke={outfit} strokeWidth="2" />
                <ellipse cx={ex - 2} cy="112" rx="12" ry="8" fill="#9CA3AF" stroke={outfit} strokeWidth="2" />
              </>
            )}
            <rect x="92" y="94" width="16" height="16" rx="5" fill={skin} />
          </>
        )}

        {/* cabeça */}
        <circle cx="76" cy="76" r="5" fill={skin} />
        <circle cx="124" cy="76" r="5" fill={skin} />
        <circle cx="100" cy="74" r="25" fill={skin} />
        <g className="hero__eyes">
          <ellipse cx="91" cy="76" rx="2.7" ry="3.5" fill="#1a1a1a" />
          <ellipse cx="109" cy="76" rx="2.7" ry="3.5" fill="#1a1a1a" />
        </g>
        <path d="M86 69 Q91 66 96 69 M104 69 Q109 66 114 69" stroke="#1a1a1a" strokeWidth="1.6" fill="none" strokeLinecap="round" opacity="0.7" />
        <path d="M93 86 Q100 92 107 86" stroke="#1a1a1a" strokeWidth="2" fill="none" strokeLinecap="round" />
        <circle cx="85" cy="84" r="4" fill="#F87171" opacity="0.22" />
        <circle cx="115" cy="84" r="4" fill="#F87171" opacity="0.22" />

        <FrontHair style={h.hair_style} color={hair} />

        {tier >= 2 && (
          <>
            <rect x="76" y="61" width="48" height="6" rx="3" fill="#EF4444" />
            <path d="M124 62 L134 58 L131 67 Z" fill="#EF4444" />
          </>
        )}
        {crop === 'full' && tier >= 6 && (
          <ellipse className="hero__halo" cx="100" cy="30" rx="19" ry="5" fill="none" stroke={GOLD} strokeWidth="3" />
        )}
      </g>
    </svg>
  );
}
