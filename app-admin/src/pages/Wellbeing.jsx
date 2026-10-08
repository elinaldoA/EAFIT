import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  pct, formatMl, scoreLevel, SCORE_BADGE,
  fetchWellbeingOverview, fetchWellbeingByDay, fetchLowCheckinUsers,
} from '../lib/insights';
import Loading from '../components/Loading';
import EmptyState from '../components/EmptyState';

const PERIODS = [7, 14, 30];

const fmt = (v, suffix = '') => (v === null || v === undefined ? '—' : `${String(v).replace('.', ',')}${suffix}`);
const dayLabel = iso => iso.slice(8, 10);

function Score({ value }) {
  if (value === null || value === undefined) return '—';
  return <span className={`badge ${SCORE_BADGE[scoreLevel(value)]}`}>{fmt(value)}</span>;
}

// Barras por dia. `value` devolve o número do dia; `title` o texto do tooltip.
function DayBars({ days, value, title, ariaLabel }) {
  const max = Math.max(1, ...days.map(d => value(d) || 0));
  return (
    <div className="bar-chart" role="img" aria-label={ariaLabel}>
      {days.map(d => {
        const v = value(d) || 0;
        return (
          <div className="bar-chart__col" key={d.day} title={title(d)}>
            <span className="bar-chart__count">{v > 0 && days.length <= 14 ? v : ''}</span>
            <div className="bar-chart__bar" style={{ height: `${Math.max(3, (v / max) * 100)}%` }} />
            <span className="bar-chart__day">{dayLabel(d.day)}</span>
          </div>
        );
      })}
    </div>
  );
}

export default function Wellbeing() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    Promise.all([fetchWellbeingOverview(days), fetchWellbeingByDay(days), fetchLowCheckinUsers(days)])
      .then(([overview, byDay, low]) => { if (active) setData({ overview, byDay, low }); })
      .catch(err => { if (active) setError(err.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [days]);

  const o = data?.overview;
  const hitPct = o ? pct(o.waterHitDays, o.waterDays) : null;

  return (
    <div className="stack">
      <div className="page-header">
        <div>
          <h1 className="page-title">Bem-estar</h1>
          <p className="page-subtitle">
            O que os usuários registram além do treino: check-in diário (energia, sono e humor, de 1 a 5),
            medidas corporais e água. Contas de admin ficam de fora.
          </p>
        </div>
        <div className="seg" role="group" aria-label="Período">
          {PERIODS.map(d => (
            <button
              key={d} type="button" aria-pressed={days === d}
              className={`seg__btn${days === d ? ' seg__btn--active' : ''}`}
              onClick={() => setDays(d)}
            >
              {d} dias
            </button>
          ))}
        </div>
      </div>

      {loading && <Loading />}
      {error && <p className="form-msg form-msg--error">{error}</p>}

      {!loading && !error && o && (
        <>
          <div className="card">
            <h2 className="section-title">Check-in diário</h2>
            <div className="tile-grid">
              <div className="tile">
                <div className="tile__value">{o.checkinUsers}</div>
                <div className="tile__label">usuários fizeram check-in ({fmt(pct(o.checkinUsers, o.users), '%')} da base)</div>
              </div>
              <div className="tile"><div className="tile__value">{fmt(o.energy)}</div><div className="tile__label">energia média</div></div>
              <div className="tile"><div className="tile__value">{fmt(o.sleep)}</div><div className="tile__label">sono médio</div></div>
              <div className="tile"><div className="tile__value">{fmt(o.mood)}</div><div className="tile__label">humor médio</div></div>
            </div>
            {o.checkins === 0 ? <p className="card-note">Nenhum check-in no período.</p> : (
              <>
                <DayBars
                  days={data.byDay} value={d => d.checkins} ariaLabel={`Check-ins por dia, últimos ${days} dias`}
                  title={d => `Dia ${dayLabel(d.day)}: ${d.checkins} check-in(s) · energia ${fmt(d.energy)} · sono ${fmt(d.sleep)} · humor ${fmt(d.mood)}`}
                />
                <p className="card-note">Check-ins por dia. Passe o mouse numa barra para ver as médias do dia.</p>
              </>
            )}
          </div>

          <div className="card">
            <h2 className="section-title">
              Energia ou sono baixos
              {o.lowUsers > 0 && <span className="badge badge--warning">{o.lowUsers}</span>}
            </h2>
            <p className="user-detail__meta" style={{ margin: '0 0 10px' }}>
              Quem fez 3 ou mais check-ins no período e ficou com média de energia ou de sono em 2 ou menos.
              Vale conferir se o plano está pesado demais.
            </p>
            {data.low.length === 0 ? <EmptyState icon="🌤️" label="Ninguém com energia ou sono baixos no período." /> : (
              <div className="table-wrap">
                <table className="resp-table">
                  <thead><tr><th>Usuário</th><th>Check-ins</th><th>Energia</th><th>Sono</th><th>Humor</th><th>Último</th></tr></thead>
                  <tbody>
                    {data.low.map(u => (
                      <tr key={u.userId}>
                        <td data-label="Usuário">
                          <Link className="btn btn--ghost btn--small" to={`/users/${u.userId}`}>{u.name}</Link>
                          <div className="user-detail__meta">{u.email}</div>
                        </td>
                        <td data-label="Check-ins">{u.checkins}</td>
                        <td data-label="Energia"><Score value={u.energy} /></td>
                        <td data-label="Sono"><Score value={u.sleep} /></td>
                        <td data-label="Humor"><Score value={u.mood} /></td>
                        <td data-label="Último">{u.last ? u.last.split('-').reverse().join('/') : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="two-col">
            <div className="card">
              <h2 className="section-title">Hidratação</h2>
              <div className="tile-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))' }}>
                <div className="tile">
                  <div className="tile__value">{o.waterUsers}</div>
                  <div className="tile__label">usuários registraram água ({fmt(pct(o.waterUsers, o.users), '%')})</div>
                </div>
                <div className="tile"><div className="tile__value">{formatMl(o.waterAvgMl)}</div><div className="tile__label">média por dia registrado</div></div>
                <div className="tile"><div className="tile__value">{fmt(hitPct, '%')}</div><div className="tile__label">dos dias registrados bateram a meta</div></div>
              </div>
              {o.waterDays > 0 && (
                <DayBars
                  days={data.byDay} value={d => d.waterUsers} ariaLabel={`Usuários que registraram água por dia, últimos ${days} dias`}
                  title={d => `Dia ${dayLabel(d.day)}: ${d.waterUsers} usuário(s) · média ${formatMl(d.waterAvgMl)} · ${d.waterHits} na meta`}
                />
              )}
              <p className="card-note">
                Usuários que registraram água por dia. A meta é a de cada um: a que a pessoa definiu no Perfil ou
                35 ml por kg de peso.
              </p>
            </div>

            <div className="card">
              <h2 className="section-title">Medidas corporais</h2>
              <div className="tile-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))' }}>
                <div className="tile">
                  <div className="tile__value">{o.measureUsers}</div>
                  <div className="tile__label">usuários registraram medidas ({fmt(pct(o.measureUsers, o.users), '%')})</div>
                </div>
                <div className="tile"><div className="tile__value">{o.measures}</div><div className="tile__label">registros no período</div></div>
              </div>
              <p className="card-note">
                Cintura, quadril, peito, braço e coxa. Os valores de cada pessoa ficam no detalhe do usuário, na aba Perfil.
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
