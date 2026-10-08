import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { db } from '../lib/supabase';

const STATUS = {
  friend: { label: 'amigos', badge: 'badge--ok' },
  outgoing: { label: 'pedido enviado', badge: 'badge--warning' },
  incoming: { label: 'pedido recebido', badge: 'badge--warning' },
};

// Amizades e pedidos do usuário, com remoção pelo suporte (denúncia, assédio).
// Sem amizades ou com a consulta indisponível, não mostra nada.
export default function UserFriendsCard({ userId }) {
  const [rows, setRows] = useState([]);
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    try {
      const { data, error } = await db.rpc('admin_user_friendships', { p_user: userId });
      if (error) throw error;
      setRows(data || []);
    } catch { /* complemento da tela */ }
  }, [userId]);

  useEffect(() => { if (userId) load(); }, [userId, load]);

  async function handleRemove(r) {
    if (!window.confirm(`Desfazer o vínculo com ${r.uf_email}? Os dois deixam de se ver no ranking e no feed.`)) return;
    setMsg('');
    const { error } = await db.rpc('admin_remove_friendship', { p_id: r.uf_id });
    if (error) { setMsg(`Erro: ${error.message}`); return; }
    setMsg('Vínculo removido.');
    await load();
  }

  if (rows.length === 0 && !msg) return null;

  return (
    <section>
      <h2 className="section-title">Amigos</h2>
      {msg && <p className={`form-msg ${msg.startsWith('Erro') ? 'form-msg--error' : 'form-msg--ok'}`}>{msg}</p>}
      {rows.length > 0 && (
        <table className="resp-table">
          <thead><tr><th>Pessoa</th><th>Situação</th><th>Desde</th><th /></tr></thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.uf_id}>
                <td data-label="Pessoa">
                  <Link className="btn btn--ghost btn--small" to={`/users/${r.uf_other}`}>{r.uf_name}</Link>
                  <div className="user-detail__meta">{r.uf_email}</div>
                </td>
                <td data-label="Situação"><span className={`badge ${STATUS[r.uf_status]?.badge || ''}`}>{STATUS[r.uf_status]?.label || r.uf_status}</span></td>
                <td data-label="Desde">{r.uf_since ? new Date(r.uf_since).toLocaleDateString('pt-BR') : '—'}</td>
                <td data-label=""><button className="btn btn--ghost btn--small" onClick={() => handleRemove(r)}>Remover</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
