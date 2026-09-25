import { parseLocalDate } from '../lib/utils';

const WEEKDAY = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

// Barras de consumo diário com a linha da meta tracejada. series vem de
// buildDailySeries (último item = hoje).
export default function WaterBars({ series, goalMl }) {
  const max = Math.max(goalMl * 1.15, ...series.map(d => d.ml)) || 1;
  const goalPct = (goalMl / max) * 100;
  const lastIdx = series.length - 1;

  return (
    <div className="water-bars" role="img" aria-label={`Consumo de água nos últimos ${series.length} dias`}>
      <div className="water-bars__plot">
        <div className="water-bars__goal" style={{ bottom: `${goalPct}%` }}>
          <span>meta</span>
        </div>
        {series.map((d, i) => {
          const hit = d.ml >= goalMl;
          return (
            <div className="water-bars__col" key={d.date} title={`${d.date.slice(8)}/${d.date.slice(5, 7)}: ${(d.ml / 1000).toLocaleString('pt-BR')}L`}>
              <div
                className={`water-bars__bar${hit ? ' water-bars__bar--hit' : ''}${i === lastIdx ? ' water-bars__bar--today' : ''}`}
                style={{ height: `${Math.max(d.ml ? 3 : 0, (d.ml / max) * 100)}%` }}
              />
            </div>
          );
        })}
      </div>
      <div className="water-bars__labels" aria-hidden="true">
        {series.map((d, i) => (
          <span key={d.date} className={i === lastIdx ? 'water-bars__label--today' : undefined}>
            {i === lastIdx ? 'Hoje' : WEEKDAY[parseLocalDate(d.date).getDay()]}
          </span>
        ))}
      </div>
    </div>
  );
}
