import { useEffect, useMemo, useState } from 'react';
import { AD_STATUS_LABEL, adTotals, fetchAds } from '../lib/marketing';
import Loading from './Loading';
import EmptyState from './EmptyState';
import { Paged } from './ShowMore';

const fmt = n => (n === null || n === undefined ? '–' : Number(n).toLocaleString('pt-BR'));

function money(value, currency = 'BRL') {
  if (value === null || value === undefined) return '–';
  try {
    return value.toLocaleString('pt-BR', { style: 'currency', currency });
  } catch {
    return value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
}

// Marketing → Resultados → Posts promovidos: o que cada anúncio da Meta gastou e rendeu.
// Só leitura (permissão ads_read); a campanha continua sendo criada no Instagram ou no
// Gerenciador de Anúncios.
export default function MarketingAds({ days }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    setData(null);
    setError('');
    fetchAds(days).then(r => { if (alive) setData(r); }).catch(err => { if (alive) setError(err.message); });
    return () => { alive = false; };
  }, [days]);

  const accounts = data?.accounts || [];
  const ads = useMemo(() => data?.ads || [], [data]);
  const currencyOf = id => accounts.find(a => a.id === id)?.currency || 'BRL';
  // Somar moedas diferentes não faz sentido: totais só quando há uma moeda.
  const currencies = [...new Set(accounts.filter(a => !a.error).map(a => a.currency))];
  const single = currencies.length === 1 ? currencies[0] : null;
  const totals = useMemo(() => adTotals(ads), [ads]);
  const failed = accounts.filter(a => a.error);

  return (
    <section className="card stack" aria-label="Posts promovidos">
      <h2 className="section-title">Posts promovidos</h2>
      {!data && !error && <Loading />}
      {error && <p className="form-msg form-msg--error">Erro: {error}</p>}
      {failed.map(a => (
        <p key={a.id} className="form-msg form-msg--error">Conta de anúncios {a.name || a.id}: {a.error}</p>
      ))}

      {data && accounts.length === 0 && (
        <EmptyState icon="📣" label="Nenhuma conta de anúncios ligada. Reconecte o Facebook em Marketing → Contas e aceite a permissão de anúncios (leitura)." />
      )}
      {data && accounts.length > 0 && !failed.length && ads.length === 0 && (
        <EmptyState icon="📣" label={`Nenhum anúncio com entrega nos últimos ${days} dias.`} />
      )}

      {ads.length > 0 && (
        <>
          {single && (
            <div className="mkt-stats">
              <div className="mkt-stat"><span className="mkt-stat__n">{money(totals.spend, single)}</span><span className="mkt-stat__l">gasto</span></div>
              <div className="mkt-stat"><span className="mkt-stat__n">{fmt(totals.reach)}</span><span className="mkt-stat__l">pessoas alcançadas</span></div>
              <div className="mkt-stat"><span className="mkt-stat__n">{fmt(totals.clicks)}</span><span className="mkt-stat__l">cliques no link</span></div>
              <div className="mkt-stat"><span className="mkt-stat__n">{money(totals.cpc, single)}</span><span className="mkt-stat__l">custo por clique</span></div>
              <div className="mkt-stat"><span className="mkt-stat__n">{money(totals.cpm, single)}</span><span className="mkt-stat__l">custo por mil impressões</span></div>
            </div>
          )}
          <Paged items={ads} size={20} resetKey={String(days)}>{visible => (
            <div className="table-wrap">
              <table className="resp-table">
                <thead>
                  <tr><th>Anúncio</th><th>Situação</th><th>Gasto</th><th>Alcance</th><th>Impressões</th><th>Cliques</th><th>Custo/clique</th></tr>
                </thead>
                <tbody>
                  {visible.map(a => (
                    <tr key={a.id}>
                      <td data-label="Anúncio">
                        <div className="mkt-row mkt-row--metric">
                          {a.thumb_url ? <img className="mkt-row__thumb" src={a.thumb_url} alt="" loading="lazy" /> : <span className="mkt-row__thumb mkt-row__thumb--empty" aria-hidden="true" />}
                          <div className="mkt-row__main">
                            <div className="mkt-row__caption">{a.name || '(sem nome)'}</div>
                            {a.permalink && <a href={a.permalink} target="_blank" rel="noreferrer">ver post</a>}
                          </div>
                        </div>
                      </td>
                      <td data-label="Situação"><span className="badge">{AD_STATUS_LABEL[a.status] || a.status || '–'}</span></td>
                      <td data-label="Gasto">{money(a.spend, currencyOf(a.account))}</td>
                      <td data-label="Alcance">{fmt(a.reach)}</td>
                      <td data-label="Impressões">{fmt(a.impressions)}</td>
                      <td data-label="Cliques">{fmt(a.clicks)}</td>
                      <td data-label="Custo/clique">{a.clicks ? money(a.spend / a.clicks, currencyOf(a.account)) : '–'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}</Paged>
          <p className="user-detail__meta">
            Dados da Meta, só leitura. Para saber quantos cadastros cada anúncio trouxe, use links com <code>utm_medium=ads</code> e
            compare com “Cadastros vindos das redes” acima.
          </p>
        </>
      )}
    </section>
  );
}
