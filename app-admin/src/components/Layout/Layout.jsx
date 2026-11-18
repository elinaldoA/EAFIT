import { Suspense, useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { hintForPath, sectionForPath, tabForPath } from './nav';
import { FAVORITES_MAX, toggleFavorite, useFavorites } from '../../lib/favorites';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import AdminAccessProvider from '../../context/AdminAccessProvider';
import { useAdminAccess } from '../../context/useAdminAccess';
import { isHidden } from '../../lib/adminAccess';
import EmptyState from '../EmptyState';
import Loading from '../Loading';
import ErrorBoundary from '../ErrorBoundary';
import IdleSessionGuard from '../IdleSessionGuard';

const COLLAPSED_KEY = 'sidebarCollapsed';

// Menu lateral do desktop começa recolhido (só ícones); a escolha fica salva.
function initialCollapsed() {
  try { return localStorage.getItem(COLLAPSED_KEY) !== '0'; } catch { return true; }
}

function Shell() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  function toggleCollapsed() {
    setCollapsed(c => {
      try { localStorage.setItem(COLLAPSED_KEY, c ? '0' : '1'); } catch { /* sem storage: vale só nesta visita */ }
      return !c;
    });
  }
  const { pathname } = useLocation();
  const { hiddenScreens } = useAdminAccess();
  const section = sectionForPath(pathname);
  const tabs = section ? section.tabs.filter(t => !isHidden(hiddenScreens, t.to)) : [];
  const showTabs = section && tabs.length > 1 && tabForPath(pathname);
  // Tela oculta para este admin (Sistema → Administradores): só interface.
  const blocked = isHidden(hiddenScreens, pathname);
  const tabsRef = useRef(null);
  const favorites = useFavorites();
  const pinned = favorites.includes(pathname);
  const hint = hintForPath(pathname);

  // Menu lateral (celular): Esc fecha, a página de trás não rola, e se a
  // janela crescer até o layout de desktop ele fecha sozinho.
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = e => { if (e.key === 'Escape') setMenuOpen(false); };
    const wide = window.matchMedia?.('(min-width: 901px)');
    const onWide = e => { if (e.matches) setMenuOpen(false); };
    document.addEventListener('keydown', onKey);
    wide?.addEventListener?.('change', onWide);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      wide?.removeEventListener?.('change', onWide);
      document.body.style.overflow = prevOverflow;
    };
  }, [menuOpen]);

  // Faixa de abas rola de lado no celular: mantém a aba atual à vista.
  useEffect(() => {
    tabsRef.current?.querySelector('.tabs__btn--active')?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }, [pathname]);

  const content = blocked
    ? <EmptyState icon="🔒" label="Você não tem acesso a esta tela. Fale com um superadmin se precisar dela." />
    : <ErrorBoundary key={pathname}><Suspense fallback={<Loading />}><Outlet /></Suspense></ErrorBoundary>;

  return (
    <div className="shell">
      <IdleSessionGuard />
      <Sidebar open={menuOpen} onClose={() => setMenuOpen(false)} collapsed={collapsed} onToggleCollapsed={toggleCollapsed} />
      <div className="shell__main">
        <Topbar menuOpen={menuOpen} onMenuClick={() => setMenuOpen(true)} />
        <main className="shell__content">
          {showTabs ? (
            <>
              <div className="section-head">
                <h1 className="section-title-main">{section.label}</h1>
                <button
                  type="button" className={`pin-btn ${pinned ? 'pin-btn--on' : ''}`}
                  aria-pressed={pinned}
                  title={pinned ? 'Tirar das fixadas' : (favorites.length >= FAVORITES_MAX ? `Limite de ${FAVORITES_MAX} telas fixadas` : 'Fixar esta tela no menu')}
                  disabled={!pinned && favorites.length >= FAVORITES_MAX}
                  onClick={() => toggleFavorite(pathname)}
                >
                  {pinned ? '★ Fixada' : '☆ Fixar'}
                </button>
              </div>
              <nav className="tabs" aria-label={section.label} ref={tabsRef}>
                {tabs.map(t => (
                  <NavLink
                    key={t.to}
                    to={t.to}
                    end
                    title={hintForPath(t.to) || undefined}
                    className={({ isActive }) => `tabs__btn ${isActive ? 'tabs__btn--active' : ''}`}
                  >
                    {t.label}
                  </NavLink>
                ))}
              </nav>
              {hint && <p className="tabs__hint">{hint}</p>}
              <div className="section-body">{content}</div>
            </>
          ) : content}
        </main>
        <footer className="shell__footer">
          <span>© {new Date().getFullYear()} EAFIT · Painel administrativo</span>
        </footer>
      </div>
    </div>
  );
}

export default function Layout() {
  return <AdminAccessProvider><Shell /></AdminAccessProvider>;
}
