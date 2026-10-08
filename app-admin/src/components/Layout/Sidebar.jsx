import { Link, useLocation } from 'react-router-dom';
import logoMark from '../../assets/logo-mark.png';
import { NAV_GROUPS, sectionForPath } from './nav';
import NavIcon from './NavIcon';
import { useAttention } from '../../lib/attention';

export default function Sidebar({ open, onClose }) {
  const { pathname } = useLocation();
  const current = sectionForPath(pathname);
  const attention = useAttention();

  return (
    <>
      {open && <div className="sidebar__backdrop" onClick={onClose} />}
      <aside className={`sidebar ${open ? 'sidebar--open' : ''}`}>
        <div className="sidebar__brand">
          <img className="sidebar__brand-mark" src={logoMark} alt="EAFIT" />
          <span>
            EAFIT
            <span className="sidebar__brand-sub">Painel administrativo</span>
          </span>
        </div>
        <nav className="sidebar__nav" aria-label="Principal">
          {NAV_GROUPS.map(group => (
            <div className="sidebar__group" key={group.label}>
              <div className="sidebar__group-label">{group.label}</div>
              {group.sections.map(section => {
                const active = current?.key === section.key;
                return (
                  <Link
                    key={section.key}
                    to={section.tabs[0].to}
                    aria-current={active ? 'page' : undefined}
                    className={`sidebar__link ${active ? 'sidebar__link--active' : ''}`}
                    onClick={onClose}
                  >
                    <span className="sidebar__link-icon"><NavIcon name={section.icon} /></span>
                    <span>{section.label}</span>
                    {attention[section.key] && (
                      <span className="sidebar__count" title={attention[section.key].title}>
                        {attention[section.key].total > 99 ? '99+' : attention[section.key].total}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="sidebar__footer">
          <Link to="/perfil" onClick={onClose}>Meu perfil</Link>
          <span>Gestão do projeto EAFIT</span>
        </div>
      </aside>
    </>
  );
}
