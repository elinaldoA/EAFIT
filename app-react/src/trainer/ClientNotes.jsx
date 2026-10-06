import { useCallback, useEffect, useState } from 'react';
import { useToast } from '../context/useToast';
import { fmtDate } from '../lib/utils';
import { fetchNotes, addNote, deleteNote, friendlyInsightError } from '../lib/trainerInsights';

// Anotações privadas do personal sobre o aluno (lesões, combinados…). O aluno
// nunca vê isto.
export default function ClientNotes({ clientId }) {
  const toast = useToast();
  const [notes, setNotes] = useState(null);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const reload = useCallback(() => {
    fetchNotes(clientId).then(setNotes).catch(err => { console.error('fetchNotes:', err); setNotes([]); });
  }, [clientId]);
  useEffect(() => { reload(); }, [reload]);

  async function handleAdd() {
    const body = text.trim();
    if (!body) return;
    setBusy(true); setError('');
    try { await addNote(clientId, body); setText(''); reload(); }
    catch (err) { setError(friendlyInsightError(err)); }
    finally { setBusy(false); }
  }

  async function handleDelete(id) {
    if (!window.confirm('Apagar esta anotação?')) return;
    try { await deleteNote(id); reload(); } catch { toast('❌ Não foi possível apagar'); }
  }

  return (
    <div className="dash-card">
      <div className="dash-card__title">📝 Anotações privadas</div>
      <p className="profile-field__hint" style={{ marginTop: 0 }}>Só você vê. Use para lesões, combinados e observações.</p>
      <textarea className="input input--sm" rows={2} maxLength={1000} aria-label="Nova anotação"
        placeholder="Ex.: dor no ombro direito, evitar desenvolvimento por 2 semanas" value={text} onChange={e => setText(e.target.value)} />
      {error && <p className="profile-field__hint" role="alert" style={{ color: 'var(--error)' }}>{error}</p>}
      <button type="button" className="btn btn--outline btn--sm" style={{ marginTop: 8 }} disabled={busy || !text.trim()} onClick={handleAdd}>
        {busy ? 'Salvando…' : 'Salvar anotação'}
      </button>

      {(notes || []).map(n => (
        <div className="sent-msg" key={n.id}>
          <div className="sent-msg__head">
            <small>{fmtDate(String(n.at).slice(0, 10))}</small>
            <button type="button" className="plan-row__del" aria-label="Apagar anotação" onClick={() => handleDelete(n.id)}>✕</button>
          </div>
          <p className="sent-msg__body">{n.body}</p>
        </div>
      ))}
    </div>
  );
}
