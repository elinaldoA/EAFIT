import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAdminAuth } from '../../context/useAdminAuth';
import { useAdminAccess } from '../../context/useAdminAccess';
import { useTheme } from '../../context/useTheme';
import { ROLE_LABELS } from '../../lib/adminAccess';
import { LANDING_URL } from '../../lib/ambassadors';
import NavIcon from './NavIcon';

const ICONS = {
  moon: 'M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z',
  sun: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10z M12 1v2 M12 21v2 M4.22 4.22l1.42 1.42 M18.36 18.36l1.42 1.42 M1 12h2 M21 12h2 M4.22 19.78l1.42-1.42 M18.36 5.64l1.42-1.42',
  globe: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z M2 12h20 M12 2a15 15 0 0 1 0 20 15 15 0 0 1 0-20z',
  phone: 'M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z M11 18h2',
  logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4 M16 17l5-5-5-5 M21 12H9',
};

function Icon({ name }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICONS[name].split(' M').map((d, i) => <path key={i} d={i === 0 ? d : `M${d}`} />)}
    </svg>
  );
}

// Avatar do topo: abre o menu da conta (perfil, tema, links e sair). Fecha ao
// clicar fora, com Esc, ao trocar de tela ou ao escolher uma opção.
export default function UserMenu() {
  const { adminUser, logout } = useAdminAuth();
  const { role } = useAdminAccess();
  const themeCtx = useTheme();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const buttonRef = useRef(null);
  const menuRef = useRef(null);

  const email = adminUser?.email || '';
  const md = adminUser?.user_metadata || {};
  const name = [md.nome, md.sobrenome].filter(Boolean).join(' ');
  const isLight = themeCtx?.theme === 'light';

  useEffect(() => { setOpen(false); }, [pathname]);

  useEffect(() => {
    if (!open) return undefined;
    menuRef.current?.querySelector('[role="menuitem"]')?.focus();
    const onDown = e => { if (!rootRef.current?.contains(e.target)) setOpen(false); };
    const onKey = e => {
      if (e.key === 'Escape') { setOpen(false); buttonRef.current?.focus(); return; }
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      const items = [...(menuRef.current?.querySelectorAll('[role="menuitem"]') || [])];
      const i = items.indexOf(document.activeElement);
      const next = e.key === 'ArrowDown' ? (i + 1) % items.length : (i - 1 + items.length) % items.length;
      items[next]?.focus();
      e.preventDefault();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!email) return null;

  const close = () => setOpen(false);

  return (
    <div className="user-menu" ref={rootRef}>
      <button
        ref={buttonRef} type="button" className="topbar__user"
        aria-haspopup="menu" aria-expanded={open} aria-label="Menu da conta"
        onClick={() => setOpen(o => !o)}
      >
        <span className="topbar__avatar" aria-hidden="true">{(name || email)[0]}</span>
        <span className="topbar__email">{email}</span>
        <svg className="topbar__caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div className="user-menu__panel" role="menu" aria-label="Conta" ref={menuRef}>
          <div className="user-menu__head">
            <span className="topbar__avatar user-menu__avatar" aria-hidden="true">{(name || email)[0]}</span>
            <div className="user-menu__who">
              {name && <strong>{name}</strong>}
              <span>{email}</span>
              {role && <span className="badge badge--admin">{ROLE_LABELS[role] || role}</span>}
            </div>
          </div>

          <div className="user-menu__group">
            <Link role="menuitem" className="user-menu__item" to="/perfil" onClick={close}>
              <NavIcon name="user" /> Meu perfil
            </Link>
            {themeCtx && (
              <button role="menuitem" type="button" className="user-menu__item" onClick={themeCtx.toggleTheme}>
                <Icon name={isLight ? 'moon' : 'sun'} /> {isLight ? 'Tema escuro' : 'Tema claro'}
              </button>
            )}
          </div>

          <div className="user-menu__group">
            <a role="menuitem" className="user-menu__item" href={LANDING_URL} target="_blank" rel="noreferrer" onClick={close}>
              <Icon name="globe" /> Site <span className="user-menu__ext" aria-hidden="true">↗</span>
            </a>
            <a role="menuitem" className="user-menu__item" href={`${LANDING_URL}app/`} target="_blank" rel="noreferrer" onClick={close}>
              <Icon name="phone" /> App <span className="user-menu__ext" aria-hidden="true">↗</span>
            </a>
          </div>

          <div className="user-menu__group">
            <button role="menuitem" type="button" className="user-menu__item user-menu__item--danger" onClick={() => { close(); logout(); }}>
              <Icon name="logout" /> Sair
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
