import { Link, useLocation } from 'react-router-dom';
import logoMark from '../../assets/logo-mark.png';
import { NAV_GROUPS, sectionForPath, tabByRoute } from './nav';
import { useFavorites } from '../../lib/favorites';
import NavIcon from './NavIcon';
import { useAttention } from '../../lib/attention';
import { useAdminAccess } from '../../context/useAdminAccess';
import { isHidden, visibleNav } from '../../lib/adminAccess';

// `collapsed` só vale no desktop (só ícones); no celular a gaveta mostra tudo.
export default function Sidebar({ open, onClose, collapsed, onToggleCollapsed }) {
  const { pathname } = useLocation();
  const current = sectionForPath(pathname);
  const attention = useAttention();
  const { hiddenScreens } = useAdminAccess();
  const groups = visibleNav(NAV_GROUPS, hiddenScreens);
  const pinned = useFavorites()
    .filter(to => !isHidden(hiddenScreens, to))
    .map(tabByRoute).filter(Boolean);

  return (
    <>
      {open && <div className="sidebar__backdrop" onClick={onClose} />}
      <aside className={`sidebar${open ? ' sidebar--open' : ''}${collapsed ? ' sidebar--collapsed' : ''}`}>
        <div className="sidebar__brand">
          <img className="sidebar__brand-mark" src={logoMark} alt="EAFIT" />
          <span className="sidebar__brand-text">
            EAFIT
            <span className="sidebar__brand-sub">Painel administrativo</span>
          </span>
          <button
            type="button" className="sidebar__toggle" onClick={onToggleCollapsed}
            aria-expanded={!collapsed} aria-label={collapsed ? 'Expandir menu' : 'Recolher menu'}
            title={collapsed ? 'Expandir menu' : 'Recolher menu'}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M15 6l-6 6 6 6" />
            </svg>
          </button>
        </div>
        <nav className="sidebar__nav" aria-label="Principal">
          {pinned.length > 0 && (
            <div className="sidebar__group">
              <div className="sidebar__group-label">Fixadas</div>
              {pinned.map(({ tab, section }) => {
                const active = pathname === tab.to;
                return (
                  <Link
                    key={tab.to} to={tab.to}
                    aria-current={active ? 'page' : undefined}
                    className={`sidebar__link ${active ? 'sidebar__link--active' : ''}`}
                    title={collapsed ? tab.label : undefined}
                    onClick={onClose}
                  >
                    <span className="sidebar__link-icon"><NavIcon name={section.icon} /></span>
                    <span className="sidebar__label">{tab.label}</span>
                  </Link>
                );
              })}
            </div>
          )}
          {groups.map(group => (
            <div className="sidebar__group" key={group.label}>
              <div className="sidebar__group-label">{group.label}</div>
              {group.sections.map(section => {
                const active = current?.key === section.key;
                const count = attention[section.key];
                return (
                  <Link
                    key={section.key}
                    to={section.tabs[0].to}
                    aria-current={active ? 'page' : undefined}
                    className={`sidebar__link ${active ? 'sidebar__link--active' : ''}`}
                    title={collapsed ? (count ? `${section.label} · ${count.title}` : section.label) : undefined}
                    onClick={onClose}
                  >
                    <span className="sidebar__link-icon"><NavIcon name={section.icon} /></span>
                    <span className="sidebar__label">{section.label}</span>
                    {count && (
                      <span className="sidebar__count" title={count.title}>
                        {count.total > 99 ? '99+' : count.total}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
      </aside>
    </>
  );
}
