import LineChart from './charts/LineChart';
import HeatStrip from './charts/HeatStrip';

// Série de um período com título e resumo. `series`: [{ key, label, total }].
// Por dia vira linha; `cyclic` (horas do dia) vira faixa de calor.
export default function PeriodChart({ title, series, unit, where, from, to, cyclic = false }) {
  const total = series.reduce((sum, d) => sum + d.total, 0);
  if (!total) return null;
  const max = Math.max(...series.map(d => d.total));
  const peak = series.find(d => d.total === max);
  const heading = <h3 className="subsection-title" style={{ marginTop: 0 }}>{title}{where ? ` em ${where}` : ''}</h3>;
  if (cyclic) {
    return (
      <div className="geo-daily">
        {heading}
        <HeatStrip cells={series} unit={unit} every={3} ariaLabel={`${total} ${unit}, ${from} a ${to}`} />
      </div>
    );
  }
  return (
    <div className="geo-daily">
      {heading}
      <LineChart
        points={series} series={[{ key: 'total', label: unit.charAt(0).toUpperCase() + unit.slice(1) }]} height={110}
        ariaLabel={`${total} ${unit}; pico de ${max} em ${peak.label}`}
      />
      <p className="card-note geo-daily__note">
        {from} a {to} · pico de <strong>{max}</strong> em {peak.label}
      </p>
    </div>
  );
}
