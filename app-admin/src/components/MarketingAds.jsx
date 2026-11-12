import { useEffect, useMemo, useState } from 'react';
import { AD_STATUS_LABEL, KIND_LABEL, PLATFORMS, adSignups, adTotals, fetchAds, fetchAdsConversion, promoCandidates } from '../lib/marketing';
import Loading from './Loading';
import EmptyState from './EmptyState';
import { Paged } from './ShowMore';

const SUGGEST_KINDS = [{ key: '', label: 'Todos' }, { key: 'reel', label: 'Reels' }, { key: 'carousel', label: 'Carrosséis' }, { key: 'image', label: 'Fotos' }, { key: 'story', label: 'Stories' }];

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
export default function MarketingAds({ days, metrics = [], accounts: networkAccounts = [] }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [kind, setKind] = useState('');
  const [conv, setConv] = useState([]);

  useEffect(() => {
    let alive = true;
    setData(null);
    setError('');
    fetchAds(days).then(r => { if (alive) setData(r); }).catch(err => { if (alive) setError(err.message); });
    // Sem a migration ou sem links de anúncio a coluna de cadastros só fica vazia.
    fetchAdsConversion(days).then(r => { if (alive) setConv(r); }).catch(() => { if (alive) setConv([]); });
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
  const signups = useMemo(() => adSignups(ads, conv), [ads, conv]);
  const suggestions = useMemo(() => (data ? promoCandidates(metrics, ads, { kind }) : []), [data, metrics, ads, kind]);
  const networkOf = m => networkAccounts.find(a => a.id === m.account_id)?.platform;

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
              <div className="mkt-stat"><span className="mkt-stat__n">{fmt(signups.totals.signups)}</span><span className="mkt-stat__l">cadastros pelos links de anúncio</span></div>
              <div className="mkt-stat">
                <span className="mkt-stat__n">{signups.totals.signups ? money(totals.spend / signups.totals.signups, single) : '–'}</span>
                <span className="mkt-stat__l">custo por cadastro</span>
              </div>
              <div className="mkt-stat">
                <span className="mkt-stat__n">{signups.totals.activated ? money(totals.spend / signups.totals.activated, single) : '–'}</span>
                <span className="mkt-stat__l">custo por quem treinou na 1ª semana</span>
              </div>
            </div>
          )}
          <Paged items={ads} size={20} resetKey={String(days)}>{visible => (
            <div className="table-wrap">
              <table className="resp-table">
                <thead>
                  <tr><th>Anúncio</th><th>Situação</th><th>Gasto</th><th>Alcance</th><th>Impressões</th><th>Cliques</th><th>Custo/clique</th><th>Cadastros</th><th>Custo/cadastro</th></tr>
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
                      <td data-label="Cadastros">{signups.perAd.get(a.id) ? fmt(signups.perAd.get(a.id).signups) : '–'}</td>
                      <td data-label="Custo/cadastro">{signups.perAd.get(a.id)?.signups ? money(a.spend / signups.perAd.get(a.id).signups, currencyOf(a.account)) : '–'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}</Paged>
          <p className="user-detail__meta">
            Dados da Meta, só leitura. Para ligar cada cadastro ao anúncio, ponha no link do anúncio (Parâmetros de URL):{' '}
            <code>utm_source=instagram&amp;utm_medium=ads&amp;utm_content={'{{ad.id}}'}</code>. A Meta troca o <code>{'{{ad.id}}'}</code> pelo número do
            anúncio. Sem o <code>utm_content</code>, só vale o custo médio por cadastro de todos os anúncios.
          </p>
        </>
      )}

      {data && (
        <div className="stack" aria-label="Posts com potencial de promoção">
          <h3 className="section-title">Próximos para promover</h3>
          <div className="mkt-filter" role="group" aria-label="Formato">
            {SUGGEST_KINDS.map(k => (
              <button key={k.key} type="button" aria-pressed={kind === k.key}
                className={`btn btn--small${kind === k.key ? '' : ' btn--ghost'}`} onClick={() => setKind(k.key)}>{k.label}</button>
            ))}
          </div>
          {suggestions.length === 0 && (
            <p className="user-detail__meta">Nenhum post deste formato nos últimos 30 dias engajou o bastante para sugerir (ou os que engajaram já estão promovidos).</p>
          )}
          {suggestions.map(m => (
            <div key={`${m.account_id}-${m.external_id}`} className="mkt-row mkt-row--metric">
              {m.thumb_url ? <img className="mkt-row__thumb" src={m.thumb_url} alt="" loading="lazy" /> : <span className="mkt-row__thumb mkt-row__thumb--empty" aria-hidden="true" />}
              <div className="mkt-row__main">
                <div className="mkt-row__title">
                  <span className="badge">{KIND_LABEL[m.kind] || m.kind}</span>
                  <span className="badge">{PLATFORMS[networkOf(m)]?.label || '–'}</span>
                  {m.confidence === 'baixa' && <span className="badge">poucos dados</span>}
                  {m.liveUntil && <span className="badge">no ar até {new Date(m.liveUntil).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>}
                </div>
                <div className="mkt-row__caption">{(String(m.caption || '').split('\n')[0] || '(sem legenda)').slice(0, 90)}</div>
                <div className="user-detail__meta">
                  {m.kind === 'story' ? `${fmt(m.comments)} respostas` : `${fmt(m.likes)} curtidas · ${fmt(m.comments)} comentários`}{m.saves ? ` · ${fmt(m.saves)} salvos` : ''}{m.shares ? ` · ${fmt(m.shares)} compart.` : ''}
                  {m.rate !== null ? ` · ${m.rate.toLocaleString('pt-BR')}% de engajamento sobre o alcance` : ''}
                  {m.vsAverage ? ` · ${m.vsAverage.toLocaleString('pt-BR')}× a média da conta` : ''}
                </div>
                {m.permalink && <a href={m.permalink} target="_blank" rel="noreferrer">ver post</a>}
              </div>
            </div>
          ))}
          {suggestions.length > 0 && (
            <p className="user-detail__meta">
              Ordem por engajamento em relação à média da própria conta, sem os posts que já têm anúncio. Para promover, abra o post
              no Instagram ou no Facebook e toque em “Impulsionar”. Story só pode ser impulsionado enquanto está no ar (24 h); os mais antigos servem de modelo para repetir. Com poucas curtidas o ranking é só uma pista: o alcance ajuda a decidir.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
