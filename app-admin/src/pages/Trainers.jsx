import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { db } from '../lib/supabase';
import Loading from '../components/Loading';
import EmptyState from '../components/EmptyState';

const fmtDate = iso => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '—');

function TrainerClients({ trainerId }) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');

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
      <thead><tr><th>Aluno</th><th>Vinculado em</th><th>Dias treinados (30d)</th></tr></thead>
      <tbody>
        {rows.map(r => (
          <tr key={r.tcl_user}>
            <td data-label="Aluno"><Link className="btn btn--ghost btn--small" to={`/users/${r.tcl_user}`}>{r.tcl_name}</Link></td>
            <td data-label="Vinculado em">{fmtDate(r.tcl_since)}</td>
            <td data-label="Dias treinados (30d)">{r.tcl_days30}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// Personais liberados e quantos alunos cada um acompanha. Quem vira personal
// (ou deixa de ser) continua sendo definido em Usuários → Ações.
export default function Trainers() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(null);

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
    return () => { active = false; };
  }, []);

  const totalClients = rows.reduce((n, r) => n + Number(r.tc_clients || 0), 0);

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Personais</h1>
        <p className="user-detail__meta">{rows.length} personal(is) · {totalClients} aluno(s) vinculado(s)</p>
      </div>

      {loading && <Loading />}
      {error && <p className="form-msg form-msg--error">{error}</p>}

      {!loading && !error && (
        <table className="resp-table">
          <thead><tr><th>Personal</th><th>Código</th><th>Alunos</th><th>Liberado em</th><th /></tr></thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.tc_user}>
                <td data-label="Personal">
                  <Link className="btn btn--ghost btn--small" to={`/users/${r.tc_user}`}>{r.tc_name}</Link>
                  <div className="user-detail__meta">{r.tc_email}</div>
                  {open === r.tc_user && <TrainerClients trainerId={r.tc_user} />}
                </td>
                <td data-label="Código"><code>{r.tc_code}</code></td>
                <td data-label="Alunos">{Number(r.tc_clients)}</td>
                <td data-label="Liberado em">{fmtDate(r.tc_since)}</td>
                <td>
                  <button className="btn btn--small" onClick={() => setOpen(open === r.tc_user ? null : r.tc_user)}>
                    {open === r.tc_user ? 'Ocultar alunos' : 'Ver alunos'}
                  </button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={5}><EmptyState icon="🧑‍🏫" label="Nenhum personal liberado ainda. Libere em Usuários → Ações." /></td></tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
