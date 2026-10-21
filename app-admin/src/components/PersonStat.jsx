// Um indicador do cartão de pessoa (Personais, Embaixadores): rótulo, número e
// um detalhe opcional. Vai dentro de <dl className="pcard__stats">.
export default function PersonStat({ label, value, sub }) {
  return (
    <div className="pcard__stat">
      <dt className="pcard__stat-label">{label}</dt>
      <dd className="pcard__stat-value">{value}</dd>
      {sub && <dd className="pcard__stat-sub">{sub}</dd>}
    </div>
  );
}
