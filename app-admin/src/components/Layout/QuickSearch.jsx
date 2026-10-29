import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAdminAccess } from '../../context/useAdminAccess';
import { pageIndex, pushRecent, readRecent, searchPages } from '../../lib/quickSearch';
import { fetchUsersPage } from '../../lib/users';
import { tabForPath } from './nav';
import NavIcon from './NavIcon';

const USER_MIN_CHARS = 3;
const USER_LIMIT = 6;
const DEBOUNCE_MS = 250;

function isTyping(el) {
  return el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));
}

// Busca rápida da Topbar: Ctrl+K (⌘K) ou "/" abre; acha telas e usuários.
// ↑/↓ escolhem, Enter abre, Esc fecha.
export default function QuickSearch() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { hiddenScreens } = useAdminAccess();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [users, setUsers] = useState({ q: '', rows: [], loading: false });
  const [active, setActive] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  const pages = useMemo(() => pageIndex(hiddenScreens), [hiddenScreens]);

  // Lembra as telas visitadas para sugerir quando a busca abre vazia.
  useEffect(() => { if (tabForPath(pathname)) pushRecent(pathname); }, [pathname]);

  useEffect(() => {
    const onKey = e => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setOpen(o => !o); return; }
      if (e.key === '/' && !open && !isTyping(document.activeElement)) { e.preventDefault(); setOpen(true); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    setQuery('');
    setActive(0);
    inputRef.current?.focus();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prevOverflow; };
  }, [open]);

  useEffect(() => { setOpen(false); }, [pathname]);

  const q = query.trim();
  useEffect(() => {
    if (q.length < USER_MIN_CHARS) return undefined;
    let alive = true;
    setUsers(u => ({ ...u, loading: true }));
    const timer = setTimeout(() => {
      fetchUsersPage({ search: q, pageSize: USER_LIMIT })
        .then(r => { if (alive) setUsers({ q, rows: r.rows, loading: false }); })
        .catch(() => { if (alive) setUsers({ q, rows: [], loading: false }); });
    }, DEBOUNCE_MS);
    return () => { alive = false; clearTimeout(timer); };
  }, [q]);

  const results = useMemo(() => {
    if (!q) {
      const byTo = new Map(pages.map(p => [p.to, p]));
      return readRecent().map(to => byTo.get(to)).filter(Boolean)
        .map(p => ({ kind: 'page', key: p.to, to: p.to, title: p.label, meta: p.section, icon: p.icon, group: 'Abertas recentemente' }));
    }
    const pageHits = searchPages(q, pages).map(p => ({ kind: 'page', key: p.to, to: p.to, title: p.label, meta: p.section, icon: p.icon, group: 'Telas' }));
    const userHits = q.length >= USER_MIN_CHARS && users.q === q
      ? users.rows.map(u => ({
          kind: 'user', key: `u:${u.id}`, to: `/users/${u.id}`,
          title: [u.nome, u.sobrenome].filter(Boolean).join(' ') || u.email,
          meta: u.email, icon: 'user', group: 'Usuários',
        }))
      : [];
    return [...pageHits, ...userHits];
  }, [q, pages, users]);

  useEffect(() => { setActive(0); }, [q]);

  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView?.({ block: 'nearest' });
  }, [active]);

  function go(item) {
    if (!item) return;
    setOpen(false);
    navigate(item.to);
  }

  function onInputKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); setOpen(false); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(i => Math.min(i + 1, results.length - 1)); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActive(i => Math.max(i - 1, 0)); return; }
    if (e.key === 'Enter') { e.preventDefault(); go(results[active]); }
  }

  const searchingUsers = q.length >= USER_MIN_CHARS && (users.loading || users.q !== q);
  let lastGroup = '';

  return (
    <>
      <button type="button" className="qsearch-btn" onClick={() => setOpen(true)} aria-label="Buscar telas e usuários (Ctrl+K)">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
          <circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" />
        </svg>
        <span className="qsearch-btn__label">Buscar…</span>
        <kbd className="qsearch-btn__kbd">Ctrl K</kbd>
      </button>

      {open && (
        <div className="qsearch-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setOpen(false); }}>
          <div className="qsearch" role="dialog" aria-modal="true" aria-label="Busca rápida">
            <input
              ref={inputRef}
              className="qsearch__input"
              type="search"
              placeholder="Buscar tela, ou usuário por nome ou e-mail…"
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={onInputKey}
              role="combobox"
              aria-expanded="true"
              aria-controls="qsearch-list"
              aria-activedescendant={results[active] ? `qs-${results[active].key}` : undefined}
              autoComplete="off"
            />
            <ul className="qsearch__list" id="qsearch-list" role="listbox" ref={listRef}>
              {results.map((r, i) => {
                const header = r.group !== lastGroup ? r.group : '';
                lastGroup = r.group;
                return (
                  <li key={r.key} role="presentation">
                    {header && <div className="qsearch__group" role="presentation">{header}</div>}
                    <div
                      id={`qs-${r.key}`}
                      role="option"
                      aria-selected={i === active}
                      className={`qsearch__item ${i === active ? 'qsearch__item--active' : ''}`}
                      onMouseMove={() => setActive(i)}
                      onClick={() => go(r)}
                    >
                      <span className="qsearch__icon"><NavIcon name={r.icon} /></span>
                      <span className="qsearch__title">{r.title}</span>
                      {r.meta && <span className="qsearch__meta">{r.meta}</span>}
                    </div>
                  </li>
                );
              })}
            </ul>
            <div className="qsearch__foot">
              {searchingUsers ? 'Procurando usuários…'
                : q && !results.length ? 'Nada encontrado.'
                : !q && !results.length ? 'Digite o nome de uma tela, ou 3+ letras para buscar usuários.'
                : q && q.length < USER_MIN_CHARS ? 'Digite 3+ letras para buscar usuários também.'
                : '↑↓ para escolher · Enter para abrir · Esc para fechar'}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
