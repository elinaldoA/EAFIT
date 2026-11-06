import { formatPace } from './runs';
import { t } from '../../lib/i18n';

// Ritmo de cada km em barras: quanto mais rápido, mais comprida (o km mais
// rápido enche a linha e ganha destaque). splits = segundos de cada km.
export default function SplitBars({ splits }) {
  if (!Array.isArray(splits) || !splits.length) return null;
  const fastest = Math.min(...splits);
  const slowest = Math.max(...splits);
  // A barra mais lenta não some: a escala vai de 35% a 100%.
  const width = sec => (slowest === fastest ? 100 : Math.round(35 + 65 * ((slowest - sec) / (slowest - fastest))));
  return (
    <ol className="run-splits" aria-label={t('Tempo por km')}>
      {splits.map((sec, i) => (
        <li key={i} className={`run-splits__row${sec === fastest && splits.length > 1 ? ' run-splits__row--best' : ''}`}>
          <span className="run-splits__km">{i + 1}</span>
          <span className="run-splits__track"><span className="run-splits__bar" style={{ width: `${width(sec)}%` }} /></span>
          <span className="run-splits__pace">{formatPace(sec)}</span>
        </li>
      ))}
    </ol>
  );
}
