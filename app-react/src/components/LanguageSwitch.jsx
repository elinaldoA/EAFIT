import { LANGS, lang, setLang, t } from '../lib/i18n';

// Seletor de idioma: trocar recarrega o app (ver lib/i18n.js).
export default function LanguageSwitch({ id = 'langSelect' }) {
  return (
    <div className="profile-field">
      <label className="profile-field__label" htmlFor={id}>{t('Idioma')}</label>
      <select id={id} className="input input--sm" value={lang} onChange={e => setLang(e.target.value)}>
        {LANGS.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
      </select>
    </div>
  );
}
