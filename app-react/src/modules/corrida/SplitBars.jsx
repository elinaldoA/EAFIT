import { formatPace } from './runs';
import { t } from '../../lib/i18n';

// Ritmo de cada km em barras: quanto mais rápido, mais comprida (o km mais
// rápido enche a linha e ganha destaque). splits = segundos de cada km.
// Com elev ([[subida, descida], ...] em metros, um par por km), mostra a subida
// e a descida de cada km ao lado do ritmo.
export default function SplitBars({ splits, elev = null }) {
  if (!Array.isArray(splits) || !splits.length) return null;
  const fastest = Math.min(...splits);
  const slowest = Math.max(...splits);
  // A barra mais lenta não some: a escala vai de 35% a 100%.
  const width = sec => (slowest === fastest ? 100 : Math.round(35 + 65 * ((slowest - sec) / (slowest - fastest))));
  const withElev = Array.isArray(elev) && elev.length > 0;
  return (
    <ol className={`run-splits${withElev ? ' run-splits--elev' : ''}`} aria-label={t('Tempo por km')}>
      {splits.map((sec, i) => (
        <li key={i} className={`run-splits__row${sec === fastest && splits.length > 1 ? ' run-splits__row--best' : ''}`}>
          <span className="run-splits__km">{i + 1}</span>
          <span className="run-splits__track"><span className="run-splits__bar" style={{ width: `${width(sec)}%` }} /></span>
          <span className="run-splits__pace">{formatPace(sec)}</span>
          {withElev && (
            <span className="run-splits__elev" aria-label={elev[i] ? t('Subida {v1} m, descida {v2} m', { v1: elev[i][0], v2: elev[i][1] }) : undefined}>
              {elev[i] ? `↗${elev[i][0]} ↘${elev[i][1]}` : ''}
            </span>
          )}
        </li>
      ))}
    </ol>
  );
}
