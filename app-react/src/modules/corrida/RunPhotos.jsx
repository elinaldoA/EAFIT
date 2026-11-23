import { useCallback, useEffect, useState } from 'react';
import { useToast } from '../../context/useToast';
import { friendlyError } from '../../lib/friendlyError';
import { fetchRunPhotos, signPhotoUrls, addRunPhoto, deleteRunPhoto, isPhotoLimit, MAX_RUN_PHOTOS } from './runPhotoStore';
import { t } from '../../lib/i18n';

// Fotos de uma corrida já salva, na corrida aberta do histórico: ver, adicionar (até 4) e apagar.
export function RunPhotos({ userId, run }) {
  const toast = useToast();
  const [photos, setPhotos] = useState([]);
  const [urls, setUrls] = useState({});
  const [busy, setBusy] = useState(false);
  const saved = !!run.id && !run.pending;

  const load = useCallback(async () => {
    if (!saved) return;
    const list = (await fetchRunPhotos([run.id])).get(run.id) || [];
    setPhotos(list);
    setUrls(await signPhotoUrls(list.map(p => p.path)));
  }, [run.id, saved]);
  useEffect(() => { load(); }, [load]);

  async function handleFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || busy) return;
    setBusy(true);
    try {
      await addRunPhoto(userId, run, file);
      await load();
    } catch (err) {
      toast(isPhotoLimit(err) ? t('⚠️ No máximo {v1} fotos por corrida', { v1: MAX_RUN_PHOTOS }) : `⚠️ ${friendlyError(err, t('Não foi possível enviar a foto.'))}`);
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(photo) {
    try {
      await deleteRunPhoto(userId, photo);
      await load();
    } catch {
      toast(t('⚠️ Não foi possível apagar a foto — tente novamente'));
    }
  }

  if (!saved) return null;
  return (
    <div className="run-photos">
      {photos.length > 0 && (
        <ul className="run-photos__list">
          {photos.map(p => (
            <li key={p.id} className="run-photos__item">
              {urls[p.path] ? <img src={urls[p.path]} alt={t('Foto da corrida')} loading="lazy" /> : <span className="skeleton" />}
              <button type="button" className="run-photos__del" aria-label={t('Apagar foto')} onClick={() => handleDelete(p)}>✕</button>
            </li>
          ))}
        </ul>
      )}
      {photos.length < MAX_RUN_PHOTOS && (
        <label className="btn btn--outline btn--sm">
          {busy ? t('Enviando…') : t('📷 Adicionar foto')}
          <input type="file" accept="image/*" hidden disabled={busy} onChange={handleFile} aria-label={t('Adicionar foto à corrida')} />
        </label>
      )}
    </div>
  );
}

// Fotos de uma corrida no feed (os caminhos vêm do run_feed): só ver.
export function FeedPhotos({ paths }) {
  const [urls, setUrls] = useState({});
  const key = (paths || []).join('|');
  useEffect(() => {
    let alive = true;
    if (paths?.length) signPhotoUrls(paths).then(u => { if (alive) setUrls(u); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- key resume o conteúdo de paths
  }, [key]);
  const shown = (paths || []).filter(p => urls[p]);
  if (!shown.length) return null;
  return (
    <ul className="run-photos__list run-photos__list--feed">
      {shown.map(p => <li key={p} className="run-photos__item"><img src={urls[p]} alt={t('Foto da corrida')} loading="lazy" /></li>)}
    </ul>
  );
}
