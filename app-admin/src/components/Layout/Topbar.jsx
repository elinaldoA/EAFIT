import { useLocation } from 'react-router-dom';
import { useAdminAuth } from '../../context/useAdminAuth';
import ThemeToggle from '../ThemeToggle';
import { titleForPath } from './nav';

export default function Topbar({ onMenuClick }) {
  const { adminUser, logout } = useAdminAuth();
  const { pathname } = useLocation();
  const title = titleForPath(pathname);
  const email = adminUser?.email || '';

  return (
    <header className="topbar">
      <button className="topbar__menu-btn" onClick={onMenuClick} aria-label="Abrir menu">☰</button>
      <div className="topbar__crumb">
        <span>Admin</span>
        {title && <><span aria-hidden="true">/</span><strong>{title}</strong></>}
      </div>
      <div className="topbar__spacer" />
      {email && (
        <div className="topbar__user" title={email}>
          <span className="topbar__avatar" aria-hidden="true">{email[0]}</span>
          <span className="topbar__email">{email}</span>
        </div>
      )}
      <ThemeToggle />
      <button className="btn btn--ghost btn--small" onClick={logout}>Sair</button>
    </header>
  );
}
