import { useEffect, useState } from 'react';
import { fetchProgramMessages, markInboxItemRead, timeAgo } from '../lib/inbox';

import { t } from '../lib/i18n';

// Modo do programa → Recados: o que a equipe EAFIT mandou para o grupo da
// pessoa (embaixadores ou influenciadores)
// (Pessoas → Embaixadores e influenciadores, no admin). Abrir a aba marca os
// novos como lidos; eles ficam destacados até sair da tela.
export default function MessagesPage({ onRead }) {
  const [items, setItems] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    fetchProgramMessages()
      .then(list => {
        if (!active) return;
        setItems(list);
        const unread = list.filter(i => !i.read_at);
        if (!unread.length) return;
        Promise.all(unread.map(i => markInboxItemRead(i.id)))
          .then(() => { if (active) onRead?.(); })
          .catch(err => console.error('markInboxItemRead:', err));
      })
      .catch(err => { console.error('fetchProgramMessages:', err); if (active) setError(true); });
    return () => { active = false; };
  }, [onRead]);

  return (
    <section className="page active trainer-page">
      <div className="dash-card">
        <div className="dash-card__title">{t('💬 Recados da equipe EAFIT')}</div>
        <p className="profile-field__hint mt-0">
          {t('Campanhas, novidades e datas importantes para quem divulga o EAFIT. Ative as notificações em Conta para saber na hora.')}
        </p>
      </div>

      {error && <p className="profile-field__hint">{t('Não foi possível carregar os recados agora.')}</p>}
      {!items && !error && <div className="skeleton" style={{ height: 110 }} />}
      {items && items.length === 0 && (
        <div className="dash-card">
          <p className="profile-field__hint m-0">{t('Nenhum recado ainda. Quando a equipe mandar, ele aparece aqui.')}</p>
        </div>
      )}
      {items && items.length > 0 && (
        <div className="influencer-messages">
          {items.map(i => (
            <article key={i.id} className={`inbox__item${i.read_at ? '' : ' inbox__item--unread'}`}>
              <div className="inbox__title">{i.title}</div>
              <p className="inbox__body">{i.body}</p>
              <div className="inbox__time">{timeAgo(i.created_at)}</div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
