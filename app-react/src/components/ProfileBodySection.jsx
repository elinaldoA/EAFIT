import { t, decimal, locale } from '../lib/i18n';
import { heightToCm, BODY_FIELD_IDS } from '../lib/profileValidation';
import { invalidProps } from '../lib/fieldErrors';
import FieldError from './FieldError';

const ID = BODY_FIELD_IDS;

export default function ProfileBodySection({
  sexo, setSexo, idade, setIdade, peso, setPeso, altura, setAltura,
  meta, setMeta, nivel, setNivel, local, setLocal, pesoAlvo, setPesoAlvo,
  progress, imc, onSave, regenerating, onRegeneratePlan, showTraining = true,
  imcInvite = false, onAcceptImcInvite, onDismissImcInvite,
  errors = {}, onFieldChange = () => {},
}) {
  // showTraining false (módulo sem plano de musculação): só os dados do corpo.
  // errors: { campo: mensagem } da última tentativa de salvar; mexer no campo
  // avisa o Perfil (onFieldChange) para apagar o erro dele.
  const change = (field, set) => e => { set(e.target.value); onFieldChange(field); };
  return (
    <>
      <div className="profile-section__fields">
        <div className="profile-field">
          <label className="profile-field__label" htmlFor="profileSexo">{t('Sexo biológico')}</label>
          <select id={ID.sexo} className="input input--sm" value={sexo} {...invalidProps(ID.sexo, errors.sexo)} onChange={change('sexo', setSexo)}>
            <option value="" disabled>{t('Selecione')}</option>
            <option value="M">{t('Masculino')}</option>
            <option value="F">{t('Feminino')}</option>
          </select>
          <FieldError id={ID.sexo} message={errors.sexo} />
        </div>
        <div className="profile-field">
          <label className="profile-field__label" htmlFor="profileIdade">{t('Idade')}</label>
          <input
            type="number" id={ID.idade} className="input input--sm" placeholder={t('Ex: 28')}
            min="14" max="100" value={idade} {...invalidProps(ID.idade, errors.idade)} onChange={change('idade', setIdade)}
          />
          <FieldError id={ID.idade} message={errors.idade} />
        </div>
      </div>
      <div className="profile-section__fields">
        <div className="profile-field">
          <label className="profile-field__label" htmlFor="profilePeso">{t('Peso (kg)')}</label>
          <input
            type="number" id={ID.peso} className="input input--sm" placeholder={t('Ex: 85')}
            min="30" max="300" step="0.1" value={peso} {...invalidProps(ID.peso, errors.peso)} onChange={change('peso', setPeso)}
          />
          <FieldError id={ID.peso} message={errors.peso} />
        </div>
        <div className="profile-field">
          <label className="profile-field__label" htmlFor="profileAltura">{t('Altura (cm)')}</label>
          <input
            type="number" id={ID.altura} className="input input--sm" placeholder={t('Ex: 178')}
            min="100" max="250" value={altura} {...invalidProps(ID.altura, errors.altura)} onChange={change('altura', setAltura)}
            onBlur={e => setAltura(heightToCm(e.target.value))}
          />
          <FieldError id={ID.altura} message={errors.altura} />
        </div>
      </div>
      {showTraining && (
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
      )}
      {showTraining && (
      <div className="profile-field">
        <label className="profile-field__label" htmlFor="profileNivel">{t('Nível de experiência')}</label>
        <select id="profileNivel" className="input input--sm" value={nivel} onChange={e => setNivel(e.target.value)}>
          <option value="iniciante">{t('Iniciante')}</option>
          <option value="intermediario">{t('Intermediário')}</option>
          <option value="avancado">{t('Avançado')}</option>
        </select>
      </div>
      )}
      {showTraining && (
      <div className="profile-field">
        <label className="profile-field__label" htmlFor="profileLocal">{t('Onde você treina')}</label>
        <select id="profileLocal" className="input input--sm" value={local} onChange={e => setLocal(e.target.value)}>
          <option value="academia">{t('Academia')}</option>
          <option value="condominio">{t('Academia do condomínio')}</option>
          <option value="casa">{t('Em casa')}</option>
        </select>
      </div>
      )}
      <div className="profile-field">
        <label className="profile-field__label" htmlFor="profilePesoAlvo">{t('Peso alvo (kg)')}</label>
        <input
          type="number" id={ID.pesoAlvo} className="input input--sm" placeholder={t('Ex: 80')}
          min="30" max="300" step="0.1" value={pesoAlvo} {...invalidProps(ID.pesoAlvo, errors.pesoAlvo)} onChange={change('pesoAlvo', setPesoAlvo)}
        />
        <FieldError id={ID.pesoAlvo} message={errors.pesoAlvo} />
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
          {progress.projection && (
            <p className="progress-card__projection">
              {t('Mantendo o ritmo ({kgPerWeek} kg/semana), você chega lá por volta de {date}', {
                kgPerWeek: decimal(progress.projection.kgPerWeek),
                date: progress.projection.date.toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' }),
              })}
            </p>
          )}
        </div>
      )}
      {imc && (
        <div className="imc-card">
          <span className="imc-card__label">{t('IMC')}</span>
          <span className="imc-card__value">{decimal(imc.value)}</span>
          <span className="imc-card__class">{imc.cls}</span>
        </div>
      )}
      <button className="btn btn--primary btn--full" onClick={onSave}>{t('Salvar dados corporais')}</button>
      {showTraining && imcInvite && (
        <div className="imc-invite" role="status">
          <p className="imc-invite__text">
            <strong>{imc ? t('Seu IMC mudou de faixa ({cls}).', { cls: imc.cls }) : t('Seu IMC mudou de faixa.')}</strong>{' '}
            {t('O treino atual foi montado para a faixa anterior. Quer um treino novo com esses dados? O atual continua salvo em "Editar treino".')}
          </p>
          <div className="imc-invite__actions">
            <button type="button" className="btn btn--primary btn--sm" disabled={regenerating} onClick={onAcceptImcInvite}>{t('Gerar treino novo')}</button>
            <button type="button" className="link-btn" disabled={regenerating} onClick={onDismissImcInvite}>{t('Agora não')}</button>
          </div>
        </div>
      )}
      {showTraining && !imcInvite && (
        <button className="btn btn--outline btn--full" disabled={regenerating} onClick={onRegeneratePlan}>
          {regenerating ? t('Gerando novo treino…') : t('🔄 Gerar novo treino com esses dados')}
        </button>
      )}
    </>
  );
}
