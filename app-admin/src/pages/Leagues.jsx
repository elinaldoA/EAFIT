import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAdminAuth } from '../context/useAdminAuth';
import Loading from '../components/Loading';
import EmptyState from '../components/EmptyState';
import { closeLeagueMonth, currentMonth, fetchLeague, groupStandings, setLeagueEnabled } from '../lib/leagues';

const MEDAL = { 1: '🥇', 2: '🥈', 3: '🥉' };

// Comunidade → Ligas.
export default function Leagues() {
  const { adminUser } = useAdminAuth();
  const [month, setMonth] = useState(currentMonth());
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  const load = useCallback(() => {
    fetchLeague(month).then(d => { setData(d); setError(''); }).catch(err => setError(err.message));
  }, [month]);
  useEffect(() => { setData(null); load(); }, [load]);

  async function act(fn, ok) {
    setMsg('');
    try {
      const r = await fn();
      setMsg(typeof r === 'number' ? `${ok} ${r} medalha(s) entregue(s).` : ok);
      load();
    } catch (err) {
      setMsg(`Erro: ${err.message.includes('month_not_over') ? 'o mês ainda não acabou.' : err.message}`);
    }
  }

  const isCurrent = month === currentMonth();
  const groups = data ? groupStandings(data.rows) : [];

  return (
    <div className="stack">
      <div className="page-header">
        <div>
          <h1 className="page-title">Ligas</h1>
          <p className="page-subtitle">
            Liga mensal por divisão: quem entra pelo app (Dashboard → Treinos) disputa com quem treina no mesmo ritmo, e
            vence quem treinar mais dias no mês. No dia 1º o mês anterior é fechado e os 3 primeiros de cada divisão
            ganham medalha nas conquistas, com aviso na caixa do app.
          </p>
        </div>
        <label className="field" style={{ maxWidth: 180 }}>
          <span className="field__label">Mês</span>
          <input className="input" type="month" value={month} max={currentMonth()} onChange={e => e.target.value && setMonth(e.target.value)} aria-label="Mês" />
        </label>
      </div>

      {error && <p className="form-msg form-msg--error">{error}</p>}
      {msg && <p className={`form-msg ${msg.startsWith('Erro') ? 'form-msg--error' : 'form-msg--ok'}`}>{msg}</p>}
      {!data && !error && <Loading />}
      {data && (
        <>
          <div className="card actions-row">
            {data.enabled ? <span className="badge badge--ok">liga ligada no app</span> : <span className="badge">liga desligada</span>}
            <button type="button" className="btn btn--small"
              onClick={() => act(() => setLeagueEnabled(!data.enabled, adminUser?.id), data.enabled ? 'Liga desligada.' : 'Liga ligada.')}>
              {data.enabled ? 'Desligar' : 'Ligar no app'}
            </button>
            {!isCurrent && !data.closed && (
              <button type="button" className="btn btn--primary btn--small" onClick={() => act(() => closeLeagueMonth(month), 'Mês fechado.')}>
                Fechar o mês e entregar medalhas
              </button>
            )}
            <span className="user-detail__meta">
              {isCurrent ? 'Mês em andamento (calculado agora).' : data.closed ? 'Mês fechado: resultado guardado.' : 'Mês ainda não fechado.'}
            </span>
          </div>

          <div className="tile-grid">
            {groups.map(g => (
              <div className="tile" key={g.key}>
                <div className="tile__value">{g.emoji} {g.members}</div>
                <div className="tile__label">{g.label}: {g.active} treinaram{g.avgDays != null ? ` · média ${g.avgDays} dia(s)` : ''}</div>
              </div>
            ))}
          </div>

          {data.rows.length === 0 ? <EmptyState icon="🏅" label="Ninguém na liga neste mês." /> : groups.filter(g => g.members).map(g => (
            <div className="card" key={g.key}>
              <h2 className="section-title">{g.emoji} {g.label} <span className="user-detail__meta">({g.rule})</span></h2>
              <div className="table-wrap">
                <table className="resp-table">
                  <thead><tr><th>Posição</th><th>Participante</th><th>Dias no mês</th></tr></thead>
                  <tbody>
                    {g.rows.slice(0, 50).map(r => (
                      <tr key={r.userId}>
                        <td data-label="Posição">{r.days > 0 && MEDAL[r.position] ? `${MEDAL[r.position]} ` : ''}{r.position}º</td>
                        <td data-label="Participante"><Link to={`/users/${r.userId}`}>{r.name}</Link><div className="user-detail__meta">{r.email}</div></td>
                        <td data-label="Dias no mês">{r.days}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {g.rows.length > 50 && <p className="card-note">Mostrando os 50 primeiros de {g.rows.length}.</p>}
            </div>
          ))}
          <p className="card-note">Admins não entram na classificação. No app aparece só o apelido ou o primeiro nome.</p>
        </>
      )}
    </div>
  );
}
