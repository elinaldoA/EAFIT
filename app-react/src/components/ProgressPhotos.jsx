import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../context/useAuth';
import { useToast } from '../context/useToast';
import { getModalRoot } from '../lib/modalRoot';
import { fetchPhotos, addPhoto, deletePhoto } from '../lib/progressPhotos';
import { fmtDate } from '../lib/utils';
import { todayDate } from '../data/treinoData';

function PhotoViewer({ photos, index, onClose, onNavigate, onDelete }) {
  useEffect(() => {
    document.body.classList.add('modal-open');
    return () => document.body.classList.remove('modal-open');
  }, []);

  const photo = photos[index];
  if (!photo) return null;

  return createPortal(
    <div className="photo-modal" role="dialog" aria-modal="true">
      <div className="photo-modal__backdrop" onClick={onClose} />
      <div className="photo-modal__panel">
        <button type="button" className="photo-modal__close" aria-label="Fechar" onClick={onClose}>✕</button>
        <img className="photo-modal__img" src={photo.image_data} alt={`Foto de ${fmtDate(photo.photo_date)}`} />
        <div className="photo-modal__meta">
          <span className="photo-modal__date">{fmtDate(photo.photo_date)}</span>
          {photo.note && <span className="photo-modal__note">{photo.note}</span>}
        </div>
        <div className="photo-modal__nav">
          <button type="button" className="btn btn--outline btn--sm" disabled={index <= 0} onClick={() => onNavigate(index - 1)}>‹ Anterior</button>
          <button type="button" className="btn btn--outline btn--sm" onClick={() => onDelete(photo.id)}>🗑 Excluir</button>
          <button type="button" className="btn btn--outline btn--sm" disabled={index >= photos.length - 1} onClick={() => onNavigate(index + 1)}>Próxima ›</button>
        </div>
      </div>
    </div>,
    getModalRoot()
  );
}

export default function ProgressPhotos() {
  const { user } = useAuth();
  const toast = useToast();
  const [photos, setPhotos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewerIndex, setViewerIndex] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [date, setDate] = useState(todayDate());
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);
      try {
        const data = await fetchPhotos(user.id);
        setPhotos(data);
      } catch (err) {
        console.error('fetchPhotos:', err);
        toast('⚠️ Erro ao carregar fotos');
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function handleFileChange(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !user) return;
    setSaving(true);
    try {
      const photo = await addPhoto(user.id, { file, date, note });
      setPhotos(list => [...list, photo].sort((a, b) => a.photo_date.localeCompare(b.photo_date)));
      setNote('');
      setShowForm(false);
      toast('✅ Foto adicionada');
    } catch (err) {
      console.error('addPhoto:', err);
      toast(`⚠️ ${err.message || 'Erro ao salvar foto'}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    if (!window.confirm('Excluir esta foto?')) return;
    try {
      await deletePhoto(id, user.id);
      setPhotos(list => list.filter(p => p.id !== id));
      setViewerIndex(null);
      toast('🗑️ Foto excluída');
    } catch (err) {
      console.error('deletePhoto:', err);
      toast('⚠️ Erro ao excluir foto');
    }
  }

  return (
    <div className="photo-progress">
      <div className="photo-strip">
        {loading ? (
          <p className="dash-empty">Carregando…</p>
        ) : (
          <>
            {photos.map((p, i) => (
              <button type="button" key={p.id} className="photo-thumb" onClick={() => setViewerIndex(i)}>
                <img src={p.image_data} alt={`Foto de ${fmtDate(p.photo_date)}`} />
                <span className="photo-thumb__date">{fmtDate(p.photo_date)}</span>
              </button>
            ))}
            <button type="button" className="photo-thumb photo-thumb--add" onClick={() => setShowForm(f => !f)}>
              <span className="photo-thumb__plus">+</span>
              <span className="photo-thumb__date">Adicionar</span>
            </button>
          </>
        )}
      </div>

      {showForm && (
        <div className="photo-add-form">
          <input className="input input--sm" type="date" value={date} max={todayDate()} onChange={e => setDate(e.target.value)} />
          <input className="input input--sm" placeholder="Nota (opcional)" value={note} onChange={e => setNote(e.target.value)} />
          <button
            type="button" className="btn btn--primary btn--sm"
            disabled={saving}
            onClick={() => fileInputRef.current?.click()}
          >{saving ? 'Salvando…' : '📷 Escolher foto'}</button>
          <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={handleFileChange} />
        </div>
      )}

      {viewerIndex !== null && (
        <PhotoViewer
          photos={photos} index={viewerIndex}
          onClose={() => setViewerIndex(null)}
          onNavigate={setViewerIndex}
          onDelete={handleDelete}
        />
      )}
    </div>
  );
}
