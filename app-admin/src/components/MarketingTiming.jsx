import { useMemo } from 'react';
import { AUTOPOST_LANES, PERIODS_OF_DAY, bestTimes, hashtagStats } from '../lib/marketing';

const num = n => (n === null || n === undefined ? '–' : Number(n).toLocaleString('pt-BR'));

// Período do dia (Brasília) de uma faixa da fila, pelo horário "11h30" / "20h45".
function laneAt(lane, day) {
  const time = day === 0 || day === 6 ? (lane.weekendTime || lane.time) : lane.time;
  const hour = Number(String(time).split('h')[0]);
  return PERIODS_OF_DAY.find(p => hour >= p.from && hour < p.to);
}

function Bars({ rows, best, label }) {
  const max = Math.max(...rows.map(r => r.ratio || 0), 1);
  return (
    <div className="table-wrap">
      <table className="resp-table">
        <thead><tr><th>{label}</th><th>Posts</th><th>Engajamento (× a média)</th></tr></thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.key}>
              <td data-label={label}>{r.label}{best?.key === r.key && <span className="badge"> melhor</span>}</td>
              <td data-label="Posts">{num(r.posts)}</td>
              <td data-label="Engajamento">
                {r.ratio === null ? '–' : (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    <span aria-hidden="true" style={{ display: 'inline-block', height: 8, width: `${Math.max(4, (r.ratio / max) * 120)}px`, borderRadius: 4, background: 'currentColor', opacity: best?.key === r.key ? 1 : 0.35 }} />
                    {r.ratio.toLocaleString('pt-BR')}×
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Marketing → Resultados: quando postar (dia e período em que o feed engaja mais) e quais
// hashtags acompanham os posts que mais engajam. Janela de 90 dias, horário de Brasília.
export default function MarketingTiming({ metrics = [] }) {
  const times = useMemo(() => bestTimes(metrics), [metrics]);
  const tags = useMemo(() => hashtagStats(metrics), [metrics]);
  const grade = AUTOPOST_LANES.filter(l => !l.off && (l.format === 'feed' || l.format === 'reel'));

  return (
    <section className="card stack" aria-label="Melhor horário e hashtags">
      <h2 className="section-title">Quando postar e hashtags</h2>
      {times.posts < 6 ? (
        <p className="user-detail__meta">Ainda poucos posts nos últimos 90 dias ({times.posts}) para apontar o melhor horário. Volte quando houver mais.</p>
      ) : (
        <>
          <p>
            {times.bestWeekday && <>Melhor dia: <strong>{times.bestWeekday.label}</strong> ({times.bestWeekday.ratio.toLocaleString('pt-BR')}× a média, {times.bestWeekday.posts} posts). </>}
            {times.bestPeriod && <>Melhor período: <strong>{times.bestPeriod.label}</strong> ({times.bestPeriod.ratio.toLocaleString('pt-BR')}× a média, {times.bestPeriod.posts} posts).</>}
          </p>
          <div className="stack">
            <Bars rows={times.byWeekday} best={times.bestWeekday} label="Dia" />
            <Bars rows={times.byPeriod} best={times.bestPeriod} label="Período" />
          </div>
          <p className="user-detail__meta">
            Grade atual da fila:{' '}
            {grade.map(l => {
              const day = l.days ? l.days[0] : 1;
              const p = laneAt(l, day);
              return `${l.label} ${l.time}${p ? ` (${p.label.split(' ')[0].toLowerCase()})` : ''}`;
            }).join(' · ')}.
            {times.bestPeriod && !grade.some(l => laneAt(l, l.days ? l.days[0] : 1)?.key === times.bestPeriod.key) && ' Nenhuma faixa de feed ou Reel cai no melhor período: vale testar um horário nele.'}
          </p>
        </>
      )}

      <h3 className="section-title">Hashtags</h3>
      {tags.best.length === 0 ? (
        <p className="user-detail__meta">
          Ainda sem hashtags usadas em 2 posts ou mais{tags.total ? ` (${tags.total} diferentes até agora)` : ''}. A comparação aparece quando uma hashtag se repete.
        </p>
      ) : (
        <>
          <div className="actions-row" aria-label="Hashtags que mais renderam">
            {tags.best.map(t => <span key={t.tag} className="badge">{t.tag} · {t.ratio.toLocaleString('pt-BR')}× ({t.posts} posts)</span>)}
          </div>
          {tags.worst.length > 0 && (
            <p className="user-detail__meta">
              As que menos acompanharam engajamento: {tags.worst.map(t => `${t.tag} (${t.ratio.toLocaleString('pt-BR')}×)`).join(', ')}.
            </p>
          )}
          <p className="user-detail__meta">
            “×” compara o engajamento dos posts que usaram a hashtag com a média da conta. Correlação, não prova: a hashtag pode só aparecer em posts de um tema que já rendia mais.
          </p>
        </>
      )}
    </section>
  );
}
