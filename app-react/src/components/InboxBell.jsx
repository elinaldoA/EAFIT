import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../context/useAuth';
import { useToast } from '../context/useToast';
import { useReminders } from '../hooks/useReminders';
import { isNotificationSupported } from '../lib/notifications';
import { useBackToClose } from '../hooks/useBackToClose';
import { getModalRoot } from '../lib/modalRoot';
import { fetchInbox, markInboxRead, markInboxItemRead, timeAgo } from '../lib/inbox';

import { t } from '../lib/i18n';
function InboxModal({ items, onClose, onReadOne, onReadAll, remindersEnabled, onToggleReminders }) {
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
          {items.map(i => (
            <div key={i.id} className={`inbox__item${i.unread ? ' inbox__item--unread' : ''}`}>
              <div className="inbox__title">{i.title}</div>
              <p className="inbox__body">{i.body}</p>
              <div className="inbox__foot">
                <span className="inbox__time">{timeAgo(i.created_at)}</span>
                {i.unread && (
                  <button type="button" className="link-btn" onClick={() => onReadOne(i.id)}>{t('Marcar como lido')}</button>
                )}
              </div>
            </div>
          ))}
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
          items={items} onClose={() => setOpen(false)} onReadOne={handleReadOne} onReadAll={handleReadAll}
          remindersEnabled={remindersEnabled} onToggleReminders={toggleReminders}
        />
      )}
    </>
  );
}
