import { Paged } from '../ShowMore';
import Loading from '../Loading';
import EmptyState from '../EmptyState';
import { HISTORY_FILTERS } from './constants';

export default function HistoryTab({
  posts, shownPosts, historyFilter, setHistoryFilter, refreshing, onRefresh, msg, postLimit, onMore, renderPost,
}) {
  return (
    <section className="card stack">
        <div className="actions-row" style={{ justifyContent: 'space-between' }}>
          <h2 className="section-title">Histórico de posts</h2>
          <button type="button" className="btn btn--ghost btn--small" disabled={refreshing} onClick={onRefresh}>
            {refreshing ? 'Atualizando…' : 'Atualizar'}
          </button>
        </div>
        {msg && <p className={`form-msg ${msg.startsWith('Erro') ? 'form-msg--error' : 'form-msg--ok'}`} role={msg.startsWith('Erro') ? 'alert' : 'status'}>{msg}</p>}
        {posts && posts.length > 0 && (
          <div className="mkt-filter" role="group" aria-label="Filtrar posts">
            {HISTORY_FILTERS.map(f => (
              <button key={f.key} type="button" aria-pressed={historyFilter === f.key}
                className={`btn btn--small${historyFilter === f.key ? '' : ' btn--ghost'}`} onClick={() => setHistoryFilter(f.key)}>
                {f.label} ({posts.filter(f.test).length})
              </button>
            ))}
          </div>
        )}
        {!posts && <Loading />}
        {posts && posts.length === 0 && <EmptyState icon="📣" label="Nenhum post ainda." />}
        {posts && posts.length > 0 && shownPosts.length === 0 && <p className="user-detail__meta">Nenhum post nesta situação.</p>}
        {posts && <Paged items={shownPosts} size={15} resetKey={historyFilter}>{visible => visible.map(p => renderPost(p))}</Paged>}
        {posts && posts.length >= postLimit && (
          <div className="actions-row">
            <button type="button" className="btn btn--ghost btn--small" onClick={onMore}>Ver posts mais antigos</button>
          </div>
        )}
      </section>
  );
}
