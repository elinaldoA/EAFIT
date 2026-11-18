import { PLATFORMS, STATUS_LABEL, accountLabel } from '../../lib/marketing';
import { formatDate } from '../../lib/userDetailHelpers';
import { STATUS_BADGE } from './constants';

export default function PostCard({ p, byId, editing, tools, editor, onRetry }) {
  return (
      <article key={p.id} className="mkt-post">
        <div className="mkt-post__head">
          <span className="user-detail__meta">
            {p.format === 'story' && <span className="badge">Story</span>}{' '}
            {p.scheduled_at ? `agendado para ${formatDate(p.scheduled_at)}` : `criado em ${formatDate(p.created_at)}`}
            {p.media?.length ? ` · ${p.media.length} mídia(s)` : ''}
          </span>
          <span className="actions-row">{tools}</span>
        </div>
        {p.format !== 'story' && editing?.id !== p.id && <p className="mkt-post__caption">{p.caption || <em>(sem legenda)</em>}</p>}
        {editor}
        <ul className="mkt-targets">
          {p.targets.map(t => {
            const a = byId.get(t.account_id);
            return (
              <li key={t.id}>
                <span>{a ? `${PLATFORMS[a.platform].label} ${accountLabel(a)}` : 'Conta removida'}</span>
                <span className={`badge ${STATUS_BADGE[t.status] || ''}`}>{STATUS_LABEL[t.status] || t.status}</span>
                {t.permalink && <a href={t.permalink} target="_blank" rel="noreferrer">ver post</a>}
                {t.status === 'published' && t.error && <span className="user-detail__meta">{t.error}</span>}
                {t.status === 'failed' && (
                  <>
                    <span className="user-detail__meta">{t.error}</span>
                    <button type="button" className="btn btn--small" onClick={() => onRetry({ ...t, post_id: p.id })}>Tentar de novo</button>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      </article>
  );
}
