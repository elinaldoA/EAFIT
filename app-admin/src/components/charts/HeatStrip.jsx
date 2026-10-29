import { useState } from 'react';
import { heatLevels } from './chartMath';

// Faixa de calor para ciclos (hora do dia, dia da semana): uma célula por
// período, mais escura quanto maior o número. `cells`: [{ key, label, total }].
// `every` mostra o rótulo de tantas em tantas células (24 horas não cabem no celular).
export default function HeatStrip({ cells, ariaLabel, unit = '', every = 1, tip }) {
  const [idx, setIdx] = useState(null);
  const levels = heatLevels(cells.map(c => c.total));
  const max = Math.max(0, ...cells.map(c => Number(c.total) || 0));
  if (!max) return null;
  const peak = cells.find(c => Number(c.total) === max);
  const hover = idx === null ? null : cells[idx];
  const pos = idx === null ? 0 : ((idx + 0.5) / cells.length) * 100;
  const side = pos < 20 ? ' chart-tip--start' : pos > 80 ? ' chart-tip--end' : '';

  return (
    <div className="heat">
      <div className="heat__row" role="img" aria-label={`${ariaLabel}; pico de ${max}${unit ? ` ${unit}` : ''} em ${peak.label}`}
        style={{ gridTemplateColumns: `repeat(${cells.length}, minmax(0, 1fr))` }} onPointerLeave={() => setIdx(null)}>
        {cells.map((c, i) => (
          <span
            key={c.key} tabIndex={0} aria-label={`${c.label}: ${c.total}`}
            className={`heat__cell${levels[i] ? '' : ' heat__cell--zero'}${c === peak ? ' heat__cell--peak' : ''}${idx === i ? ' heat__cell--active' : ''}`}
            style={levels[i] ? { background: `color-mix(in oklab, var(--primary) ${Math.round(14 + levels[i] * 86)}%, var(--surface-2))` } : undefined}
            onPointerEnter={() => setIdx(i)} onFocus={() => setIdx(i)} onBlur={() => setIdx(null)}
          />
        ))}
        {hover && (
          <div className={`chart-tip chart-tip--above${side}`} style={{ left: `${pos}%` }} role="status">
            <strong>{hover.label}</strong>
            <span className="chart-tip__row"><b>{hover.total}</b>{unit ? ` ${unit}` : ''}</span>
            {tip && <span className="chart-tip__extra">{tip(hover)}</span>}
          </div>
        )}
      </div>
      <div className="heat__labels" aria-hidden="true" style={{ gridTemplateColumns: `repeat(${cells.length}, minmax(0, 1fr))` }}>
        {cells.map((c, i) => <span key={c.key}>{i % every === 0 ? c.label : ''}</span>)}
      </div>
      <div className="heat__foot">
        <span>Pico: <strong>{peak.label}</strong> ({max}{unit ? ` ${unit}` : ''})</span>
        <span className="heat__scale" aria-hidden="true">
          menos
          {[0.14, 0.35, 0.57, 0.78, 1].map(p => (
            <i key={p} style={{ background: `color-mix(in oklab, var(--primary) ${Math.round(p * 100)}%, var(--surface-2))` }} />
          ))}
          mais
        </span>
      </div>
    </div>
  );
}
