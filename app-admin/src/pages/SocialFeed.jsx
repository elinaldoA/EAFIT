import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  FEED_KINDS, KIND_LABEL, FEED_PAGE_SIZE, friendlyCommunityError,
  fetchSocialStats, fetchFeedEvents, deleteFeedEvent, setFeedBlock, fetchInviteFunnel,
} from '../lib/community';
import { formatDate } from '../lib/userDetailHelpers';
import Loading from '../components/Loading';
import EmptyState from '../components/EmptyState';

const PERIODS = [7, 30, 90];

function pct(part, total) {
  return total > 0 ? `${Math.round((part / total) * 100)}%` : '—';
}

function InviteCard() {
  const [days, setDays] = useState(30);
  const [funnel, setFunnel] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setError('');
    fetchInviteFunnel(days)
      .then(f => { if (active) setFunnel(f); })
      .catch(err => { if (active) setError(err.message); });
    return () => { active = false; };
  }, [days]);

  return (
    <div className="card">
      <div className="card-head">
        <h2 className="section-title" style={{ margin: 0 }}>Convites</h2>
        <div className="seg" role="group" aria-label="Período dos convites">
          {PERIODS.map(d => (
            <button
              key={d} type="button" aria-pressed={days === d}
              className={`seg__btn${days === d ? ' seg__btn--active' : ''}`}
              onClick={() => setDays(d)}
            >
              {d} dias
            </button>
          ))}
        </div>
      </div>
      {error && <p className="form-msg form-msg--error">{error}</p>}
      {!error && !funnel && <Loading />}
      {!error && funnel && (
        <>
          <div className="tile-grid">
            <div className="tile"><div className="tile__value">{funnel.shareUsers}</div><div className="tile__label">usuários tocaram em "Convidar amigos"</div></div>
            <div className="tile"><div className="tile__value">{funnel.landing}</div><div className="tile__label">visitas à landing vindas de convite</div></div>
            <div className="tile"><div className="tile__value">{funnel.acesso}</div><div className="tile__label">chegaram à tela de cadastro por convite</div></div>
            <div className="tile"><div className="tile__value">{funnel.signups}</div><div className="tile__label">cadastros no período (todas as origens)</div></div>
          </div>
          <p className="card-note">
            As visitas são anônimas, então não dá para ligar um cadastro a um convite específico: compare as visitas
            por convite com o total de cadastros só como referência.
          </p>
        </>
      )}
    </div>
  );
}

