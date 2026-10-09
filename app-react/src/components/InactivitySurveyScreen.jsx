import { useEffect, useState } from 'react';
import { COMMENT_MAX, REASONS, sendInactivityReason } from '../lib/inactivitySurvey';
import { t } from '../lib/i18n';

// Tela cheia aberta pelos links da pesquisa "por que você parou?" do e-mail
// (ver lib/inactivitySurvey.js): o motivo tocado no e-mail é gravado na hora,
// sem pedir login; aqui a pessoa pode trocar o motivo e contar mais.
// Reaproveita as classes da splash (.boot), como EmailUnsubscribeScreen.
export default function InactivitySurveyScreen({ token, reason: initialReason, onClose }) {
  const [reason, setReason] = useState(initialReason);
  const [comment, setComment] = useState('');
  const [state, setState] = useState(initialReason ? 'saving' : 'idle');

  useEffect(() => {
    if (!initialReason) return undefined;
    let active = true;
    sendInactivityReason(token, initialReason).then(ok => { if (active) setState(ok ? 'saved' : 'error'); });
    return () => { active = false; };
  }, [token, initialReason]);

  async function save(nextReason, nextState) {
    setReason(nextReason);
    setState('saving');
    const ok = await sendInactivityReason(token, nextReason, comment);
    setState(ok ? nextState : 'error');
  }

  if (state === 'done') {
    return (
      <div className="boot maintenance" role="status">
        <img src={`${import.meta.env.BASE_URL}icon-maskable-192.png`} alt="" />
        <div className="boot__name">EAFIT</div>
        <h1 className="maintenance__title">{t('Obrigado por contar pra gente')}</h1>
        <p className="maintenance__text">{t('Sua resposta ajuda a melhorar o app. Seu plano e seu histórico continuam guardados, pra quando você quiser voltar.')}</p>
        <button className="btn btn--primary" type="button" onClick={onClose}>{t('Continuar para o app')}</button>
      </div>
    );
  }

  return (
    <div className="boot maintenance survey">
      <img src={`${import.meta.env.BASE_URL}icon-maskable-192.png`} alt="" />
      <div className="boot__name">EAFIT</div>
      <h1 className="maintenance__title">{t('O que fez você parar?')}</h1>
      <p className="maintenance__text" role="status">
        {state === 'saving' && t('Registrando a sua resposta…')}
        {state === 'saved' && t('Resposta registrada. Se quiser, troque o motivo ou conte mais.')}
        {state === 'idle' && t('Escolha o motivo que mais combina com você.')}
        {state === 'error' && t('Não foi possível registrar agora. O link pode estar incompleto ou a conexão falhou; tente de novo.')}
      </p>

      <div className="survey__options" role="group" aria-label={t('Motivo')}>
        {REASONS.map(r => (
          <button
            key={r.value}
            type="button"
            className={`btn ${reason === r.value ? 'btn--primary' : 'btn--ghost'}`}
            aria-pressed={reason === r.value}
            disabled={state === 'saving'}
            onClick={() => save(r.value, 'saved')}
          >
            {r.label}
          </button>
        ))}
      </div>

      <textarea
        className="workout-notes__textarea survey__comment"
        value={comment}
        maxLength={COMMENT_MAX}
        placeholder={t('Quer contar mais? (opcional)')}
        aria-label={t('Quer contar mais? (opcional)')}
        onChange={e => setComment(e.target.value)}
      />

      <div className="survey__actions">
        <button className="btn btn--primary" type="button" disabled={!reason || state === 'saving'} onClick={() => save(reason, 'done')}>
          {t('Enviar')}
        </button>
        <button className="btn btn--ghost" type="button" onClick={onClose}>{t('Continuar para o app')}</button>
      </div>
    </div>
  );
}
