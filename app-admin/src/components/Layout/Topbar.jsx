import { useLocation } from 'react-router-dom';
import UserMenu from './UserMenu';
import { titleForPath } from './nav';

export default function Topbar({ menuOpen, onMenuClick }) {
  const { pathname } = useLocation();
  const title = titleForPath(pathname);

  return (
    <header className="topbar">
      <button className="topbar__menu-btn" onClick={onMenuClick} aria-label="Abrir menu" aria-expanded={!!menuOpen}>☰</button>
      <div className="topbar__crumb">
        <span>Admin</span>
        {title && <><span aria-hidden="true">/</span><strong>{title}</strong></>}
      </div>
      <div className="topbar__spacer" />
      <UserMenu />
    </header>
  );
}
