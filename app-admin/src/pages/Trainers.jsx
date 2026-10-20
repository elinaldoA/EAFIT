import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { db } from '../lib/supabase';
import {
  APPOINTMENT_STATUS, TRAINER_LINK_BASE, confirmRate, fetchTrainerActivity, fetchTrainerInvites, fetchTrainerInviteSignups,
  fetchUpcomingAppointments, inviteConversion,
} from '../lib/trainers';
import { formatDate } from '../lib/userDetailHelpers';
import Loading from '../components/Loading';
import EmptyState from '../components/EmptyState';

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
        <table className="resp-table">
          <thead><tr><th>Usuário</th><th>Cadastro</th><th>E-mail confirmado</th><th>Último acesso</th><th>Treinos</th><th>Virou aluno</th></tr></thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.userId}>
                <td data-label="Usuário">
                  <Link className="btn btn--ghost btn--small" to={`/users/${r.userId}`}>{r.email}</Link>
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
      )}
    </div>
  );
}

function TrainerClients({ trainerId }) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');

  // Encerra o vínculo (o mesmo que o aluno faz pelo app): o personal deixa de
  // ver os dados dele. Fica na auditoria.
  async function handleRevoke(r) {
    if (!window.confirm(`Encerrar o vínculo com ${r.tcl_name}? O personal deixa de ver o treino e os dados desse aluno.`)) return;
    const { error: err } = await db.rpc('admin_revoke_trainer_link', { p_trainer: trainerId, p_client: r.tcl_user });
    if (err) { setError(err.message); return; }
    setRows(prev => prev.filter(x => x.tcl_user !== r.tcl_user));
  }

  useEffect(() => {
    let active = true;
    db.rpc('admin_trainer_clients', { p_trainer: trainerId })
      .then(({ data, error: err }) => {
        if (!active) return;
        if (err) throw err;
        setRows(data || []);
      })
      .catch(err => { if (active) setError(err.message); });
    return () => { active = false; };
  }, [trainerId]);

  if (error) return <p className="form-msg form-msg--error">{error}</p>;
  if (!rows) return <Loading />;
  if (rows.length === 0) return <p className="user-detail__meta">Nenhum aluno ativo.</p>;

  return (
    <table className="resp-table">
      <thead><tr><th>Aluno</th><th>Vinculado em</th><th>Dias treinados (30d)</th><th /></tr></thead>
      <tbody>
        {rows.map(r => (
          <tr key={r.tcl_user}>
            <td data-label="Aluno"><Link className="btn btn--ghost btn--small" to={`/users/${r.tcl_user}`}>{r.tcl_name}</Link></td>
            <td data-label="Vinculado em">{fmtDate(r.tcl_since)}</td>
            <td data-label="Dias treinados (30d)">{r.tcl_days30}</td>
            <td data-label=""><button className="btn btn--ghost btn--small" onClick={() => handleRevoke(r)}>Encerrar vínculo</button></td>
          </tr>
        ))}
      </tbody>
    </table>
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
    return () => { active = false; };
  }, [days]);

  const totalClients = rows.reduce((n, r) => n + Number(r.tc_clients || 0), 0);
  const totals = Object.values(invites).reduce((acc, i) => ({
    visits: acc.visits + i.visits, signups: acc.signups + i.signups, total: acc.total + i.total, linked: acc.linked + i.linked,
  }), { visits: 0, signups: 0, total: 0, linked: 0 });

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Personais</h1>
        <p className="user-detail__meta">{rows.length} personal(is) · {totalClients} aluno(s) vinculado(s)</p>
      </div>

      <div className="page-header" style={{ marginTop: 0 }}>
        <p className="card-note" style={{ margin: 0, maxWidth: 640 }}>
          Cada personal tem um link de divulgação (<code>{TRAINER_LINK_BASE}CODIGO</code>). Quem abre o link e cria conta
          fica registrado como indicação dele, e o app pede para a pessoa autorizar o vínculo. Visitas contam no máximo 1
          vez por dia por navegador.
        </p>
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

      {!loading && !error && rows.length > 0 && (
        <div className="tile-grid" style={{ marginBottom: 16 }}>
          <div className="tile"><div className="tile__value">{totals.visits}</div><div className="tile__label">Visitas pelos links no período</div></div>
          <div className="tile"><div className="tile__value">{totals.signups}</div><div className="tile__label">Contas criadas no período</div></div>
          <div className="tile"><div className="tile__value">{totals.total}</div><div className="tile__label">Indicados no total</div></div>
          <div className="tile"><div className="tile__value">{totals.linked}</div><div className="tile__label">Alunos que entraram pelo link</div></div>
        </div>
      )}

      {loading && <Loading />}
      {error && <p className="form-msg form-msg--error">{error}</p>}

      {!loading && !error && (
        <table className="resp-table">
          <thead>
            <tr><th>Personal</th><th>Código</th><th>Alunos</th><th>Link (período)</th><th>Indicados</th><th>Aulas (30d)</th><th>Recados (30d)</th><th>Liberado em</th><th /></tr>
          </thead>
          <tbody>
            {rows.map(r => {
              const a = activity[r.tc_user];
              const rate = confirmRate(a);
              const inv = invites[r.tc_user];
              const conv = inv ? inviteConversion(inv.visits, inv.signups) : null;
              return (
                <tr key={r.tc_user}>
                  <td data-label="Personal">
                    <Link className="btn btn--ghost btn--small" to={`/users/${r.tc_user}`}>{r.tc_name}</Link>
                    <div className="user-detail__meta">{r.tc_email}</div>
                    {open === r.tc_user && <TrainerClients trainerId={r.tc_user} />}
                    {openInvites === r.tc_user && <TrainerInviteSignups trainerId={r.tc_user} code={r.tc_code} />}
                  </td>
                  <td data-label="Código"><code>{r.tc_code}</code></td>
                  <td data-label="Alunos">{Number(r.tc_clients)}</td>
                  <td data-label="Link (período)">
                    {inv ? (
                      <>
                        {inv.visits} visita(s) · {inv.signups} cadastro(s)
                        {conv !== null && <span className="user-detail__meta"> · {conv}%</span>}
                      </>
                    ) : '—'}
                  </td>
                  <td data-label="Indicados">
                    {inv ? (
                      <>
                        {inv.total}
                        {inv.total > 0 && <div className="user-detail__meta">{inv.linked} viraram aluno · {inv.active7} ativos 7d</div>}
                      </>
                    ) : '—'}
                  </td>
                  <td data-label="Aulas (30d)">
                    {a ? (
                      <>
                        {a.appts}
                        {rate !== null && <span className="user-detail__meta"> · {rate}% confirmadas</span>}
                        {a.upcoming > 0 && <div className="user-detail__meta">{a.upcoming} marcada(s) à frente</div>}
                      </>
                    ) : '—'}
                  </td>
                  <td data-label="Recados (30d)">
                    {a ? (
                      <>
                        {a.messages}
                        {a.messages > 0 && <span className="user-detail__meta"> · {a.read} lido(s)</span>}
                        {a.lastMessage && <div className="user-detail__meta">último em {fmtDate(a.lastMessage)}</div>}
                      </>
                    ) : '—'}
                  </td>
                  <td data-label="Liberado em">{fmtDate(r.tc_since)}</td>
                  <td>
                    <div className="actions-row">
                      <button className="btn btn--small" onClick={() => setOpen(open === r.tc_user ? null : r.tc_user)}>
                        {open === r.tc_user ? 'Ocultar alunos' : 'Ver alunos'}
                      </button>
                      <button className="btn btn--ghost btn--small" aria-expanded={openInvites === r.tc_user}
                        onClick={() => setOpenInvites(openInvites === r.tc_user ? null : r.tc_user)}>
                        {openInvites === r.tc_user ? 'Ocultar indicados' : `Indicados (${inv ? inv.total : 0})`}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr><td colSpan={9}><EmptyState icon="🧑‍🏫" label="Nenhum personal liberado ainda. Libere em Usuários → Ações." /></td></tr>
            )}
          </tbody>
        </table>
      )}

      {!loading && !error && <UpcomingAppointments />}
    </div>
  );
}
