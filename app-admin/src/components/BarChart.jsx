// Barras simples (por dia ou por hora). `series`: [{ key, label, total }].
export default function BarChart({ title, series, unit, where, from, to }) {
  const total = series.reduce((sum, d) => sum + d.total, 0);
  if (!total) return null;
  const max = Math.max(...series.map(d => d.total));
  const peak = series.find(d => d.total === max);
  const step = 100 / series.length;
  return (
    <div className="geo-daily">
      <h3 className="subsection-title" style={{ marginTop: 0 }}>{title}{where ? ` em ${where}` : ''}</h3>
      <svg
        className="geo-daily__chart" viewBox="0 0 100 30" preserveAspectRatio="none" role="img"
        aria-label={`${total} ${unit}; pico de ${max} em ${peak.label}`}
      >
        {series.map((d, i) => {
          const h = d.total ? Math.max(1, (d.total / max) * 28) : 0;
          return (
            <rect key={d.key} x={i * step + step * 0.1} y={30 - h} width={step * 0.8} height={h} fill="currentColor">
              <title>{`${d.label}: ${d.total}`}</title>
            </rect>
          );
        })}
      </svg>
      <p className="card-note geo-daily__note">
        {from} a {to} · pico de <strong>{max}</strong> em {peak.label}
      </p>
    </div>
  );
}
