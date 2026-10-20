import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAdminAuth } from '../context/useAdminAuth';
import { fetchAdmins, removeAdmin } from '../lib/ops';
import { formatDate } from '../lib/userDetailHelpers';
import Loading from '../components/Loading';
import AdminAccessEditor from '../components/AdminAccessEditor';
import { useAdminAccess } from '../context/useAdminAccess';
import { ROLE_LABELS, fetchAccessList } from '../lib/adminAccess';

// Quem tem acesso ao painel hoje. Promover alguém continua em Usuários →
// Ações (é lá que se escolhe a pessoa); aqui dá para conferir e remover.
export default function Admins() {
  const { adminUser } = useAdminAuth();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');
  const [msg, setMsg] = useState('');
  const [access, setAccess] = useState({});
  const [open, setOpen] = useState(null);
  const { role: myRole } = useAdminAccess();
  const canEdit = myRole === 'superadmin';

  const load = useCallback(async () => {
    try {
      setRows(await fetchAdmins());
      setError('');
      // Permissões são de migration nova: sem ela, a lista segue sem a coluna.
      fetchAccessList().then(list => setAccess(Object.fromEntries(list.map(a => [a.id, a])))).catch(() => setAccess({}));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleRemove(a) {
    if (!window.confirm(`Remover o acesso de admin de ${a.email}? A pessoa continua com a conta no app.`)) return;
    setBusyId(a.id);
    setMsg('');
    try {
      await removeAdmin(a.id, adminUser?.id);
      setMsg('Acesso removido.');
      await load();
    } catch (err) {
      setMsg(`Erro: ${err.message}`);
    } finally {
      setBusyId('');
    }
  }

  return (
    <div className="stack">
      <div className="page-header">
        <div>
          <h1 className="page-title">Administradores</h1>
          <p className="page-subtitle">
            Contas com acesso a este painel e aos dados de todos os usuários. O papel e as permissões dizem o que cada uma
            pode alterar e quais telas vê no menu (só superadmin edita). Para dar acesso a alguém, abra a
            pessoa em <Link to="/users">Usuários</Link> e use Ações → Tornar admin. Toda mudança fica na{' '}
            <Link to="/auditoria">Auditoria</Link>.
          </p>
        </div>
        {!loading && !error && <span className="badge badge--admin">{rows.length} admin(s)</span>}
      </div>

      {loading && <Loading />}
      {error && <p className="form-msg form-msg--error">{error}</p>}
      {msg && <p className={`form-msg ${msg.startsWith('Erro') ? 'form-msg--error' : 'form-msg--ok'}`}>{msg}</p>}

      {!loading && !error && (
        <div className="table-wrap">
          <table className="resp-table">
            <thead><tr><th>Admin</th><th>Papel</th><th>Conta criada em</th><th>Último login</th><th /></tr></thead>
            <tbody>
              {rows.map(a => (
                <tr key={a.id}>
                  <td data-label="Admin">
                    <Link className="btn btn--ghost btn--small" to={`/users/${a.id}`}>{a.email}</Link>
                    {a.id === adminUser?.id && <span className="badge badge--ok">você</span>}
                    {a.name && <div className="user-detail__meta">{a.name}</div>}
                    {open === a.id && access[a.id] && (
                      <AdminAccessEditor key={access[a.id].updatedAt || a.id} admin={access[a.id]} adminId={adminUser?.id} canEdit={canEdit} onSaved={load} />
                    )}
                  </td>
                  <td data-label="Papel">
                    {access[a.id] ? ROLE_LABELS[access[a.id].role] || access[a.id].role : '—'}
                    {access[a.id] && (access[a.id].extraAreas.length > 0 || access[a.id].hiddenScreens.length > 0) && (
                      <div className="user-detail__meta">
                        {access[a.id].extraAreas.length ? `+${access[a.id].extraAreas.length} área(s)` : ''}
                        {access[a.id].extraAreas.length && access[a.id].hiddenScreens.length ? ' · ' : ''}
                        {access[a.id].hiddenScreens.length ? `${access[a.id].hiddenScreens.length} tela(s) oculta(s)` : ''}
                      </div>
                    )}
                  </td>
                  <td data-label="Conta criada em">{formatDate(a.createdAt)}</td>
                  <td data-label="Último login">{a.lastSignIn ? formatDate(a.lastSignIn) : 'nunca'}</td>
                  <td>
                    <div className="actions-row">
                    {access[a.id] && (
                      <button type="button" className="btn btn--small" onClick={() => setOpen(open === a.id ? null : a.id)}>
                        {open === a.id ? 'Fechar' : canEdit ? 'Permissões' : 'Ver permissões'}
                      </button>
                    )}
                    {a.id !== adminUser?.id && (
                      <button className="btn btn--danger btn--small" disabled={busyId === a.id} onClick={() => handleRemove(a)}>
                        Remover admin
                      </button>
                    )}
                    </div>
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
