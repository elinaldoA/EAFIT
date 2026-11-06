import { LANGS, lang, setLang, t } from '../lib/i18n';

// Seletor de idioma: trocar recarrega o app (ver lib/i18n.js).
export default function LanguageSwitch({ id = 'langSelect', compact = false }) {
  return (
    <div className={compact ? 'lang-compact' : 'profile-field'}>
      <label className={compact ? 'lang-compact__label' : 'profile-field__label'} htmlFor={id}>{t('Idioma')}</label>
      <select id={id} className={compact ? 'input input--sm lang-compact__select' : 'input input--sm'} value={lang} onChange={e => setLang(e.target.value)}>
        {LANGS.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
      </select>
    </div>
  );
}
