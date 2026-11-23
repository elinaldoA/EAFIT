import { useMemo, useState } from 'react';
import { loadSeries, trainingStatus, STATUS_TEXT } from './runLoad';
import { t } from '../../lib/i18n';

const W = 320;
const H = 120;
const PAD = 6;

const path = (values, max) => values
  .map((v, i) => `${i ? 'L' : 'M'}${(PAD + (i / Math.max(1, values.length - 1)) * (W - 2 * PAD)).toFixed(1)} ${(H - PAD - (v / max) * (H - 2 * PAD)).toFixed(1)}`)
  .join('');

// Forma e frescor: a forma (média lenta da carga de treino) e a fadiga (média
// rápida) dos últimos dias; a diferença entre as duas diz se o corpo está
// descansado ou sobrecarregado. A carga de cada corrida é o esforço relativo (runLoad.js).
export default function RunFitness({ runs, today }) {
  const [days, setDays] = useState(90);
  const series = useMemo(() => loadSeries(runs, today, days), [runs, today, days]);
  const status = trainingStatus(series);
  if (!status) return null;
  const max = Math.max(10, ...series.map(d => Math.max(d.fitness, d.fatigue)));
  return (
    <div className="section-group">
      <div className="section-group__label">{t('Forma e frescor')}</div>
      <div className="dash-card run-goals">
        <div className="run-chips">
          {[30, 90].map(n => (
            <button key={n} type="button" aria-pressed={days === n} className={`run-chip${days === n ? ' run-chip--on' : ''}`} onClick={() => setDays(n)}>{t('{v1} d', { v1: n })}</button>
          ))}
        </div>
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t('Gráfico de forma e fadiga')} style={{ width: '100%', height: 'auto', display: 'block' }}>
          <path d={path(series.map(d => d.fitness), max)} fill="none" stroke="var(--primary, #f97316)" strokeWidth="2.5" strokeLinejoin="round" />
          <path d={path(series.map(d => d.fatigue), max)} fill="none" stroke="#38bdf8" strokeWidth="2" strokeLinejoin="round" strokeDasharray="4 3" />
        </svg>
        <div className="run-load__numbers">
          <div><strong>{Math.round(status.fitness)}</strong><small>{t('forma')}</small></div>
          <div><strong>{Math.round(status.fatigue)}</strong><small>{t('fadiga')}</small></div>
          <div><strong>{status.form > 0 ? `+${Math.round(status.form)}` : Math.round(status.form)}</strong><small>{t('frescor')}</small></div>
        </div>
        <p className="run-load__msg">{STATUS_TEXT[status.key]()}</p>
        <p className="profile-field__hint">{t('Linha cheia: forma (42 dias). Tracejada: fadiga (7 dias). Frescor = forma − fadiga. Calculado pelo esforço relativo de cada corrida.')}</p>
      </div>
    </div>
  );
}
