import { useState } from 'react';
import { PARQ_COUNT, HEALTH_TEXT_MAX, parqQuestions, decodeAnswers, allAnswered, hasAlert, healthFields } from '../lib/parq';

import { t } from '../lib/i18n';
// Formulário do PAR-Q + anamnese curta. Usado na tela de primeira abertura
// (HealthScreen, com "Pular por agora") e no Perfil (ProfileHealthSection).
// Chama onSaved(alerta) depois de gravar; onSkip só existe na tela inicial.
export default function HealthForm({ meta = {}, updateProfile, onSaved, onSkip }) {
  const [answers, setAnswers] = useState(() => decodeAnswers(meta.parqAnswers));
  const [lesoes, setLesoes] = useState(meta.lesoes || '');
  const [restricoes, setRestricoes] = useState(meta.restricoes || '');
  const [medicamentos, setMedicamentos] = useState(meta.medicamentos || '');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const questions = parqQuestions();
  const ready = allAnswered(answers) && consent;

  function setAnswer(i, value) {
    setAnswers(a => a.map((x, j) => (j === i ? value : x)));
  }

  async function handleSave() {
    if (!ready) return;
    setBusy(true);
    setError('');
    const { error: err } = await updateProfile(healthFields({ answers, lesoes, restricoes, medicamentos }));
    setBusy(false);
    if (err) { setError(t('Não foi possível salvar. Verifique a conexão e tente de novo.')); return; }
    onSaved?.(hasAlert(answers));
  }

  async function handleSkip() {
    setBusy(true);
    await onSkip();
    setBusy(false);
  }

  return (
    <div className="health-form">
      <ol className="health-form__questions">
        {questions.map((q, i) => (
          <li key={i} className="health-q">
            <p className="health-q__text">{q}</p>
            <div className="health-q__opts" role="group" aria-label={t('Pergunta {n} de {total}', { n: i + 1, total: PARQ_COUNT })}>
              <button type="button" className={`health-q__opt${answers[i] === true ? ' health-q__opt--on' : ''}`}
                aria-pressed={answers[i] === true} onClick={() => setAnswer(i, true)}>{t('Sim')}</button>
              <button type="button" className={`health-q__opt${answers[i] === false ? ' health-q__opt--on' : ''}`}
                aria-pressed={answers[i] === false} onClick={() => setAnswer(i, false)}>{t('Não')}</button>
            </div>
          </li>
        ))}
      </ol>

      <label className="profile-field__label" htmlFor="health-lesoes">{t('Lesões (opcional)')}</label>
      <input id="health-lesoes" className="input input--sm" maxLength={HEALTH_TEXT_MAX} value={lesoes}
        placeholder={t('Ex: joelho direito, ombro')} onChange={e => setLesoes(e.target.value)} />
      <label className="profile-field__label" htmlFor="health-restricoes">{t('Restrições (opcional)')}</label>
      <input id="health-restricoes" className="input input--sm" maxLength={HEALTH_TEXT_MAX} value={restricoes}
        placeholder={t('Ex: hipertensão, evitar impacto')} onChange={e => setRestricoes(e.target.value)} />
      <label className="profile-field__label" htmlFor="health-medicamentos">{t('Medicamentos de uso contínuo (opcional)')}</label>
      <input id="health-medicamentos" className="input input--sm" maxLength={HEALTH_TEXT_MAX} value={medicamentos}
        onChange={e => setMedicamentos(e.target.value)} />

      <label className="health-form__consent">
        <input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} />
        <span>
          {t('Autorizo o EAFIT a guardar estas respostas de saúde, que são dados sensíveis, para orientar meu treino. Só o personal que eu vincular as vê, e só enquanto o vínculo existir.')}{' '}
          <a href="legal/privacidade.html" target="_blank" rel="noopener noreferrer">{t('Política de Privacidade')}</a>
        </span>
      </label>
      <p className="profile-field__hint">{t('Este questionário orienta, mas não substitui a avaliação de um médico.')}</p>

      {error && <p role="alert" className="profile-field__hint">{error}</p>}
      <button type="button" className="btn btn--primary btn--full" disabled={!ready || busy} onClick={handleSave}>
        {busy ? t('Salvando…') : t('Salvar respostas')}
      </button>
      {onSkip && (
        <button type="button" className="btn btn--ghost btn--sm" disabled={busy} onClick={handleSkip}>{t('Pular por agora')}</button>
      )}
    </div>
  );
}
