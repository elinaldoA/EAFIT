import { MIN_VISITS_RATE } from '../lib/geo';

// Dashboard → Localização → Conversão: visitas ao site × contas por estado.
export default function ConversionTable({ rows, prev, sort, onSort, note, updating }) {
  return (
        <div className={updating ? 'card geo-body geo-body--updating' : 'card geo-body'} aria-busy={updating}>
          <p className="card-note" style={{ marginTop: 0 }}>
            {note}{updating && <> · <em>atualizando…</em></>}
          </p>
          {rows.length ? (
            <>
            <div className="seg" role="group" aria-label="Ordenar por">
              {[{ key: 'visitas', label: 'Mais visitas' }, { key: 'taxa', label: 'Maior taxa' }].map(o => (
                <button
                  key={o.key} type="button" aria-pressed={sort === o.key}
                  className={`seg__btn${sort === o.key ? ' seg__btn--active' : ''}`}
                  onClick={() => onSort(o.key)}
                >
                  {o.label}
                </button>
              ))}
            </div>
            <div className="table-wrap">
              <table className="source-table">
                <thead>
                  <tr>
                    <th scope="col">Estado</th><th scope="col">Visitas ao site</th>
                    <th scope="col">Contas</th><th scope="col">Contas por 100 visitas</th>
                    {prev && <th scope="col">No período anterior</th>}
                  </tr>
                </thead>
                <tbody>
                  {rows.map(c => (
                    <tr key={c.uf}>
                      <th scope="row">{c.label}</th>
                      <td>{c.visits}</td>
                      <td>{c.users}</td>
                      <td>
                        {c.rate === null ? '—' : c.rate.toLocaleString('pt-BR')}
                        {c.rate !== null && c.visits < MIN_VISITS_RATE && (
                          <span title={`Menos de ${MIN_VISITS_RATE} visitas: a taxa não é confiável`}> ⚠ amostra pequena</span>
                        )}
                      </td>
                      {prev && (
                        <td>{prev.get(c.uf)?.rate == null ? '—' : prev.get(c.uf).rate.toLocaleString('pt-BR')}</td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            </>
          ) : <p className="card-note" style={{ marginTop: 0 }}>Nada localizado no Brasil no período ainda.</p>}
        </div>
  );
}
