const ITEMS = [
  { key: 'treino', label: 'Treino' },
  { key: 'hidratacao', label: 'Água' },
  { key: 'dash', label: 'Evolução' },
  { key: 'perfil', label: 'Perfil' },
];

const ICONS = {
  treino: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="10" width="4" height="4" rx="1" /><rect x="18" y="10" width="4" height="4" rx="1" />
      <rect x="6" y="7" width="2" height="10" rx="1" /><rect x="16" y="7" width="2" height="10" rx="1" />
      <line x1="8" y1="12" x2="16" y2="12" />
    </svg>
  ),
  hidratacao: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2s7 8.5 7 13a7 7 0 0 1-14 0c0-4.5 7-13 7-13z" />
    </svg>
  ),
  dash: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" /><line x1="2" y1="20" x2="22" y2="20" />
    </svg>
  ),
  perfil: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
    </svg>
  ),
};

export default function BottomNav({ active, onChange }) {
  return (
    <nav className="bottom-nav">
      {ITEMS.map(item => (
        <button
          key={item.key}
          className={`nav-item${active === item.key ? ' active' : ''}`}
          onClick={() => onChange(item.key)}
        >
          <span className="nav-item__icon">{ICONS[item.key]}</span>
          <span>{item.label}</span>
        </button>
      ))}
    </nav>
  );
}
