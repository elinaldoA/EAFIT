import { useCallback, useEffect, useState } from 'react';
import { db } from '../lib/supabase';
import { formatDate } from '../lib/userDetailHelpers';
import Loading from '../components/Loading';

// Notas internas do time sobre o usuário (suporte, contexto de atendimento).
// Nunca aparecem no app do usuário: a tabela só tem policy de admin.
export default function UserNotesTab({ userId, adminUser }) {
  const [notes, setNotes] = useState([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const { data, error: err } = await db.from('admin_user_notes')
      .select('id, note, admin_email, created_at')
      .eq('user_id', userId).order('created_at', { ascending: false });
    if (err) setError(err.message); else setNotes(data || []);
    setLoading(false);
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  async function handleAdd(e) {
    e.preventDefault();
    const note = draft.trim();
    if (!note) return;
    setSaving(true);
    setError('');
    const { error: err } = await db.from('admin_user_notes').insert({
      user_id: userId, admin_id: adminUser?.id, admin_email: adminUser?.email, note,
    });
    if (err) setError(err.message);
    else { setDraft(''); await load(); }
    setSaving(false);
  }

  async function handleDelete(id) {
    if (!window.confirm('Excluir esta nota?')) return;
    const { error: err } = await db.from('admin_user_notes').delete().eq('id', id);
    if (err) setError(err.message); else await load();
  }

  return (
    <div className="card stack">
      <form className="stack" style={{ gap: 10 }} onSubmit={handleAdd}>
        <label className="field">
          <span className="field__label">Nova nota interna (só o time admin vê)</span>
          <textarea
            className="input" rows={3} value={draft} maxLength={2000}
            placeholder="Ex.: pediu pausa por lesão no ombro, retomar em novembro."
            onChange={e => setDraft(e.target.value)}
          />
        </label>
        <div className="actions-row">
          <button className="btn" type="submit" disabled={saving || !draft.trim()}>Adicionar nota</button>
        </div>
      </form>

      {error && <p className="form-msg form-msg--error">{error}</p>}

      {loading ? <Loading /> : !notes.length ? (
        <p className="card-note">Nenhuma nota para este usuário.</p>
      ) : (
        <div>
          {notes.map(n => (
            <div className="note" key={n.id}>
              <p className="note__text">{n.note}</p>
              <div className="user-detail__meta">
                {n.admin_email || 'admin'} · {formatDate(n.created_at)}
                {' · '}
                <button type="button" className="btn btn--ghost btn--small" onClick={() => handleDelete(n.id)}>Excluir</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
