import { useMemo, useState } from 'react';
import { useToast } from '../../context/useToast';
import { RUN_SAVED_EVENT, updateRun, formatKm, formatClock } from './runs';
import { cropRun, routeLengthM } from './runEdit';
import RouteDrawing from './RouteDrawing';
import { t } from '../../lib/i18n';

// Cortar o começo ou o fim do percurso de uma corrida salva (esqueceu o GPS ligado
// depois de parar). O que sai do mapa sai também da distância e do tempo; os
// tempos por km e a subida por km deixam de valer.
export default function CropRun({ userId, run, onClose }) {
  const toast = useToast();
  const length = useMemo(() => routeLengthM(run.route), [run.route]);
  const half = Math.floor(length / 2 / 50) * 50;
  const [from, setFrom] = useState(0);
  const [to, setTo] = useState(0);
  const [busy, setBusy] = useState(false);
  const result = useMemo(() => cropRun(run, from, to), [run, from, to]);
  const changed = from > 0 || to > 0;

  async function handleSave() {
    if (!result.patch || busy) return;
    setBusy(true);
    try {
      await updateRun(userId, run, result.patch);
      window.dispatchEvent(new CustomEvent(RUN_SAVED_EVENT));
      toast(t('✂️ Percurso cortado'));
      onClose();
    } catch (err) {
      console.error('CropRun:', err);
      toast(t('⚠️ Não foi possível cortar — tente novamente'));
      setBusy(false);
    }
  }

  return (
    <div className="dash-card run-crop">
      <strong>{t('✂️ Cortar o percurso')}</strong>
      <p className="profile-field__hint">{t('Tire o começo ou o fim da corrida (por exemplo, o GPS ficou ligado depois de parar). A distância e o tempo diminuem junto; o tempo por km deixa de existir.')}</p>
      {result.patch && <RouteDrawing route={result.patch.route} width={320} height={150} />}
      <div className="profile-field">
        <label className="profile-field__label" htmlFor="crop-from">{t('Cortar do começo: {v1} km', { v1: formatKm(from) })}</label>
        <input id="crop-from" type="range" min="0" max={half} step="50" value={from} onChange={e => setFrom(Number(e.target.value))} />
      </div>
      <div className="profile-field">
        <label className="profile-field__label" htmlFor="crop-to">{t('Cortar do fim: {v1} km', { v1: formatKm(to) })}</label>
        <input id="crop-to" type="range" min="0" max={half} step="50" value={to} onChange={e => setTo(Number(e.target.value))} />
      </div>
      {result.patch && changed && (
        <p className="run-item__weather">
          {t('Fica com {v1} km em {v2}.', { v1: formatKm(result.patch.distance_m), v2: formatClock(result.patch.duration_s) })}
        </p>
      )}
      <div className="run-item__actions">
        <button type="button" className="btn btn--primary btn--sm" disabled={!changed || !result.patch || busy} onClick={handleSave}>
          {busy ? t('Salvando…') : t('Cortar')}
        </button>
        <button type="button" className="btn btn--ghost btn--sm" onClick={onClose}>{t('Cancelar')}</button>
      </div>
    </div>
  );
}
