import { useState } from 'react';
import { isWarmupDone, setWarmupDone, warmupSets } from '../lib/warmup';
import { trackFeature } from '../lib/tracking';

import { t, locale } from '../lib/i18n';
// Séries de aquecimento antes das de trabalho (ver lib/warmup.js): carga em %
// da de trabalho (a da Série 1, ou a sugerida), check só no aparelho.
export default function WarmupSets({ ex, day, count, workKg, started }) {
  const sets = warmupSets(count, workKg);
  const [done, setDone] = useState(() => sets.map(s => isWarmupDone(day.dia, ex.nome, s.n)));
  if (!sets.length) return null;

  function toggle(i) {
    const next = !done[i];
    if (next) trackFeature('warmup');
    setWarmupDone(day.dia, ex.nome, sets[i].n, next);
    setDone(d => d.map((v, j) => (j === i ? next : v)));
  }

  return (
    <div className="warmup" aria-label={t('Séries de aquecimento')}>
      <div className="warmup__title">
        {t('🔥 Aquecimento')}
        <span className="warmup__hint">{t('não conta no volume nem nos recordes')}</span>
      </div>
      {sets.map((s, i) => (
        <div className={`warmup__row${done[i] ? ' warmup__row--done' : ''}`} key={s.n}>
          <span className="warmup__label">{t('Aq. {n}', { n: s.n })}</span>
          <span className="warmup__load">
            {s.carga != null
              ? t('{carga} kg × {reps}', { carga: s.carga.toLocaleString(locale), reps: s.reps })
              : t('leve × {reps}', { reps: s.reps })}
          </span>
          <span className="warmup__pct">{workKg ? `${s.pct}%` : ''}</span>
          <button
            type="button" className={`set-row__check warmup__check${done[i] ? ' set-row__check--done' : ''}`}
            aria-pressed={done[i]} aria-label={t('Marcar aquecimento {n}', { n: s.n })}
            disabled={!started} title={started ? undefined : t('Inicie o treino para registrar as séries')}
            onClick={() => toggle(i)}
          >✓</button>
        </div>
      ))}
    </div>
  );
}
