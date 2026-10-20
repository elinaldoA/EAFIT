import { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { sectionForPath, tabForPath } from './nav';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import AdminAccessProvider from '../../context/AdminAccessProvider';
import { useAdminAccess } from '../../context/useAdminAccess';
import { isHidden } from '../../lib/adminAccess';
import EmptyState from '../EmptyState';

function Shell() {
  const [menuOpen, setMenuOpen] = useState(false);
  const { pathname } = useLocation();
  const { hiddenScreens } = useAdminAccess();
  const section = sectionForPath(pathname);
  const tabs = section ? section.tabs.filter(t => !isHidden(hiddenScreens, t.to)) : [];
  const showTabs = section && tabs.length > 1 && tabForPath(pathname);
  // Tela oculta para este admin (Sistema → Administradores): só interface.
  const blocked = isHidden(hiddenScreens, pathname);
  const content = blocked
    ? <EmptyState icon="🔒" label="Você não tem acesso a esta tela. Fale com um superadmin se precisar dela." />
    : <Outlet />;

  return (
    <div className="shell">
      <Sidebar open={menuOpen} onClose={() => setMenuOpen(false)} />
      <div className="shell__main">
        <Topbar onMenuClick={() => setMenuOpen(true)} />
        <main className="shell__content">
          {showTabs ? (
            <>
              <h1 className="section-title-main">{section.label}</h1>
              <nav className="tabs" aria-label={section.label}>
                {tabs.map(t => (
                  <NavLink
                    key={t.to}
                    to={t.to}
                    end
                    className={({ isActive }) => `tabs__btn ${isActive ? 'tabs__btn--active' : ''}`}
                  >
                    {t.label}
                  </NavLink>
                ))}
              </nav>
              <div className="section-body">{content}</div>
            </>
          ) : content}
        </main>
      </div>
    </div>
  );
}

export default function Layout() {
  return <AdminAccessProvider><Shell /></AdminAccessProvider>;
}
