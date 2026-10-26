import { parseLocalDate } from '../lib/utils';

import { t, locale } from '../lib/i18n';
const WEEKDAY = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

// Barras de proteína diária com a linha da meta tracejada. series vem de
// buildProteinSeries (último item = hoje). Usa o visual do gráfico de água.
export default function ProteinBars({ series, goalG }) {
  const max = Math.max(goalG * 1.15, ...series.map(d => d.g)) || 1;
  const goalPct = (goalG / max) * 100;
  const lastIdx = series.length - 1;

  return (
    <div className="water-bars" role="img" aria-label={t('Proteína nos últimos {length} dias', { length: series.length })}>
      <div className="water-bars__plot">
        <div className="water-bars__goal" style={{ bottom: `${goalPct}%` }}>
          <span>{t('meta')}</span>
        </div>
        {series.map((d, i) => {
          const hit = d.g >= goalG;
          return (
            <div className="water-bars__col" key={d.date} title={`${d.date.slice(8)}/${d.date.slice(5, 7)}: ${d.g.toLocaleString(locale)} g`}>
              <div
                className={`water-bars__bar${hit ? ' water-bars__bar--hit' : ''}${i === lastIdx ? ' water-bars__bar--today' : ''}`}
                style={{ height: `${Math.max(d.g ? 3 : 0, (d.g / max) * 100)}%` }}
              />
            </div>
          );
        })}
      </div>
      <div className="water-bars__labels" aria-hidden="true">
        {series.map((d, i) => (
          <span key={d.date} className={i === lastIdx ? 'water-bars__label--today' : undefined}>
            {i === lastIdx ? t('Hoje') : WEEKDAY[parseLocalDate(d.date).getDay()]}
          </span>
        ))}
      </div>
    </div>
  );
}
