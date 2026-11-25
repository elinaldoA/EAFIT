import { useEffect, useRef, useState } from 'react';
import { t } from '../lib/i18n';

// Menu "⋯" para ações pouco usadas ou que apagam coisas, fora do caminho de quem
// só quer treinar. Abre uma lista de itens (reaproveita o visual do menu do topo)
// e fecha ao escolher, ao tocar fora ou com Esc.
// `items`: [{ label, onClick, disabled }].
export default function OverflowMenu({ items, label = t('Mais opções') }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

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

  return (
    <div className="topbar-menu overflow-menu" ref={rootRef}>
      <button
        type="button" className="btn btn--ghost btn--sm overflow-menu__btn" aria-haspopup="menu" aria-expanded={open}
        aria-label={label} onClick={() => setOpen(o => !o)}
      >
        <span aria-hidden="true">⋯</span>
      </button>
      {open && (
        <div className="topbar-menu__list" role="menu">
          {items.map(item => (
            <button
              key={item.label} type="button" role="menuitem" className="topbar-menu__item" disabled={item.disabled}
              onClick={() => { setOpen(false); item.onClick(); }}
            >
              <span className="topbar-menu__text">{item.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
