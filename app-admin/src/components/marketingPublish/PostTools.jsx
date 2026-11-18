

// Ações de um post já publicado (Histórico e Agenda).
export function PostButtons({ p, deleting, setEditing, onCancel, onDelete }) {
  return (
  <>
    {p.targets.some(t => t.status === 'pending') && p.scheduled_at && (
      <button type="button" className="btn btn--ghost btn--small" onClick={() => onCancel(p)}>Cancelar</button>
    )}
    {p.format !== 'story' && p.targets.some(t => t.status === 'published') && (
      <button type="button" className="btn btn--ghost btn--small" onClick={() => setEditing({ id: p.id, text: p.caption || '' })}>Editar legenda</button>
    )}
    <button type="button" className="btn btn--danger btn--small" disabled={deleting === p.id} onClick={() => onDelete(p)}>
      {deleting === p.id ? 'Excluindo…' : 'Excluir'}
    </button>
  </>
  );
}

// Editor da legenda de um post já publicado.
export function PostEditor({ p, editing, setEditing, editBusy, onEdit, onRepost }) {
  if (editing?.id !== p.id) return null;
  return (
  editing?.id === p.id && (
    <div className="stack mkt-edit">
      <textarea className="input" rows={6} value={editing.text} maxLength={5000} aria-label="Nova legenda"
        onChange={e => setEditing({ id: p.id, text: e.target.value })} />
      <p className="user-detail__meta">
        No Facebook a legenda muda na hora. O Instagram não permite editar um post publicado: para ele,
        use “Excluir e republicar” (as curtidas e os comentários do post atual se perdem).
      </p>
      <div className="actions-row">
        <button type="button" className="btn btn--primary btn--small" disabled={editBusy} onClick={() => onEdit(p)}>
          {editBusy ? 'Salvando…' : 'Salvar nas redes que permitem'}
        </button>
        <button type="button" className="btn btn--danger btn--small" disabled={editBusy} onClick={() => onRepost(p)}>Excluir e republicar</button>
        <button type="button" className="btn btn--ghost btn--small" disabled={editBusy} onClick={() => setEditing(null)}>Cancelar</button>
      </div>
    </div>
  )
  );
}
