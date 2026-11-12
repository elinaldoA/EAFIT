import { useEffect, useMemo, useState } from 'react';
import { fetchAds, fetchConversion, trendingPosts, weeklySummary } from '../lib/marketing';
import Loading from './Loading';

const fmt = n => (n === null || n === undefined ? '–' : Number(n).toLocaleString('pt-BR'));
const firstLine = text => (String(text || '').split('\n')[0] || '(sem legenda)').slice(0, 90);

function money(value) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function summaryText(s) {
  const lines = [
    'Resumo da semana · EAFIT',
    `Posts no feed: ${s.posts} · stories: ${s.stories}`,
    `Interações: ${fmt(s.interactions)}${s.reach ? ` · alcance somado: ${fmt(s.reach)}` : ''}`,
  ];
  if (s.best) lines.push(`Melhor post: ${firstLine(s.best.caption)}${s.best.permalink ? ` (${s.best.permalink})` : ''}`);
  if (s.spend) lines.push(`Anúncios: gasto ${money(s.spend)} · ${fmt(s.adReach)} pessoas alcançadas · ${fmt(s.adClicks)} cliques`);
  lines.push(`Cadastros pelas redes: ${fmt(s.signups)} (de ${fmt(s.visits)} visitas)`);
  return lines.join('\n');
}

// Marketing → Resultados: o resumo dos últimos 7 dias (para copiar e mandar) e o aviso de
// posts que decolaram nas últimas 72 h e ainda não têm anúncio.
export default function MarketingWeekly({ metrics = [], accounts = [] }) {
  const [ads, setAds] = useState(null);
  const [conversion, setConversion] = useState(null);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    let alive = true;
    fetchAds(7).then(r => { if (alive) setAds(r.ads || []); }).catch(() => { if (alive) setAds([]); });
    fetchConversion(7).then(r => { if (alive) setConversion(r); }).catch(() => { if (alive) setConversion([]); });
    return () => { alive = false; };
  }, []);

  const ready = ads !== null && conversion !== null;
  const summary = useMemo(() => (ready ? weeklySummary({ metrics, ads, conversion }) : null), [ready, metrics, ads, conversion]);
  const trending = useMemo(() => (ready ? trendingPosts(metrics, ads) : []), [ready, metrics, ads]);
  const networkOf = m => accounts.find(a => a.id === m.account_id)?.platform;

  async function copy() {
    try {
      await navigator.clipboard.writeText(summaryText(summary));
      setMsg('Resumo copiado.');
    } catch {
      setMsg('Erro: o navegador não deixou copiar. Selecione o texto abaixo.');
    }
  }

  return (
    <section className="card stack" aria-label="Resumo da semana">
      <h2 className="section-title">Resumo da semana</h2>
      {!ready && <Loading />}

      {trending.length > 0 && (
        <div className="form-msg form-msg--ok" role="status">
          <strong>Em alta agora:</strong>{' '}
          {trending.map(m => (
            <span key={`${m.account_id}-${m.external_id}`}>
              {m.permalink ? <a href={m.permalink} target="_blank" rel="noreferrer">{firstLine(m.caption)}</a> : firstLine(m.caption)}
              {' '}({networkOf(m) === 'facebook' ? 'Facebook' : 'Instagram'}, {m.vsAverage.toLocaleString('pt-BR')}× a média da conta);{' '}
            </span>
          ))}
          ainda sem anúncio. Posts que decolam cedo costumam render bem se forem impulsionados logo.
        </div>
      )}

      {summary && (
        <>
          <div className="mkt-stats">
            <div className="mkt-stat"><span className="mkt-stat__n">{fmt(summary.posts)}</span><span className="mkt-stat__l">posts no feed (+{fmt(summary.stories)} stories)</span></div>
            <div className="mkt-stat"><span className="mkt-stat__n">{fmt(summary.interactions)}</span><span className="mkt-stat__l">interações</span></div>
            <div className="mkt-stat"><span className="mkt-stat__n">{money(summary.spend)}</span><span className="mkt-stat__l">gasto em anúncios</span></div>
            <div className="mkt-stat"><span className="mkt-stat__n">{fmt(summary.signups)}</span><span className="mkt-stat__l">cadastros pelas redes</span></div>
          </div>
          {summary.best && (
            <p className="user-detail__meta">
              Melhor post da semana: {summary.best.permalink ? <a href={summary.best.permalink} target="_blank" rel="noreferrer">{firstLine(summary.best.caption)}</a> : firstLine(summary.best.caption)}
            </p>
          )}
          <div className="actions-row">
            <button type="button" className="btn btn--small" onClick={copy}>Copiar resumo</button>
            {msg && <span className={`form-msg ${msg.startsWith('Erro') ? 'form-msg--error' : 'form-msg--ok'}`}>{msg}</span>}
          </div>
          <pre className="user-detail__meta" style={{ whiteSpace: 'pre-wrap' }}>{summaryText(summary)}</pre>
        </>
      )}
    </section>
  );
}
