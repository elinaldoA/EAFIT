import { NavLink } from 'react-router-dom';
import logoMark from '../../assets/logo-mark.png';
import { NAV_GROUPS } from './nav';
import NavIcon from './NavIcon';

export default function Sidebar({ open, onClose }) {
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
              {group.links.map(link => (
                <NavLink
                  key={link.to}
                  to={link.to}
                  end={link.end}
                  className={({ isActive }) => `sidebar__link ${isActive ? 'sidebar__link--active' : ''}`}
                  onClick={onClose}
                >
                  <span className="sidebar__link-icon"><NavIcon name={link.icon} /></span>
                  <span>{link.label}</span>
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="sidebar__footer">Gestão do projeto EAFIT</div>
      </aside>
    </>
  );
}
