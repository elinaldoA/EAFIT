import { useEffect, useState } from 'react';
import { db } from '../lib/supabase';
import Loading from '../components/Loading';
import EmptyState from '../components/EmptyState';

const PAGE_SIZE = 50;

function formatDate(value) {
  if (!value) return '—';
  return new Date(value).toLocaleString('pt-BR');
}

const ACTION_LABEL = {
  ban: 'Baniu',
  unban: 'Desbaniu',
  resetPassword: 'Gerou link de senha',
  updateProfile: 'Editou perfil',
  deleteUser: 'Excluiu conta',
  broadcastPush: 'Notificação em massa',
  updateAppSettings: 'Alterou configurações do app',
  promoteAdmin: 'Promoveu a admin',
  promoteTrainer: 'Liberou como personal trainer',
  demoteTrainer: 'Removeu o acesso de personal trainer',
  demoteAdmin: 'Removeu admin',
  generateWorkout: 'Gerou novo treino',
  confirmUser: 'Confirmou e-mail',
  fixWorkoutSet: 'Corrigiu série de treino',
  deleteWorkout: 'Apagou treino',
  exportUserData: 'Exportou dados do usuário',
  purgeOldData: 'Limpou dados antigos',
  revokeTrainerLink: 'Encerrou vínculo com personal',
  removeFriendship: 'Removeu amizade',
  createOfficialChallenge: 'Criou desafio oficial',
  deleteChallenge: 'Apagou desafio',
  deleteFeedEvent: 'Removeu publicação do feed',
  blockFeed: 'Bloqueou no feed',
  unblockFeed: 'Desbloqueou no feed',
  publishLegalVersion: 'Registrou versão de documento legal',
};

export default function AuditLog() {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [action, setAction] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // A busca só dispara depois de uma pausa na digitação.
  useEffect(() => {
    const timer = setTimeout(() => { setSearch(searchInput.trim()); setPage(0); }, 350);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    db.rpc('admin_search_audit_log', {
      page_size: PAGE_SIZE, page_offset: page * PAGE_SIZE, p_action: action || null, p_search: search || null,
    })
      .then(({ data, error }) => {
        if (!active) return;
        if (error) throw error;
        setRows(data || []);
        setTotal(data?.[0]?.total_count ?? 0);
      })
      .catch(err => { if (active) setError(err.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [page, action, search]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Auditoria</h1>
        <div className="actions-row">
          <select className="input" aria-label="Filtrar por ação" value={action} onChange={e => { setAction(e.target.value); setPage(0); }}>
            <option value="">Todas as ações</option>
            {Object.entries(ACTION_LABEL).sort((a, b) => a[1].localeCompare(b[1])).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
          <input
            className="input" type="search" aria-label="Buscar por e-mail" placeholder="E-mail do admin ou do alvo"
            value={searchInput} onChange={e => setSearchInput(e.target.value)}
          />
        </div>
      </div>

      {loading && <Loading />}
      {error && <p className="form-msg form-msg--error">{error}</p>}

      {!loading && !error && (
        <>
          <table className="resp-table">
            <thead>
              <tr><th>Quando</th><th>Admin</th><th>Ação</th><th>Alvo</th><th>Detalhes</th></tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id}>
                  <td data-label="Quando">{formatDate(r.created_at)}</td>
                  <td data-label="Admin">{r.admin_email || '—'}</td>
                  <td data-label="Ação">{ACTION_LABEL[r.action] || r.action}</td>
                  <td data-label="Alvo">{r.target_email || '—'}</td>
                  <td data-label="Detalhes">
                    {r.details ? (
                      <details>
                        <summary style={{ cursor: 'pointer' }}>ver</summary>
                        <pre className="template-json-preview">{JSON.stringify(r.details, null, 2)}</pre>
                      </details>
                    ) : '—'}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={5}><EmptyState icon="🕒" label={action || search ? 'Nenhuma ação com esse filtro.' : 'Nenhuma ação registrada ainda.'} /></td></tr>}
            </tbody>
          </table>

          {total > 0 && (
            <div className="page-header">
              <p className="user-detail__meta">
                {total} registro(s) · página {page + 1} de {totalPages}
              </p>
              <div className="actions-row">
                <button className="btn btn--small" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Anterior</button>
                <button className="btn btn--small" disabled={page + 1 >= totalPages} onClick={() => setPage(p => p + 1)}>Próxima</button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
