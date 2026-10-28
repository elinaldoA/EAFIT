import { useEffect, useState } from 'react';
import { fetchRetentionCohorts } from '../lib/dashboardStats';
import { pivotRetention } from '../lib/activation';
import Loading from './Loading';

const WEEKS = 8;

function formatWeek(iso) {
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
}

function heat(pct) {
  // Laranja do tema com opacidade proporcional à retenção.
  return pct ? { background: `rgba(249, 115, 22, ${0.12 + (pct / 100) * 0.7})` } : undefined;
}

export default function RetentionCohorts() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    fetchRetentionCohorts(WEEKS)
      .then(r => { if (active) setRows(r); })
      .catch(err => { if (active) setError(err.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const { weekIndexes, cohorts, average } = pivotRetention(rows);
  const totalSignups = cohorts.reduce((sum, c) => sum + c.size, 0);
  const summary = [
    { label: 'Cadastros analisados', value: totalSignups, hint: `últimas ${WEEKS} semanas, ${cohorts.length} coorte(s)` },
    { label: 'Voltaram na 1ª semana', value: average[1] == null ? '—' : `${average[1]}%`, hint: 'média das coortes completas (Sem 1)' },
    { label: 'Voltaram na 4ª semana', value: average[4] == null ? '—' : `${average[4]}%`, hint: 'média das coortes completas (Sem 4)' },
  ];

  return (
    <div className="stack">
      <div>
        <h2 className="section-title" style={{ margin: 0 }}>Retenção por semana de cadastro</h2>
        <p className="section-hint">Das pessoas que se cadastraram em cada semana, quantas continuam treinando.</p>
      </div>

      {loading ? <Loading /> : error ? <p className="form-msg form-msg--error">{error}</p> : !cohorts.length ? (
        <div className="card"><p className="card-note" style={{ margin: 0 }}>Nenhum cadastro nas últimas {WEEKS} semanas.</p></div>
      ) : (
        <>
          <div className="tile-grid tile-grid--kpi">
            {summary.map(t => (
              <div className="tile tile--kpi" key={t.label}>
                <div className="tile__label">{t.label} · {t.hint}</div>
                <div className="tile__value">{t.value}</div>
              </div>
            ))}
          </div>

          <div className="card">
            <div className="table-wrap">
              <table className="cohort-table">
                <thead>
                  <tr>
                    <th scope="col">Semana</th>
                    <th scope="col">Usuários</th>
                    {weekIndexes.map(k => <th scope="col" key={k}>Sem {k}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {cohorts.map(c => (
                    <tr key={c.week}>
                      <th scope="row">{formatWeek(c.week)}</th>
                      <td>{c.size}</td>
                      {c.cells.map((cell, k) => (
                        cell ? (
                          <td
                            key={k}
                            className={`cohort-table__cell${cell.complete ? '' : ' cohort-table__cell--partial'}`}
                            style={heat(cell.pct)}
                            title={`${cell.active} de ${c.size} treinaram${cell.complete ? '' : ' (semana em andamento)'}`}
                          >
                            {cell.pct}%{cell.complete ? '' : '*'}
                          </td>
                        ) : <td key={k} className="cohort-table__cell cohort-table__cell--empty" />
                      ))}
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <th scope="row" colSpan={2}>Média</th>
                    {average.map((p, k) => <td key={k} className="cohort-table__cell">{p == null ? '—' : `${p}%`}</td>)}
                  </tr>
                </tfoot>
              </table>
            </div>
            <div className="heat-legend" aria-hidden="true">
              <span>0%</span><span className="heat-legend__bar" /><span>100%</span>
            </div>
            <p className="card-note">
              % da coorte que treinou em cada semana contada do próprio dia de cadastro (Sem 0 = primeiros 7 dias).
              * semana ainda em andamento pra parte da coorte — fica fora da média.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
