import { useState } from 'react';
import { donutSlices } from './chartMath';

const R = 15.9155; // circunferência 100: o comprimento do traço já é o %
const GAP = 0.8;   // folga entre fatias, na cor da superfície

// Rosca de partes de um todo (aparelho, navegador, origem…), com legenda
// sempre visível trazendo número e %. Até 6 fatias; o resto vira "Outros".
// Com só 2 categorias vira uma faixa dividida (rosca de 2 fatias engana).
// `ordered`: faixas em ordem (durações, idade) — tons de uma cor só, na ordem dada.
export default function Donut({ rows, unit = '', empty = 'Sem dados no período.', ordered = false, label = 'Total' }) {
  const [active, setActive] = useState(null);
  const { sum, slices } = donutSlices(rows, { ordered });
  if (!sum) return <p className="card-note" style={{ marginTop: 0 }}>{empty}</p>;

  const color = (s, i) => {
    if (s.other) return 'var(--chart-other)';
    if (!ordered) return `var(--series-${i + 1})`;
    const step = slices.length > 1 ? i / (slices.length - 1) : 1;
    return `color-mix(in oklab, var(--primary) ${Math.round(45 + step * 55)}%, var(--surface))`;
  };
  const fmt = n => `${n}${unit}`;
  const pctText = p => `${String(p).replace('.', ',')}%`;
  const cur = slices.find(s => s.key === active);
  const legend = (
    <ul className="donut__legend">
      {slices.map((s, i) => (
        <li
          key={s.key} className={active && active !== s.key ? 'is-dim' : ''}
          onPointerEnter={() => setActive(s.key)} onPointerLeave={() => setActive(null)}
        >
          <span className="chart-legend__key" style={{ background: color(s, i) }} />
          <span className="donut__label" title={s.label}>{s.label}</span>
          <span className="donut__value">{fmt(s.total)} · {pctText(s.pct)}</span>
        </li>
      ))}
    </ul>
  );

  if (slices.length <= 2) {
    return (
      <div className="split" role="img" aria-label={slices.map(s => `${s.label}: ${s.total} (${pctText(s.pct)})`).join('; ')}>
        <div className="split__track">
          {slices.map((s, i) => (
            <span key={s.key} className={active && active !== s.key ? 'is-dim' : ''} style={{ flex: s.total, background: color(s, i) }} />
          ))}
        </div>
        {legend}
      </div>
    );
  }

  let offset = 25; // começa às 12h
  return (
    <div className="donut">
      <div className="donut__ring">
        <svg viewBox="0 0 42 42" role="img" aria-label={slices.map(s => `${s.label}: ${s.total} (${pctText(s.pct)})`).join('; ')}>
          <circle cx="21" cy="21" r={R} fill="none" stroke="var(--surface-2)" strokeWidth="6" />
          {slices.map((s, i) => {
            const len = Math.max(0.01, s.pct - (slices.length > 1 ? GAP : 0));
            const el = (
              <circle
                key={s.key} cx="21" cy="21" r={R} fill="none" stroke={color(s, i)} strokeWidth={active === s.key ? 7.5 : 6}
                strokeDasharray={`${len} ${100 - len}`} strokeDashoffset={offset}
                className={active && active !== s.key ? 'is-dim' : ''}
                onPointerEnter={() => setActive(s.key)} onPointerLeave={() => setActive(null)}
              >
                <title>{`${s.label}: ${fmt(s.total)} (${pctText(s.pct)})`}</title>
              </circle>
            );
            offset -= s.pct;
            return el;
          })}
        </svg>
        <div className="donut__center" aria-hidden="true">
          <strong>{cur ? pctText(cur.pct) : fmt(sum)}</strong>
          <span title={cur?.label}>{cur ? cur.label : label}</span>
        </div>
      </div>
      {legend}
    </div>
  );
}
