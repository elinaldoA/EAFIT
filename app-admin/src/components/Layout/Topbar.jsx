import { useAdminAuth } from '../../context/useAdminAuth';
import ThemeToggle from '../ThemeToggle';

export default function Topbar({ onMenuClick }) {
  const { adminUser, logout } = useAdminAuth();

  return (
    <header className="topbar">
      <button className="topbar__menu-btn" onClick={onMenuClick} aria-label="Abrir menu">☰</button>
      <div className="topbar__spacer" />
      <span className="topbar__email">{adminUser?.email}</span>
      <ThemeToggle />
      <button className="btn btn--ghost" onClick={logout}>Sair</button>
    </header>
  );
}
