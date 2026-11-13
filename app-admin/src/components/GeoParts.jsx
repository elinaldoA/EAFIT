import { trend, trendLabel } from '../lib/geo';

export function Trend({ t, days }) {
  if (!t) return null;
  return (
    <span className={`geo-trend geo-trend--${t.dir}`} title={`Em relação aos ${days} dias anteriores`}>
      {trendLabel(t)}
    </span>
  );
}

export function Bars({ rows, onPick, selected, trends, days }) {
  if (!rows?.length) return <p className="card-note">Sem dados.</p>;
  return (
    <ul className="dist">
      {rows.map(r => {
        const key = r.uf || r.region || r.value || r.code;
        const label = (
          <>
            <span className="dist__label">{r.label}</span>
            <span className="dist__track"><span className="dist__fill" style={{ width: `${Math.max(2, r.pct)}%` }} /></span>
            <span className="dist__end">
              <span className="dist__value">{r.total} · {r.pct}%</span>
              {trends && <Trend t={trend(trends.get(key))} days={days} />}
            </span>
          </>
        );
        return (
          <li key={key}>
            {onPick ? (
              <button type="button" className={`dist__row dist__row--btn${selected === key ? ' dist__row--sel' : ''}`} onClick={() => onPick(selected === key ? null : key)}>
                {label}
              </button>
            ) : <div className="dist__row">{label}</div>}
          </li>
        );
      })}
    </ul>
  );
}
