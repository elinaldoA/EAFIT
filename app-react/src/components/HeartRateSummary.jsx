import { formatDuration } from '../lib/utils';

import { t } from '../lib/i18n';
const ZONE_NAMES = [t('Leve'), t('Aquecimento'), t('Aeróbico'), t('Limiar'), t('Máximo')];

// Média, máxima e tempo em cada zona da cinta cardíaca (lib/heartRate.js).
// hr = { avg, max, zones: [segundos z1..z5] }.
export default function HeartRateSummary({ hr }) {
  if (!hr?.avg) return null;
  const zones = Array.isArray(hr.zones) ? hr.zones : [];
  const total = zones.reduce((a, b) => a + (Number(b) || 0), 0);
  return (
    <div className="summary-section">
      <div className="summary-section__title">{t('❤️ Frequência cardíaca')}</div>
      <div className="hr-summary">
        <div className="hr-summary__stats">
          <span><strong>{hr.avg}</strong> {t('bpm médio')}</span>
          <span><strong>{hr.max}</strong> {t('bpm máximo')}</span>
        </div>
        {total > 0 && (
          <div className="hr-zones" role="list" aria-label={t('Tempo em cada zona')}>
            {zones.map((secs, i) => (
              <div className="hr-zones__row" role="listitem" key={i}>
                <span className="hr-zones__name">Z{i + 1} · {ZONE_NAMES[i]}</span>
                <span className="hr-zones__bar">
                  <span className={`hr-zones__fill hr-zones__fill--z${i + 1}`} style={{ width: `${(secs / total) * 100}%` }} />
                </span>
                <span className="hr-zones__time">{formatDuration(secs * 1000)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
