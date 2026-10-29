import { useId, useState } from 'react';
import { chartTicks } from './chartMath';

// Linha no tempo (área quando é uma série só). `points`: objetos com os
// valores de cada série em point[series.key]; `label(p)` vira o eixo X e
// `title(p)` o cabeçalho da dica. Passar o mouse (ou ←/→ com foco) mostra a
// mira com os valores do ponto.
export default function LineChart({
  points, series, ariaLabel, label = p => p.label, title = label,
  format = v => v, extra, height = 160,
}) {
  const [idx, setIdx] = useState(null);
  const gradId = `lc${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const n = points.length;
  if (!n) return null;

  const values = points.flatMap(p => series.map(s => Number(p[s.key]) || 0));
  const ticks = chartTicks(Math.max(...values));
  const top = ticks[ticks.length - 1] || 1;
  const x = i => (n === 1 ? 50 : (i / (n - 1)) * 100);
  const y = v => 100 - ((Number(v) || 0) / top) * 100;
  const color = i => (series.length === 1 ? 'var(--primary)' : `var(--series-${i + 1})`);
  const line = key => points.map((p, i) => `${i ? 'L' : 'M'}${x(i)},${y(p[key])}`).join(' ');
  const every = Math.max(1, Math.ceil(n / 6));

  function pick(e) {
    const r = e.currentTarget.getBoundingClientRect();
    if (!r.width) return;
    setIdx(Math.min(n - 1, Math.max(0, Math.round(((e.clientX - r.left) / r.width) * (n - 1)))));
  }

  function onKey(e) {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    setIdx(i => {
      const cur = i ?? (e.key === 'ArrowLeft' ? n : -1);
      return Math.min(n - 1, Math.max(0, cur + (e.key === 'ArrowRight' ? 1 : -1)));
    });
  }

  const hover = idx === null ? null : points[idx];
  const tipSide = idx === null ? '' : x(idx) < 20 ? ' chart-tip--start' : x(idx) > 80 ? ' chart-tip--end' : '';

  return (
    <div className="lchart">
      {series.length > 1 && (
        <ul className="chart-legend">
          {series.map((s, i) => (
            <li key={s.key}><span className="chart-legend__key chart-legend__key--line" style={{ background: color(i) }} />{s.label}</li>
          ))}
        </ul>
      )}
      <div className="lchart__body">
        <div className="lchart__yaxis" aria-hidden="true" style={{ height }}>
          {ticks.slice().reverse().map(t => <span key={t}>{format(t)}</span>)}
        </div>
        <div className="lchart__main">
          <div
            className="lchart__plot" style={{ height }} role="img" aria-label={ariaLabel} tabIndex={0}
            onPointerMove={pick} onPointerDown={pick} onPointerLeave={() => setIdx(null)}
            onKeyDown={onKey} onBlur={() => setIdx(null)}
          >
            {ticks.map(t => <div key={t} className="lchart__grid" style={{ top: `${y(t)}%` }} />)}
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
              {series.length === 1 && (
                <>
                  <defs>
                    <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0" stopColor={color(0)} stopOpacity=".24" />
                      <stop offset="1" stopColor={color(0)} stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <path d={`${line(series[0].key)} L${x(n - 1)},100 L${x(0)},100 Z`} fill={`url(#${gradId})`} />
                </>
              )}
              {series.map((s, i) => (
                <path key={s.key} d={line(s.key)} fill="none" stroke={color(i)} strokeWidth="2"
                  strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
              ))}
            </svg>
            {hover && (
              <>
                <div className="lchart__cross" style={{ left: `${x(idx)}%` }} />
                {series.map((s, i) => (
                  <span key={s.key} className="lchart__dot" style={{ left: `${x(idx)}%`, top: `${y(hover[s.key])}%`, background: color(i) }} />
                ))}
                <div className={`chart-tip${tipSide}`} style={{ left: `${x(idx)}%` }} role="status">
                  <strong>{title(hover)}</strong>
                  {series.map((s, i) => (
                    <span key={s.key} className="chart-tip__row">
                      {series.length > 1 && <span className="chart-legend__key chart-legend__key--line" style={{ background: color(i) }} />}
                      {`${s.label}: `}<b>{format(Number(hover[s.key]) || 0)}</b>
                    </span>
                  ))}
                  {extra && <span className="chart-tip__extra">{extra(hover)}</span>}
                </div>
              </>
            )}
          </div>
          <div className="lchart__xaxis" aria-hidden="true">
            {points.map((p, i) => ((i % every === 0 || i === n - 1) && (i === n - 1 || n - 1 - i >= every)
              ? <span key={i} style={{ left: `${x(i)}%` }} className={i === 0 ? 'is-start' : i === n - 1 ? 'is-end' : ''}>{label(p)}</span>
              : null))}
          </div>
        </div>
      </div>
      <table className="sr-only">
        <thead><tr><th>Ponto</th>{series.map(s => <th key={s.key}>{s.label}</th>)}</tr></thead>
        <tbody>{points.map((p, i) => <tr key={i}><td>{title(p)}</td>{series.map(s => <td key={s.key}>{format(Number(p[s.key]) || 0)}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}
