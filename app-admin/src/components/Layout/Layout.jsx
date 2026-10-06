import { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { sectionForPath, tabForPath } from './nav';
import Sidebar from './Sidebar';
import Topbar from './Topbar';

export default function Layout() {
  const [menuOpen, setMenuOpen] = useState(false);
  const { pathname } = useLocation();
  const section = sectionForPath(pathname);
  const showTabs = section && section.tabs.length > 1 && tabForPath(pathname);

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
                {section.tabs.map(t => (
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
              <div className="section-body"><Outlet /></div>
            </>
          ) : <Outlet />}
        </main>
      </div>
    </div>
  );
}
