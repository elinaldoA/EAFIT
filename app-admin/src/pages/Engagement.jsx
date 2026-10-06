import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchAtRiskUsers, fetchExpiringPlans, displayName } from '../lib/management';
import { toCsv, downloadCsv } from '../lib/csv';
import Loading from '../components/Loading';
import EmptyState from '../components/EmptyState';

const INACTIVE_OPTIONS = [7, 14, 30];
const AHEAD_OPTIONS = [7, 14, 30];

function formatDay(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function SegControl({ label, options, value, onChange, suffix }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map(o => (
        <button
          key={o} type="button" aria-pressed={value === o}
          className={`seg__btn${value === o ? ' seg__btn--active' : ''}`}
          onClick={() => onChange(o)}
        >
          {o} {suffix}
        </button>
      ))}
    </div>
  );
}

function AtRiskCard() {
  const [inactiveDays, setInactiveDays] = useState(14);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    fetchAtRiskUsers(inactiveDays, 200)
      .then(r => { if (active) setRows(r); })
      .catch(err => { if (active) setError(err.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [inactiveDays]);

  const neverTrained = rows.filter(r => !r.last_training).length;

  function handleExport() {
    downloadCsv(`usuarios_em_risco_${inactiveDays}d.csv`, toCsv(
      rows.map(r => ({ ...r, nome_exibicao: displayName(r) })),
      [
        { key: 'nome_exibicao', label: 'Nome' }, { key: 'email', label: 'Email' },
        { key: 'last_training', label: 'UltimoTreino' }, { key: 'days_inactive', label: 'DiasSemTreinar' },
        { key: 'trainings_total', label: 'TotalTreinos' }, { key: 'plan_end_date', label: 'FimDoPlano' },
      ],
    ));
  }

  return (
    <div className="card">
      <div className="card-head">
        <div>
          <h2 className="section-title" style={{ margin: 0 }}>Em risco de abandono</h2>
          <p className="user-detail__meta" style={{ margin: '4px 0 0' }}>
            Já treinaram e sumiram, ou cadastraram há mais de 7 dias e nunca treinaram.
          </p>
        </div>
        <div className="actions-row">
          <SegControl label="Dias sem treinar" options={INACTIVE_OPTIONS} value={inactiveDays} onChange={setInactiveDays} suffix="dias" />
          <button className="btn btn--small" onClick={handleExport} disabled={!rows.length}>Exportar CSV</button>
          <Link className="btn btn--small" to="/notificacoes">Enviar notificação</Link>
        </div>
      </div>

      {loading ? <Loading /> : error ? <p className="form-msg form-msg--error">{error}</p> : (
        <div className="table-wrap">
          <table className="resp-table">
            <thead>
              <tr>
                <th>Usuário</th><th>Último treino</th><th>Sem treinar</th><th>Treinos</th><th>Fim do plano</th><th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id}>
                  <td data-label="Usuário">
                    {displayName(r)}
                    <div className="user-detail__meta">{r.email}</div>
                  </td>
                  <td data-label="Último treino">{r.last_training ? formatDay(r.last_training) : <span className="badge badge--warning">nunca treinou</span>}</td>
                  <td data-label="Sem treinar">{r.days_inactive != null ? `${r.days_inactive} dias` : '—'}</td>
                  <td data-label="Treinos">{r.trainings_total}</td>
                  <td data-label="Fim do plano">{formatDay(r.plan_end_date)}</td>
                  <td data-label=""><Link className="btn btn--ghost btn--small" to={`/users/${r.id}`}>Ver</Link></td>
                </tr>
              ))}
              {!rows.length && (
                <tr><td colSpan={6}><EmptyState icon="🎉" label="Ninguém em risco nesse critério." /></td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      {!loading && !error && rows.length > 0 && (
        <p className="card-note">
          {rows.length} usuário(s){rows.length === 200 ? ' (mostrando os 200 primeiros)' : ''} · {neverTrained} nunca treinaram.
        </p>
      )}
    </div>
  );
}

function ExpiringPlansCard() {
  const [daysAhead, setDaysAhead] = useState(7);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    fetchExpiringPlans(daysAhead)
      .then(r => { if (active) setRows(r); })
      .catch(err => { if (active) setError(err.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [daysAhead]);

  return (
    <div className="card">
      <div className="card-head">
        <div>
          <h2 className="section-title" style={{ margin: 0 }}>Planos vencidos ou vencendo</h2>
          <p className="user-detail__meta" style={{ margin: '4px 0 0' }}>
            Planos ativos cujo prazo já passou ou vence no período — hora de renovar ou progredir.
          </p>
        </div>
        <SegControl label="Vencem em até" options={AHEAD_OPTIONS} value={daysAhead} onChange={setDaysAhead} suffix="dias" />
      </div>

      {loading ? <Loading /> : error ? <p className="form-msg form-msg--error">{error}</p> : (
        <div className="table-wrap">
          <table className="resp-table">
            <thead>
              <tr><th>Usuário</th><th>Plano</th><th>Vence em</th><th>Situação</th><th>Próximo plano</th><th></th></tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.user_id}>
                  <td data-label="Usuário">
                    {displayName(r)}
                    <div className="user-detail__meta">{r.email}</div>
                  </td>
                  <td data-label="Plano">{r.plan_name}</td>
                  <td data-label="Vence em">{formatDay(r.end_date)}</td>
                  <td data-label="Situação">
                    {r.days_left < 0
                      ? <span className="badge badge--danger">vencido há {Math.abs(r.days_left)} dia(s)</span>
                      : r.days_left === 0
                        ? <span className="badge badge--warning">vence hoje</span>
                        : <span className="badge badge--warning">em {r.days_left} dia(s)</span>}
                  </td>
                  <td data-label="Próximo plano">{r.has_next ? 'configurado' : '—'}</td>
                  <td data-label=""><Link className="btn btn--ghost btn--small" to={`/users/${r.user_id}`}>Ver</Link></td>
                </tr>
              ))}
              {!rows.length && (
                <tr><td colSpan={6}><EmptyState icon="✅" label="Nenhum plano vencendo nesse prazo." /></td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function Engagement() {
  return (
    <div className="stack">
      <div className="page-header">
        <h1 className="page-title">Engajamento</h1>
      </div>
      <AtRiskCard />
      <ExpiringPlansCard />
    </div>
  );
}