export default function SocialFeed() {
  const [stats, setStats] = useState(null);
  const [statsError, setStatsError] = useState('');
  const [kind, setKind] = useState('');
  const [page, setPage] = useState(0);
  const [feed, setFeed] = useState({ rows: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  const loadStats = useCallback(() => {
    fetchSocialStats().then(setStats).catch(err => setStatsError(err.message));
  }, []);

  const loadFeed = useCallback(async () => {
    setLoading(true);
    try {
      setFeed(await fetchFeedEvents({ page, kind }));
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [page, kind]);

  useEffect(() => { loadStats(); }, [loadStats]);
  useEffect(() => { loadFeed(); }, [loadFeed]);

  async function run(action, okMsg) {
    setMsg('');
    try {
      await action();
      setMsg(okMsg);
      await loadFeed();
      loadStats();
    } catch (err) {
      setMsg(`Erro: ${friendlyCommunityError(err)}`);
    }
  }

  function handleDelete(e) {
    if (!window.confirm(`Remover a publicação "${e.title}" do feed? Ela some para todos os amigos.`)) return;
    run(() => deleteFeedEvent(e.id), 'Publicação removida.');
  }

  function handleBlock(e) {
    const block = !e.blocked;
    if (block && !window.confirm(`Bloquear ${e.email} de publicar no feed? As publicações dessa pessoa deixam de aparecer para os amigos.`)) return;
    run(() => setFeedBlock(e.userId, block), block ? 'Usuário bloqueado no feed.' : 'Bloqueio removido.');
  }

  const totalPages = Math.max(1, Math.ceil(feed.total / FEED_PAGE_SIZE));
  const tiles = stats ? [
    { label: 'usuários com ao menos 1 amigo', value: `${stats.withFriends} (${pct(stats.withFriends, stats.users)})` },
    { label: 'amizades', value: stats.friendships },
    { label: 'pedidos pendentes', value: stats.pending },
    { label: 'publicações em 7 dias', value: stats.events7d },
    { label: 'reações em 30 dias', value: stats.reactions30d },
    { label: 'desligaram o compartilhamento', value: stats.sharingOff },
    { label: 'bloqueados no feed', value: stats.blocked },
  ] : [];

  return (
    <div className="stack">
      <div className="page-header">
        <div>
          <h1 className="page-title">Amigos e feed</h1>
          <p className="page-subtitle">
            O feed é o único lugar em que um usuário vê o que outro publica. As publicações são geradas pelo app
            (treino concluído, recorde, sequência), mas o nome de um exercício criado pelo usuário pode aparecer nelas.
          </p>
        </div>
      </div>

      {statsError && <p className="form-msg form-msg--error">{statsError}</p>}
      {stats && (
        <div className="tile-grid">
          {tiles.map(t => (
            <div className="tile" key={t.label}>
              <div className="tile__value">{t.value}</div>
              <div className="tile__label">{t.label}</div>
            </div>
          ))}
        </div>
      )}

      <InviteCard />

      <div className="card">
        <div className="card-head">
          <h2 className="section-title" style={{ margin: 0 }}>Publicações</h2>
          <div className="seg" role="group" aria-label="Tipo de publicação">
            {FEED_KINDS.map(k => (
              <button
                key={k.value} type="button" aria-pressed={kind === k.value}
                className={`seg__btn${kind === k.value ? ' seg__btn--active' : ''}`}
                onClick={() => { setKind(k.value); setPage(0); }}
              >
                {k.label}
              </button>
            ))}
          </div>
        </div>

        {msg && <p className={`form-msg ${msg.startsWith('Erro') ? 'form-msg--error' : 'form-msg--ok'}`}>{msg}</p>}
        {loading && <Loading />}
        {error && <p className="form-msg form-msg--error">{error}</p>}

        {!loading && !error && (
          <>
            <div className="table-wrap">
              <table className="resp-table">
                <thead><tr><th>Quando</th><th>Usuário</th><th>Tipo</th><th>Publicação</th><th>Reações</th><th /></tr></thead>
                <tbody>
                  {feed.rows.map(e => (
                    <tr key={e.id}>
                      <td data-label="Quando">{formatDate(e.at)}</td>
                      <td data-label="Usuário">
                        <Link className="btn btn--ghost btn--small" to={`/users/${e.userId}`}>{e.email}</Link>
                        {e.blocked && <span className="badge badge--danger">bloqueado</span>}
                      </td>
                      <td data-label="Tipo">{KIND_LABEL[e.kind] || e.kind}</td>
                      <td data-label="Publicação">
                        {e.title}
                        {e.detail && <div className="user-detail__meta">{e.detail}</div>}
                      </td>
                      <td data-label="Reações">{e.reactions}</td>
                      <td>
                        <div className="actions-row">
                          <button className="btn btn--danger btn--small" onClick={() => handleDelete(e)}>Remover</button>
                          <button className="btn btn--small" onClick={() => handleBlock(e)}>
                            {e.blocked ? 'Desbloquear' : 'Bloquear usuário'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {feed.rows.length === 0 && (
                    <tr><td colSpan={6}><EmptyState icon="📰" label="Nenhuma publicação no feed." /></td></tr>
                  )}
                </tbody>
              </table>
            </div>

            {feed.total > 0 && (
              <div className="page-header">
                <p className="user-detail__meta">{feed.total} publicação(ões) · página {page + 1} de {totalPages}</p>
                <div className="actions-row">
                  <button className="btn btn--small" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Anterior</button>
                  <button className="btn btn--small" disabled={page + 1 >= totalPages} onClick={() => setPage(p => p + 1)}>Próxima</button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
