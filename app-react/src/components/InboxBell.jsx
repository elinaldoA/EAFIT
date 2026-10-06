import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../context/useAuth';
import { useBackToClose } from '../hooks/useBackToClose';
import { getModalRoot } from '../lib/modalRoot';
import { fetchInbox, markInboxRead, timeAgo } from '../lib/inbox';

function InboxModal({ items, onClose }) {
  useBackToClose(onClose);
  useEffect(() => {
    document.body.classList.add('modal-open');
    return () => document.body.classList.remove('modal-open');
  }, []);

  return createPortal(
    <div className="inbox" role="dialog" aria-modal="true" aria-label="Avisos">
      <div className="inbox__backdrop" onClick={onClose} />
      <div className="inbox__panel">
        <div className="inbox__head">
          <strong>✉️ Avisos</strong>
          <button type="button" className="icon-btn" aria-label="Fechar" onClick={onClose}>✕</button>
        </div>
        <div className="inbox__list">
          {items.length === 0 && <p className="dash-empty">Nenhum aviso por enquanto.</p>}
          {items.map(i => (
            <div key={i.id} className={`inbox__item${i.unread ? ' inbox__item--unread' : ''}`}>
              <div className="inbox__title">{i.title}</div>
              <p className="inbox__body">{i.body}</p>
              <span className="inbox__time">{timeAgo(i.created_at)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>,
    getModalRoot(),
  );
}

// Sino na barra superior: avisos que o admin enviou e notificações
// automáticas, para reler mesmo sem push. Falha (offline, migration pendente)
// conta como "sem avisos", sem barulho.
export default function InboxBell() {
  const { user } = useAuth();
  const userId = user?.id;
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);

  const refresh = useCallback(() => {
    if (!userId) return;
    fetchInbox().then(rows => setItems(rows.map(r => ({ ...r, unread: !r.read_at })))).catch(() => {});
  }, [userId]);

  useEffect(() => {
    refresh();
    const onVisible = () => { if (document.visibilityState === 'visible') refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    const timer = setInterval(refresh, 120000);
    return () => { document.removeEventListener('visibilitychange', onVisible); clearInterval(timer); };
  }, [refresh]);

  const unread = items.filter(i => i.unread).length;

  function handleOpen() {
    setOpen(true);
    if (unread > 0) markInboxRead().catch(err => console.error('markInboxRead:', err));
  }

  function handleClose() {
    setOpen(false);
    // Só agora some o destaque: enquanto aberto, o aluno ainda vê o que era novo.
    setItems(list => list.map(i => ({ ...i, unread: false })));
  }

  return (
    <>
      <button type="button" className="inbox-bell" title="Avisos" aria-label={unread ? `Avisos (${unread} novo(s))` : 'Avisos'} onClick={handleOpen}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3" y="5" width="18" height="14" rx="2" /><polyline points="3 7 12 13 21 7" />
        </svg>
        {unread > 0 && <span className="inbox-bell__badge">{unread > 9 ? '9+' : unread}</span>}
      </button>
      {open && <InboxModal items={items} onClose={handleClose} />}
    </>
  );
}
