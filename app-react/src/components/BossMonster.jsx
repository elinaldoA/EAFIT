// Monstros dos chefões semanais da Arena, desenhados em SVG. Cada tipo de meta
// tem o seu: treinos → gorila, XP → dragão, km → serpente. O estado vem do jogo:
//   idle      respira e olha em frente
//   hit       levou dano: treme e pisca em vermelho
//   hurt      pouca vida: olhos apertados, balança
//   defeated  derrotado: olhos em X, cai e esmaece
import { monsterKind } from '../lib/arena';

function Eyes({ left, right, y, mood, color }) {
  if (mood === 'defeated') {
    return [left, right].map(x => (
      <path key={x} d={`M${x - 5} ${y - 5} L${x + 5} ${y + 5} M${x + 5} ${y - 5} L${x - 5} ${y + 5}`}
        stroke="#111827" strokeWidth="2.6" strokeLinecap="round" />
    ));
  }
  if (mood === 'hurt' || mood === 'hit') {
    return [left, right].map(x => (
      <path key={x} d={`M${x - 6} ${y} Q${x} ${y - 5} ${x + 6} ${y}`} stroke="#111827" strokeWidth="3" fill="none" strokeLinecap="round" />
    ));
  }
  return [left, right].map(x => (
    <g key={x}>
      <ellipse cx={x} cy={y} rx="6.5" ry="7" fill={color} />
      <ellipse cx={x} cy={y} rx="2.4" ry="5.2" fill="#111827" />
    </g>
  ));
}

function Dragon({ mood }) {
  return (
    <>
      <path d="M72 112 Q16 70 34 24 Q58 66 88 92 Z" fill="#166534" />
      <path d="M128 112 Q184 70 166 24 Q142 66 112 92 Z" fill="#166534" />
      <path className="monster__tail" d="M142 156 Q184 160 186 118 Q190 150 160 176" stroke="#16A34A" strokeWidth="13" fill="none" strokeLinecap="round" />
      <ellipse cx="100" cy="128" rx="48" ry="52" fill="#22C55E" />
      <ellipse cx="100" cy="138" rx="28" ry="38" fill="#BBF7D0" />
      <path d="M86 116 H114 M84 130 H116 M86 144 H114 M90 158 H110" stroke="#86EFAC" strokeWidth="2" opacity="0.8" />
      <ellipse cx="76" cy="176" rx="17" ry="9" fill="#16A34A" />
      <ellipse cx="124" cy="176" rx="17" ry="9" fill="#16A34A" />
      <ellipse cx="55" cy="132" rx="9" ry="17" fill="#16A34A" />
      <ellipse cx="145" cy="132" rx="9" ry="17" fill="#16A34A" />
      <path d="M72 50 L64 26 L86 44 Z M128 50 L136 26 L114 44 Z" fill="#FDE68A" />
      <ellipse cx="100" cy="72" rx="36" ry="30" fill="#22C55E" />
      <ellipse cx="100" cy="86" rx="22" ry="13" fill="#4ADE80" />
      <circle cx="93" cy="85" r="2.2" fill="#14532D" />
      <circle cx="107" cy="85" r="2.2" fill="#14532D" />
      <path d="M90 94 Q100 100 110 94" stroke="#14532D" strokeWidth="2" fill="none" strokeLinecap="round" />
      <path d="M92 40 L97 28 L102 40 L108 30 L110 42" fill="#16A34A" />
      <Eyes left={84} right={116} y={64} mood={mood} color="#FACC15" />
    </>
  );
}

function Gorilla({ mood }) {
  return (
    <>
      <ellipse cx="100" cy="136" rx="54" ry="56" fill="#4B5563" />
      <ellipse cx="100" cy="140" rx="31" ry="35" fill="#9CA3AF" />
      <path d="M88 124 Q100 118 112 124 M86 140 Q100 134 114 140" stroke="#6B7280" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      <ellipse className="monster__arm monster__arm--l" cx="44" cy="140" rx="20" ry="46" fill="#374151" style={{ transformOrigin: '50px 100px' }} />
      <ellipse className="monster__arm monster__arm--r" cx="156" cy="140" rx="20" ry="46" fill="#374151" style={{ transformOrigin: '150px 100px' }} />
      <circle cx="42" cy="184" r="17" fill="#4B5563" />
      <circle cx="158" cy="184" r="17" fill="#4B5563" />
      <ellipse cx="76" cy="186" rx="19" ry="10" fill="#374151" />
      <ellipse cx="124" cy="186" rx="19" ry="10" fill="#374151" />
      <circle cx="70" cy="76" r="9" fill="#4B5563" />
      <circle cx="130" cy="76" r="9" fill="#4B5563" />
      <ellipse cx="100" cy="76" rx="35" ry="31" fill="#4B5563" />
      <ellipse cx="100" cy="86" rx="25" ry="21" fill="#D1D5DB" />
      <path d="M72 62 Q100 50 128 62 L124 70 Q100 62 76 70 Z" fill="#1F2937" />
      <circle cx="94" cy="90" r="2.2" fill="#374151" />
      <circle cx="106" cy="90" r="2.2" fill="#374151" />
      <path d="M88 99 Q100 106 112 99" stroke="#374151" strokeWidth="2.4" fill="none" strokeLinecap="round" />
      <Eyes left={88} right={112} y={74} mood={mood} color="#F87171" />
    </>
  );
}

function Serpent({ mood }) {
  return (
    <>
      <path d="M36 182 Q10 146 66 136 Q146 124 134 92 Q128 70 104 66" stroke="#4D7C0F" strokeWidth="34" fill="none" strokeLinecap="round" />
      <path d="M36 182 Q10 146 66 136 Q146 124 134 92 Q128 70 104 66" stroke="#A3E635" strokeWidth="26" fill="none" strokeLinecap="round" />
      <path d="M36 182 Q10 146 66 136 Q146 124 134 92 Q128 70 104 66" stroke="#D9F99D" strokeWidth="8" fill="none" strokeLinecap="round" strokeDasharray="2 14" />
      <path className="monster__tongue" d="M100 66 L100 50 M100 50 L93 42 M100 50 L107 42" stroke="#DC2626" strokeWidth="3" fill="none" strokeLinecap="round" />
      <ellipse cx="100" cy="76" rx="29" ry="22" fill="#A3E635" stroke="#4D7C0F" strokeWidth="3" />
      <path d="M78 70 Q100 56 122 70" stroke="#4D7C0F" strokeWidth="3" fill="none" />
      <circle cx="93" cy="86" r="2" fill="#365314" />
      <circle cx="107" cy="86" r="2" fill="#365314" />
      <Eyes left={88} right={112} y={74} mood={mood} color="#FDE047" />
    </>
  );
}

const ART = { dragon: Dragon, gorilla: Gorilla, serpent: Serpent };

export default function BossMonster({ metric, mood = 'idle', className = '', label }) {
  const Art = ART[monsterKind(metric)];
  return (
    <svg className={`monster monster--${mood} ${className}`.trim()} viewBox="0 0 200 200" role="img"
      aria-label={label || 'Chefão'} data-kind={monsterKind(metric)}>
      <ellipse cx="100" cy="192" rx="60" ry="8" fill="#000" opacity="0.3" />
      <g className="monster__body"><Art mood={mood} /></g>
    </svg>
  );
}
