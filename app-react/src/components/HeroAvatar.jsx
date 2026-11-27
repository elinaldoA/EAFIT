import { useId } from 'react';
import { HAIR_COLORS, OUTFITS, SKIN, heroTier, physique, sanitizeHero } from '../lib/hero';

// Herói da EAFIT Arena, desenhado em SVG por camadas (sem imagem nem biblioteca):
// corpo, pele, cabelo e cor da roupa vêm das escolhas da pessoa; o equipamento
// vem do nível (lib/hero.js → heroTier):
//   1 Novato     camiseta
//   2 Dedicado   + faixa na testa e munhequeiras
//   3 Atleta     + cinto e detalhes dourados no tênis
//   4 Veterano   + ombreiras
//   5 Elite      + capa e aura
//   6 Lenda      + acabamento dourado, halo e aura dourada
// O corpo vem do treino: `form` (0 a 100, a forma física calculada no servidor)
// e `goal` (objetivo do perfil) viram as medidas em lib/hero.js → physique:
// forma baixa = barriga, braço fino, postura caída e olheiras; forma alta =
// ombros largos, bíceps, peitoral e abdômen definidos, na direção do objetivo.
// Sem `form` o corpo fica neutro.
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

export default function HeroAvatar({ hero, level = 1, form, goal, mood = 'idle', crop = 'full', className = '', label }) {
  const uid = useId().replace(/:/g, '');
  const h = sanitizeHero(hero);
  const { tier } = heroTier(level);
  const p = physique(form, goal);
  const base = BODY[h.body];
  const skin = SKIN[h.skin - 1];
  const hair = HAIR_COLORS[h.hair_color - 1];
  const outfit = OUTFITS[h.outfit - 1];

  // Medidas finais: a base do corpo escolhido, moldada pela forma física.
  const bw = base.shoulder * p.shoulder;
  const ww = Math.min(base.waist * p.waist, bw * 1.3);
  const aw = base.arm * p.arm;
  const lw = base.leg * (0.88 + 0.12 * p.arm);
  const sx = 100 - bw;
  const ex = 100 + bw;
  const aura = tier >= 6 ? GOLD : outfit;
  const viewBox = crop === 'head' ? '58 28 84 84' : '0 0 200 280';
  const headShift = p.slump * 5;
  const bicepR = aw * (0.5 + 0.3 * p.bicep);

  const arm = (side) => {
    const dir = side === 'l' ? -1 : 1;
    const x0 = 100 + dir * (bw - 2);
    const x1 = x0 + dir * 8;
    return (
      <g className={`hero__arm hero__arm--${side}`} style={{ transformOrigin: `${x0}px 114px` }}>
        <line x1={x0} y1="114" x2={x1} y2="168" stroke={skin} strokeWidth={aw} strokeLinecap="round" />
        {p.bicep > 0.15 && (
          <ellipse cx={x0 + dir * 5} cy="146" rx={bicepR} ry={10 + 6 * p.bicep} fill={skin} />
        )}
        {p.bicep > 0.6 && (
          <path d={`M${x0 + dir * 5} 143 Q${x0 + dir * 8} 150 ${x0 + dir * 5} 157`} stroke="#000" strokeWidth="1.2" fill="none" opacity="0.16" />
        )}
        <line x1={x0} y1="114" x2={x0 + dir * 2} y2={142 - 20 * p.bicep} stroke={outfit} strokeWidth={aw + 4} strokeLinecap="round" />
        {tier >= 2 && <rect x={x1 - (aw + 4) / 2 - dir * 0.6} y="156" width={aw + 4} height="6" rx="3" fill="#fff" />}
        <circle cx={x1} cy="171" r={aw * 0.58} fill={skin} />
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
      data-belly={p.belly.toFixed(2)}
      data-abs={p.abs.toFixed(2)}
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

        <g transform={`translate(0 ${headShift})`}>
          <BackHair style={h.hair_style} color={hair} />
        </g>

        {crop === 'full' && (
          <>
            {/* pernas e tênis */}
            <rect x={100 - lw - 2} y="172" width={lw} height="72" rx="6" fill={PANTS} />
            <rect x="102" y="172" width={lw} height="72" rx="6" fill={PANTS} />
            <rect x={100 - lw - 6} y="238" width={lw + 9} height="16" rx="8" fill="#fff" />
            <rect x="97" y="238" width={lw + 9} height="16" rx="8" fill="#fff" />
            <rect x={100 - lw - 6} y="249" width={lw + 9} height="5" rx="2.5" fill={tier >= 3 ? GOLD : '#CBD5E1'} />
            <rect x="97" y="249" width={lw + 9} height="5" rx="2.5" fill={tier >= 3 ? GOLD : '#CBD5E1'} />

            {/* braços e tronco */}
            {arm('l')}
            {arm('r')}
            <path
              d={`M${sx} ${114 + p.slump * 3} Q${sx} ${106 + p.slump * 3} ${sx + 9} ${106 + p.slump * 3} L${ex - 9} ${106 + p.slump * 3} Q${ex} ${106 + p.slump * 3} ${ex} ${114 + p.slump * 3} L${100 + ww} 178 L${100 - ww} 178 Z`}
              fill={outfit}
              stroke={tier >= 6 ? GOLD : 'none'}
              strokeWidth="2.5"
            />
            {p.belly > 0.2 && (
              <g>
                <ellipse cx="100" cy="166" rx={ww * (0.8 + 0.26 * p.belly)} ry={9 + 11 * p.belly} fill={outfit} stroke="#000" strokeOpacity="0.16" strokeWidth="1.6" />
                <ellipse cx="100" cy="164" rx={ww * 0.45 * p.belly} ry={6 * p.belly} fill="#fff" fillOpacity="0.13" />
              </g>
            )}
            <path d="M92 106 L100 119 L108 106 Z" fill={skin} />
            <text x="100" y="131" textAnchor="middle" fontSize="15" fontWeight="800" fill="#fff" opacity="0.92" fontFamily="system-ui, sans-serif">E</text>
            {p.abs > 0.08 && (
              <g className="hero__abs" opacity={Math.min(1, p.abs * 1.15)} fill="#fff">
                <path d={`M${100 - bw * 0.55} 138 Q${100 - bw * 0.25} 146 100 140 Q${100 + bw * 0.25} 146 ${100 + bw * 0.55} 138`} stroke="#000" strokeOpacity="0.4" strokeWidth="2" fill="none" />
                {[146, 157, 168].map(y => (
                  <g key={y}>
                    <rect x="92" y={y} width="7" height="9" rx="3" fillOpacity="0.34" />
                    <rect x="101" y={y} width="7" height="9" rx="3" fillOpacity="0.34" />
                  </g>
                ))}
              </g>
            )}
            {tier >= 3 && (
              <>
                <rect x={100 - ww - 1} y="171" width={ww * 2 + 2} height="8" rx="2" fill="#111827" />
                <rect x="95" y="170" width="10" height="10" rx="2" fill={GOLD} />
              </>
            )}
            {tier >= 4 && (
              <>
                <ellipse cx={sx + 2} cy="112" rx="12" ry="8" fill="#9CA3AF" stroke={outfit} strokeWidth="2" />
                <ellipse cx={ex - 2} cy="112" rx="12" ry="8" fill="#9CA3AF" stroke={outfit} strokeWidth="2" />
              </>
            )}
            <rect x="92" y={94 + headShift * 0.6} width="16" height="16" rx="5" fill={skin} />
          </>
        )}

        {/* cabeça: cai um pouco para a frente quando a forma está baixa */}
        <g transform={`translate(0 ${headShift}) rotate(${p.slump * 4} 100 100)`}>
          <circle cx="76" cy="76" r="5" fill={skin} />
          <circle cx="124" cy="76" r="5" fill={skin} />
          <circle cx="100" cy="74" r="25" fill={skin} />
          <g className="hero__eyes">
            <ellipse cx="91" cy="76" rx="2.7" ry="3.5" fill="#1a1a1a" />
            <ellipse cx="109" cy="76" rx="2.7" ry="3.5" fill="#1a1a1a" />
          </g>
          {p.tired > 0.05 && (
            <g opacity={0.2 + 0.4 * p.tired} fill="#6D28D9">
              <ellipse cx="91" cy="82" rx="5" ry="2" />
              <ellipse cx="109" cy="82" rx="5" ry="2" />
            </g>
          )}
          <path d="M86 69 Q91 66 96 69 M104 69 Q109 66 114 69" stroke="#1a1a1a" strokeWidth="1.6" fill="none" strokeLinecap="round" opacity="0.7" />
          {p.tired > 0.6
            ? <path d="M93 89 Q100 87 107 89" stroke="#1a1a1a" strokeWidth="2" fill="none" strokeLinecap="round" />
            : <path d="M93 86 Q100 92 107 86" stroke="#1a1a1a" strokeWidth="2" fill="none" strokeLinecap="round" />}
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
      </g>
    </svg>
  );
}
