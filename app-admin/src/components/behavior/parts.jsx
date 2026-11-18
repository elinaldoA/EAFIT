import { downloadCsv, toCsv } from '../../lib/csv';
import { trend, trendLabel } from '../../lib/geo';
import Loading from '../Loading';

export function Card({ title, state, note, children }) {
  return (
    <div className="card">
      <h2 className="section-title">{title}</h2>
      {state.loading ? <Loading /> : state.error ? <p className="form-msg form-msg--error" role="alert">{state.error}</p> : children(state.data)}
      {note && <p className="card-note">{note}</p>}
    </div>
  );
}

export function Bars({ rows, unit = '', empty = 'Sem dados no período.' }) {
  if (!rows?.length || rows.every(r => !r.total)) return <p className="card-note" style={{ marginTop: 0 }}>{empty}</p>;
  return (
    <ul className="dist">
      {rows.map(r => (
        <li key={r.value ?? r.key} className="dist__row">
          <span className="dist__label" title={r.label}>{r.label}</span>
          <span className="dist__track"><span className="dist__fill" style={{ width: `${Math.max(r.total ? 2 : 0, r.pct ?? 0)}%` }} /></span>
          <span className="dist__value">{r.total}{unit}{r.pct == null ? '' : ` · ${r.pct}%`}</span>
        </li>
      ))}
    </ul>
  );
}

export function Steps({ steps }) {
  return (
    <ol className="funnel">
      {steps.map((s, i) => (
        <li key={s.key} className="funnel__step">
          <div className="funnel__label"><span>{s.label}</span><strong>{s.count}</strong></div>
          <div className="funnel__track">
            <div className="funnel__bar" style={{ width: `${Math.max(s.count ? 2 : 0, Math.min(100, s.pctOfStart ?? 0))}%` }} />
          </div>
          <div className="funnel__meta">{i === 0 ? 'base' : s.pctOfStart == null ? '—' : `${s.pctOfStart}% da 1ª etapa`}</div>
        </li>
      ))}
    </ol>
  );
}

// Variação em relação ao período anterior (▲ verde, ▼ vermelho). Nada quando
// não há base de comparação.
export function DeltaBadge({ cur, prev }) {
  if (prev == null) return null;
  const t = trend({ cur, prev });
  if (!t) return null;
  const cls = t.dir === 'up' ? 'delta--up' : t.dir === 'down' ? 'delta--down' : 'delta--flat';
  return <span className={`delta ${cls}`}>{trendLabel(t)} vs. período anterior</span>;
}

// `csv` = nome do arquivo: mostra o botão que baixa a tabela como está na tela.
export function CountTable({ head, rows, empty, csv }) {
  if (!rows.length) return <p className="card-note" style={{ marginTop: 0 }}>{empty}</p>;
  function exportCsv() {
    const columns = head.map((label, i) => ({ label, key: String(i) }));
    // `csvCells` = valores puros quando a célula da tela tem marcação (ex.: variação).
    const data = rows.map(r => Object.fromEntries([['0', r.label], ...(r.csvCells ?? r.cells).map((c, i) => [String(i + 1), c])]));
    downloadCsv(`${csv}.csv`, toCsv(data, columns));
  }
  return (
    <div className="table-wrap">
      {csv && <div className="actions-row" style={{ marginBottom: 6 }}><button type="button" className="btn btn--ghost btn--small" onClick={exportCsv}>Exportar CSV</button></div>}
      <table className="source-table">
        <thead><tr>{head.map(h => <th key={h} scope="col">{h}</th>)}</tr></thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.key}><th scope="row">{r.label}</th>{r.cells.map((c, i) => <td key={i}>{c}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
