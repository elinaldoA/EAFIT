import { useMemo, useState } from 'react';
import { useToast } from '../../context/useToast';
import { RUN_SAVED_EVENT, updateRun, deleteRun, formatKm, formatClock, runTitle } from './runs';
import { canMerge, mergeRuns } from './runEdit';
import { t } from '../../lib/i18n';

// Juntar esta corrida com outra do mesmo dia (a gravação caiu no meio e virou
// duas). A que começou antes fica, com as duas somadas, e a outra é apagada.
export default function MergeRun({ userId, run, runs, onClose }) {
  const toast = useToast();
  const options = useMemo(() => runs.filter(r => canMerge(run, r)), [run, runs]);
  const [otherId, setOtherId] = useState(null);
  const [busy, setBusy] = useState(false);
  const other = options.find(r => r.client_id === otherId);
  const merged = useMemo(() => (other ? mergeRuns(run, other) : null), [run, other]);

  async function handleMerge() {
    if (!merged?.patch || busy) return;
    setBusy(true);
    try {
      await updateRun(userId, merged.keep, merged.patch);
      await deleteRun(userId, merged.drop);
      window.dispatchEvent(new CustomEvent(RUN_SAVED_EVENT));
      toast(t('🔗 Corridas juntadas'));
      onClose();
    } catch (err) {
      console.error('MergeRun:', err);
      toast(t('⚠️ Não foi possível juntar — tente novamente'));
      setBusy(false);
    }
  }

  return (
    <div className="dash-card run-crop">
      <strong>{t('🔗 Juntar com outra corrida')}</strong>
      {options.length === 0 ? (
        <p className="profile-field__hint">{t('Não há outra corrida no mesmo dia para juntar.')}</p>
      ) : (
        <>
          <p className="profile-field__hint">{t('Escolha a corrida do mesmo dia. As duas viram uma só, somando distância e tempo. O tempo por km deixa de existir.')}</p>
          <div className="run-chips" role="radiogroup" aria-label={t('Corrida para juntar')}>
            {options.map(r => (
              <button
                key={r.client_id} type="button" role="radio" aria-checked={otherId === r.client_id}
                className={`run-chip${otherId === r.client_id ? ' run-chip--on' : ''}`}
                onClick={() => setOtherId(r.client_id)}
              >{runTitle(r)} · {formatKm(r.distance_m)} km</button>
            ))}
          </div>
          {merged?.patch && (
            <p className="run-item__weather">{t('Fica com {v1} km em {v2}.', { v1: formatKm(merged.patch.distance_m), v2: formatClock(merged.patch.duration_s) })}</p>
          )}
        </>
      )}
      <div className="run-item__actions">
        <button type="button" className="btn btn--primary btn--sm" disabled={!merged?.patch || busy} onClick={handleMerge}>
          {busy ? t('Juntando…') : t('Juntar')}
        </button>
        <button type="button" className="btn btn--ghost btn--sm" onClick={onClose}>{t('Cancelar')}</button>
      </div>
    </div>
  );
}
