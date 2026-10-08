import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../context/useAuth';
import { useToast } from '../context/useToast';
import { useReminders } from '../hooks/useReminders';
import { isNotificationSupported } from '../lib/notifications';
import { useBackToClose } from '../hooks/useBackToClose';
import { getModalRoot } from '../lib/modalRoot';
import {
  INBOX_PAGE, fetchInbox, markInboxRead, markInboxItemRead, timeAgo, inboxTarget,
} from '../lib/inbox';
import { goTo } from '../lib/appNav';

import { t } from '../lib/i18n';
function InboxModal({ items, hasMore, onMore, onClose, onReadOne, onReadAll, onGo, remindersEnabled, onToggleReminders }) {
  useBackToClose(onClose);
  useEffect(() => {
    document.body.classList.add('modal-open');
    return () => document.body.classList.remove('modal-open');
  }, []);

  return createPortal(
    <div className="inbox" role="dialog" aria-modal="true" aria-label={t('Avisos')}>
      <div className="inbox__backdrop" onClick={onClose} />
      <div className="inbox__panel">
        <div className="inbox__head">
          <strong>{t('🔔 Avisos')}</strong>
          <button type="button" className="icon-btn" aria-label={t('Fechar')} onClick={onClose}>✕</button>
        </div>
        <label className="inbox__reminders">
          <input type="checkbox" checked={remindersEnabled} onChange={onToggleReminders} disabled={!isNotificationSupported()} />
          <span>
            {t('Lembretes neste aparelho')}
            <small>{isNotificationSupported() ? t('Treino, água e incentivos, mesmo com o app fechado.') : t('Notificações não são suportadas neste navegador.')}</small>
          </span>
        </label>
        {items.some(i => i.unread) && (
          <div className="inbox__bar">
            <span>{t('{n} não lido(s)', { n: items.filter(i => i.unread).length })}</span>
            <button type="button" className="link-btn" onClick={onReadAll}>{t('Marcar todos como lidos')}</button>
          </div>
        )}
        <div className="inbox__list">
          {items.length === 0 && <p className="dash-empty">{t('Nenhum aviso por enquanto.')}</p>}
          {items.map(i => {
            const target = inboxTarget(i);
            return (
              <div key={i.id} className={`inbox__item${i.unread ? ' inbox__item--unread' : ''}`}>
                <div className="inbox__title">{i.title}</div>
                <p className="inbox__body">{i.body}</p>
                <div className="inbox__foot">
                  <span className="inbox__time">{timeAgo(i.created_at)}</span>
                  <span className="inbox__actions">
                    {i.unread && (
                      <button type="button" className="link-btn" onClick={() => onReadOne(i.id)}>{t('Marcar como lido')}</button>
                    )}
                    {target && (
                      <button type="button" className="link-btn inbox__go" onClick={() => onGo(i, target)}>{target.label} ›</button>
                    )}
                  </span>
                </div>
              </div>
            );
          })}
          {hasMore && (
            <button type="button" className="btn btn--ghost btn--sm" onClick={onMore}>{t('Ver avisos mais antigos')}</button>
          )}
        </div>
      </div>
    </div>,
    getModalRoot(),
  );
}

// Sino na barra superior: avisos que o admin enviou e notificações
// automáticas, para reler mesmo sem push, e o liga/desliga dos lembretes (o
// sino fica cortado quando estão desligados). Abrir não marca nada como lido:
// o aluno marca um aviso ou todos. Falha ao carregar (offline, migration
// pendente) conta como "sem avisos", sem barulho.
export default function InboxBell() {
  const { user } = useAuth();
  const toast = useToast();
  const [remindersEnabled, toggleReminders] = useReminders(toast, user);
  const userId = user?.id;
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [limit, setLimit] = useState(INBOX_PAGE);

  const refresh = useCallback(() => {
    if (!userId) return;
    fetchInbox(limit).then(rows => setItems(rows.map(r => ({ ...r, unread: !r.read_at })))).catch(() => {});
  }, [userId, limit]);

  useEffect(() => {
    refresh();
    const onVisible = () => { if (document.visibilityState === 'visible') refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    const timer = setInterval(refresh, 120000);
    return () => { document.removeEventListener('visibilitychange', onVisible); clearInterval(timer); };
  }, [refresh]);

  const unread = items.filter(i => i.unread).length;

  // O destaque some na hora; se o servidor recusar, volta como estava.
  async function markRead(ids, request) {
    setItems(list => list.map(i => (ids.includes(i.id) ? { ...i, unread: false } : i)));
    try {
      await request();
    } catch (err) {
      console.error('markInboxRead:', err);
      setItems(list => list.map(i => (ids.includes(i.id) ? { ...i, unread: true } : i)));
      toast(t('⚠️ Não foi possível marcar como lido. Tente de novo.'));
    }
  }

  const handleReadOne = id => markRead([id], () => markInboxItemRead(id));
  const handleReadAll = () => markRead(items.filter(i => i.unread).map(i => i.id), markInboxRead);

  // Abre a tela do aviso (e o dá como lido). Fechar o modal desfaz a entrada
  // que ele empilhou no histórico (useBackToClose) com um history.back()
  // assíncrono: trocar de aba antes disso seria desfeito por esse "voltar",
  // então a troca espera o popstate dele (com um prazo, se ele não vier).
  function handleGo(item, target) {
    if (item.unread) handleReadOne(item.id);
    setOpen(false);
    let done = false;
    const go = () => {
      if (done) return;
      done = true;
      window.removeEventListener('popstate', go);
      goTo(target);
    };
    window.addEventListener('popstate', go);
    setTimeout(go, 400);
  }

  return (
    <>
      <button type="button" className="inbox-bell" title={t('Avisos')} aria-label={unread ? t('Avisos ({unread} novo(s))', { unread }) : t('Avisos')} onClick={() => setOpen(true)}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          {remindersEnabled || !isNotificationSupported()
            ? <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></>
            : <><path d="M13.73 21a2 2 0 0 1-3.46 0" /><path d="M18.63 13A17.89 17.89 0 0 1 18 8" /><path d="M6.26 6.26A5.86 5.86 0 0 0 6 8c0 7-3 9-3 9h14" /><path d="M18 8a6 6 0 0 0-9.33-5" /><line x1="1" y1="1" x2="23" y2="23" /></>}
        </svg>
        {unread > 0 && <span className="inbox-bell__badge">{unread > 9 ? '9+' : unread}</span>}
      </button>
      {open && (
        <InboxModal
          items={items} hasMore={items.length >= limit} onMore={() => setLimit(n => n + INBOX_PAGE)}
          onClose={() => setOpen(false)} onReadOne={handleReadOne} onReadAll={handleReadAll} onGo={handleGo}
          remindersEnabled={remindersEnabled} onToggleReminders={toggleReminders}
        />
      )}
    </>
  );
}
