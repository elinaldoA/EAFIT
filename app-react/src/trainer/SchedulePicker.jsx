import { minScheduleValue, maxScheduleValue } from '../lib/trainerScheduled';

import { t } from '../lib/i18n';
// "Agendar para depois": alterna o envio imediato e mostra o campo de data e
// hora (hora local do aparelho, de 5 minutos a 60 dias a partir de agora).
// Quem usa decide o que fazer ao enviar; aqui só ficam o botão e o campo.
export default function SchedulePicker({ open, onToggle, when, onChange }) {
  return (
    <>
      <button type="button" className="btn btn--ghost btn--sm" style={{ alignSelf: 'flex-start' }} aria-pressed={open} onClick={onToggle}>
        {open ? t('Enviar agora') : t('🕒 Agendar para depois')}
      </button>
      {open && (
        <div className="profile-field">
          <label className="profile-field__label" htmlFor="schedWhen">{t('Enviar em')}</label>
          <input id="schedWhen" type="datetime-local" className="input input--sm" value={when}
            min={minScheduleValue()} max={maxScheduleValue()} onChange={e => onChange(e.target.value)} />
        </div>
      )}
    </>
  );
}
