import { useCallback, useEffect, useRef, useState } from 'react';
import { useTheme } from '../context/useTheme';
import InboxBell from './InboxBell';
import { t } from '../lib/i18n';

// Menu do canto direito da barra superior: avisos, tema e os botões de trocar
// de modo (Personal, Embaixador, Influenciador). Juntos num botão só, sobra
// espaço para o nome e o módulo de esporte. A bolinha vermelha mostra os
// avisos não lidos. `modes`: [{ label: '📣 Influenciador', onClick }].
//
// A lista fica montada mesmo fechada (só escondida): os avisos continuam
// sendo buscados e o painel de avisos, aberto por ela, não some ao fechar.
export default function TopbarMenu({ modes = [] }) {
  const { theme, toggleTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const rootRef = useRef(null);
  const onUnreadChange = useCallback(n => setUnread(n), []);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = e => { if (!rootRef.current?.contains(e.target)) setOpen(false); };
    const onKey = e => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const isLight = theme === 'light';
  // Qualquer item escolhido fecha o menu.
  const pick = fn => () => { setOpen(false); fn?.(); };

  return (
    <div className="topbar-menu" ref={rootRef}>
      <button
        type="button" className="topbar-menu__btn" aria-haspopup="menu" aria-expanded={open}
        aria-label={unread ? t('Menu ({v1} aviso(s) novo(s))', { v1: unread }) : t('Menu')}
        onClick={() => setOpen(o => !o)}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
          <line x1="4" y1="7" x2="20" y2="7" /><line x1="4" y1="12" x2="20" y2="12" /><line x1="4" y1="17" x2="20" y2="17" />
        </svg>
        {unread > 0 && <span className="inbox-bell__badge">{unread > 9 ? '9+' : unread}</span>}
      </button>
      <div className="topbar-menu__list" role="menu" hidden={!open} onClick={e => { if (e.target.closest('[role="menuitem"]')) setOpen(false); }}>
        <InboxBell asMenuItem onUnreadChange={onUnreadChange} />
        <button type="button" role="menuitem" className="topbar-menu__item" onClick={pick(toggleTheme)}>
          <span aria-hidden="true">{isLight ? '🌙' : '☀️'}</span>
          <span className="topbar-menu__text">{isLight ? t('Tema escuro') : t('Tema claro')}</span>
        </button>
        {modes.map(m => {
          const text = String(m.label || '');
          const space = text.indexOf(' ');
          return (
            <button key={text} type="button" role="menuitem" className="topbar-menu__item" onClick={pick(m.onClick)}>
              <span aria-hidden="true">{space > 0 ? text.slice(0, space) : '↔️'}</span>
              <span className="topbar-menu__text">{space > 0 ? text.slice(space + 1) : text}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
