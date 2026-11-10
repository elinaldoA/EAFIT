import { ZONE_COUNT } from './heartRate';
import { formatClock } from './runs';

import { t } from '../../lib/i18n';
// Tempo em cada zona de esforço da corrida: barra com as cinco zonas, a
// porcentagem do tempo e o relógio de cada uma.
const NAMES = [t('Z1 · leve'), t('Z2 · aeróbica'), t('Z3 · moderada'), t('Z4 · forte'), t('Z5 · máxima')];

export default function HrZones({ zones }) {
  const total = Array.isArray(zones) && zones.length === ZONE_COUNT ? zones.reduce((s, v) => s + v, 0) : 0;
  if (!(total > 0)) return null;
  return (
    <div className="run-zones">
      <div className="run-zones__bar" role="img" aria-label={t('Tempo em cada zona de esforço')}>
        {zones.map((s, i) => s > 0 && <span key={i} className={`run-zones__seg run-zones__seg--${i + 1}`} style={{ flexGrow: s }} />)}
      </div>
      <ul className="run-zones__list">
        {zones.map((s, i) => (
          <li key={i}>
            <i className={`run-zones__dot run-zones__seg--${i + 1}`} aria-hidden="true" />
            <span>{NAMES[i]}</span>
            <strong>{Math.round((s / total) * 100)}%</strong>
            <small>{formatClock(s)}</small>
          </li>
        ))}
      </ul>
    </div>
  );
}
