import { NavLink } from 'react-router-dom';
import logoMark from '../../assets/logo-mark.png';

const links = [
  { to: '/', label: 'Dashboard', icon: '📊', end: true },
  { to: '/users', label: 'Usuários', icon: '👥' },
  { to: '/notificacoes', label: 'Notificações', icon: '🔔' },
  { to: '/conteudo', label: 'Conteúdo', icon: '📋' },
  { to: '/landing', label: 'Landing page', icon: '🖥️' },
  { to: '/seguranca', label: 'Segurança', icon: '🩹' },
  { to: '/auditoria', label: 'Auditoria', icon: '🕒' },
  { to: '/perfil', label: 'Meu perfil', icon: '👤' },
];

export default function Sidebar({ open, onClose }) {
  return (
    <>
      {open && <div className="sidebar__backdrop" onClick={onClose} />}
      <aside className={`sidebar ${open ? 'sidebar--open' : ''}`}>
        <div className="sidebar__brand">
          <img className="sidebar__brand-mark" src={logoMark} alt="EAFIT" />
          <span className="sidebar__brand-name">EAFIT Admin</span>
        </div>
        <nav className="sidebar__nav">
          {links.map(link => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.end}
              className={({ isActive }) => `sidebar__link ${isActive ? 'sidebar__link--active' : ''}`}
              onClick={onClose}
            >
              <span className="sidebar__link-icon">{link.icon}</span>
              <span>{link.label}</span>
            </NavLink>
          ))}
        </nav>
      </aside>
    </>
  );
}
