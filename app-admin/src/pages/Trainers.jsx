import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { db } from '../lib/supabase';
import {
  APPOINTMENT_STATUS, IDLE_DAYS, NO_CONTACT_DAYS, TRAINER_LINK_BASE, clientFlags, confirmRate, fetchTrainerActivity,
  fetchTrainerClientsDetail, fetchTrainerHealth, fetchTrainerInvites, fetchTrainerInviteSignups, fetchUpcomingAppointments,
  goalRate, inviteConversion,
} from '../lib/trainers';
import { formatDate } from '../lib/userDetailHelpers';
import Loading from '../components/Loading';
import TrainerResultsCard from '../components/TrainerResultsCard';
import EmptyState from '../components/EmptyState';
import PersonStat from '../components/PersonStat';

const fmtDate = iso => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '—');

const PERIODS = [
  { days: 7, label: '7 dias' },
  { days: 30, label: '30 dias' },
  { days: 90, label: '90 dias' },
  { days: 0, label: 'Tudo' },
];

// Quem criou conta pelo link de divulgação do personal, das mais recentes para
// as mais antigas (igual a Embaixadores e influenciadores).
function TrainerInviteSignups({ trainerId, code }) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    fetchTrainerInviteSignups(trainerId)
      .then(r => { if (active) setRows(r); })
      .catch(err => { if (active) setError(err.message); });
    return () => { active = false; };
  }, [trainerId]);

  if (error) return <p className="form-msg form-msg--error">{error}</p>;
  if (!rows) return <Loading />;

  return (
    <div style={{ marginTop: 8 }}>
      <p className="card-note" style={{ margin: '0 0 6px' }}>Link: <code>{TRAINER_LINK_BASE}{code}</code></p>
      {rows.length === 0 ? (
        <p className="user-detail__meta">Ninguém criou conta pelo link ainda.</p>
      ) : (
        <div className="table-wrap">
          <table className="resp-table">
            <thead><tr><th>Usuário</th><th>Cadastro</th><th>E-mail confirmado</th><th>Último acesso</th><th>Treinos</th><th>Virou aluno</th></tr></thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.userId}>
                  <td data-label="Usuário">
                    <Link to={`/users/${r.userId}`}>{r.email}</Link>
                    {r.name && <div className="user-detail__meta">{r.name}</div>}
                  </td>
                  <td data-label="Cadastro">{formatDate(r.createdAt)}</td>
                  <td data-label="E-mail confirmado">
                    <span className={`badge ${r.confirmed ? 'badge--ok' : 'badge--warning'}`}>{r.confirmed ? 'sim' : 'não'}</span>
                  </td>
                  <td data-label="Último acesso">{r.lastSeen ? formatDate(r.lastSeen) : 'nunca'}</td>
                  <td data-label="Treinos">{r.workouts}</td>
                  <td data-label="Virou aluno">
                    <span className={`badge ${r.client ? 'badge--ok' : ''}`}>{r.client ? 'sim' : 'não'}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// Alunos ativos com treino, meta semanal e último contato do personal. Quem
// está parado ou sem contato aparece primeiro, marcado.
function TrainerClients({ trainerId }) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');

  // Encerra o vínculo (o mesmo que o aluno faz pelo app): o personal deixa de
  // ver os dados dele. Fica na auditoria.
  async function handleRevoke(r) {
    if (!window.confirm(`Encerrar o vínculo com ${r.name}? O personal deixa de ver o treino e os dados desse aluno.`)) return;
    const { error: err } = await db.rpc('admin_revoke_trainer_link', { p_trainer: trainerId, p_client: r.userId });
    if (err) { setError(err.message); return; }
    setRows(prev => prev.filter(x => x.userId !== r.userId));
  }

  useEffect(() => {
    let active = true;
    fetchTrainerClientsDetail(trainerId)
      .then(r => {
        if (!active) return;
        const withFlags = r.map(c => ({ ...c, flags: clientFlags(c) }));
        // sort estável: mantém a ordem de vínculo dentro de cada grupo
        setRows(withFlags.sort((a, b) => b.flags.length - a.flags.length));
      })
      .catch(err => { if (active) setError(err.message); });
    return () => { active = false; };
  }, [trainerId]);

  if (error) return <p className="form-msg form-msg--error">{error}</p>;
  if (!rows) return <Loading />;
  if (rows.length === 0) return <p className="user-detail__meta">Nenhum aluno ativo.</p>;

  return (
    <div className="table-wrap">
      <table className="resp-table">
        <thead><tr><th>Aluno</th><th>Vinculado em</th><th>Dias treinados (30d)</th><th>Último treino</th><th>Meta semanal</th><th>Último contato</th><th /></tr></thead>
        <tbody>
          {rows.map(r => {
            const rate = goalRate(r.goalWeeks, r.goalHit);
            return (
              <tr key={r.userId}>
                <td data-label="Aluno">
                  <Link to={`/users/${r.userId}`}>{r.name}</Link>{' '}
                  {r.flags.includes('idle') && <span className="badge badge--warning">parado</span>}
                  {r.flags.includes('noContact') && <span className="badge badge--danger">sem contato</span>}
                </td>
                <td data-label="Vinculado em">{fmtDate(r.since)}</td>
                <td data-label="Dias treinados (30d)">{r.days30}</td>
                <td data-label="Último treino">{r.lastDay ? fmtDate(`${r.lastDay}T12:00:00`) : 'nunca'}</td>
                <td data-label="Meta semanal">
                  {r.weeklyGoal ? (
                    <>
                      {r.weeklyGoal}x por semana
                      {r.goalWeeks > 0 && <div className="user-detail__meta">bateu {r.goalHit} de {r.goalWeeks} semana(s) · {rate}%</div>}
                    </>
                  ) : 'sem meta'}
                </td>
                <td data-label="Último contato">{r.lastContact ? fmtDate(r.lastContact) : 'nunca'}</td>
                <td><button className="btn btn--ghost btn--small" onClick={() => handleRevoke(r)}>Encerrar vínculo</button></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// Próximas aulas marcadas por todos os personais. Sem aulas (ou com a consulta
// indisponível) o bloco não aparece.
function UpcomingAppointments() {
  const [rows, setRows] = useState([]);

  useEffect(() => {
    let active = true;
    fetchUpcomingAppointments(30).then(r => { if (active) setRows(r); }).catch(() => {});
    return () => { active = false; };
  }, []);

  if (rows.length === 0) return null;

  return (
    <div className="card" style={{ marginTop: 20 }}>
      <h2 className="section-title">Próximas aulas</h2>
      <div className="table-wrap">
        <table className="resp-table">
          <thead><tr><th>Quando</th><th>Personal</th><th>Aluno</th><th>Duração</th><th>Situação</th></tr></thead>
          <tbody>
            {rows.map(a => (
              <tr key={a.id}>
                <td data-label="Quando">{new Date(a.starts).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</td>
                <td data-label="Personal"><Link className="btn btn--ghost btn--small" to={`/users/${a.trainerId}`}>{a.trainerName}</Link></td>
                <td data-label="Aluno"><Link className="btn btn--ghost btn--small" to={`/users/${a.clientId}`}>{a.clientName}</Link></td>
                <td data-label="Duração">{a.duration} min</td>
                <td data-label="Situação">
                  <span className={`badge ${APPOINTMENT_STATUS[a.status]?.badge || ''}`}>{APPOINTMENT_STATUS[a.status]?.label || a.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="card-note">Local e observações da aula ficam só entre personal e aluno.</p>
    </div>
  );
}

// Personais liberados, quantos alunos cada um acompanha, quem trouxeram pelo
// link de divulgação e o quanto usam a agenda e os recados. Quem vira personal
// (ou deixa de ser) continua sendo definido em Usuários → Ações.
export default function Trainers() {
  const [rows, setRows] = useState([]);
  const [activity, setActivity] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(null);
  const [openInvites, setOpenInvites] = useState(null);
  const [days, setDays] = useState(30);
  const [invites, setInvites] = useState({});
  const [health, setHealth] = useState({});

  useEffect(() => {
    let active = true;
    db.rpc('admin_list_trainers')
      .then(({ data, error: err }) => {
        if (!active) return;
        if (err) throw err;
        setRows(data || []);
      })
      .catch(err => { if (active) setError(err.message); })
      .finally(() => { if (active) setLoading(false); });
    // Atividade é complemento: se falhar, a lista de personais continua.
    fetchTrainerActivity(30).then(a => { if (active) setActivity(a); }).catch(() => {});
    return () => { active = false; };
  }, []);

  // Números do link mudam com o período; se falhar, a lista continua.
  useEffect(() => {
    let active = true;
    fetchTrainerInvites(days).then(i => { if (active) setInvites(i); }).catch(() => {});
    fetchTrainerHealth(days).then(h => { if (active) setHealth(h); }).catch(() => {});
    return () => { active = false; };
  }, [days]);

  const totalClients = rows.reduce((n, r) => n + Number(r.tc_clients || 0), 0);
  const totals = Object.values(invites).reduce((acc, i) => ({
    visits: acc.visits + i.visits, signups: acc.signups + i.signups, total: acc.total + i.total, linked: acc.linked + i.linked,
  }), { visits: 0, signups: 0, total: 0, linked: 0 });
  const healthTotals = Object.values(health).reduce((acc, h) => ({
    added: acc.added + h.added, lost: acc.lost + h.lost, goalWeeks: acc.goalWeeks + h.goalWeeks,
    goalHit: acc.goalHit + h.goalHit, idle: acc.idle + h.idle, noContact: acc.noContact + h.noContact,
  }), { added: 0, lost: 0, goalWeeks: 0, goalHit: 0, idle: 0, noContact: 0 });
  const totalGoalRate = goalRate(healthTotals.goalWeeks, healthTotals.goalHit);

  const ready = !loading && !error;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Personais</h1>
          <p className="user-detail__meta">{rows.length} personal(is) · {totalClients} aluno(s) vinculado(s)</p>
        </div>
        <div className="seg" role="group" aria-label="Período">
          {PERIODS.map(p => (
            <button
              key={p.days} type="button" aria-pressed={days === p.days}
              className={`seg__btn${days === p.days ? ' seg__btn--active' : ''}`}
              onClick={() => setDays(p.days)}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {ready && rows.length > 0 && (
        <div className="stack" style={{ gap: 14, marginBottom: 24 }}>
          <h2 className="section-label">Link de divulgação</h2>
          <div className="tile-grid tile-grid--4">
            <div className="tile"><div className="tile__value">{totals.visits}</div><div className="tile__label">Visitas pelos links no período</div></div>
            <div className="tile"><div className="tile__value">{totals.signups}</div><div className="tile__label">Contas criadas no período</div></div>
            <div className="tile"><div className="tile__value">{totals.total}</div><div className="tile__label">Indicados no total</div></div>
            <div className="tile"><div className="tile__value">{totals.linked}</div><div className="tile__label">Alunos que entraram pelo link</div></div>
          </div>
          <p className="card-note" style={{ margin: 0, maxWidth: 720 }}>
            Cada personal tem um link de divulgação (<code>{TRAINER_LINK_BASE}CODIGO</code>). Quem abre o link e cria conta
            fica registrado como indicação dele, e o app pede para a pessoa autorizar o vínculo. Visitas contam no máximo 1
            vez por dia por navegador.
          </p>

          {Object.keys(health).length > 0 && (
            <>
              <h2 className="section-label">Carteira dos alunos</h2>
              <div className="tile-grid tile-grid--4">
                <div className="tile">
                  <div className="tile__value">+{healthTotals.added} / −{healthTotals.lost}</div>
                  <div className="tile__label">Vínculos novos / encerrados no período</div>
                </div>
                <div className="tile">
                  <div className="tile__value">{totalGoalRate === null ? '—' : `${totalGoalRate}%`}</div>
                  <div className="tile__label">Semanas com a meta batida (últimas 4)</div>
                </div>
                <div className="tile"><div className="tile__value">{healthTotals.idle}</div><div className="tile__label">Alunos parados há {IDLE_DAYS}+ dias</div></div>
                <div className="tile"><div className="tile__value">{healthTotals.noContact}</div><div className="tile__label">Alunos sem contato há {NO_CONTACT_DAYS}+ dias</div></div>
              </div>
            </>
          )}
        </div>
      )}

      {loading && <Loading />}
      {error && <p className="form-msg form-msg--error">{error}</p>}

      {ready && rows.length === 0 && (
        <div className="card"><EmptyState icon="🧑‍🏫" label="Nenhum personal liberado ainda. Libere em Usuários → Ações." /></div>
      )}

      {ready && rows.length > 0 && (
        <>
          <h2 className="section-label" style={{ margin: '0 0 12px' }}>Personais liberados</h2>
          <ul className="pcard-list">
            {rows.map(r => {
              const a = activity[r.tc_user];
              const rate = confirmRate(a);
              const inv = invites[r.tc_user];
              const conv = inv ? inviteConversion(inv.visits, inv.signups) : null;
              const hl = health[r.tc_user];
              const hlRate = hl ? goalRate(hl.goalWeeks, hl.goalHit) : null;
              const clientsOpen = open === r.tc_user;
              const invitesOpen = openInvites === r.tc_user;
              const joinSub = parts => parts.filter(Boolean).join(' · ') || null;
              return (
                <li key={r.tc_user} className="card pcard">
                  <div className="pcard__head">
                    <div className="pcard__id">
                      <Link className="pcard__name" to={`/users/${r.tc_user}`}>{r.tc_name}</Link>
                      <div className="pcard__meta">
                        <span>{r.tc_email}</span>
                        <span>Código <code>{r.tc_code}</code></span>
                        <span>Liberado em {fmtDate(r.tc_since)}</span>
                      </div>
                      {hl && (hl.idle > 0 || hl.noContact > 0) && (
                        <div className="pcard__flags">
                          {hl.idle > 0 && <span className="badge badge--warning">{hl.idle} parado(s)</span>}
                          {hl.noContact > 0 && <span className="badge badge--danger">{hl.noContact} sem contato</span>}
                        </div>
                      )}
                    </div>
                    <div className="actions-row pcard__actions">
                      <button className="btn btn--small" aria-expanded={clientsOpen}
                        onClick={() => setOpen(clientsOpen ? null : r.tc_user)}>
                        {clientsOpen ? 'Ocultar alunos' : 'Ver alunos'}
                      </button>
                      <button className="btn btn--ghost btn--small" aria-expanded={invitesOpen}
                        onClick={() => setOpenInvites(invitesOpen ? null : r.tc_user)}>
                        {invitesOpen ? 'Ocultar indicados' : `Indicados (${inv ? inv.total : 0})`}
                      </button>
                    </div>
                  </div>

                  <dl className="pcard__stats">
                    <PersonStat label="Alunos" value={Number(r.tc_clients)}
                      sub={hl && (hl.added > 0 || hl.lost > 0) ? `+${hl.added} / −${hl.lost} no período` : null} />
                    <PersonStat label="Link (período)" value={inv ? `${inv.visits} visita(s)` : '—'}
                      sub={inv ? joinSub([`${inv.signups} cadastro(s)`, conv !== null && `${conv}% de conversão`]) : null} />
                    <PersonStat label="Indicados" value={inv ? inv.total : '—'}
                      sub={inv && inv.total > 0 ? `${inv.linked} viraram aluno · ${inv.active7} ativos 7d` : null} />
                    <PersonStat label="Meta semanal" value={hlRate !== null ? `${hlRate}%` : '—'}
                      sub={hl ? joinSub([`${hl.withGoal} com meta`, hlRate !== null && 'semanas batidas']) : null} />
                    <PersonStat label="Aulas (30d)" value={a ? a.appts : '—'}
                      sub={a ? joinSub([rate !== null && `${rate}% confirmadas`, a.upcoming > 0 && `${a.upcoming} marcada(s) à frente`]) : null} />
                    <PersonStat label="Recados (30d)" value={a ? a.messages : '—'}
                      sub={a ? joinSub([a.messages > 0 && `${a.read} lido(s)`, a.lastMessage && `último em ${fmtDate(a.lastMessage)}`]) : null} />
                  </dl>

                  {clientsOpen && (
                    <section className="pcard__panel">
                      <h3 className="subsection-title">Alunos ativos</h3>
                      <TrainerClients trainerId={r.tc_user} />
                    </section>
                  )}
                  {invitesOpen && (
                    <section className="pcard__panel">
                      <h3 className="subsection-title">Indicados pelo link</h3>
                      <TrainerInviteSignups trainerId={r.tc_user} code={r.tc_code} />
                    </section>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}

      {ready && rows.length > 0 && <TrainerResultsCard trainers={rows} days={days} />}
      {ready && <UpcomingAppointments />}
    </div>
  );
}
