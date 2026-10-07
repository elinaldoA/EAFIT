import { t } from '../lib/i18n';
export default function ProfileBodySection({
  sexo, setSexo, idade, setIdade, peso, setPeso, altura, setAltura,
  meta, setMeta, nivel, setNivel, pesoAlvo, setPesoAlvo,
  progress, imc, onSave, regenerating, onRegeneratePlan,
}) {
  return (
    <>
      <div className="profile-section__fields">
        <div className="profile-field">
          <label className="profile-field__label" htmlFor="profileSexo">{t('Sexo biológico')}</label>
          <select id="profileSexo" className="input input--sm" value={sexo} onChange={e => setSexo(e.target.value)}>
            <option value="" disabled>{t('Selecione')}</option>
            <option value="M">{t('Masculino')}</option>
            <option value="F">{t('Feminino')}</option>
          </select>
        </div>
        <div className="profile-field">
          <label className="profile-field__label" htmlFor="profileIdade">{t('Idade')}</label>
          <input
            type="number" id="profileIdade" className="input input--sm" placeholder={t('Ex: 28')}
            min="14" max="100" value={idade} onChange={e => setIdade(e.target.value)}
          />
        </div>
      </div>
      <div className="profile-section__fields">
        <div className="profile-field">
          <label className="profile-field__label" htmlFor="profilePeso">{t('Peso (kg)')}</label>
          <input
            type="number" id="profilePeso" className="input input--sm" placeholder={t('Ex: 85')}
            min="30" max="300" step="0.1" value={peso} onChange={e => setPeso(e.target.value)}
          />
        </div>
        <div className="profile-field">
          <label className="profile-field__label" htmlFor="profileAltura">{t('Altura (cm)')}</label>
          <input
            type="number" id="profileAltura" className="input input--sm" placeholder={t('Ex: 178')}
            min="100" max="250" value={altura} onChange={e => setAltura(e.target.value)}
          />
        </div>
      </div>
      <div className="profile-field">
        <label className="profile-field__label" htmlFor="profileMeta">{t('Meta principal')}</label>
        <select id="profileMeta" className="input input--sm" value={meta} onChange={e => setMeta(e.target.value)}>
          <option value="massa">{t('Ganho de massa')}</option>
          <option value="forca">{t('Aumento de força')}</option>
          <option value="emagrecer">{t('Emagrecimento')}</option>
          <option value="definicao">{t('Definição muscular')}</option>
          <option value="saude">{t('Saúde e bem-estar')}</option>
          <option value="resistencia">{t('Resistência / Condicionamento')}</option>
        </select>
      </div>
      <div className="profile-field">
        <label className="profile-field__label" htmlFor="profileNivel">{t('Nível de experiência')}</label>
        <select id="profileNivel" className="input input--sm" value={nivel} onChange={e => setNivel(e.target.value)}>
          <option value="iniciante">{t('Iniciante')}</option>
          <option value="intermediario">{t('Intermediário')}</option>
          <option value="avancado">{t('Avançado')}</option>
        </select>
      </div>
      <div className="profile-field">
        <label className="profile-field__label" htmlFor="profilePesoAlvo">{t('Peso alvo (kg)')}</label>
        <input
          type="number" id="profilePesoAlvo" className="input input--sm" placeholder={t('Ex: 80')}
          min="30" max="300" step="0.1" value={pesoAlvo} onChange={e => setPesoAlvo(e.target.value)}
        />
      </div>
      {progress && (
        <div className="progress-card">
          <div className="progress-card__row">
            <span className="progress-card__label">{progress.msg}</span>
          </div>
          {!progress.done && (
            <div className="progress-card__bar">
              <div className="progress-card__fill" style={{ width: `${progress.pct}%` }} />
            </div>
          )}
        </div>
      )}
      {imc && (
        <div className="imc-card">
          <span className="imc-card__label">{t('IMC')}</span>
          <span className="imc-card__value">{imc.value.replace('.', ',')}</span>
          <span className="imc-card__class">{imc.cls}</span>
        </div>
      )}
      <button className="btn btn--primary btn--full" onClick={onSave}>{t('Salvar dados corporais')}</button>
      <button className="btn btn--outline btn--full" disabled={regenerating} onClick={onRegeneratePlan}>
        {regenerating ? t('Gerando novo treino…') : t('🔄 Gerar novo treino com esses dados')}
      </button>
    </>
  );
}
