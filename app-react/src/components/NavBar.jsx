import { useEffect, useRef, useState } from 'react';
import { t } from '../lib/i18n';
import { useSeason } from '../hooks/useSeason';
import { seasonNavIcon } from './seasonIcons';

const MORE_ICON = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="5" cy="12" r="1.2" fill="currentColor" /><circle cx="12" cy="12" r="1.2" fill="currentColor" /><circle cx="19" cy="12" r="1.2" fill="currentColor" />
  </svg>
);

// Barra inferior única de todos os modos (aluno, módulos de esporte, personal,
// embaixador e influenciador). `items`: [{ key, label, icon, badge }] na ordem;
// `more`: chaves que saem da barra e ficam no menu "Mais" (o botão só aparece
// se houver alguma). A bolinha de não lidas do item vai também ao botão Mais.
export default function NavBar({ items, more = [], active, onChange, label }) {
  const { theme } = useSeason();
  const [moreOpen, setMoreOpen] = useState(false);
  const navRef = useRef(null);
  const barItems = items.filter(item => !more.includes(item.key));
  const moreItems = items.filter(item => more.includes(item.key));
  const moreActive = moreItems.some(item => item.key === active);
  const moreBadge = moreItems.reduce((sum, item) => sum + (item.badge || 0), 0);

  // O menu fecha ao tocar fora ou apertar Esc.
  useEffect(() => {
    if (!moreOpen) return undefined;
    const onDown = event => { if (!navRef.current?.contains(event.target)) setMoreOpen(false); };
    const onKey = event => { if (event.key === 'Escape') setMoreOpen(false); };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [moreOpen]);

  const icon = item => seasonNavIcon(theme, item.key, item.icon);
  const badgeLabel = n => t('{v1} não lido(s)', { v1: n });

  return (
    <nav className="bottom-nav" aria-label={label} ref={navRef}>
      {barItems.map(item => (
        <button
          key={item.key}
          type="button"
          className={`nav-item${active === item.key ? ' active' : ''}`}
          aria-current={active === item.key ? 'page' : undefined}
          onClick={() => onChange(item.key)}
        >
          <span className="nav-item__icon" aria-hidden="true">{icon(item)}</span>
          <span>{item.label}</span>
          {item.badge > 0 && <span className="trainer-badge" aria-label={badgeLabel(item.badge)}>{item.badge}</span>}
        </button>
      ))}
      {moreItems.length > 0 && (
        <>
          <button
            type="button"
            className={`nav-item${moreActive ? ' active' : ''}`}
            aria-current={moreActive ? 'page' : undefined}
            aria-haspopup="menu"
            aria-expanded={moreOpen}
            onClick={() => setMoreOpen(open => !open)}
          >
            <span className="nav-item__icon" aria-hidden="true">{MORE_ICON}</span>
            <span>{t('Mais')}</span>
            {moreBadge > 0 && <span className="trainer-badge" aria-label={badgeLabel(moreBadge)}>{moreBadge}</span>}
          </button>
          {moreOpen && (
            <div className="nav-more" role="menu" aria-label={t('Mais')}>
              {moreItems.map(item => (
                <button
                  key={item.key}
                  type="button"
                  role="menuitem"
                  className={`nav-more__item${active === item.key ? ' active' : ''}`}
                  onClick={() => { setMoreOpen(false); onChange(item.key); }}
                >
                  <span className="nav-more__icon" aria-hidden="true">{icon(item)}</span>
                  <span>{item.label}</span>
                  {item.badge > 0 && <span className="trainer-badge trainer-badge--inline">{item.badge}</span>}
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </nav>
  );
}
