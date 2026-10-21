import { t } from '../lib/i18n';
import { NAME_MAX } from '../lib/profileValidation';
export default function ProfilePersonalSection({ nome, setNome, sobrenome, setSobrenome, apelido, setApelido, onSave }) {
  return (
    <>
      <div className="profile-section__fields">
        <div className="profile-field">
          <label className="profile-field__label" htmlFor="profileNome">{t('Nome')}</label>
          <input
            type="text" id="profileNome" className="input input--sm" placeholder={t('Ex: João')}
            value={nome} maxLength={NAME_MAX} onChange={e => setNome(e.target.value)}
          />
        </div>
        <div className="profile-field">
          <label className="profile-field__label" htmlFor="profileSobrenome">{t('Sobrenome')}</label>
          <input
            type="text" id="profileSobrenome" className="input input--sm" placeholder={t('Ex: Silva')}
            value={sobrenome} maxLength={NAME_MAX} onChange={e => setSobrenome(e.target.value)}
          />
        </div>
      </div>
      <div className="profile-field">
        <label className="profile-field__label" htmlFor="profileApelido">{t('Apelido')}</label>
        <input
          type="text" id="profileApelido" className="input input--sm" placeholder={t('Como prefere ser chamado')}
          value={apelido} maxLength={NAME_MAX} onChange={e => setApelido(e.target.value)}
        />
      </div>
      <button className="btn btn--primary btn--full" onClick={onSave}>{t('Salvar dados pessoais')}</button>
    </>
  );
}
