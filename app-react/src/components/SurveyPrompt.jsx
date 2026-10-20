import { useState } from 'react';
import { createPortal } from 'react-dom';
import { getModalRoot } from '../lib/modalRoot';
import { useBackToClose } from '../hooks/useBackToClose';
import { COMMENT_MAX, answerSurvey, snoozeSurvey, surveyQuestion } from '../lib/surveys';

import { t } from '../lib/i18n';
const SCORES = Array.from({ length: 11 }, (_, i) => i);

// Pesquisa do painel (ver lib/surveys.js), no mesmo visual do pedido de
// avaliação. Fechar sem responder = "Agora não" (volta em alguns dias).
export default function SurveyPrompt({ survey, onClose }) {
  const [score, setScore] = useState(null);
  const [choice, setChoice] = useState(null);
  const [comment, setComment] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  function handleClose() {
    if (!sent) snoozeSurvey(survey.id);
    onClose();
  }
  useBackToClose(handleClose);

  const ready = survey.kind === 'nps' ? score !== null : survey.kind === 'escolha' ? !!choice : comment.trim().length > 0;

  async function handleSend() {
    setError('');
    setSending(true);
    try {
      await answerSurvey(survey, { score, choice, comment });
      setSent(true);
    } catch {
      setError(t('Não foi possível enviar agora. Tente de novo.'));
    } finally {
      setSending(false);
    }
  }

  return createPortal(
    <div className="rating-modal" role="dialog" aria-modal="true" aria-labelledby="survey-title">
      <div className="rating-modal__backdrop" onClick={handleClose} />
      <div className="rating-modal__panel">
        <div className="rating-modal__header">
          <h3 className="rating-modal__title" id="survey-title">{sent ? t('Obrigado pela resposta!') : t('Uma pergunta rápida')}</h3>
          <button type="button" className="rating-modal__close" aria-label={t('Fechar')} onClick={handleClose}>✕</button>
        </div>

        {sent ? (
          <>
            <p className="app-rating__text">{t('Sua opinião ajuda a gente a melhorar o app. Vamos ler com atenção.')}</p>
            <button type="button" className="btn btn--primary btn--full" onClick={handleClose}>{t('Fechar')}</button>
          </>
        ) : (
          <>
            <p className="app-rating__text"><strong>{surveyQuestion(survey)}</strong></p>

            {survey.kind === 'nps' && (
              <>
                <div className="survey__scale" role="group" aria-label={t('Nota de 0 a 10')}>
                  {SCORES.map(n => (
                    <button
                      key={n} type="button" aria-pressed={score === n}
                      className={`survey__score${score === n ? ' survey__score--on' : ''}`}
                      onClick={() => setScore(n)}
                    >{n}</button>
                  ))}
                </div>
                <div className="survey__ends"><span>{t('Nada provável')}</span><span>{t('Muito provável')}</span></div>
              </>
            )}

            {survey.kind === 'escolha' && (
              <div className="survey__options" role="group" aria-label={t('Opções')}>
                {survey.options.map(o => (
                  <button
                    key={o} type="button" aria-pressed={choice === o}
                    className={`btn btn--full ${choice === o ? 'btn--primary' : 'btn--outline'}`}
                    onClick={() => setChoice(o)}
                  >{o}</button>
                ))}
              </div>
            )}

            {(survey.kind === 'texto' || score !== null || choice) && (
              <textarea
                className="input input--sm" rows={3} maxLength={COMMENT_MAX}
                aria-label={survey.kind === 'texto' ? t('Sua resposta') : t('Comentário (opcional)')}
                placeholder={survey.kind === 'texto' ? t('Escreva aqui') : t('Quer contar o porquê? (opcional)')}
                value={comment} onChange={e => setComment(e.target.value)}
              />
            )}
            {error && <p className="app-rating__text" role="alert" style={{ color: 'var(--error)' }}>{error}</p>}
            <button type="button" className="btn btn--primary btn--full" disabled={!ready || sending} onClick={handleSend}>
              {sending ? t('Enviando…') : t('Enviar resposta')}
            </button>
            <button type="button" className="btn btn--ghost btn--full" disabled={sending} onClick={handleClose}>{t('Agora não')}</button>
          </>
        )}
      </div>
    </div>,
    getModalRoot()
  );
}
