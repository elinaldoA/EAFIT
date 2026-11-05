import { t } from '../lib/i18n';

// Escolha do esporte (módulo do app, modules/registry.js). Com um módulo só
// disponível não há o que escolher e o campo não aparece.
export default function SportPicker({ id, value, onChange, modules, small = false }) {
  if (!modules || modules.length < 2) return null;
  return (
    <div className="profile-field">
      <label className="profile-field__label" htmlFor={id}>{t('Seu esporte')}</label>
      <select id={id} className={`input${small ? ' input--sm' : ''}`} value={value} onChange={e => onChange(e.target.value)}>
        {modules.map(m => (
          <option key={m.id} value={m.id}>{`${m.icon} ${m.label}`}</option>
        ))}
      </select>
    </div>
  );
}
