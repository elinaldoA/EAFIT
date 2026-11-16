import { t } from '../lib/i18n';

// Escolha do esporte (módulo do app, modules/registry.js): um cartão por
// esporte, com ícone, nome e uma frase do que a pessoa ganha. Com um módulo só
// disponível não há o que escolher e nada aparece. `value` vazio = nada
// marcado ainda (o onboarding pede uma escolha de verdade).
export default function SportPicker({ id, value, onChange, modules, small = false }) {
  if (!modules || modules.length < 2) return null;
  return (
    <div className="profile-field">
      <span className="profile-field__label" id={`${id}-label`}>{t('Qual é a sua vibe?')}</span>
      <div className={`sport-cards${small ? ' sport-cards--sm' : ''}`} role="radiogroup" aria-labelledby={`${id}-label`}>
        {modules.map(m => {
          const on = m.id === value;
          return (
            <button
              key={m.id} type="button" role="radio" aria-checked={on}
              className={`sport-card${on ? ' sport-card--on' : ''}`} onClick={() => onChange(m.id)}
            >
              <span className="sport-card__icon" aria-hidden="true">{m.icon}</span>
              <strong className="sport-card__name">{m.label}</strong>
              {m.blurb && <span className="sport-card__blurb">{m.blurb}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
