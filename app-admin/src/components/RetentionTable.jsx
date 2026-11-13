import { MIN_RETENTION_BASE } from '../lib/geo';

// Dashboard → Localização → Retenção: por estado, contas, novas, ativas no
// período e quantas das que já existiam antes do período voltaram.
export default function RetentionTable({ rows, note, updating }) {
  return (
    <div className={updating ? 'card geo-body geo-body--updating' : 'card geo-body'} aria-busy={updating}>
      <p className="card-note" style={{ marginTop: 0 }}>
        {note}{updating && <> · <em>atualizando…</em></>}
      </p>
      {rows.length ? (
        <div className="table-wrap">
          <table className="source-table">
            <thead>
              <tr>
                <th scope="col">Estado</th><th scope="col">Contas</th><th scope="col">Novas no período</th>
                <th scope="col">Ativas no período</th><th scope="col">Retenção</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.uf}>
                  <th scope="row">{r.label}</th>
                  <td>{r.total}</td>
                  <td>{r.novas}</td>
                  <td>{r.ativas} · {r.activePct}%</td>
                  <td>
                    {r.retention === null ? '—' : `${r.retention}% (${r.antigasAtivas} de ${r.antigas})`}
                    {r.retention !== null && r.antigas < MIN_RETENTION_BASE && (
                      <span title={`Menos de ${MIN_RETENTION_BASE} contas antigas: a taxa não é confiável`}> ⚠ amostra pequena</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p className="card-note" style={{ marginTop: 0 }}>Nada localizado no Brasil ainda.</p>}
    </div>
  );
}
