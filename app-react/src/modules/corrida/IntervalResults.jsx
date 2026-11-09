import { cleanReps, repPace, repsSummary } from './intervals';
import { formatPace, formatClock } from './runs';
import { t } from '../../lib/i18n';

// Resultado de cada tiro do intervalado: barras de ritmo (o tiro mais rápido
// enche a linha e ganha destaque) com tempo e ritmo, mais o resumo.
// reps = [{ rep, s, m }] (intervals.js).
export default function IntervalResults({ reps }) {
  const list = cleanReps(reps);
  if (!list.length) return null;
  const summary = repsSummary(list);
  const paces = list.map(repPace).filter(p => p !== null);
  const fastest = Math.min(...paces);
  const slowest = Math.max(...paces);
  const width = pace => (pace === null ? 0 : slowest === fastest ? 100 : Math.round(35 + 65 * ((slowest - pace) / (slowest - fastest))));
  return (
    <div className="run-intervals">
      <ol className="run-splits run-splits--wide" aria-label={t('Tempo de cada tiro')}>
        {list.map(r => {
          const pace = repPace(r);
          const best = summary && summary.count > 1 && r.rep === summary.bestRep;
          return (
            <li key={r.rep} className={`run-splits__row${best ? ' run-splits__row--best' : ''}`}>
              <span className="run-splits__km">{r.rep}</span>
              <span className="run-splits__track"><span className="run-splits__bar" style={{ width: `${width(pace)}%` }} /></span>
              <span className="run-splits__pace">
                {formatClock(r.s)}{pace !== null ? ` · ${formatPace(pace)}/km` : ''}
              </span>
            </li>
          );
        })}
      </ol>
      {summary && summary.count > 1 && (
        <p className="profile-field__hint">
          {t('Tiro mais rápido: {v1} ({v2}/km) · média {v3}/km · diferença entre o mais rápido e o mais lento: {v4} s/km', {
            v1: summary.bestRep, v2: formatPace(summary.fastest), v3: formatPace(summary.avg), v4: summary.slowest - summary.fastest,
          })}
        </p>
      )}
    </div>
  );
}
