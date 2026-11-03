import { HYDRATION_SIP_ML } from '../lib/workoutHydration';
import { t } from '../lib/i18n';

// O cartão do lembrete de água (hooks/useWorkoutHydration). `className` muda
// só o encaixe: dentro do modo ao vivo ou flutuando sobre a lista do treino.
export default function HydrationAlert({ onDrink, onDismiss, className = 'live__drink' }) {
  return (
    <div className={className} role="alert">
      <span className="live__drink-icon" aria-hidden="true">💧</span>
      <div className="live__drink-text">
        <strong>{t('Hora de se hidratar')}</strong>
        <span>{t('Alguns goles de água ajudam a manter o rendimento.')}</span>
      </div>
      <div className="live__drink-actions">
        {onDrink && (
          <button type="button" className="btn btn--primary btn--sm" onClick={() => onDrink(HYDRATION_SIP_ML)}>
            {t('Bebi +{ml} ml', { ml: HYDRATION_SIP_ML })}
          </button>
        )}
        <button type="button" className="btn btn--ghost btn--sm" aria-label={t('Dispensar lembrete de água')} onClick={onDismiss}>✕</button>
      </div>
    </div>
  );
}
