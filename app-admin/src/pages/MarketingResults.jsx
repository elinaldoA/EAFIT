import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  KIND_LABEL, MEDIUM_LABEL, PLATFORMS, averageByKind, conversionRate, deleteExternalPost, editExternalPost, fetchAccounts, fetchContentConversion, fetchConversion, fetchMetrics,
  postScore, refreshMetrics,
} from '../lib/marketing';
import { formatDate } from '../lib/userDetailHelpers';
import Loading from '../components/Loading';
import EmptyState from '../components/EmptyState';

const PERIODS = [
  { days: 7, label: '7 dias' },
  { days: 30, label: '30 dias' },
  { days: 90, label: '90 dias' },
];
const SORTS = [
  { key: 'score', label: 'Melhores' },
  { key: 'recent', label: 'Mais recentes' },
];
const NETWORKS = ['instagram', 'facebook'];

const fmt = n => (n === null || n === undefined ? '–' : Number(n).toLocaleString('pt-BR'));
const pct = rate => (rate === null ? '–' : `${rate.toLocaleString('pt-BR')}%`);
const firstLine = text => (String(text || '').split('\n')[0] || '(sem legenda)').slice(0, 90);

// Marketing → Resultados: o que cada post rendeu (alcance, curtidas, salvos) e
// quantos cadastros vieram de cada tipo de link das redes.
export default function MarketingResults() {
  const [days, setDays] = useState(30);
  const [platform, setPlatform] = useState('');
  const [sort, setSort] = useState('score');
  const [metrics, setMetrics] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [conversion, setConversion] = useState(null);
  const [byPost, setByPost] = useState([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [editing, setEditing] = useState(null); // { key, accountId, externalId, text }
  const [rowBusy, setRowBusy] = useState('');

  const loadMetrics = useCallback(async () => {
    try {
      setMetrics(await fetchMetrics());
    } catch (err) {
      setMsg(`Erro: ${err.message}`);
      setMetrics([]);
    }
  }, []);

  useEffect(() => {
    loadMetrics();
    fetchAccounts().then(setAccounts).catch(() => setAccounts([]));
  }, [loadMetrics]);

  useEffect(() => {
    let alive = true;
    setConversion(null);
    fetchConversion(days).then(r => { if (alive) setConversion(r); }).catch(err => {
      if (alive) { setMsg(`Erro: ${err.message}`); setConversion([]); }
    });
    // Sem a migration aplicada a lista por post só fica vazia; não é erro da tela.
    fetchContentConversion(days).then(r => { if (alive) setByPost(r); }).catch(() => { if (alive) setByPost([]); });
    return () => { alive = false; };
  }, [days]);

  async function handleRefresh() {
    setBusy(true);
    setMsg('');
    try {
      const { results = [] } = await refreshMetrics();
      const failed = results.filter(r => r.error);
      await loadMetrics();
      setMsg(failed.length ? `Erro: ${failed.length} conta(s) não atualizaram (${failed[0].error}).` : 'Métricas atualizadas.');
    } catch (err) {
      setMsg(`Erro: ${err.message}`);
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(m) {
    const net = PLATFORMS[accountById.get(m.account_id)?.platform]?.label || 'a rede';
    if (!window.confirm(`Excluir este post no ${net}? Ele some da rede, com curtidas e comentários. Não dá para desfazer.`)) return;
    const key = `${m.account_id}-${m.external_id}`;
    setRowBusy(key);
    setMsg('');
    try {
      await deleteExternalPost(m.account_id, m.external_id);
      setMsg('Post excluído.');
      await loadMetrics();
    } catch (err) {
      setMsg(`Erro: ${err.message}`);
    } finally {
      setRowBusy('');
    }
  }

  async function handleSaveEdit() {
    setRowBusy(editing.key);
    setMsg('');
    try {
      await editExternalPost(editing.accountId, editing.externalId, editing.text);
      setMsg('Legenda atualizada no Facebook.');
      setEditing(null);
      await loadMetrics();
    } catch (err) {
      setMsg(`Erro: ${err.message}`);
    } finally {
      setRowBusy('');
    }
  }

  const accountById = useMemo(() => new Map(accounts.map(a => [a.id, a])), [accounts]);
  const platformOf = m => accountById.get(m.account_id)?.platform;
  const rows = useMemo(() => {
    const cutoff = Date.now() - days * 86_400_000;
    const list = (metrics || []).filter(m => (!platform || accountById.get(m.account_id)?.platform === platform) && (!m.posted_at || new Date(m.posted_at) >= cutoff));
    return [...list].sort(sort === 'score' ? (a, b) => postScore(b) - postScore(a) : (a, b) => new Date(b.posted_at || 0) - new Date(a.posted_at || 0));
  }, [metrics, platform, sort, days, accountById]);
  const byKind = useMemo(() => averageByKind(rows), [rows]);
  const withInsights = rows.some(m => m.insights_ok);
  const best = rows[0];

  const totals = (conversion || []).reduce((t, r) => ({
    visits: t.visits + r.visits, signups: t.signups + r.signups, activated: t.activated + r.activated,
    mature: t.mature + r.mature, retained: t.retained + r.retained,
  }), { visits: 0, signups: 0, activated: 0, mature: 0, retained: 0 });

  return (
    <div className="stack">
      <div className="page-header">
        <div>
          <h1 className="page-title">Resultados</h1>
          <p className="page-subtitle">
            O que cada post rendeu e quantos cadastros vieram das redes. Os números dos posts vêm da própria rede e
            atualizam de 3 em 3 horas.
          </p>
        </div>
        <button type="button" className="btn" disabled={busy} onClick={handleRefresh}>
          {busy ? 'Atualizando…' : 'Atualizar métricas'}
        </button>
      </div>


      <div className="mkt-filter" role="group" aria-label="Período">
        {PERIODS.map(p => (
          <button key={p.days} type="button" aria-pressed={days === p.days}
            className={`btn btn--small${days === p.days ? '' : ' btn--ghost'}`} onClick={() => setDays(p.days)}>
            Últimos {p.label}
          </button>
        ))}
      </div>
      {msg && <p className={`form-msg ${msg.startsWith('Erro') ? 'form-msg--error' : 'form-msg--ok'}`}>{msg}</p>}

      <section className="card stack" aria-label="Cadastros vindos das redes">
        <h2 className="section-title">Cadastros vindos das redes</h2>
        {!conversion && <Loading />}
        {conversion && (
          <div className="mkt-stats">
            <div className="mkt-stat"><span className="mkt-stat__n">{fmt(totals.visits)}</span><span className="mkt-stat__l">visitas</span></div>
            <div className="mkt-stat"><span className="mkt-stat__n">{fmt(totals.signups)}</span><span className="mkt-stat__l">cadastros</span></div>
            <div className="mkt-stat"><span className="mkt-stat__n">{fmt(totals.activated)}</span><span className="mkt-stat__l">treinaram na 1ª semana</span></div>
            <div className="mkt-stat">
              <span className="mkt-stat__n">{totals.mature ? pct(conversionRate(totals.mature, totals.retained)) : '—'}</span>
              <span className="mkt-stat__l">seguiram treinando (dias 8 a 30)</span>
            </div>
            <div className="mkt-stat">
              <span className="mkt-stat__n">{pct(conversionRate(totals.visits, totals.signups))}</span>
              <span className="mkt-stat__l">cadastros por visita</span>
            </div>
          </div>
        )}
        {conversion && conversion.length === 0 && (
          <EmptyState icon="🔗" label="Ainda sem visitas com origem de rede social. Use os links com UTM na bio e nos stories." />
        )}
        {conversion && conversion.length > 0 && (
          <div className="table-wrap">
            <table className="resp-table">
              <thead>
                <tr><th>Rede</th><th>Tipo de link</th><th>Visitas</th><th>Cadastros</th><th>Por visita</th><th>Treinaram</th><th>Seguiram</th></tr>
              </thead>
              <tbody>
                {conversion.map(r => {
                  const rate = conversionRate(r.visits, r.signups);
                  return (
                    <tr key={`${r.source}-${r.medium}`}>
                      <td data-label="Rede">{PLATFORMS[r.source]?.label || r.source}</td>
                      <td data-label="Tipo de link">{MEDIUM_LABEL[r.medium] || r.medium}</td>
                      <td data-label="Visitas">{fmt(r.visits)}</td>
                      <td data-label="Cadastros">{fmt(r.signups)}</td>
                      <td data-label="Por visita">{pct(rate)}</td>
                      <td data-label="Treinaram">{fmt(r.activated)}</td>
                      <td data-label="Seguiram">{r.mature ? `${fmt(r.retained)} de ${fmt(r.mature)}` : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="user-detail__meta">
          Links para usar: <code>eafit.com.br/?utm_source=instagram&amp;utm_medium=bio</code> (bio), <code>utm_medium=story</code>,
          {' '}<code>utm_medium=post</code> e <code>utm_medium=ads</code>. “Seguiram” conta, entre quem se cadastrou há mais de 7 dias,
          {' '}quem voltou a treinar entre o dia 8 e o dia 30.
        </p>
      </section>

      {byPost.length > 0 && (
        <section className="card stack" aria-label="Cadastros por post">
          <h2 className="section-title">Cadastros por post</h2>
          <div className="table-wrap">
            <table className="resp-table">
              <thead>
                <tr><th>Post</th><th>Rede</th><th>Visitas</th><th>Cadastros</th><th>Treinaram</th><th>Seguiram</th></tr>
              </thead>
              <tbody>
                {byPost.map(r => (
                  <tr key={`${r.source}-${r.content}`}>
                    <td data-label="Post">{r.caption || `Post ${r.content}`}</td>
                    <td data-label="Rede">{PLATFORMS[r.source]?.label || r.source}</td>
                    <td data-label="Visitas">{fmt(r.visits)}</td>
                    <td data-label="Cadastros">{fmt(r.signups)}</td>
                    <td data-label="Treinaram">{fmt(r.activated)}</td>
                    <td data-label="Seguiram">{r.mature ? `${fmt(r.retained)} de ${fmt(r.mature)}` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="user-detail__meta">
            Os posts do Facebook saem com um link do app marcado com o id do post; cada cadastro por esse link entra aqui.
          </p>
        </section>
      )}

      <section className="card stack" aria-label="Desempenho dos posts">
        <h2 className="section-title">Desempenho dos posts</h2>
        <div className="actions-row">
          <div className="mkt-filter" role="group" aria-label="Rede">
            <button type="button" aria-pressed={!platform} className={`btn btn--small${platform ? ' btn--ghost' : ''}`} onClick={() => setPlatform('')}>Todas</button>
            {NETWORKS.map(n => (
              <button key={n} type="button" aria-pressed={platform === n}
                className={`btn btn--small${platform === n ? '' : ' btn--ghost'}`} onClick={() => setPlatform(n)}>{PLATFORMS[n].label}</button>
            ))}
          </div>
          <div className="mkt-filter" role="group" aria-label="Ordem">
            {SORTS.map(s => (
              <button key={s.key} type="button" aria-pressed={sort === s.key}
                className={`btn btn--small${sort === s.key ? '' : ' btn--ghost'}`} onClick={() => setSort(s.key)}>{s.label}</button>
            ))}
          </div>
        </div>

        {!metrics && <Loading />}
        {metrics && metrics.length === 0 && (
          <EmptyState icon="📊" label="Ainda sem métricas. Clique em “Atualizar métricas” para buscar nas redes." />
        )}
        {metrics && metrics.length > 0 && rows.length === 0 && <p className="user-detail__meta">Nenhum post neste período e rede.</p>}

        {rows.length > 0 && !withInsights && (
          <p className="form-msg">
            Alcance e salvamentos ainda não vieram: a rede só libera com a permissão de insights. Reconecte a conta em
            “Contas conectadas” e aceite as permissões novas. Por enquanto valem curtidas, comentários e compartilhamentos.
          </p>
        )}

        {best && (
          <div className="mkt-stats">
            <div className="mkt-stat">
              <span className="mkt-stat__l">Melhor post do período</span>
              <span>{firstLine(best.caption)}</span>
              <span className="user-detail__meta">{KIND_LABEL[best.kind]} · {withInsights ? `alcance ${fmt(best.reach)}` : `${fmt(postScore(best))} interações`}</span>
            </div>
            {byKind.map(g => (
              <div key={g.kind} className="mkt-stat">
                <span className="mkt-stat__l">{KIND_LABEL[g.kind]} · média por post</span>
                <span className="mkt-stat__n">{fmt(g.average)}</span>
                <span className="user-detail__meta">{g.posts} post(s) · {withInsights ? 'alcance' : 'interações'}</span>
              </div>
            ))}
          </div>
        )}

        {rows.length > 0 && (
          <div className="table-wrap">
            <table className="resp-table">
              <thead>
                <tr>
                  <th>Post</th><th>Rede</th><th>Alcance</th><th>Visualizações</th><th>Curtidas</th><th>Comentários</th><th>Salvos</th><th>Compart.</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(m => (
                  <tr key={`${m.account_id}-${m.external_id}`}>
                    <td data-label="Post">
                      <div className="mkt-row mkt-row--metric">
                        {m.thumb_url ? <img className="mkt-row__thumb" src={m.thumb_url} alt="" loading="lazy" /> : <span className="mkt-row__thumb mkt-row__thumb--empty" aria-hidden="true" />}
                        <div className="mkt-row__main">
                          <div className="mkt-row__title">
                            <span className="badge">{KIND_LABEL[m.kind]}</span>
                            <span className="user-detail__meta">{m.posted_at ? formatDate(m.posted_at) : ''}</span>
                          </div>
                          <div className="mkt-row__caption">{firstLine(m.caption)}</div>
                          <div className="actions-row">
                            {m.permalink && <a href={m.permalink} target="_blank" rel="noreferrer">ver post</a>}
                            {platformOf(m) === 'facebook' && (
                              <button type="button" className="btn btn--ghost btn--small"
                                onClick={() => setEditing({ key: `${m.account_id}-${m.external_id}`, accountId: m.account_id, externalId: m.external_id, text: m.caption || '' })}>
                                Editar legenda
                              </button>
                            )}
                            <button type="button" className="btn btn--danger btn--small" disabled={rowBusy === `${m.account_id}-${m.external_id}`} onClick={() => handleDelete(m)}>Excluir</button>
                          </div>
                          {editing?.key === `${m.account_id}-${m.external_id}` && (
                            <div className="stack">
                              <textarea className="input" rows={5} value={editing.text} maxLength={5000} aria-label="Nova legenda"
                                onChange={e => setEditing({ ...editing, text: e.target.value })} />
                              <div className="actions-row">
                                <button type="button" className="btn btn--primary btn--small" disabled={rowBusy === editing.key || !editing.text.trim()} onClick={handleSaveEdit}>Salvar</button>
                                <button type="button" className="btn btn--ghost btn--small" onClick={() => setEditing(null)}>Cancelar</button>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td data-label="Rede">{PLATFORMS[platformOf(m)]?.label || '–'}</td>
                    <td data-label="Alcance">{fmt(m.reach)}</td>
                    <td data-label="Visualizações">{fmt(m.views)}</td>
                    <td data-label="Curtidas">{fmt(m.likes)}</td>
                    <td data-label="Comentários">{fmt(m.comments)}</td>
                    <td data-label="Salvos">{fmt(m.saves)}</td>
                    <td data-label="Compart.">{fmt(m.shares)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
