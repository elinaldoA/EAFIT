import { useMemo, useState } from 'react';
import { useToast } from '../../context/useToast';
import { formatKm } from './runs';
import { segmentFromRun, pathLengthM } from './segmentMatch';
import { createSegment } from './segmentStore';
import RouteDrawing from './RouteDrawing';
import { t } from '../../lib/i18n';

// Criar um segmento a partir de um trecho de uma corrida: escolhe onde começa e onde
// termina (em km do percurso), dá um nome. Nasce privado; quem quer mostrar aos amigos
// muda depois, na lista de segmentos.
export default function CreateSegment({ userId, run, onClose, onCreated }) {
  const toast = useToast();
  const length = useMemo(() => Math.floor(pathLengthM(run.route)), [run.route]);
  const [from, setFrom] = useState(0);
  const [to, setTo] = useState(length);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const seg = useMemo(() => segmentFromRun(run, from, to), [run, from, to]);
  // O trecho escolhido, como percurso para o mapa (sem tempo, só o desenho).
  const preview = useMemo(() => (seg.route ? [seg.route] : null), [seg]);

  async function handleCreate() {
    if (!seg.route || !name.trim() || busy) return;
    setBusy(true);
    try {
      await createSegment(userId, { name, route: seg.route, distance_m: seg.distance_m });
      toast(t('📍 Segmento criado'));
      onCreated?.();
      onClose();
    } catch (err) {
      console.error('CreateSegment:', err);
      toast(t('⚠️ Não foi possível criar o segmento — tente novamente'));
      setBusy(false);
    }
  }

  return (
    <div className="dash-card run-crop">
      <strong>{t('📍 Criar segmento')}</strong>
      <p className="profile-field__hint">{t('Escolha o trecho desta corrida que você quer comparar sempre que passar por ele. O segmento começa privado: só você vê.')}</p>
      {preview && <RouteDrawing route={preview} width={320} height={150} />}
      <div className="profile-field">
        <label className="profile-field__label" htmlFor="seg-from">{t('Começa em {v1} km', { v1: formatKm(from) })}</label>
        <input id="seg-from" type="range" min="0" max={Math.max(0, length - 100)} step="50" value={from} onChange={e => { const v = Number(e.target.value); setFrom(v); if (to < v + 100) setTo(Math.min(length, v + 100)); }} />
      </div>
      <div className="profile-field">
        <label className="profile-field__label" htmlFor="seg-to">{t('Termina em {v1} km', { v1: formatKm(to) })}</label>
        <input id="seg-to" type="range" min="100" max={length} step="50" value={to} onChange={e => { const v = Number(e.target.value); setTo(v); if (from > v - 100) setFrom(Math.max(0, v - 100)); }} />
      </div>
      {seg.distance_m && <p className="run-item__weather">{t('Segmento de {v1} km', { v1: formatKm(seg.distance_m) })}</p>}
      <div className="profile-field">
        <label className="profile-field__label" htmlFor="seg-name">{t('Nome do segmento')}</label>
        <input id="seg-name" className="input" maxLength={60} value={name} onChange={e => setName(e.target.value)} placeholder={t('Ex.: Subida da ponte')} />
      </div>
      <div className="run-item__actions">
        <button type="button" className="btn btn--primary btn--sm" disabled={!seg.route || !name.trim() || busy} onClick={handleCreate}>
          {busy ? t('Salvando…') : t('Criar segmento')}
        </button>
        <button type="button" className="btn btn--ghost btn--sm" onClick={onClose}>{t('Cancelar')}</button>
      </div>
    </div>
  );
}
